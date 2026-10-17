// Decide qual impressora recebe cada comanda. Código puro, testável.

const HOST = /^[A-Za-z0-9.-]{1,253}$/;

/** Impressoras de rede deste print server para a comanda da cozinha/bar. */
export function kitchenPrinters(rows) {
  return (rows ?? []).filter((p) =>
    p.active &&
    p.transport === "tcp" &&
    typeof p.host === "string" && HOST.test(p.host) &&
    Number.isInteger(p.port) && p.port >= 1 && p.port <= 65535 &&
    (Array.isArray(p.gatilhos) && p.gatilhos.length ? p.gatilhos : [p.gatilho]).includes("comanda_cozinha"),
  ).map((p) => ({
    id: p.id,
    name: p.name,
    host: p.host,
    port: p.port,
    destinos: Array.isArray(p.destinos) && p.destinos.length ? p.destinos : ["kitchen", "bar"],
    paperWidth: p.paper_width ?? 80,
    copies: Math.max(1, Math.min(5, Number(p.copies) || 1)),
    autoCut: p.auto_cut !== false,
  }));
}

/**
 * Distribui as comandas: cada uma vai para todas as impressoras que atendem o seu setor.
 * Devolve também as comandas sem impressora (para o erro explicar o que faltou).
 */
export function route(tickets, printers) {
  const plan = new Map();
  const orphans = [];
  for (const ticket of tickets) {
    const targets = printers.filter((p) => p.destinos.includes(ticket.destination));
    if (!targets.length) { orphans.push(ticket); continue; }
    for (const p of targets) {
      if (!plan.has(p.id)) plan.set(p.id, { printer: p, tickets: [] });
      plan.get(p.id).tickets.push(ticket);
    }
  }
  return { plan: [...plan.values()], orphans };
}

/** Rótulo da comanda (mesa, retirada ou canal), igual à Estação de impressão do navegador. */
const CHANNELS = { ifood: "iFood", "99food": "99Food", whatsapp: "WhatsApp", "own-pwa": "Online", keeta: "Keeta" };
export function channelLabel(order) {
  if (order?.source && CHANNELS[order.source]) return CHANNELS[order.source];
  if (order?.origin === "pwa") return "Online";
  return null;
}
