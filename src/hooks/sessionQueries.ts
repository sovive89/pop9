export const SESSION_SELECT_WITH_ORIGIN =
  "id, table_number, started_at, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at, origin, order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))";

export const SESSION_SELECT_LEGACY =
  "id, table_number, started_at, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at, order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
} | null;

type ActiveSessionsResult<TData> = {
  data: TData | null;
  error: SupabaseLikeError;
};

type SessionsQueryClient = {
  from: (table: string) => {
    select: (query: string) => {
      eq: (column: string, value: string) => Promise<ActiveSessionsResult<any[]>>;
    };
  };
};

const shouldFallbackToLegacyQuery = (error: SupabaseLikeError): boolean =>
  error?.code === "42703" && Boolean(error.message?.toLowerCase().includes("origin"));

export const fetchActiveSessionsWithOriginFallback = async (client: SessionsQueryClient) => {
  let result = await client
    .from("sessions")
    .select(SESSION_SELECT_WITH_ORIGIN)
    .eq("status", "active");

  if (shouldFallbackToLegacyQuery(result.error)) {
    result = await client
      .from("sessions")
      .select(SESSION_SELECT_LEGACY)
      .eq("status", "active");
  }

  return result;
};
