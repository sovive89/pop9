import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

const CHANGE_EVENT = "pop9:kds-changed";

/** Lê se a unidade usa a tela da cozinha (KDS). Na dúvida (erro/carregando) assume ligado, o comportamento atual. */
export function useUnitKds(unitId?: string | null) {
  const { businessUnitId } = useCurrentBusinessUnit();
  const unit = unitId ?? businessUnitId;
  const [state, setState] = useState<{ unit: string | null; enabled: boolean; loaded: boolean }>({ unit: null, enabled: true, loaded: false });
  const latest = useRef(0);
  // Leituras sobrepostas (foco + troca) podem voltar fora de ordem: só a mais recente vale.
  const load = useCallback(async () => {
    const request = ++latest.current;
    if (!unit) { setState({ unit: null, enabled: true, loaded: true }); return; }
    try {
      const { data, error } = await supabase.from("business_units").select("kds_enabled" as "id").eq("id", unit).maybeSingle();
      if (request !== latest.current) return;
      const row = data as unknown as { kds_enabled?: boolean } | null;
      setState({ unit, enabled: Boolean(error) || row?.kds_enabled !== false, loaded: true });
    } catch (err) {
      console.error("Erro ao ler kds_enabled da unidade:", err);
      // Falha de rede ou cliente indisponível: mantém o comportamento padrão.
      if (request === latest.current) setState({ unit, enabled: true, loaded: true });
    }
  }, [unit]);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(CHANGE_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [load]);
  const visible = state.unit === unit ? state : { unit, enabled: true, loaded: false };
  return { enabled: visible.enabled, loaded: visible.loaded, reload: load };
}

export async function setUnitKds(unitId: string, enabled: boolean) {
  const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc("set_unit_kds", { p_unit: unitId, p_enabled: enabled });
  if (error) throw Error(error.message);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
