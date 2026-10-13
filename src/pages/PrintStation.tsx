import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Printer, RotateCcw, Power, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useUnitPrintMode, rpc } from "@/hooks/useUnitPrintMode";
import { buildStationTickets, type StationItem } from "@/utils/thermal-print";
import { pickupLabel } from "@/utils/operationalLinks";

type Job = { id: string; order_id: string; status: string; created_at: string; error_message: string | null; label?: string };
const DEST_KEY = "pop9:print-station-destinations";
const CHANNELS: Record<string, string> = { ifood: "iFood", "99food": "99Food", whatsapp: "WhatsApp", "own-pwa": "Online", keeta: "Keeta" };
/** Canal impresso na comanda: o pedido da mesa não leva rótulo; online e integrações sim. */
function channelLabel(order: { origin?: string | null; source?: string | null }): string | null {
  if (order.source && CHANNELS[order.source]) return CHANNELS[order.source];
  if (order.origin === "pwa") return "Online";
  return null;
}

function readDestinations(): string[] {
  try { const v = JSON.parse(localStorage.getItem(DEST_KEY) ?? "null"); if (Array.isArray(v) && v.length) return v; } catch { /* sem storage */ }
  return ["kitchen"];
}

/** Imprime várias comandas num só trabalho, por um iframe oculto (não depende de pop-up liberado). */
function printTickets(tickets: string[]) {
  return new Promise<void>((resolve, reject) => {
    const bodies = tickets.map((html) => html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "");
    const head = tickets[0].match(/<head>([\s\S]*)<\/head>/)?.[1] ?? "";
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) { frame.remove(); reject(Error("Não foi possível preparar a impressão")); return; }
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>${head}</head><body>${bodies.map((b) => `<div style="page-break-after:always">${b}</div>`).join("")}</body></html>`);
    doc.close();
    window.setTimeout(() => {
      try { frame.contentWindow!.focus(); frame.contentWindow!.print(); resolve(); }
      catch (e) { reject(e instanceof Error ? e : Error("Falha ao imprimir")); }
      finally { window.setTimeout(() => frame.remove(), 2000); }
    }, 300);
  });
}

export default function PrintStation() {
  const { user, loading: authLoading } = useAuth();
  const { roles, loading: rolesLoading } = useUnitRoles();
  const { businessUnitId, units } = useCurrentBusinessUnit();
  const printMode = useUnitPrintMode();
  const [active, setActive] = useState(false);
  const [destinations, setDestinations] = useState<string[]>(readDestinations);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(new Set<string>());
  const queue = useRef(Promise.resolve());
  const allowed = roles.some((r) => ["admin", "attendant", "kitchen", "cashier"].includes(r));
  const unitName = units.find((u) => u.id === businessUnitId)?.name ?? "";

  const loadJobs = useCallback(async () => {
    if (!businessUnitId) return;
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data, error: e } = await supabase.from("print_jobs" as "orders").select("id, order_id, status, created_at, error_message")
      .eq("business_unit_id", businessUnitId).gte("created_at", since).order("created_at", { ascending: false }).limit(50);
    if (e) { setError("Não foi possível carregar a fila de impressão."); return; }
    setJobs((data ?? []) as unknown as Job[]);
  }, [businessUnitId]);

  const printJob = useCallback((job: Pick<Job, "id" | "order_id">) => {
    if (busy.current.has(job.id)) return;
    busy.current.add(job.id);
    // Uma impressão por vez: várias tarefas chegando juntas não abrem vários diálogos sobrepostos.
    queue.current = queue.current.then(async () => {
      try {
        const claimed = await rpc("claim_print_job", { p_job: job.id });
        if (claimed.error) throw Error(claimed.error.message);
        if (!claimed.data) return; // outra estação já pegou
        try {
          const { data: order, error: oe } = await supabase.from("orders").select("id, origin, source, external_id, client_id, session_id, order_items(name, quantity, observation, ingredient_mods, destination)").eq("id", job.order_id).single();
          if (oe || !order) throw Error("Pedido não encontrado");
          // Pedidos de integração (iFood, 99Food) podem não ter mesa nem cliente de sessão.
          const [{ data: session }, { data: client }] = await Promise.all([
            order.session_id ? supabase.from("sessions").select("table_number").eq("id", order.session_id).maybeSingle() : Promise.resolve({ data: null }),
            order.client_id ? supabase.from("session_clients").select("name").eq("id", order.client_id).maybeSingle() : Promise.resolve({ data: null }),
          ]);
          const items = (order.order_items ?? []) as unknown as StationItem[];
          const channel = channelLabel(order as { origin?: string | null; source?: string | null });
          const label = session ? pickupLabel(session.table_number) : `${channel ?? "Pedido"} #${String(order.external_id ?? order.id).slice(-6).toUpperCase()}`;
          const tickets = buildStationTickets(label, client?.name ?? "Cliente", items, order.id, destinations, channel);
          if (tickets.length) await printTickets(tickets);
          await rpc("finish_print_job", { p_job: job.id, p_ok: true });
        } catch (e) {
          await rpc("finish_print_job", { p_job: job.id, p_ok: false, p_error: e instanceof Error ? e.message : "Falha" });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao imprimir");
      } finally {
        busy.current.delete(job.id);
        void loadJobs();
      }
    });
  }, [destinations, loadJobs]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  useEffect(() => {
    if (!active || !businessUnitId || printMode.mode !== "station") return;
    // Ao ativar (e ao reconectar), imprime o que ficou pendente enquanto a estação estava fechada.
    const catchUp = async () => {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from("print_jobs" as "orders").select("id, order_id").eq("business_unit_id", businessUnitId).eq("status", "pending").gte("created_at", since).order("created_at");
      ((data ?? []) as unknown as Job[]).forEach(printJob);
    };
    void catchUp();
    const channel = supabase.channel(`print-jobs:${businessUnitId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "print_jobs", filter: `business_unit_id=eq.${businessUnitId}` }, (payload) => {
        printJob(payload.new as Job);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "print_jobs", filter: `business_unit_id=eq.${businessUnitId}` }, (payload) => {
        const row = payload.new as Job;
        if (row.status === "pending") printJob(row); else void loadJobs();
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void catchUp();
      });
    return () => { void supabase.removeChannel(channel); setConnected(false); };
  }, [active, businessUnitId, printMode.mode, printJob, loadJobs]);

  const toggleDestination = (d: string) => {
    const next = destinations.includes(d) ? destinations.filter((x) => x !== d) : [...destinations, d];
    if (!next.length) return;
    setDestinations(next);
    try { localStorage.setItem(DEST_KEY, JSON.stringify(next)); } catch { /* sem storage */ }
  };

  if (authLoading || rolesLoading || !printMode.loaded) return <main className="p-6 text-sm">Carregando...</main>;
  if (!user || !allowed) return <main className="p-6 text-sm">Acesso restrito à equipe da unidade. <Link className="underline" to="/login">Entrar</Link></main>;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Printer className="h-5 w-5 text-primary" /> Estação de impressão</h1>
          <p className="text-sm text-muted-foreground">{unitName} · comandas de todos os pedidos: mesa, online e integrações.</p>
        </div>
        <Link to="/" className="text-sm underline">Voltar</Link>
      </header>

      {printMode.mode !== "station" ? (
        <div role="status" className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> A unidade ainda imprime no aparelho de quem envia o pedido.</p>
          <p className="text-muted-foreground">Para usar esta estação, um administrador escolhe <strong>Estação de impressão</strong> em Admin → Unidades.</p>
        </div>
      ) : (
        <section className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button className="gap-2" variant={active ? "outline" : "default"} onClick={() => setActive((v) => !v)}>
              <Power className="h-4 w-4" /> {active ? "Pausar estação" : "Ativar estação"}
            </Button>
            <span className={`text-sm ${active && connected ? "text-emerald-500" : "text-muted-foreground"}`} role="status">
              {!active ? "Pausada: nada será impresso neste aparelho." : connected ? "Conectada: imprimindo pedidos novos." : "Conectando..."}
            </span>
          </div>
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1 text-xs text-muted-foreground">Este aparelho imprime:</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={destinations.includes("kitchen")} onChange={() => toggleDestination("kitchen")} /> Cozinha</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={destinations.includes("bar")} onChange={() => toggleDestination("bar")} /> Bar</label>
          </fieldset>
          <p className="text-xs text-muted-foreground">Deixe esta tela aberta no aparelho ligado à impressora. Para imprimir sem a janela de confirmação, abra o Chrome com a opção <code>--kiosk-printing</code> e defina a impressora térmica como padrão.</p>
        </section>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Últimas comandas (12 h)</h2>
        {!jobs.length && <p className="text-sm text-muted-foreground">Nenhuma comanda na fila.</p>}
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span>{new Date(job.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · Pedido {job.order_id.slice(0, 8)}</span>
              <span className="flex items-center gap-2">
                <span className={job.status === "printed" ? "text-emerald-500" : job.status === "failed" ? "text-destructive" : "text-amber-500"}>
                  {{ pending: "Na fila", printing: "Imprimindo", printed: "Impressa", failed: `Falhou${job.error_message ? `: ${job.error_message}` : ""}` }[job.status] ?? job.status}
                </span>
                {(job.status === "printed" || job.status === "failed") && (
                  <Button size="sm" variant="outline" className="gap-1" aria-label={`Reimprimir pedido ${job.order_id.slice(0, 8)}`}
                    onClick={async () => { const r = await rpc("requeue_print_job", { p_job: job.id }); if (r.error) setError(r.error.message); else void loadJobs(); }}>
                    <RotateCcw className="h-3 w-3" /> Reimprimir
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
