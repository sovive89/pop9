import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ unit: "a", response: vi.fn(), filters: vi.fn() }));
const user = { id: "staff" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user }) }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: mocks.unit }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const query = { select: () => query, eq: (key: string, value: string) => { mocks.filters(key, value); return query; }, gte: () => query, lt: () => query, order: () => query, limit: () => mocks.response() };
    return query;
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: vi.fn(),
} }));
import { useDeliveredOrders } from "@/hooks/useDeliveredOrders";
const row = { id: "delivered-a", client_id: "client", placed_at: "2026-10-09T12:00:00Z", origin: "mesa", sessions: { table_number: 1 }, session_clients: { name: "Ricardo" }, order_items: [] };
describe("delivered order history scope", () => {
  it("reads delivered orders independently of session status and hides them on unit change", async () => {
    let resolveB!: (value: unknown) => void;
    mocks.response.mockResolvedValueOnce({ data: [row], error: null }).mockReturnValueOnce(new Promise(resolve => { resolveB = resolve; }));
    const { result, rerender, unmount } = renderHook(() => useDeliveredOrders(true, "2026-10-09"));
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    expect(mocks.filters).toHaveBeenCalledWith("business_unit_id", "a");
    expect(mocks.filters).toHaveBeenCalledWith("status", "delivered");
    expect(mocks.filters).not.toHaveBeenCalledWith("status", "active");
    mocks.unit = "b";
    rerender();
    expect(result.current.orders).toEqual([]);
    await act(async () => { resolveB({ data: [], error: null }); });
    expect(result.current.orders).toEqual([]);
    unmount();
  });
});
