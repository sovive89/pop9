import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ unit: "a", query: vi.fn(), writes: [] as { action: string; filters: Record<string, string>; value: unknown }[] }));
const user = { id: "admin" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user }) }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: mock.unit }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const filters: Record<string, string> = {};let action = "read", value: unknown;
  const q = { select: () => q, eq: (key: string, v: string) => { filters[key] = v;return q; }, order: () => q, update: (v: unknown) => { action = "update";value = v;return q; }, delete: () => { action = "delete";return q; }, insert: (v: unknown) => { action = "insert";value = v;return q; }, then: (resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) => {
    if (action !== "read") { mock.writes.push({ action, filters, value });return Promise.resolve({ error: null }).then(resolve, reject); }
    return Promise.resolve(mock.query(filters.business_unit_id)).then(resolve, reject);
  } };return q;
} } }));
import { usePrinterConfigs } from "@/hooks/usePrinterConfigs";
const printer = (unit: string) => ({ id: unit, business_unit_id: unit, name: unit, setor: "cozinha", tipo: "termica", gatilho: "comanda_cozinha", gatilhos: ["comanda_cozinha"], destinos: ["kitchen"], active: true, connection_type: "browser" });
beforeEach(() => { mock.unit = "a";mock.writes = [];mock.query.mockReset().mockImplementation((unit: string) => ({ data: [printer(unit)], error: null })); });
describe("printer configuration follows selected unit", () => {
  it("filters reads and mutations by unit and refuses foreign equipment", async () => {
    const { result, unmount } = renderHook(() => usePrinterConfigs());await waitFor(() => expect(result.current.printers).toHaveLength(1));expect(mock.query).toHaveBeenCalledWith("a");
    await act(async () => { expect(await result.current.updatePrinter("b", { active: false })).toBe(false);expect(await result.current.updatePrinter("a", { active: false })).toBe(true); });
    expect(mock.writes).toEqual([{ action: "update", filters: { id: "a", business_unit_id: "a" }, value: { active: false } }]);unmount();
  });
  it("hides stale equipment and discards late results after changing units", async () => {
    let finish!: (v: unknown) => void;mock.query.mockImplementation((unit: string) => unit === "a" ? new Promise(resolve => { finish = resolve; }) : { data: [printer(unit)], error: null });
    const { result, rerender, unmount } = renderHook(() => usePrinterConfigs());await waitFor(() => expect(mock.query).toHaveBeenCalledWith("a"));mock.unit = "b";rerender();expect(result.current.printers).toEqual([]);
    await waitFor(() => expect(result.current.printers[0]?.id).toBe("b"));await act(async () => finish({ data: [printer("a")], error: null }));expect(result.current.printers[0]?.id).toBe("b");unmount();
  });
});
