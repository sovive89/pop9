import { applyPrintLayout, type PrintLayout } from "./printLayout";
import type { PrinterGatilho, PrinterSector, PrinterTipo, PrinterDestino } from "@/hooks/usePrinterConfigs";
import { buildStationTickets, buildWaiterReceipt, buildClientBillReceipt, buildTableBillReceipt, buildReadyReceipt, escapeHtml } from "@/utils/thermal-print";
import type { ClientOrder, OrderItem } from "@/utils/orders";

export type PrinterPreset = { id: string; label: string; setor: PrinterSector; tipo: PrinterTipo; gatilhos: PrinterGatilho[]; destinos: PrinterDestino[]; paperWidth: number; copies: number; autoCut: boolean; description: string };
export const PRINTER_PRESETS: PrinterPreset[] = [
  { id: "cozinha", label: "Cozinha", setor: "cozinha", tipo: "termica", gatilhos: ["comanda_cozinha"], destinos: ["kitchen"], paperWidth: 80, copies: 1, autoCut: true, description: "Uma comanda por item da cozinha, com modificações e observações." },
  { id: "bar", label: "Bar", setor: "bar", tipo: "termica", gatilhos: ["comanda_cozinha"], destinos: ["bar"], paperWidth: 80, copies: 1, autoCut: true, description: "Comandas somente dos itens destinados ao bar." },
  { id: "caixa", label: "Caixa", setor: "caixa", tipo: "termica", gatilhos: ["conta_mesa", "conta_individual"], destinos: ["kitchen", "bar"], paperWidth: 80, copies: 1, autoCut: true, description: "Conta da mesa e conta individual, com itens, adicionais e totais." },
  { id: "expedicao", label: "Expedição", setor: "expedicao", tipo: "termica", gatilhos: ["comanda_garcom", "pedido_pronto"], destinos: ["kitchen", "bar"], paperWidth: 80, copies: 1, autoCut: true, description: "Resumo completo do pedido e aviso de pronto para conferência da retirada." },
];

export function receiptPrintSettings(html: string, paperWidth: number, copies: number) {
  if (![58, 80].includes(paperWidth) || !Number.isInteger(copies) || copies < 1 || copies > 5) throw new Error("Papel ou cópias inválidos.");
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1];
  if (!body) throw new Error("Modelo de impressão inválido.");
  return `<!DOCTYPE html><html><head>${head}<style>@page{size:${paperWidth}mm auto}body{width:${paperWidth}mm}.receipt-copy{break-after:page}.receipt-copy:last-child{break-after:auto}</style></head><body>${Array.from({ length: copies }, () => `<div class="receipt-copy">${body}</div>`).join("")}</body></html>`;
}

/** Uses the same builders as operational printing; examples are never persisted. */
export function printerPreview(gatilho: PrinterGatilho, destinos: PrinterDestino[], unitName: string, paperWidth: number, copies: number, layout?: PrintLayout) {
  const items: OrderItem[] = [{ menuItemId: "example-burger", name: "Hambúrguer de exemplo", quantity: 1, price: 29.9, observation: "Sem cebola", ingredientMods: [{ name: "Queijo", action: "extra", extraPrice: 2 }] }, { menuItemId: "example-drink", name: "Suco de exemplo", quantity: 1, price: 8 }];
  const client = { id: "example-client", name: "Cliente de exemplo", addedAt: new Date(), phone: "" };
  const order: ClientOrder = { clientId: client.id, cart: [], orders: [{ id: "example-order", status: "ready", placedAt: new Date(), items }] };
  let html: string;
  switch (gatilho) {
    case "comanda_cozinha": html = buildStationTickets("TESTE — Mesa 01", client.name, items.map((item, index) => ({ ...item, destination: index === 0 ? "kitchen" : "bar" })), "example-order", destinos)[0] ?? "";break;
    case "comanda_garcom": html = buildWaiterReceipt(1, client.name, items, "example-order");break;
    case "conta_mesa": html = buildTableBillReceipt(1, [client], [order]);break;
    case "conta_individual": html = buildClientBillReceipt(1, client, order);break;
    case "pedido_pronto": html = buildReadyReceipt(-1, client.name, items, "example-order");break;
    case "etiqueta_producao": html = '<!DOCTYPE html><html><head><style>body{font-family:monospace;padding:4mm;color:#000;background:#fff}</style></head><body><h3>ETIQUETA DE EXEMPLO</h3><p>Molho da casa — lote TESTE</p><p>Produção e validade: conferir no lote real</p><p>Quantidade: 1 kg</p></body></html>';break;
  }
  html = html.split("CONFIT BURGUER").join(escapeHtml(unitName || "PØP9")).split("Artesanal · Brasília-DF").join("MODELO PREDEFINIDO").replace("<body>", '<body><div style="text-align:center;font-weight:bold;border-bottom:1px dashed;margin-bottom:4mm">TESTE DE IMPRESSÃO — SEM VALOR FISCAL</div>');
  return receiptPrintSettings(applyPrintLayout(html, layout), paperWidth, copies);
}
