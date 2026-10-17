import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { summarizeWaste, type WasteMovement, type WasteSummary } from "@/lib/insights";

export const WASTE_REASONS = ["Vencimento", "Queda ou acidente", "Erro de preparo", "Sobra descartada", "Armazenamento", "Outro"] as const;

/** Perdas reais da unidade (movimentos de estoque com motivo "perda") nos últimos N dias. */
export function useWaste(days = 30) {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [state, setState] = useState<{ unit: string | null; summary: WasteSummary[]; loaded: boolean; error: boolean }>({ unit: null, summary: [], loaded: false, error: false });
  const latest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latest.current;
    if (!businessUnitId) { setState({ unit: null, summary: [], loaded: true, error: false }); return; }
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await supabase.from("stock_movements")
      .select("raw_material_id, quantity, unit_cost, batch_info, raw_materials(name, unit, average_cost)")
      .eq("business_unit_id", businessUnitId).eq("reason", "perda").eq("type", "saida").gte("created_at", since).limit(2000);
    if (request !== latest.current) return;
    if (error) { setState({ unit: businessUnitId, summary: [], loaded: true, error: true }); return; }
    const rows: WasteMovement[] = (data ?? []).map((r) => {
      const m = r.raw_materials as unknown as { name: string; unit: string; average_cost: number } | null;
      const info = (r.batch_info ?? {}) as { motivo?: string };
      return { rawMaterialId: r.raw_material_id, name: m?.name ?? "Insumo", unit: m?.unit ?? "", quantity: Number(r.quantity), unitCost: r.unit_cost ?? m?.average_cost ?? null, motivo: info.motivo ?? null };
    });
    setState({ unit: businessUnitId, summary: summarizeWaste(rows), loaded: true, error: false });
  }, [businessUnitId, days]);
  useEffect(() => { void load(); }, [load]);
  const visible = state.unit === businessUnitId ? state : { unit: businessUnitId, summary: [] as WasteSummary[], loaded: false, error: false };
  return { ...visible, reload: load };
}

/** Lança a perda como saída de estoque (o gatilho do banco abate o saldo e valida a unidade). */
export async function registerWaste(input: { unitId: string; rawMaterialId: string; quantity: number; motivo: string }) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw Error("Informe uma quantidade maior que zero.");
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("stock_movements").insert({
    business_unit_id: input.unitId, raw_material_id: input.rawMaterialId, type: "saida", reason: "perda",
    quantity: input.quantity, created_by: auth.user?.id ?? null, batch_info: { motivo: input.motivo },
  });
  if (error) throw Error(error.message);
}
