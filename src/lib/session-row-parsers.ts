import type { ClientInfo } from "@/components/TableSessionPanel";
import type {
  IngredientMod,
  OrderItem,
  OrderOrigin,
  OrderStatus,
  PlacedOrder,
} from "@/utils/orders";
import type { ActiveSessionRow } from "@/hooks/sessionQueries";

type RecordValue = Record<string, unknown>;

/**
 * These types intentionally contain only the columns present in the session
 * selects. They are not the complete database rows: nested Supabase joins are
 * returned as unknown[] by sessionQueries and must be checked at this boundary.
 */
export interface SessionClientJoinRow {
  id: string;
  name: string;
  added_at: string;
  phone?: string | null;
  email?: string | null;
  cep?: string | null;
  bairro?: string | null;
  genero?: string | null;
  // Supported when a newer select includes them, but never required here.
  faixa_etaria?: string | null;
  origem_conhecimento?: string | null;
}

export interface SessionOrderItemJoinRow {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  observation?: string | null;
  ingredient_mods?: unknown;
}

export interface SessionOrderJoinRow {
  id: string;
  client_id: string;
  status: string;
  placed_at: string;
  origin?: string | null;
  order_items: unknown[];
}

export interface OrderRealtimeRow {
  id: string;
  business_unit_id: string;
  status: string;
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): RecordValue | null => isRecord(value) ? value : null;

const optionalString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
};

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const arrayOrEmpty = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const isOrderStatus = (value: string): value is OrderStatus =>
  value === "pending" || value === "preparing" || value === "ready" || value === "delivered";

const isOrderOrigin = (value: string): value is OrderOrigin => value === "mesa" || value === "pwa";

/** Parse the session envelope without requiring columns omitted by its selects. */
export const parseActiveSessionRow = (value: unknown): ActiveSessionRow | null => {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.table_number !== "number" || !Number.isFinite(record.table_number) || typeof record.started_at !== "string") {
    return null;
  }

  const closureRequestedAt = optionalString(record.closure_requested_at);
  const serviceChargeEnabled = record.service_charge_enabled;

  return {
    id: record.id,
    table_number: record.table_number,
    started_at: record.started_at,
    closure_requested_at: closureRequestedAt,
    service_charge_enabled: typeof serviceChargeEnabled === "boolean" ? serviceChargeEnabled : undefined,
    session_clients: arrayOrEmpty(record.session_clients),
    orders: arrayOrEmpty(record.orders),
  };
};

/** Validate only the selected columns needed to render a session client. */
export const parseSessionClientRow = (value: unknown): SessionClientJoinRow | null => {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.name !== "string" || typeof record.added_at !== "string") {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    added_at: record.added_at,
    phone: optionalString(record.phone),
    email: optionalString(record.email),
    cep: optionalString(record.cep),
    bairro: optionalString(record.bairro),
    genero: optionalString(record.genero),
    faixa_etaria: optionalString(record.faixa_etaria),
    origem_conhecimento: optionalString(record.origem_conhecimento),
  };
};

export const parseSessionClientRows = (value: unknown): SessionClientJoinRow[] =>
  arrayOrEmpty(value).flatMap((row) => {
    const parsed = parseSessionClientRow(row);
    return parsed ? [parsed] : [];
  });

/**
 * Parse the JSON column as a whole. A malformed array falls back to undefined
 * rather than returning a partially changed list; valid values keep their
 * order, action and optional extra price exactly.
 */
export const parseIngredientMods = (value: unknown): IngredientMod[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;

  const parsed: IngredientMod[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record || typeof record.name !== "string" || (record.action !== "remove" && record.action !== "extra")) {
      return undefined;
    }

    const extraPrice = record.extraPrice;
    const parsedExtraPrice = extraPrice === undefined || extraPrice === null ? undefined : finiteNumber(extraPrice);
    if (extraPrice !== undefined && extraPrice !== null && parsedExtraPrice === undefined) {
      return undefined;
    }

    parsed.push({
      name: record.name,
      action: record.action,
      ...(parsedExtraPrice === undefined ? {} : { extraPrice: parsedExtraPrice }),
    });
  }

  return parsed;
};

/** Validate the selected order columns and normalize an absent nested join to []. */
export const parseSessionOrderRow = (value: unknown): SessionOrderJoinRow | null => {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.client_id !== "string" || typeof record.status !== "string" || typeof record.placed_at !== "string") {
    return null;
  }

  return {
    id: record.id,
    client_id: record.client_id,
    status: record.status,
    placed_at: record.placed_at,
    origin: optionalString(record.origin),
    order_items: arrayOrEmpty(record.order_items),
  };
};

export const parseSessionOrderRows = (value: unknown): SessionOrderJoinRow[] =>
  arrayOrEmpty(value).flatMap((row) => {
    const parsed = parseSessionOrderRow(row);
    return parsed ? [parsed] : [];
  });

export const parseSessionOrderItemRow = (value: unknown): OrderItem | null => {
  const record = asRecord(value);
  if (!record) return null;
  const price = finiteNumber(record.price);
  const quantity = finiteNumber(record.quantity);
  if (typeof record.menu_item_id !== "string" || typeof record.name !== "string" || price === undefined || quantity === undefined) {
    return null;
  }

  const observation = optionalString(record.observation);
  return {
    menuItemId: record.menu_item_id,
    name: record.name,
    price,
    quantity,
    observation: observation ?? undefined,
    ingredientMods: parseIngredientMods(record.ingredient_mods),
  };
};

export const parseSessionOrderItems = (value: unknown): OrderItem[] =>
  arrayOrEmpty(value).flatMap((item) => {
    const parsed = parseSessionOrderItemRow(item);
    return parsed ? [parsed] : [];
  });

/**
 * Build the UI order from a validated selected row. Cancelled rows are not
 * part of the active-session view; an unknown future status is kept visible as
 * pending instead of silently dropping the order.
 */
export const parsePlacedOrder = (value: unknown): PlacedOrder | null => {
  const row = parseSessionOrderRow(value);
  if (!row || row.status === "cancelled") return null;
  const placedAt = new Date(row.placed_at);
  if (Number.isNaN(placedAt.getTime())) return null;

  const status: OrderStatus = isOrderStatus(row.status) ? row.status : "pending";
  const origin: OrderOrigin = row.origin && isOrderOrigin(row.origin) ? row.origin : "mesa";

  return {
    id: row.id,
    status,
    placedAt,
    origin,
    items: parseSessionOrderItems(row.order_items),
  };
};

export const toClientInfo = (row: SessionClientJoinRow): ClientInfo => ({
  id: row.id,
  name: row.name,
  phone: row.phone ?? undefined,
  addedAt: new Date(row.added_at),
  email: row.email ?? undefined,
  cep: row.cep ?? undefined,
  bairro: row.bairro ?? undefined,
  genero: row.genero ?? undefined,
  faixa_etaria: row.faixa_etaria ?? undefined,
  origem_conhecimento: row.origem_conhecimento ?? undefined,
});

/** Realtime UPDATEs need their own narrow contract before fields are read. */
export const parseOrderRealtimeRow = (value: unknown): OrderRealtimeRow | null => {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.business_unit_id !== "string" || typeof record.status !== "string") {
    return null;
  }
  return {
    id: record.id,
    business_unit_id: record.business_unit_id,
    status: record.status,
  };
};
