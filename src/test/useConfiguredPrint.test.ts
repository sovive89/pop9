import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ printers: [] as { paperWidth: number; copies: number }[], lookup: vi.fn(), print: vi.fn() }));
vi.mock("@/hooks/usePrinterConfigs", () => ({ usePrinterConfigs: () => ({ getPrintersForGatilho: mock.lookup }) }));
vi.mock("@/utils/thermal-print", () => ({ printReceipt: mock.print }));
import { useConfiguredPrint } from "@/hooks/useConfiguredPrint";
const html = "<html><head></head><body><p>Conta</p></body></html>";
beforeEach(() => { mock.printers = [];mock.lookup.mockReset().mockImplementation(() => mock.printers);mock.print.mockReset(); });
describe("configured browser bills", () => {
  it("applies saved paper and copies to the operational receipt", () => {
    mock.printers = [{ paperWidth: 58, copies: 2 }];const { result } = renderHook(() => useConfiguredPrint());result.current(html, "conta_mesa");
    expect(mock.lookup).toHaveBeenCalledWith("conta_mesa");expect(mock.print).toHaveBeenCalledOnce();const printed = mock.print.mock.calls[0][0] as string;expect(printed).toContain("width:58mm");expect(printed.match(/class="receipt-copy"/g)).toHaveLength(2);
  });
  it("preserves the existing dialog when no printer is configured", () => { const { result } = renderHook(() => useConfiguredPrint());result.current(html, "conta_individual");expect(mock.print).toHaveBeenCalledWith(html); });
});
