import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface SupabaseQueryError {
  code?: string | null;
  message?: string | null;
}

interface SessionQueryResult {
  data: unknown[] | null;
  error: SupabaseQueryError | null;
}

const mockState = vi.hoisted(() => {
  const state = {
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    sessionQueryQueue: [] as SessionQueryResult[],
    sessionSelectColumns: [] as string[],
    realtimeCallbacks: [] as Array<() => void | Promise<void>>,
  };

  const supabaseMock = {
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return {
          select: vi.fn((columns: string) => {
            state.sessionSelectColumns.push(columns);
            return {
              eq: vi.fn(async () => state.sessionQueryQueue.shift() ?? { data: [], error: null }),
            };
          }),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      };
    }),
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn(
          (_event: string, _filter: unknown, cb: () => void | Promise<void>) => {
            state.realtimeCallbacks.push(cb);
            return channel;
          }
        ),
        subscribe: vi.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: vi.fn(),
  };

  return { ...state, supabaseMock };
});
const authMock = vi.hoisted(() => ({
  user: { id: "user-1" },
  loading: false,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockState.toastErrorMock,
    success: mockState.toastSuccessMock,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockState.supabaseMock,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authMock,
}));

import { useSessionStore } from "@/hooks/useSessionStore";

describe("useSessionStore origin compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.sessionSelectColumns.length = 0;
    mockState.realtimeCallbacks.length = 0;
    mockState.sessionQueryQueue.length = 0;
  });

  it("retries without origin when database lacks orders.origin", async () => {
    const now = new Date().toISOString();

    mockState.sessionQueryQueue.push(
      {
        data: null,
        error: { code: "42703", message: "column orders_1.origin does not exist" },
      },
      {
        data: [
          {
            id: "session-1",
            table_number: 1,
            started_at: now,
            session_clients: [
              {
                id: "client-1",
                name: "Ana",
                phone: null,
                added_at: now,
                email: null,
                cep: null,
                bairro: null,
                genero: null,
              },
            ],
            orders: [
              {
                id: "order-1",
                client_id: "client-1",
                status: "pending",
                placed_at: now,
                order_items: [
                  {
                    menu_item_id: "burger",
                    name: "Burger",
                    price: 35,
                    quantity: 1,
                    observation: null,
                    ingredient_mods: [],
                  },
                ],
              },
            ],
          },
        ],
        error: null,
      },
      {
        data: [],
        error: null,
      },
    );

    const { result } = renderHook(() => useSessionStore());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockState.sessionSelectColumns).toHaveLength(2);
    expect(mockState.sessionSelectColumns[0]).toContain(", origin");
    expect(mockState.sessionSelectColumns[1]).not.toContain(", origin");
    expect(result.current.sessions[1].orders[0].orders[0].origin).toBe("mesa");
    expect(mockState.toastErrorMock).not.toHaveBeenCalled();

    await act(async () => {
      await mockState.realtimeCallbacks[0]?.();
    });

    expect(mockState.sessionSelectColumns).toHaveLength(3);
    expect(mockState.sessionSelectColumns[2]).not.toContain(", origin");
  });
});
