import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

export const OPTIONAL_MODULES = ["financeiro", "combos", "crm", "documents"] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];
const CHANGE_EVENT = "pop9:modules-changed";

/** Módulos opcionais desligados na unidade. Na dúvida (erro, coluna ainda inexistente) todos ficam ligados, como hoje. */
export function useUnitModules() {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [state, setState] = useState<{ unit: string | null; disabled: string[]; loaded: boolean }>({ unit: null, disabled: [], loaded: false });
  const latest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latest.current;
    if (!businessUnitId) { setState({ unit: null, disabled: [], loaded: true }); return; }
    try {
      const { data, error } = await supabase.from("business_units").select("disabled_modules" as "id").eq("id", businessUnitId).maybeSingle();
      if (request !== latest.current) return;
      const row = data as unknown as { disabled_modules?: string[] } | null;
      setState({ unit: businessUnitId, disabled: error ? [] : (row?.disabled_modules ?? []), loaded: true });
    } catch {
      if (request === latest.current) setState({ unit: businessUnitId, disabled: [], loaded: true });
    }
  }, [businessUnitId]);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(CHANGE_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [load]);
  const visible = state.unit === businessUnitId ? state : { unit: businessUnitId, disabled: [] as string[], loaded: false };
  return { loaded: visible.loaded, isEnabled: (m: OptionalModule) => !visible.disabled.includes(m), reload: load };
}

export async function setUnitModule(unitId: string, module: OptionalModule, enabled: boolean) {
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc("set_unit_module", { p_unit: unitId, p_module: module, p_enabled: enabled });
  if (error) throw Error(error.message);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
