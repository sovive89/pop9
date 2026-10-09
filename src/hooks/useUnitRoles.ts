import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type Role = Database["public"]["Enums"]["app_role"];
export const useUnitRoles = () => {
  const { user, loading: authLoading } = useAuth();
  const { businessUnitId, loading: unitLoading } = useCurrentBusinessUnit();
  const scope = `${user?.id}:${businessUnitId}`;
  const [state, setState] = useState<{ scope: string; roles: Role[]; error: boolean }>({ scope: "", roles: [], error: false });
  useEffect(() => {
    if (!user || !businessUnitId) return;
    let disposed = false;
    const load = async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("business_unit_id", businessUnitId);
      if (!disposed) setState({ scope, roles: (data ?? []).map(row => row.role), error: Boolean(error) });
    };
    void load().catch(() => { if (!disposed) setState({ scope, roles: [], error: true }); });
    return () => { disposed = true; };
  }, [businessUnitId, scope, user]);
  const roles = state.scope === scope ? state.roles : [];
  return { roles, error: state.scope === scope && state.error,
    loading: authLoading || unitLoading || Boolean(user && businessUnitId && state.scope !== scope),
    canCashier: roles.includes("admin") || roles.includes("cashier"),
  };
};
