import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ unit: "a", roles: ["admin"], query: vi.fn(), roleError: false }));
const user = { id: "admin" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user }) }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: mock.unit }) }));
vi.mock("@/hooks/useUnitRoles", () => ({ useUnitRoles: () => ({ roles: mock.roles, loading: false, error: mock.roleError }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filters: Record<string, unknown> = {};
  const q = { select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q; }, gte: (key: string, value: string) => { filters[`from:${key}`] = value; return q; }, lte: (key: string, value: string) => { filters[`to:${key}`] = value; return q; }, in: () => q, order: () => q, then: (resolve: (value: unknown) => unknown, reject: (value: unknown) => unknown) => Promise.resolve(mock.query(table, filters)).then(resolve, reject) };return q;
} } }));
import { useOperationalReportData } from "@/hooks/useOperationalReportData";
const from = new Date("2026-10-13T00:00:00Z"), to = new Date("2026-10-13T23:59:59Z");
beforeEach(() => { mock.unit = "a";mock.roles = ["admin"];mock.roleError = false;mock.query.mockReset();mock.query.mockResolvedValue({ data: [], error: null }); });
describe("reports follow the selected unit and permission", () => {
  it("filters every query by unit/period and counts only confirmed payments", async () => {
    const { result, unmount } = renderHook(() => useOperationalReportData(from, to));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock.query).toHaveBeenCalledWith("orders", { business_unit_id: "a", "from:placed_at": from.toISOString(), "to:placed_at": to.toISOString() });
    expect(mock.query).toHaveBeenCalledWith("payments", { business_unit_id: "a", status: "confirmed", "from:paid_at": from.toISOString(), "to:paid_at": to.toISOString() });unmount();
  });
  it("hides the prior unit immediately and discards its late response", async () => {
    let finish!: (value: unknown) => void;
    mock.query.mockImplementation((table: string, filters: Record<string, unknown>) => filters.business_unit_id === "a" && table === "orders" ? new Promise(resolve => { finish = resolve; }) : { data: table === "orders" ? [{ id: "b", order_items: [] }] : [], error: null });
    const { result, rerender, unmount } = renderHook(() => useOperationalReportData(from, to));await waitFor(() => expect(mock.query).toHaveBeenCalledTimes(2));
    mock.unit = "b";rerender();expect(result.current.orders).toEqual([]);
    await waitFor(() => expect(result.current.orders[0]?.id).toBe("b"));
    await act(async () => { finish({ data: [{ id: "a", order_items: [] }], error: null }); });expect(result.current.orders[0]?.id).toBe("b");unmount();
  });
  it("clears old results when permission changes and does not read as an attendant", async () => {
    mock.query.mockImplementation((table: string) => ({ data: table === "orders" ? [{ id: "a", order_items: [] }] : [], error: null }));
    const { result, rerender, unmount } = renderHook(() => useOperationalReportData(from, to));await waitFor(() => expect(result.current.orders).toHaveLength(1));
    mock.roles = ["attendant"];rerender();expect(result.current.orders).toEqual([]);expect(result.current.payments).toEqual([]);expect(mock.query).toHaveBeenCalledTimes(2);unmount();
  });
  it("shows an error without retaining old totals and permits retry", async () => {
    mock.query.mockResolvedValue({ data: [{ id: "a", order_items: [] }], error: null });
    const { result, unmount } = renderHook(() => useOperationalReportData(from, to));await waitFor(() => expect(result.current.loading).toBe(false));
    mock.query.mockResolvedValue({ data: null, error: { message: "offline" } });act(() => result.current.reload());expect(result.current.orders).toEqual([]);
    await waitFor(() => expect(result.current.error).toBe(true));expect(result.current.payments).toEqual([]);
    mock.query.mockResolvedValue({ data: [], error: null });act(() => result.current.reload());await waitFor(() => expect(result.current.loading).toBe(false));expect(result.current.error).toBe(false);unmount();
  });
  it("rejects an inverted period before querying", async () => {
    const { result, unmount } = renderHook(() => useOperationalReportData(to, from));await waitFor(() => expect(result.current.error).toBe(true));expect(mock.query).not.toHaveBeenCalled();unmount();
  });
});
