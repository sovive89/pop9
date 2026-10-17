import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseLotEditData } from "@/hooks/useStockData";

type MockQueryResult = { data: unknown[]; error: null };
type MockQuery = {
  select: (...columns: string[]) => MockQuery;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => MockQuery;
  limit: (count: number) => MockQuery;
  eq: (column: string, value: unknown) => MockQuery;
  is: (column: string, value: unknown) => MockQuery;
  not: (column: string, operator: string, value: unknown) => MockQuery;
  or: (condition: string) => MockQuery;
  single: () => MockQuery;
  then: (resolve: (value: MockQueryResult) => unknown) => Promise<unknown>;
};

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

const makeQuery = (): MockQuery => {
  const query: MockQuery = {
    select: () => query,
    order: () => query,
    limit: () => query,
    eq: () => query,
    is: () => query,
    not: () => query,
    or: () => query,
    single: () => query,
    then: (resolve) => Promise.resolve(resolve({ data: [], error: null })),
  };
  return query;
};

vi.mock("@/hooks/useCurrentBusinessUnit", () => ({
  useCurrentBusinessUnit: () => ({ businessUnitId: "unit" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => makeQuery()),
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    rpc,
  },
}));

import { useStockData } from "@/hooks/useStockData";

describe("stock purchase RPC contract", () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: null, error: null });
    rpc.mockClear();
  });

  it("sends the typed JSON edit payload and omits it for cancellation", async () => {
    const editData: PurchaseLotEditData = {
      quantidade_compra: 12,
      fator_conversao: 2,
      unidade_compra: "caixa",
      custo_total: 240,
      fornecedor_id: "supplier",
      validade: "2026-12-31",
      numero_lote: "L-12",
      caixas: 12,
      conteudo_por_caixa: 2,
    };
    const { result, unmount } = renderHook(() => useStockData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.managePurchaseLot("lot", "edit", editData);
      await result.current.managePurchaseLot("lot", "cancel");
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "manage_purchase_lot", {
      p_lote_id: "lot",
      p_action: "edit",
      p_data: editData,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "manage_purchase_lot", {
      p_lote_id: "lot",
      p_action: "cancel",
    });
    unmount();
  });
});
