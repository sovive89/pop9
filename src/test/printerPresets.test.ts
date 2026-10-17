import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { PRINTER_PRESETS, printerPreview, receiptPrintSettings } from "@/lib/printerPresets";
describe("predefined print models", () => {
  it("routes the kitchen and bar models to their own items in the actual ticket builder", () => {
    const kitchen = PRINTER_PRESETS.find(p => p.id === "cozinha")!, bar = PRINTER_PRESETS.find(p => p.id === "bar")!;
    const k = printerPreview(kitchen.gatilhos[0], kitchen.destinos, "Minha loja", 80, 1), b = printerPreview(bar.gatilhos[0], bar.destinos, "Minha loja", 80, 1);
    expect(k).toContain("HAMBÚRGUER DE EXEMPLO");expect(k).not.toContain("SUCO DE EXEMPLO");expect(b).toContain("SUCO DE EXEMPLO");expect(b).not.toContain("HAMBÚRGUER DE EXEMPLO");
    expect(k).toContain("TESTE DE IMPRESSÃO");expect(k).toContain("Minha loja");
  });
  it("uses real bill and pickup builders, including extras in the bill total", () => {
    const bill = printerPreview("conta_mesa", ["kitchen", "bar"], "Loja", 58, 2);
    expect(bill).toContain("39,90");expect(bill).toContain("CONTA DA MESA");expect(bill).toContain("width:58mm");expect(bill.match(/class="receipt-copy"/g)).toHaveLength(2);
    expect(printerPreview("pedido_pronto", ["kitchen", "bar"], "Loja", 80, 1)).toContain("Retirada #1");
  });
  it("escapes unit names and refuses invalid paper/copies without adding active content", () => {
    const preview = printerPreview("conta_individual", ["kitchen"], '<img src=x onerror="bad()">', 80, 1);
    expect(preview).not.toContain("<img");expect(preview).toContain("&lt;img");
    expect(() => receiptPrintSettings(preview, 100, 1)).toThrow("inválidos");expect(() => receiptPrintSettings(preview, 80, 6)).toThrow("inválidos");
  });
});
