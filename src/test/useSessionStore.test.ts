import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ unit: "a" as string | null, fetch: vi.fn(), update: vi.fn(), insert: vi.fn() }));
const staff = { id: "staff" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: staff, loading: false }) }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: mocks.unit }) }));
vi.mock("@/hooks/sessionQueries", () => ({ fetchActiveSessionsWithOriginFallback: mocks.fetch }));
vi.mock("@/data/menu", () => ({ isKitchenItem: () => true }));
vi.mock("@/utils/thermal-print", () => ({ buildKitchenReceipts: () => [], printReceipt: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
  from: () => ({ update: mocks.update, insert: mocks.insert }),
} }));
import { useSessionStore } from "@/hooks/useSessionStore";

const row = (id: string) => ({ id, table_number: 1, started_at: "2026-10-09T10:00:00Z", session_clients: [], orders: [] });

describe("session store unit switching", () => {
  beforeEach(() => { mocks.unit = "a"; mocks.fetch.mockReset(); mocks.update.mockReset(); mocks.insert.mockReset(); });

  it("hides the old table while the new unit loads", async () => {
    let resolveB!: (value: unknown) => void;
    mocks.fetch.mockResolvedValueOnce({ data: [row("session-a")], error: null })
      .mockReturnValueOnce(new Promise(resolve => { resolveB = resolve; }));
    const { result, rerender, unmount } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.sessions[1]?.session.dbId).toBe("session-a"));
    mocks.unit = "b";
    rerender();
    expect(result.current.sessions).toEqual({});
    await act(async () => { await result.current.closeSession(1); });
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => { resolveB({ data: [row("session-b")], error: null }); });
    expect(result.current.sessions[1].session.dbId).toBe("session-b");
    expect(mocks.fetch.mock.calls.map(call => call[1])).toEqual(["a", "b"]);
    unmount();
  });

  it("discards an old unit response that arrives last", async () => {
    let resolveA!: (value: unknown) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { resolveA = resolve; }))
      .mockResolvedValue({ data: [row("session-b")], error: null });
    const { result, rerender, unmount } = renderHook(() => useSessionStore());
    mocks.unit = "b";
    rerender();
    await waitFor(() => expect(result.current.sessions[1]?.session.dbId).toBe("session-b"));
    await act(async () => { resolveA({ data: [row("session-a")], error: null }); });
    expect(result.current.sessions[1].session.dbId).toBe("session-b");
    unmount();
  });

  it("does not fetch sessions when no unit is selected", () => {
    mocks.unit = null;
    const { result, unmount } = renderHook(() => useSessionStore());
    expect(result.current.sessions).toEqual({});
    expect(mocks.fetch).not.toHaveBeenCalled();
    unmount();
  });

  it("ignores reload callbacks retained from the previous unit", async () => {
    mocks.fetch.mockResolvedValue({ data: [row("session-a")], error: null });
    const { result, rerender, unmount } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.sessions[1]?.session.dbId).toBe("session-a"));
    const oldReload = result.current.reload;
    mocks.unit = "b";
    mocks.fetch.mockResolvedValue({ data: [row("session-b")], error: null });
    rerender();
    await waitFor(() => expect(result.current.sessions[1]?.session.dbId).toBe("session-b"));
    const calls = mocks.fetch.mock.calls.length;
    await act(async () => { await oldReload(); });
    expect(mocks.fetch).toHaveBeenCalledTimes(calls);
    expect(result.current.sessions[1].session.dbId).toBe("session-b");
    unmount();
  });
});
