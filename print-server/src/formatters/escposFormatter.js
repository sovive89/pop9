const ESC = "\x1b";
const GS = "\x1d";
const LF = "\n";

const escpos = {
  init: Buffer.from([0x1b, 0x40]),
  alignLeft: Buffer.from([0x1b, 0x61, 0x00]),
  alignCenter: Buffer.from([0x1b, 0x61, 0x01]),
  boldOn: Buffer.from([0x1b, 0x45, 0x01]),
  boldOff: Buffer.from([0x1b, 0x45, 0x00]),
  doubleOn: Buffer.from([0x1d, 0x21, 0x11]),
  doubleOff: Buffer.from([0x1d, 0x21, 0x00]),
  cut: Buffer.from([0x1d, 0x56, 0x01]),
};

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "");

const wrapLine = (text, width) => {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line.length) {
      line = word;
      continue;
    }
    const candidate = `${line} ${word}`;
    if (candidate.length <= width) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length) lines.push(line);
  return lines;
};

const printLine = (text = "") => Buffer.from(`${normalizeText(text)}${LF}`, "ascii");

const eventLabel = (eventType) => {
  switch (eventType) {
    case "ORDER_CREATED":
      return "NOVO PEDIDO";
    case "ORDER_UPDATED":
      return "ATUALIZACAO PEDIDO";
    case "PRINT_BILL":
      return "CONTA";
    case "PRINT_COMMAND":
    default:
      return "COMANDO IMPRESSAO";
  }
};

export class EscPosFormatter {
  constructor({ lineWidth = 42 } = {}) {
    this.lineWidth = lineWidth;
  }

  buildTicket(job, printer) {
    const payload = job.payload ?? {};
    const restaurantName = payload.restaurant_name
      ?? payload.restaurantName
      ?? payload.company_name
      ?? payload.companyName
      ?? `Restaurant ${job.restaurant_id}`;
    const orderNumber = payload.order_number
      ?? payload.orderNumber
      ?? payload.order_id
      ?? payload.orderId
      ?? job.job_id;
    const tableNumber = payload.table_number ?? payload.tableNumber ?? payload.table ?? "-";
    const notes = payload.notes ?? payload.observation ?? payload.note;
    const items = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.order_items)
        ? payload.order_items
        : [];

    const rows = [];
    rows.push(escpos.init);
    rows.push(escpos.alignCenter);
    rows.push(escpos.boldOn);
    rows.push(escpos.doubleOn);
    rows.push(printLine(restaurantName));
    rows.push(escpos.doubleOff);
    rows.push(escpos.boldOff);
    rows.push(printLine(printer?.location ? `${printer.location}` : ""));
    rows.push(printLine(eventLabel(job.event_type)));
    rows.push(printLine("=".repeat(this.lineWidth)));

    rows.push(escpos.alignLeft);
    rows.push(printLine(`Mesa: ${tableNumber}`));
    rows.push(printLine(`Pedido: ${orderNumber}`));
    rows.push(printLine(`Job: ${job.job_id}`));
    rows.push(printLine(`Horario: ${new Date().toLocaleString("pt-BR")}`));
    rows.push(printLine("-".repeat(this.lineWidth)));

    rows.push(escpos.boldOn);
    rows.push(printLine("ITENS"));
    rows.push(escpos.boldOff);

    if (!items.length) {
      rows.push(printLine("(sem itens)"));
    } else {
      for (const item of items) {
        const name = item.name ?? item.title ?? "Item";
        const qty = Number(item.quantity ?? item.qty ?? 1);
        const line = `${qty}x ${name}`;
        for (const wrapped of wrapLine(line, this.lineWidth)) {
          rows.push(printLine(wrapped));
        }
      }
    }

    if (notes) {
      rows.push(printLine("-".repeat(this.lineWidth)));
      rows.push(escpos.boldOn);
      rows.push(printLine("OBSERVACOES"));
      rows.push(escpos.boldOff);
      for (const wrapped of wrapLine(notes, this.lineWidth)) {
        rows.push(printLine(wrapped));
      }
    }

    rows.push(printLine("-".repeat(this.lineWidth)));
    rows.push(escpos.alignCenter);
    rows.push(printLine("Impresso pelo Local Print Server"));
    rows.push(printLine(`${ESC}${GS}`)); // harmless marker for easier support diagnostics
    rows.push(printLine(LF));
    rows.push(escpos.cut);

    return Buffer.concat(rows);
  }
}
