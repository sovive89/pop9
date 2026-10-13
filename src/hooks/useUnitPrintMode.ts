import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

export type PrintMode = "device" | "station";
const CHANGE_EVENT = "pop9:print-mode-changed";

/** Modo de impressão da unidade. Na dúvida (erro/carregando) assume "device", o comportamento atual. */
export function useUnitPrintMode(unitId?: string | null) {
  const { businessUnitId } = useCurrentBusinessUnit();
  const unit = unitId ?? businessUnitId;
  const [state, setState] = useState<{ unit: string | null; mode: PrintMode; loaded: boolean }>({ unit: null, mode: "device", loaded: false });
  const load = useCallback(async () => {
    if (!unit) { setState({ unit: null, mode: "device", loaded: true }); return; }
    const { data } = await supabase.from("business_units").select("print_mode" as "id").eq("id", unit).maybeSingle();
    const row = data as unknown as { print_mode?: string } | null;
    setState({ unit, mode: row?.print_mode === "station" ? "station" : "device", loaded: true });
  }, [unit]);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(CHANGE_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [load]);
  const visible = state.unit === unit ? state : { unit, mode: "device" as PrintMode, loaded: false };
  return { mode: visible.mode, loaded: visible.loaded, reload: load };
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export const rpc: Rpc = (fn, args) => (supabase.rpc as unknown as Rpc)(fn, args);

export async function setUnitPrintMode(unitId: string, mode: PrintMode) {
  const { error } = await rpc("set_unit_print_mode", { p_unit: unitId, p_mode: mode });
  if (error) throw Error(error.message);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
