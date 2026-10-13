// POP9 Print Server — agente local que imprime as comandas direto na térmica de rede.
//
// Fluxo: pedido gravado → gatilho no banco cria print_jobs (modo "Estação de impressão")
// → este agente recebe pelo realtime (e confere a fila a cada poucos segundos)
// → pega a tarefa com claim_print_job (só um aparelho imprime cada pedido)
// → monta ESC/POS e envia por TCP (porta 9100) para cada impressora do setor
// → finish_print_job registra sucesso ou o erro (que aparece na Estação para reimprimir).
//
// Não abre nenhuma porta na rede: só faz conexões de saída (Supabase e impressoras).
import net from "node:net";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { buildKitchenTickets, renderTicket, renderTestPage } from "./escpos.mjs";
import { kitchenPrinters, route, channelLabel } from "./routing.mjs";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "POP9_AGENT_EMAIL", "POP9_AGENT_PASSWORD", "POP9_UNIT_ID"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Faltam variáveis no .env: ${missing.join(", ")}`);
  process.exit(1);
}
const unitId = process.env.POP9_UNIT_ID;
if (!/^[0-9a-f-]{36}$/i.test(unitId)) { console.error("POP9_UNIT_ID inválido"); process.exit(1); }
const POLL_MS = Math.max(3000, Number(process.env.POLL_INTERVAL_MS) || 10000);
const CATCH_UP_HOURS = Math.max(1, Math.min(24, Number(process.env.CATCH_UP_HOURS) || 2));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
  realtime: { transport: WebSocket },
});

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function signIn() {
  const { error } = await supabase.auth.signInWithPassword({ email: process.env.POP9_AGENT_EMAIL, password: process.env.POP9_AGENT_PASSWORD });
  if (error) throw new Error(`Login do agente falhou: ${error.message}`);
}

function sendTcp(host, port, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(10000);
    socket.once("connect", () => socket.end(Buffer.from(bytes)));
    socket.once("error", (e) => reject(new Error(`Impressora ${host}:${port} não respondeu (${e.code ?? e.message})`)));
    socket.once("timeout", () => socket.destroy(new Error(`Impressora ${host}:${port} sem resposta (tempo esgotado)`)));
    socket.once("close", (hadError) => { if (!hadError) resolve(); });
  });
}

async function loadPrinters() {
  const { data, error } = await supabase.from("printer_configs").select("*").eq("business_unit_id", unitId);
  if (error) throw new Error(`Não foi possível ler as impressoras: ${error.message}`);
  return kitchenPrinters(data);
}

async function loadOrder(orderId) {
  const { data: order, error } = await supabase.from("orders")
    .select("id, origin, source, external_id, client_id, session_id, order_items(name, quantity, observation, ingredient_mods, destination)")
    .eq("id", orderId).single();
  if (error || !order) throw new Error("Pedido não encontrado");
  const [{ data: session }, { data: client }] = await Promise.all([
    order.session_id ? supabase.from("sessions").select("table_number").eq("id", order.session_id).maybeSingle() : Promise.resolve({ data: null }),
    order.client_id ? supabase.from("session_clients").select("name").eq("id", order.client_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const channel = channelLabel(order);
  const n = session?.table_number;
  const label = typeof n === "number"
    ? (n < 0 ? `Retirada #${Math.abs(n)}` : `Mesa ${String(n).padStart(2, "0")}`)
    : `${channel ?? "Pedido"} #${String(order.external_id ?? order.id).slice(-6).toUpperCase()}`;
  const items = (order.order_items ?? []).map((i) => ({
    name: i.name, quantity: i.quantity, observation: i.observation, ingredientMods: i.ingredient_mods, destination: i.destination,
  }));
  return { label, clientName: client?.name ?? "Cliente", orderId: order.id, channel, items };
}

const busy = new Set();

async function processJob(job) {
  if (busy.has(job.id)) return;
  busy.add(job.id);
  try {
    const printers = await loadPrinters();
    // Sem impressora de rede configurada, não pega a tarefa: a Estação do navegador ainda pode imprimir.
    if (!printers.length) return;
    const { data: claimed, error } = await supabase.rpc("claim_print_job", { p_job: job.id });
    if (error) throw new Error(error.message);
    if (!claimed) return; // outro aparelho já pegou
    try {
      const order = await loadOrder(job.order_id);
      const { plan, orphans } = route(buildKitchenTickets(order), printers);
      const failures = [];
      for (const { printer, tickets } of plan) {
        try {
          for (let c = 0; c < printer.copies; c++)
            for (const t of tickets) await sendTcp(printer.host, printer.port, renderTicket(t, printer));
          log(`Pedido ${order.orderId.slice(0, 8)}: ${tickets.length} comanda(s) em ${printer.name}`);
        } catch (e) { failures.push(`${printer.name}: ${e.message}`); }
      }
      if (orphans.length) failures.push(`Sem impressora para ${[...new Set(orphans.map((t) => (t.destination === "bar" ? "o bar" : "a cozinha")))].join(" e ")}`);
      if (failures.length) throw new Error(failures.join("; "));
      await supabase.rpc("finish_print_job", { p_job: job.id, p_ok: true });
    } catch (e) {
      log(`Falha no pedido ${job.order_id}: ${e.message}`);
      await supabase.rpc("finish_print_job", { p_job: job.id, p_ok: false, p_error: String(e.message).slice(0, 300) });
    }
  } catch (e) {
    log(`Erro ao processar tarefa ${job.id}: ${e.message}`);
  } finally {
    busy.delete(job.id);
  }
}

async function catchUp() {
  const since = new Date(Date.now() - CATCH_UP_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase.from("print_jobs").select("id, order_id")
    .eq("business_unit_id", unitId).eq("status", "pending").gte("created_at", since).order("created_at");
  if (error) { log(`Não foi possível ler a fila: ${error.message}`); return; }
  for (const job of data ?? []) await processJob(job);
}

async function testPrint() {
  const printers = await loadPrinters();
  if (!printers.length) { console.error("Nenhuma impressora de rede (TCP) ativa com o gatilho \"Comanda da cozinha/bar\" nesta unidade."); process.exit(1); }
  let ok = true;
  for (const p of printers) {
    try { await sendTcp(p.host, p.port, renderTestPage(p.name, p)); log(`Teste enviado para ${p.name} (${p.host}:${p.port})`); }
    catch (e) { ok = false; console.error(`${p.name}: ${e.message}`); }
  }
  process.exit(ok ? 0 : 1);
}

await signIn();
if (process.argv.includes("--test")) await testPrint();

log(`POP9 Print Server ligado · unidade ${unitId}`);
const printers = await loadPrinters();
if (!printers.length) log("Atenção: nenhuma impressora de rede (TCP) ativa com o gatilho \"Comanda da cozinha/bar\". Cadastre em Admin → Impressoras.");
else for (const p of printers) log(`Impressora: ${p.name} ${p.host}:${p.port} · ${p.destinos.join(" + ")}`);

supabase.channel(`print-server-${unitId}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "print_jobs", filter: `business_unit_id=eq.${unitId}` },
    (payload) => { void processJob(payload.new); })
  .subscribe((status) => log(`Realtime: ${status}`));

// Rede de segurança: confere a fila periodicamente (realtime pode cair; reimpressões voltam como pending).
await catchUp();
setInterval(() => { void catchUp(); }, POLL_MS);
