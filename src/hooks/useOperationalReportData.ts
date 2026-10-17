import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { supabase } from "@/integrations/supabase/client";

export interface ReportOrderItem { name: string; price: number; quantity: number; destination: string; menu_item_id: string }
export interface ReportOrder { id: string; placed_at: string; status: string; order_items: ReportOrderItem[] }
export interface ReportPayment { id: string; amount: number; service_charge: number; method: string; paid_at: string }
type ReportState = { scope: string; orders: ReportOrder[]; payments: ReportPayment[]; error: boolean };
const EMPTY_ORDERS: ReportOrder[] = [], EMPTY_PAYMENTS: ReportPayment[] = [];

export function useOperationalReportData(from: Date, to: Date) {
  const { user } = useAuth();
  const { businessUnitId } = useCurrentBusinessUnit();
  const { roles, loading: rolesLoading, error: rolesError } = useUnitRoles();
  const allowed = Boolean(user && businessUnitId && !rolesLoading && !rolesError && roles.includes("admin"));
  const [revision, setRevision] = useState(0);
  const start = from.toISOString(), end = to.toISOString();
  const scope = `${user?.id}:${businessUnitId}:${allowed}:${start}:${end}:${revision}`;
  const current = useRef(scope); current.current = scope;
  const [state, setState] = useState<ReportState>({ scope: "", orders: [], payments: [], error: false });
  useEffect(() => {
    if (!allowed || !businessUnitId) return;
    let disposed = false;
    const load = async () => {
      if (start > end) throw new Error("Período inválido");
      const [orders, payments] = await Promise.all([
        supabase.from("orders").select("id, placed_at, status, order_items(name, price, quantity, destination, menu_item_id)")
          .eq("business_unit_id", businessUnitId).gte("placed_at", start).lte("placed_at", end).in("status", ["pending", "preparing", "ready", "delivered"]).order("placed_at", { ascending: true }),
        supabase.from("payments").select("id, amount, service_charge, method, paid_at")
          .eq("business_unit_id", businessUnitId).eq("status", "confirmed").gte("paid_at", start).lte("paid_at", end).order("paid_at", { ascending: true }),
      ]);
      if (orders.error || payments.error) throw orders.error ?? payments.error;
      if (!disposed && current.current === scope) setState({ scope, orders: orders.data ?? [], payments: payments.data ?? [], error: false });
    };
    void load().catch(() => { if (!disposed && current.current === scope) setState({ scope, orders: [], payments: [], error: true }); });
    return () => { disposed = true; };
  }, [allowed, businessUnitId, end, scope, start]);
  const visible = allowed && state.scope === scope;
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { orders: visible ? state.orders : EMPTY_ORDERS, payments: visible ? state.payments : EMPTY_PAYMENTS,
    loading: allowed && !visible, error: visible && state.error, reload };
}
