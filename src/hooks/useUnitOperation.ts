import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const CHANGED = "pop9:operation-changed";
type Operation = Tables<"operation_periods">;
export function useUnitOperation() {
  const { user } = useAuth();
  const { businessUnitId } = useCurrentBusinessUnit();
  const identity = `${user?.id}:${businessUnitId}`;
  const current = useRef(identity); current.current = identity;
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const [state, setState] = useState<{ identity: string; period: Operation | null; activeSessions: number; error: boolean }>({ identity: "", period: null, activeSessions: 0, error: false });
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!user?.id || !businessUnitId) return;
    try {
      const [operation, sessions] = await Promise.all([
        supabase.from("operation_periods").select("*").eq("business_unit_id", businessUnitId).is("closed_at", null).maybeSingle(),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("business_unit_id", businessUnitId).eq("status", "active"),
      ]);
      if (operation.error || sessions.error) throw operation.error ?? sessions.error;
      if (current.current === identity && generation.current === request) setState({ identity, period: operation.data, activeSessions: sessions.count ?? 0, error: false });
    } catch { if (current.current === identity && generation.current === request) setState({ identity, period: null, activeSessions: 0, error: true }); }
  }, [businessUnitId, identity, user?.id]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState !== "hidden") void load(); };
    window.addEventListener(CHANGED, refresh);window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { invalidate();window.removeEventListener(CHANGED, refresh);window.removeEventListener("focus", refresh);window.clearInterval(timer); };
  }, [invalidate, load]);
  const visible = Boolean(user && businessUnitId) && state.identity === identity;
  return { identity, businessUnitId, open: visible && Boolean(state.period), period: visible ? state.period : null,
    activeSessions: visible ? state.activeSessions : 0, loading: Boolean(user && businessUnitId) && !visible, error: visible && state.error, reload: load };
}
export async function setUnitOperation(unitId: string, open: boolean) {
  const { data, error } = await supabase.rpc("set_unit_operation", { p_unit: unitId, p_open: open });
  if (error) throw new Error(error.message || "Não foi possível alterar a operação.");
  if (!data || typeof data !== "object" || Array.isArray(data) || data.open !== open) throw new Error("A mudança não foi confirmada. Atualize o estado da operação.");
  window.dispatchEvent(new Event(CHANGED));
}
