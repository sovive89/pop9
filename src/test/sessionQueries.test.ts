import { describe, expect, it, vi } from "vitest";
import { fetchActiveSessionsWithOriginFallback, SESSION_SELECT_LEGACY, SESSION_SELECT_WITH_ORIGIN } from "@/hooks/sessionQueries";

type Client = Parameters<typeof fetchActiveSessionsWithOriginFallback>[0];
const fixtures = [
  { id: "a1", table_number: 1, business_unit_id: "a", status: "active" },
  { id: "b1", table_number: 1, business_unit_id: "b", status: "active" },
  { id: "a2", table_number: 2, business_unit_id: "a", status: "closed" },
];

function clientWithError(error?: { code: string; message: string }) {
  const filters: Array<Array<[string, string]>> = [];
  const select = vi.fn((selection: string) => {
    const where: Array<[string, string]> = [];
    filters.push(where);
    const query = {
      eq: vi.fn((key: string, value: string) => { where.push([key, value]); return query; }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(
        error && selection !== SESSION_SELECT_LEGACY
          ? { data: null, error }
          : { data: fixtures.filter(row => where.every(([key, value]) => row[key as keyof typeof row] === value)), error: null }
      ).then(resolve),
    };
    return query;
  });
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as Client, from, select, filters };
}

describe("active sessions by business unit", () => {
  it("keeps identically numbered tables in separate units", async () => {
    const { client, select } = clientWithError();
    expect((await fetchActiveSessionsWithOriginFallback(client, "a")).data).toEqual([fixtures[0]]);
    expect((await fetchActiveSessionsWithOriginFallback(client, "b")).data).toEqual([fixtures[1]]);
    expect(select).toHaveBeenCalledWith(SESSION_SELECT_WITH_ORIGIN);
  });

  it("keeps the unit filter when retrying without origin", async () => {
    const { client, select, filters } = clientWithError({ code: "42703", message: "column orders_1.origin does not exist" });
    expect((await fetchActiveSessionsWithOriginFallback(client, "a")).data).toEqual([fixtures[0]]);
    expect(select).toHaveBeenNthCalledWith(2, SESSION_SELECT_LEGACY);
    expect(filters).toEqual([
      [["status", "active"], ["business_unit_id", "a"]],
      [["status", "active"], ["business_unit_id", "a"]],
    ]);
  });

  it("does not query all units before selection", async () => {
    const { client, from } = clientWithError();
    expect(await fetchActiveSessionsWithOriginFallback(client, null)).toEqual({ data: [], error: null });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not retry a permission error", async () => {
    const error = { code: "42501", message: "permission denied" };
    const { client, select } = clientWithError(error);
    expect(await fetchActiveSessionsWithOriginFallback(client, "a")).toEqual({ data: null, error });
    expect(select).toHaveBeenCalledTimes(1);
  });
});
