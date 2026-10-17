import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type Role = Database["public"]["Enums"]["app_role"];

export const useUnitRoles = () => {
  const { user, loading: authLoading } = useAuth();
  const { businessUnitId, loading: unitLoading } = useCurrentBusinessUnit();
  const userId = user?.id;
  const scope = `${userId}:${businessUnitId}`;
  const [state, setState] = useState<{ scope: string; roles: Role[]; error: boolean }>({ scope: "", roles: [], error: false });
  useEffect(() => {
    if (!userId || !businessUnitId) return;
    let disposed = false;
    let generation = 0;
    const load = async () => {
      const request = ++generation;
      try {
        const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("business_unit_id", businessUnitId);
        if (!disposed && request === generation) {
          setState({ scope, roles: error ? [] : (data ?? []).map(row => row.role), error: Boolean(error) });
        }
      } catch {
        if (!disposed && request === generation) setState({ scope, roles: [], error: true });
      }
    };
    // UI refresh is bounded, not instantaneous revocation. Server authorization
    // remains authoritative for every protected request, even between refreshes.
    const revalidate = () => { if (document.visibilityState !== "hidden") void load(); };
    void load();
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const timer = window.setInterval(revalidate, 60_000);
    return () => {
      disposed = true;
      generation++;
      window.clearInterval(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [businessUnitId, scope, userId]);
  const roles = state.scope === scope ? state.roles : [];
  return { roles, error: state.scope === scope && state.error,
    loading: authLoading || unitLoading || Boolean(user && businessUnitId && state.scope !== scope),
    canCashier: roles.includes("admin") || roles.includes("cashier"),
  };
};
