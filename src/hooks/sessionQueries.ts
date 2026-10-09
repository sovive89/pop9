export const SESSION_SELECT_WITH_ORIGIN =
  "id, table_number, started_at, closure_requested_at, service_charge_enabled, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at, origin, order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))";

export const SESSION_SELECT_LEGACY =
  "id, table_number, started_at, closure_requested_at, service_charge_enabled, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at, order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
} | null;

type ActiveSessionsResult<TData> = {
  data: TData | null;
  error: SupabaseLikeError;
};

export type ActiveSessionRow = {
  id: string;
  table_number: number;
  started_at: string;
  closure_requested_at?: string | null;
  service_charge_enabled?: boolean;
  session_clients?: unknown[];
  orders?: unknown[];
};

type SessionsQuery = PromiseLike<ActiveSessionsResult<ActiveSessionRow[]>> & {
  eq: (column: string, value: string) => SessionsQuery;
};

export type SessionsQueryClient = {
  from: (table: string) => {
    select: (query: string) => SessionsQuery;
  };
};

const shouldFallbackToLegacyQuery = (error: SupabaseLikeError): boolean =>
  error?.code === "42703" && Boolean(error.message?.toLowerCase().includes("origin"));

export const fetchActiveSessionsWithOriginFallback = async (
  client: SessionsQueryClient,
  businessUnitId: string | null
) => {
  // Nunca consulte todas as unidades enquanto a seleção ainda está carregando.
  if (!businessUnitId) return { data: [], error: null };
  let result = await client
    .from("sessions")
    .select(SESSION_SELECT_WITH_ORIGIN)
    .eq("status", "active")
    .eq("business_unit_id", businessUnitId);

  if (shouldFallbackToLegacyQuery(result.error)) {
    result = await client
      .from("sessions")
      .select(SESSION_SELECT_LEGACY)
      .eq("status", "active")
      .eq("business_unit_id", businessUnitId);
  }

  return result;
};
