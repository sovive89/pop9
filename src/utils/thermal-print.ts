import {pickupLabel} from "@/utils/operationalLinks";
import type { ClientOrder, OrderItem } from "./orders";
import { getItemUnitPrice, formatCurrency, getClientTotal, getTableTotal } from "./orders";
import type { ClientInfo } from "@/components/TableSessionPanel";
import { isKitchenItem } from "@/data/menu";

/** Escapa texto antes de ir para o HTML da comanda (nome do item e observação podem vir do cliente). */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STORE_NAME = "CONFIT BURGUER";
const STORE_LINE2 = "Artesanal · Brasília-DF";

// ── Base receipt HTML wrapper for 80mm thermal (≈48 chars per line) ──

const wrapReceipt = (bodyHtml: string): string => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.4;
    width: 80mm;
    padding: 4mm;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: 16px; font-weight: bold; }
  .small { font-size: 10px; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .double-line { border-top: 2px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .row-indent { display: flex; justify-content: space-between; padding-left: 12px; }
  .mod { padding-left: 16px; font-size: 10px; color: #333; }
  .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  td.qty { width: 24px; text-align: center; }
  td.price { text-align: right; white-space: nowrap; }
  td.name { padding-left: 4px; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

const now = () => {
  const d = new Date();
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

// ── Kitchen Order — one receipt PER UNIT of each kitchen item ──

export const buildKitchenReceipts = (
  tableId: number,
  clientName: string,
  items: OrderItem[],
  orderId?: string
): string[] => {
  // Setor gravado pelo banco (pela categoria do item); o cardápio fixo antigo só vale sem ele.
  const kitchenItems = items.filter((item) => (item.destination ? item.destination === "kitchen" : isKitchenItem(item.menuItemId)));
  if (kitchenItems.length === 0) return [];

  const receipts: string[] = [];

  for (const item of kitchenItems) {
    const mods: string[] = [];
    if (item.ingredientMods) {
      item.ingredientMods.forEach((m) => {
        mods.push(m.action === "remove" ? `  S/ ${escapeHtml(m.name)}` : `  C/ EXTRA ${escapeHtml(m.name)}`);
      });
    }
    if (item.observation) {
      mods.push(`  OBS: ${escapeHtml(item.observation)}`);
    }

    const modsHtml = mods.map((m) => `<tr><td></td><td class="mod">${m}</td></tr>`).join("");

    for (let i = 0; i < item.quantity; i++) {
      receipts.push(wrapReceipt(`
        <div class="center big">🔥 COMANDA</div>
        <div class="center small">${STORE_NAME}</div>
        <div class="line"></div>
        <div class="row"><span class="bold">${pickupLabel(tableId)}</span><span>${now()}</span></div>
        <div>Cliente: <span class="bold">${escapeHtml(clientName)}</span></div>
        ${orderId ? `<div class="small">Pedido: ${escapeHtml(orderId.slice(0, 8))}</div>` : ""}
        ${item.quantity > 1 ? `<div class="small bold">Unidade ${i + 1} de ${item.quantity}</div>` : ""}
        <div class="double-line"></div>
        <table>
          <tr>
            <td class="qty bold">1x</td>
            <td class="name bold">${escapeHtml(item.name.toUpperCase())}</td>
          </tr>
          ${modsHtml}
        </table>
        <div class="double-line"></div>
        <div class="center small">*** ATENÇÃO ÀS MODIFICAÇÕES ***</div>
        <br><br><br>
      `));
    }
  }

  return receipts;
};

// ── Waiter Order (Comanda do Garçom — todos os itens) ──

export const buildWaiterReceipt = (
  tableId: number,
  clientName: string,
  items: OrderItem[],
  orderId?: string
): string => {
  if (items.length === 0) return "";

  const itemsHtml = items.map((item) => {
    const mods: string[] = [];
    if (item.ingredientMods) {
      item.ingredientMods.forEach((m) => {
        mods.push(m.action === "remove" ? `  S/ ${escapeHtml(m.name)}` : `  C/ EXTRA ${escapeHtml(m.name)}`);
      });
    }
    if (item.observation) {
      mods.push(`  OBS: ${escapeHtml(item.observation)}`);
    }
    return `
      <tr>
        <td class="qty bold">${item.quantity}x</td>
        <td class="name bold">${escapeHtml(item.name.toUpperCase())}</td>
      </tr>
      ${mods.map((m) => `<tr><td></td><td class="mod">${m}</td></tr>`).join("")}
    `;
  }).join("");

  return wrapReceipt(`
    <div class="center big">📋 PEDIDO</div>
    <div class="center small">${STORE_NAME}</div>
    <div class="line"></div>
    <div class="row"><span class="bold">${pickupLabel(tableId)}</span><span>${now()}</span></div>
    <div>Cliente: <span class="bold">${escapeHtml(clientName)}</span></div>
    ${orderId ? `<div class="small">Pedido: ${orderId.slice(0, 8)}</div>` : ""}
    <div class="double-line"></div>
    <table>${itemsHtml}</table>
    <div class="double-line"></div>
    <div class="center small">*** COMANDA DO GARÇOM ***</div>
    <br><br><br>
  `);
};

// ── Client Bill (Conta Individual) ──

export const buildClientBillReceipt = (
  tableId: number,
  client: ClientInfo,
  order: ClientOrder,
  includeServiceCharge = false
): string => {
  const ordersHtml = order.orders.map((o) => {
    const itemsHtml = o.items.map((item) => {
      const unitPrice = getItemUnitPrice(item);
      const lineTotal = unitPrice * item.quantity;
      return `
        <tr>
          <td class="qty">${item.quantity}x</td>
          <td class="name">${escapeHtml(item.name)}</td>
          <td class="price">${formatCurrency(lineTotal)}</td>
        </tr>
        ${(item.ingredientMods ?? [])
          .filter((m) => m.action === "extra" && m.extraPrice)
          .map((m) => `<tr><td></td><td class="mod">+ ${escapeHtml(m.name)}</td><td class="price small">${formatCurrency(m.extraPrice! * item.quantity)}</td></tr>`)
          .join("")}
      `;
    }).join("");

    return `<table>${itemsHtml}</table>`;
  }).join('<div class="line"></div>');

  const subtotal = getClientTotal(order);
  const serviceCharge = includeServiceCharge ? subtotal * 0.1 : 0;
  const total = subtotal + serviceCharge;

  return wrapReceipt(`
    <div class="center big">${STORE_NAME}</div>
    <div class="center small">${STORE_LINE2}</div>
    <div class="line"></div>
    <div class="center bold">CONTA INDIVIDUAL</div>
    <div class="line"></div>
    <div class="row"><span><span class="bold">${pickupLabel(tableId)}</span></span><span>${now()}</span></div>
    <div>Cliente: <span class="bold">${escapeHtml(client.name)}</span></div>
    <div class="double-line"></div>
    ${ordersHtml}
    <div class="double-line"></div>
    <div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    ${includeServiceCharge ? `<div class="row"><span>Taxa de serviço (10%)</span><span>${formatCurrency(serviceCharge)}</span></div>` : ""}
    <div class="total-row"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
    <div class="line"></div>
    <div class="center small">Obrigado pela preferência!</div>
    <div class="center small">${STORE_NAME}</div>
    <br><br><br>
  `);
};

// ── Table Bill (Conta da Mesa) ──

export const buildTableBillReceipt = (
  tableId: number,
  clients: ClientInfo[],
  orders: ClientOrder[],
  includeServiceCharge = false
): string => {
  const clientsHtml = clients.map((client) => {
    const clientOrder = orders.find((o) => o.clientId === client.id);
    if (!clientOrder || clientOrder.orders.length === 0) return "";
    const clientTotal = getClientTotal(clientOrder);

    const itemsHtml = clientOrder.orders.flatMap((o) =>
      o.items.map((item) => {
        const unitPrice = getItemUnitPrice(item);
        return `
          <tr>
            <td class="qty">${item.quantity}x</td>
            <td class="name">${escapeHtml(item.name)}</td>
            <td class="price">${formatCurrency(unitPrice * item.quantity)}</td>
          </tr>
        `;
      })
    ).join("");

    return `
      <div class="bold">${escapeHtml(client.name)}</div>
      <table>${itemsHtml}</table>
      <div class="row-indent"><span></span><span class="bold">${formatCurrency(clientTotal)}</span></div>
      <div class="line"></div>
    `;
  }).join("");

  const subtotal = getTableTotal(orders);
  const serviceCharge = includeServiceCharge ? subtotal * 0.1 : 0;
  const total = subtotal + serviceCharge;

  return wrapReceipt(`
    <div class="center big">${STORE_NAME}</div>
    <div class="center small">${STORE_LINE2}</div>
    <div class="line"></div>
    <div class="center bold">CONTA DA MESA</div>
    <div class="line"></div>
    <div class="row"><span><span class="bold">${pickupLabel(tableId)}</span></span><span>${now()}</span></div>
    <div>Clientes: <span class="bold">${clients.length}</span></div>
    <div class="double-line"></div>
    ${clientsHtml}
    <div class="double-line"></div>
    <div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    ${includeServiceCharge ? `<div class="row"><span>Taxa de serviço (10%)</span><span>${formatCurrency(serviceCharge)}</span></div>` : ""}
    <div class="total-row"><span>TOTAL MESA</span><span>${formatCurrency(total)}</span></div>
    <div class="line"></div>
    <div class="center small">Obrigado pela preferência!</div>
    <div class="center small">${STORE_NAME}</div>
    <br><br><br>
  `);
};

// ── Ready Notification Receipt (printed when order is fully ready) ──

export const buildReadyReceipt = (
  tableId: number,
  clientName: string,
  items: OrderItem[],
  orderId?: string
): string => {
  if (items.length === 0) return "";

  const itemsHtml = items.map((item) => `
    <tr>
      <td class="qty bold">${item.quantity}x</td>
      <td class="name bold">${escapeHtml(item.name.toUpperCase())}</td>
    </tr>
  `).join("");

  return wrapReceipt(`
    <div class="center big">✅ PEDIDO PRONTO</div>
    <div class="center small">${STORE_NAME}</div>
    <div class="line"></div>
    <div class="row"><span class="bold">${pickupLabel(tableId)}</span><span>${now()}</span></div>
    <div>Cliente: <span class="bold">${escapeHtml(clientName)}</span></div>
    ${orderId ? `<div class="small">Pedido: ${orderId.slice(0, 8)}</div>` : ""}
    <div class="double-line"></div>
    <table>${itemsHtml}</table>
    <div class="double-line"></div>
    <div class="center bold">*** RETIRAR NA COZINHA ***</div>
    <br><br><br>
  `);
};

// ── Print function — opens receipt in new window for network printer ──

export const printReceipt = (html: string) => {
  const printWindow = window.open("", "_blank", "width=320,height=600");
  if (!printWindow) {
    alert("Permita pop-ups para imprimir.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    // Close after a short delay to allow print dialog
    setTimeout(() => printWindow.close(), 1000);
  };
};

// ── Estação de impressão: comanda a partir do pedido gravado no banco ──
// Usa o destino gravado em order_items (cozinha/bar) em vez da lista fixa de categorias,
// e escapa todo texto, porque pedidos online trazem nome e observação digitados pelo cliente.
export type StationItem = { name: string; quantity: number; observation?: string | null; ingredientMods?: { action: string; name: string }[] | null; destination: string };
export const buildStationTickets = (
  label: string, clientName: string, items: StationItem[], orderId: string, destinations: string[], origin?: string | null,
): string[] => {
  const tickets: string[] = [];
  for (const item of items.filter((i) => destinations.includes(i.destination))) {
    const mods = [
      ...(item.ingredientMods ?? []).map((m) => (m.action === "remove" ? `  S/ ${escapeHtml(m.name)}` : `  C/ EXTRA ${escapeHtml(m.name)}`)),
      ...(item.observation ? [`  OBS: ${escapeHtml(item.observation)}`] : []),
    ].map((m) => `<tr><td></td><td class="mod">${m}</td></tr>`).join("");
    const quantity = Math.max(1, Math.min(50, Math.floor(item.quantity || 1)));
    for (let i = 0; i < quantity; i++) {
      tickets.push(wrapReceipt(`
        <div class="center big">${item.destination === "bar" ? "🍹 BAR" : "🔥 COMANDA"}</div>
        <div class="center small">${STORE_NAME}</div>
        <div class="line"></div>
        <div class="row"><span class="bold">${escapeHtml(label)}</span><span>${now()}</span></div>
        <div>Cliente: <span class="bold">${escapeHtml(clientName)}</span></div>
        <div class="small">Pedido: ${escapeHtml(orderId.slice(0, 8))}${origin ? ` · <span class="bold">${escapeHtml(origin.toUpperCase())}</span>` : ""}</div>
        ${quantity > 1 ? `<div class="small bold">Unidade ${i + 1} de ${quantity}</div>` : ""}
        <div class="double-line"></div>
        <table><tr><td class="qty bold">1x</td><td class="name bold">${escapeHtml(item.name.toUpperCase())}</td></tr>${mods}</table>
        <div class="double-line"></div>
        <div class="center small">*** ATENÇÃO ÀS MODIFICAÇÕES ***</div>
        <br><br><br>
      `));
    }
  }
  return tickets;
};
