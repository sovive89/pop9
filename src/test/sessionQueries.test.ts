import { describe, expect, it, vi } from "vitest";
import { fetchActiveSessionsWithOriginFallback } from "@/hooks/sessionQueries";

const selectWithOrigin =
  "id, table_number, started_at, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at, origin, order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))";
const selectLegacy =
  "id, table_number, started_at, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at, order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))";

describe("fetchActiveSessionsWithOriginFallback", () => {
  it("returns first query result when origin is available", async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: [{ id: "s1" }], error: null });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabaseLike = { from: fromMock } as any;

    const result = await fetchActiveSessionsWithOriginFallback(supabaseLike);

    expect(result).toEqual({ data: [{ id: "s1" }], error: null });
    expect(fromMock).toHaveBeenCalledWith("sessions");
    expect(selectMock).toHaveBeenCalledWith(selectWithOrigin);
    expect(eqMock).toHaveBeenCalledWith("status", "active");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("retries with legacy select when origin column is missing", async () => {
    const firstEq = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42703", message: "column orders_1.origin does not exist" },
    });
    const secondEq = vi.fn().mockResolvedValue({ data: [{ id: "legacy" }], error: null });
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ eq: firstEq })
      .mockReturnValueOnce({ eq: secondEq });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabaseLike = { from: fromMock } as any;

    const result = await fetchActiveSessionsWithOriginFallback(supabaseLike);

    expect(result).toEqual({ data: [{ id: "legacy" }], error: null });
    expect(selectMock).toHaveBeenNthCalledWith(1, selectWithOrigin);
    expect(selectMock).toHaveBeenNthCalledWith(2, selectLegacy);
    expect(firstEq).toHaveBeenCalledWith("status", "active");
    expect(secondEq).toHaveBeenCalledWith("status", "active");
  });

  it("does not retry for unrelated errors", async () => {
    const firstEq = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    const selectMock = vi.fn().mockReturnValue({ eq: firstEq });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabaseLike = { from: fromMock } as any;

    const result = await fetchActiveSessionsWithOriginFallback(supabaseLike);

    expect(result).toEqual({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    expect(selectMock).toHaveBeenCalledTimes(1);
  });
});
