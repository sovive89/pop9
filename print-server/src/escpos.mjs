// Montagem das comandas em ESC/POS (bytes que a térmica entende).
// Código puro: sem rede nem Supabase, para ser testado isoladamente.

const ESC = 0x1b;
const GS = 0x1d;

// Página de código 850 (Latin-1 do DOS), a mais comum nas térmicas vendidas no Brasil.
const CP850 = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "å": 0x86, "ç": 0x87,
  "ê": 0x88, "ë": 0x89, "è": 0x8a, "ï": 0x8b, "î": 0x8c, "ì": 0x8d, "Ä": 0x8e, "Å": 0x8f,
  "É": 0x90, "ô": 0x93, "ö": 0x94, "ò": 0x95, "û": 0x96, "ù": 0x97, "Ö": 0x99, "Ü": 0x9a,
  "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6, "º": 0xa7,
  "Á": 0xb5, "Â": 0xb6, "À": 0xb7, "ã": 0xc6, "Ã": 0xc7, "Ê": 0xd2, "Í": 0xd6, "Ó": 0xe0,
  "Ô": 0xe2, "Ò": 0xe3, "õ": 0xe4, "Õ": 0xe5, "Ú": 0xe9, "°": 0xf8,
};

/** Texto → bytes CP850. Caractere fora da tabela vira a letra sem acento (ou "?"). */
export function encodeCp850(text) {
  const out = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code === 0x0a || (code >= 0x20 && code < 0x7f)) out.push(code);
    else if (CP850[ch] !== undefined) out.push(CP850[ch]);
    else {
      const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      for (const c of plain) { const k = c.codePointAt(0); out.push(k >= 0x20 && k < 0x7f ? k : 0x3f); }
    }
  }
  return out;
}

/** Quebra o texto em linhas de no máximo `width` colunas, sem cortar palavras quando possível. */
export function wrap(text, width) {
  const lines = [];
  for (const raw of String(text).split("\n")) {
    let line = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += " " + word;
      else { lines.push(line); line = word; }
      while (line.length > width) { lines.push(line.slice(0, width)); line = line.slice(width); }
    }
    lines.push(line);
  }
  return lines;
}

/** Colunas por largura de papel (fonte A padrão). */
export const columnsFor = (paperWidth) => (Number(paperWidth) <= 58 ? 32 : 48);

/**
 * Uma comanda por unidade de item, igual à Estação de impressão do navegador:
 * cada cozinheiro pega o papel do que vai preparar.
 */
export function buildKitchenTickets({ label, clientName, orderId, channel, items, now = new Date() }) {
  const tickets = [];
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  for (const item of items) {
    const quantity = Math.max(1, Math.min(50, Math.floor(Number(item.quantity) || 1)));
    const mods = [
      ...(Array.isArray(item.ingredientMods) ? item.ingredientMods : []).map((m) => (m.action === "remove" ? `S/ ${m.name}` : `C/ EXTRA ${m.name}`)),
      ...(item.observation ? [`OBS: ${item.observation}`] : []),
    ];
    for (let i = 0; i < quantity; i++) {
      tickets.push({
        destination: item.destination || "kitchen",
        title: item.destination === "bar" ? "BAR" : (item.destination && item.destination !== "kitchen" ? String(item.destination).replace(/_/g, " ").toUpperCase() : "COMANDA"),
        label, clientName, time,
        orderRef: String(orderId).slice(0, 8),
        channel: channel ?? null,
        unit: quantity > 1 ? `Unidade ${i + 1} de ${quantity}` : null,
        name: String(item.name).toUpperCase(),
        mods,
      });
    }
  }
  return tickets;
}

/** Converte uma comanda em bytes ESC/POS. */
export function renderTicket(ticket, { paperWidth = 80, autoCut = true } = {}) {
  const cols = columnsFor(paperWidth);
  const bytes = [];
  const raw = (...b) => bytes.push(...b);
  const text = (s) => bytes.push(...encodeCp850(s));
  const line = (s = "") => { text(s); raw(0x0a); };
  const rule = (ch = "-") => line(ch.repeat(cols));

  raw(ESC, 0x40);            // inicializa
  raw(ESC, 0x74, 2);         // página de código 850
  raw(ESC, 0x61, 1);         // centralizado
  raw(GS, 0x21, 0x11);       // fonte dupla (altura e largura)
  line(ticket.title);
  raw(GS, 0x21, 0x00);
  raw(ESC, 0x61, 0);         // à esquerda
  rule();
  raw(ESC, 0x45, 1); text(ticket.label); raw(ESC, 0x45, 0);
  const gap = Math.max(1, cols - ticket.label.length - ticket.time.length);
  line(" ".repeat(gap) + ticket.time);
  line(`Cliente: ${ticket.clientName}`);
  line(`Pedido: ${ticket.orderRef}${ticket.channel ? ` - ${ticket.channel.toUpperCase()}` : ""}`);
  if (ticket.unit) line(ticket.unit);
  rule("=");
  raw(GS, 0x21, 0x01);       // altura dupla para o item
  raw(ESC, 0x45, 1);
  for (const l of wrap(`1x ${ticket.name}`, cols)) line(l);
  raw(ESC, 0x45, 0);
  raw(GS, 0x21, 0x00);
  for (const mod of ticket.mods) for (const l of wrap(`  ${mod}`, cols)) line(l);
  rule("=");
  if (ticket.mods.length) { raw(ESC, 0x61, 1); line("*** ATENCAO AS MODIFICACOES ***"); raw(ESC, 0x61, 0); }
  raw(ESC, 0x64, 4);         // avança 4 linhas
  if (autoCut) raw(GS, 0x56, 0x42, 0x00); // corte parcial
  return Uint8Array.from(bytes);
}

/** Página de teste para conferir conexão, acentos e corte. */
export function renderTestPage(printerName, { paperWidth = 80, autoCut = true, now = new Date() } = {}) {
  return renderTicket({
    title: "TESTE POP9", label: printerName, clientName: "Teste de impressão",
    time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
    orderRef: "--------", channel: null, unit: null,
    name: "Ação, pão, coração, çãõé", mods: [`Papel ${paperWidth} mm`],
  }, { paperWidth, autoCut });
}
