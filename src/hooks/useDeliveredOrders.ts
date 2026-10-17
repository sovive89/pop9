import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { ORDER_DELIVERED_EVENT } from "@/utils/orderNotifications";
import type { IngredientMod, PlacedOrder } from "@/utils/orders";

export interface ListedOrder {
  order: PlacedOrder;
  tableNumber: number;
  clientName: string;
  clientId: string;
  isDelivery?: boolean;
}

// Query orders directly so closing a table does not erase its delivery history.
export const useDeliveredOrders = (enabled: boolean, date: string) => {
  const { user } = useAuth();
  const { businessUnitId } = useCurrentBusinessUnit();
  const [revision, setRevision] = useState(0);
  const [limit, setLimit] = useState(50);
  const key = `${user?.id}:${businessUnitId}:${date}:${limit}:${revision}`;
  const [state, setState] = useState<{ key: string; orders: ListedOrder[]; error: boolean; more: boolean }>({ key: "", orders: [], error: false, more: false });

  useEffect(() => {
    if (!enabled || !user || !businessUnitId) return;
    let disposed = false;
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const load = async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, client_id, status, placed_at, origin, sessions!orders_session_id_fkey(table_number), session_clients!orders_client_id_fkey(name), order_items(menu_item_id, name, price, quantity, observation, ingredient_mods)")
        .eq("business_unit_id", businessUnitId).eq("status", "delivered")
        .gte("placed_at", start.toISOString()).lt("placed_at", end.toISOString())
        .order("placed_at", { ascending: false }).order("id").limit(limit + 1);
      if (disposed) return;
      const orders: ListedOrder[] = (data ?? []).slice(0, limit).map(row => ({
        tableNumber: row.sessions?.table_number ?? 0,
        clientName: row.session_clients?.name ?? "Cliente",
        clientId: row.client_id,
        isDelivery: row.origin === "pwa",
        order: {
          id: row.id, status: "delivered", placedAt: new Date(row.placed_at),
          origin: row.origin === "pwa" ? "pwa" : "mesa",
          items: row.order_items.map(item => ({
            menuItemId: item.menu_item_id, name: item.name, price: Number(item.price), quantity: item.quantity,
            observation: item.observation ?? undefined,
            ingredientMods: (item.ingredient_mods as unknown as IngredientMod[] | null) ?? undefined,
          })),
        },
      }));
      setState({ key, orders, error: Boolean(error), more: (data?.length ?? 0) > limit });
    };
    void load().catch(() => { if (!disposed) setState({ key, orders: [], error: true, more: false }); });
    const refresh = () => setRevision(n => n + 1);
    const channel = supabase.channel(`delivered-orders:${businessUnitId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_unit_id=eq.${businessUnitId}` }, refresh).subscribe();
    window.addEventListener(ORDER_DELIVERED_EVENT, refresh);
    return () => { disposed = true; void supabase.removeChannel(channel); window.removeEventListener(ORDER_DELIVERED_EVENT, refresh); };
  }, [businessUnitId, date, enabled, key, limit, user]);

  const visible = enabled && Boolean(user && businessUnitId) && state.key === key;
  return {
    orders: visible ? state.orders : [], loading: enabled && Boolean(user && businessUnitId) && !visible,
    error: visible && state.error, more: visible && state.more,
    loadMore: () => setLimit(n => n + 50), retry: () => setRevision(n => n + 1),
  };
};
