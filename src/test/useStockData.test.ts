import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: "unit" }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let rows: Array<Record<string, unknown>> = table === "lotes" ? [{
      id: "lot", raw_material_id: "material", origem: "compra", numero_lote: "L-1",
      quantidade_entrada: 8, data_entrada: "2026-10-09", validade: null, cancelado_em: null,
    }] : table === "stock_movements" ? [
      { lote_id: "lot", type: "saida", quantity: 2, reference_type: "lote_correcao" },
      { lote_id: "lot", type: "saida", quantity: 1, reference_type: null },
      { lote_id: "lot", type: "saida", quantity: 1, reference_type: "venda" },
    ] : table === "production_batch_inputs" ? [{ lote_id: "lot", quantity_used: 1 }] : [];
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
      is: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
      not: (key: string, _operator: string, value: unknown) => { rows = rows.filter(row => row[key] !== value); return query; },
      or: (condition: string) => {
        const predicates = condition.split(",").map(part => part.split("."));
        rows = rows.filter(row => predicates.some(([key, operator, value]) =>
          operator === "is" ? row[key] == null : operator === "neq" && row[key] != null && row[key] !== value
        ));
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  },
} }));
import { useStockData } from "@/hooks/useStockData";

describe("stock lot balance after quantity corrections", () => {
  it("ignores correction outputs but counts real stock and production consumption", async () => {
    const { result, unmount } = renderHook(() => useStockData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lotes).toHaveLength(1);
    // Quantidade corrigida 8 - saídas reais 2 - produção 1 = 5.
    expect(result.current.lotes[0].quantidadeRestante).toBe(5);
    unmount();
  });
});
