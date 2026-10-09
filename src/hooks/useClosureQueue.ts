import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useAuth } from "@/hooks/useAuth";
import type { CheckoutSnapshot } from "@/utils/checkout";
export interface ClosureRequest { id: string; tableNumber: number; requestedAt: string; snapshot: CheckoutSnapshot }
export const useClosureQueue = (enabled: boolean) => {
  const { user } = useAuth();
  const { businessUnitId } = useCurrentBusinessUnit();
  const [revision, setRevision] = useState(0);
  const [limit, setLimit] = useState(50);
  const key = `${user?.id}:${businessUnitId}:${revision}:${limit}`;
  const [state, setState] = useState<{ key: string; queue: ClosureRequest[]; error: boolean; more: boolean }>({ key: "", queue: [], error: false, more: false });
  const reload = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    if (!enabled || !user || !businessUnitId) return;
    let disposed = false;
    const load = async () => {
      const { data, error } = await supabase.from("sessions").select("id, table_number, closure_requested_at")
        .eq("business_unit_id", businessUnitId).eq("status", "active").not("closure_requested_at", "is", null)
        .order("closure_requested_at").order("id").limit(limit + 1);
      if (error) throw error;
      const queue = await Promise.all((data ?? []).slice(0, limit).map(async row => {
        const { data: snapshot, error: snapshotError } = await supabase.rpc("get_session_checkout", { p_session_id: row.id });
        if (snapshotError || !snapshot) throw snapshotError ?? new Error("Saldo indisponível");
        return { id: row.id, tableNumber: row.table_number, requestedAt: row.closure_requested_at!, snapshot: snapshot as unknown as CheckoutSnapshot };
      }));
      if (!disposed) setState({ key, queue, error: false, more: (data?.length ?? 0) > limit });
    };
    void load().catch(() => { if (!disposed) setState({ key, queue: [], error: true, more: false }); });
    return () => { disposed = true; };
  }, [businessUnitId, enabled, key, limit, user]);
  useEffect(() => {
    if (!enabled || !businessUnitId) return;
    const channel = supabase.channel(`cashier-queue:${businessUnitId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `business_unit_id=eq.${businessUnitId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `business_unit_id=eq.${businessUnitId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_unit_id=eq.${businessUnitId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, reload).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessUnitId, enabled, reload]);
  const visible = enabled && Boolean(user && businessUnitId) && state.key === key;
  return { queue: visible ? state.queue : [], error: visible && state.error, more: visible && state.more,
    loading: enabled && Boolean(user && businessUnitId) && !visible, reload, loadMore: () => setLimit(n => n + 50) };
};
