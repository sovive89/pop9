import { describe, expect, it } from "vitest";
import { applyPrintLayout, defaultPrintLayout } from "@/lib/printLayout";
import { normalizeLayout, normalizeLayouts, logoSvg } from "../../print-server/src/layout.mjs";
import { buildKitchenTickets, renderTicket } from "../../print-server/src/escpos.mjs";
import { printerPreview } from "@/lib/printerPresets";

const kitchen = buildKitchenTickets({ label: "Mesa 01", clientName: "CLIENTE_TESTE", orderId: "REFERENC-123", channel: null, items: [{ name: "Burger", quantity: 1, observation: "OBSERVACAO_TESTE", destination: "kitchen" }] })[0];

describe("structured printer layouts", () => {
  it("bounds configuration, strips command bytes and rejects arbitrary logo content", () => {
    const layout = normalizeLayout({ header: "a".repeat(100) + "\x1b", footer: "\x1b@rodape", showClient: "false", logo: { width: 8, height: 1, hex: '<script>' } });
    expect(layout.header).toHaveLength(80);expect(layout.footer).toBe("@rodape");expect(layout.showClient).toBe(true);expect(layout.logo).toBeNull();
    expect(normalizeLayouts({ invalid: {}, conta_mesa: { header: "Caixa" } })).toEqual({ conta_mesa: expect.objectContaining({ header: "Caixa" }) });
    expect(normalizeLayouts(null)).toEqual({});
  });
  it("uses the same visibility fields and text in HTML and ESC/POS without dropping item or table", () => {
    const layout = { ...defaultPrintLayout(), header: "LOJA_TESTE", footer: "RODAPE_TESTE", showClient: false, showOrder: false, showTime: false, showModifications: false };
    const html = printerPreview("comanda_cozinha", ["kitchen"], "Loja", 80, 1, layout);
    expect(html).toContain("LOJA_TESTE");expect(html).toContain("RODAPE_TESTE");expect(html).not.toContain("Cliente de exemplo");expect(html).not.toContain("Sem cebola");expect(html).toContain("HAMBÚRGUER DE EXEMPLO");
    const bytes = renderTicket(kitchen, { layouts: { comanda_cozinha: layout } });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("LOJA_TESTE");expect(text).toContain("RODAPE_TESTE");expect(text).not.toContain("CLIENTE_TESTE");expect(text).not.toContain("REFERENC");expect(text).not.toContain("OBSERVACAO_TESTE");expect(text).toContain("Mesa 01");expect(text).toContain("BURGER");
  });
  it("renders bounded logo pixels to SVG and ESC/POS raster without external URLs", () => {
    const logo = { width: 8, height: 1, hex: "80" };
    expect(logoSvg(logo)).toContain('<rect x="0" y="0"');expect(logoSvg(logo)).not.toContain("href");
    const bytes = Buffer.from(renderTicket(kitchen, { layouts: { comanda_cozinha: { logo } } }));
    expect(bytes.includes(Buffer.from([0x1d, 0x76, 0x30, 0, 1, 0, 1, 0, 0x80]))).toBe(true);
    expect(normalizeLayout({ logo: { width: 999, height: 1, hex: "80" } }).logo).toBeNull();
  });
  it("escapes user text and preserves bill totals and copies", () => {
    const html = printerPreview("conta_mesa", ["kitchen", "bar"], "Loja", 58, 2, { ...defaultPrintLayout(), header: '<img src=x onerror="bad()">', footer: "<script>bad()</script>" });
    expect(html).not.toContain('<img src=x');expect(html).not.toContain('<script>');expect(html).toContain("&lt;script&gt;");expect(html).toContain("39,90");expect(html.match(/class="receipt-copy"/g)).toHaveLength(2);
    expect(applyPrintLayout("unchanged")).toBe("unchanged");
  });
  it("restoring defaults removes all custom options", () => {
    expect(defaultPrintLayout()).toEqual(normalizeLayout({}));
    expect(defaultPrintLayout().header).toBe("");expect(defaultPrintLayout().logo).toBeNull();
  });
});
