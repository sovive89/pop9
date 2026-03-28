import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthState = { user: { id: string } | null; loading: boolean };
type DbSessionClient = {
  id: string;
  name: string;
  phone: string | null;
  added_at: string;
  email: string | null;
  cep: string | null;
  bairro: string | null;
  genero: string | null;
};
type DbSession = {
  id: string;
  table_number: number;
  started_at: string;
  session_clients: DbSessionClient[];
  orders: Array<{
    id: string;
    client_id: string;
    status: string;
    placed_at: string;
    origin?: string | null;
    order_items: Array<{
      menu_item_id: string;
      name: string;
      price: number;
      quantity: number;
      observation: string | null;
      ingredient_mods: unknown[];
    }>;
  }>;
};

const mocks = vi.hoisted(() => {
  const state: { authState: AuthState; activeSessions: DbSession[] } = {
    authState: { user: null, loading: true },
    activeSessions: [],
  };

  const sessionsEqMock = vi.fn(async () => ({ data: state.activeSessions, error: null }));
  const sessionsSelectMock = vi.fn(() => ({ eq: sessionsEqMock }));
  const sessionsInsertSingleMock = vi.fn(async () => ({
    data: { id: "sess-new", started_at: "2026-03-28T03:00:00.000Z" },
    error: null,
  }));
  const sessionsInsertMock = vi.fn(() => ({
    select: () => ({ single: sessionsInsertSingleMock }),
  }));
  const sessionClientsInsertMock = vi.fn(async () => ({ error: null }));

  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({}),
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "sessions") {
      return {
        select: sessionsSelectMock,
        insert: sessionsInsertMock,
        update: vi.fn(() => ({ eq: vi.fn() })),
      };
    }
    if (table === "session_clients") {
      return {
        insert: sessionClientsInsertMock,
        select: vi.fn(),
      };
    }
    return {
      select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
      insert: vi.fn(async () => ({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn() })),
    };
  });

  return {
    state,
    sessionsEqMock,
    sessionsSelectMock,
    sessionsInsertSingleMock,
    sessionsInsertMock,
    sessionClientsInsertMock,
    channelMock,
    fromMock,
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mocks.state.authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => mocks.channelMock),
    removeChannel: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastErrorMock(...args),
    success: (...args: unknown[]) => mocks.toastSuccessMock(...args),
  },
}));

describe("useSessionStore persistence flow", () => {
  beforeEach(() => {
    mocks.state.authState = { user: null, loading: true };
    mocks.state.activeSessions = [];
    mocks.sessionsEqMock.mockClear();
    mocks.sessionsSelectMock.mockClear();
    mocks.sessionsInsertSingleMock.mockClear();
    mocks.sessionsInsertMock.mockClear();
    mocks.sessionClientsInsertMock.mockClear();
    mocks.fromMock.mockClear();
    mocks.channelMock.on.mockClear();
    mocks.channelMock.subscribe.mockClear();
    mocks.toastErrorMock.mockClear();
    mocks.toastSuccessMock.mockClear();
  });

  it("loads active sessions only after auth is ready", async () => {
    const { useSessionStore } = await import("@/hooks/useSessionStore");
    const { rerender, result } = renderHook(() => useSessionStore());

    expect(mocks.sessionsEqMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);

    mocks.state.activeSessions = [
      {
        id: "sess-1",
        table_number: 5,
        started_at: "2026-03-28T02:00:00.000Z",
        session_clients: [
          {
            id: "cli-1",
            name: "Maria Silva",
            phone: null,
            added_at: "2026-03-28T02:00:00.000Z",
            email: null,
            cep: null,
            bairro: null,
            genero: null,
          },
        ],
        orders: [],
      },
    ];

    mocks.state.authState = { user: { id: "user-1" }, loading: false };
    rerender();

    await waitFor(() => {
      expect(mocks.sessionsEqMock).toHaveBeenCalledTimes(1);
      expect(result.current.loading).toBe(false);
      expect(result.current.sessions[5]?.session.clients[0]?.name).toBe("Maria Silva");
    });
  });

  it("re-syncs from Supabase after successful session start", async () => {
    const { useSessionStore } = await import("@/hooks/useSessionStore");
    mocks.state.authState = { user: { id: "user-1" }, loading: false };

    mocks.sessionClientsInsertMock.mockImplementationOnce(async () => {
      mocks.state.activeSessions = [
        {
          id: "sess-new",
          table_number: 7,
          started_at: "2026-03-28T03:00:00.000Z",
          session_clients: [
            {
              id: "cli-new",
              name: "Ana Souza",
              phone: null,
              added_at: "2026-03-28T03:01:00.000Z",
              email: null,
              cep: null,
              bairro: null,
              genero: null,
            },
          ],
          orders: [],
        },
      ];
      return { error: null };
    });

    const { result } = renderHook(() => useSessionStore());

    await waitFor(() => {
      expect(mocks.sessionsEqMock).toHaveBeenCalledTimes(1);
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.startSession(7, "salao", { name: "Ana Souza" });
    });

    await waitFor(() => {
      expect(mocks.sessionsInsertMock).toHaveBeenCalledWith({
        table_number: 7,
        zone: "salao",
        created_by: "user-1",
      });
      expect(mocks.sessionsEqMock).toHaveBeenCalledTimes(2);
      expect(result.current.sessions[7]?.session.dbId).toBe("sess-new");
      expect(result.current.sessions[7]?.session.clients[0]?.name).toBe("Ana Souza");
      expect(mocks.toastSuccessMock).toHaveBeenCalled();
    });
  });
});
