import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import type { Combo, ComboPricingMode } from "@/lib/combos";

type Row = {
  id: string; name: string; description: string | null; pricing_mode: ComboPricingMode; price: number | null; discount: number; active: boolean; sort_order: number;
  menu_combo_slots: { id: string; label: string; sort_order: number; menu_combo_options: { id: string; menu_item_id: string; extra_price: number; is_free: boolean; sort_order: number }[] }[];
};
type Result<T = unknown> = Promise<{ data: T; error: { message: string } | null }>;
type Table = {
  select(c: string): { eq(c: string, v: string): { order(c: string): Result<Row[] | null> } };
  insert(v: Record<string, unknown> | Record<string, unknown>[]): { select(c: string): { single(): Result<{ id: string } | null> } } & Result;
  update(v: Record<string, unknown>): { eq(c: string, v: string): Result };
  delete(): { eq(c: string, v: string): Result };
};
// Tabelas de combos ainda não estão nos tipos gerados do Supabase.
const table = (name: "menu_combos" | "menu_combo_slots" | "menu_combo_options") =>
  (supabase as unknown as { from(t: string): Table }).from(name);

const toCombo = (r: Row): Combo => ({
  id: r.id, name: r.name, description: r.description, pricingMode: r.pricing_mode,
  price: r.price === null ? null : Number(r.price), discount: Number(r.discount), active: r.active,
  slots: [...(r.menu_combo_slots ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((s) => ({
    id: s.id, label: s.label,
    options: [...(s.menu_combo_options ?? [])].sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ id: o.id, menuItemId: o.menu_item_id, extraPrice: Number(o.extra_price), isFree: o.is_free })),
  })),
});

export function useCombos() {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [state, setState] = useState<{ unit: string | null; combos: Combo[]; loading: boolean; error: string }>({ unit: null, combos: [], loading: true, error: "" });
  const load = useCallback(async () => {
    if (!businessUnitId) return;
    const unit = businessUnitId;
    try {
      const { data, error } = await table("menu_combos")
        .select("id,name,description,pricing_mode,price,discount,active,sort_order,menu_combo_slots(id,label,sort_order,menu_combo_options(id,menu_item_id,extra_price,is_free,sort_order))")
        .eq("business_unit_id", unit).order("sort_order");
      if (error) throw error;
      setState({ unit, combos: (data ?? []).map(toCombo), loading: false, error: "" });
    } catch (e) {
      console.error("combos", e);
      setState({ unit, combos: [], loading: false, error: "Combos indisponíveis nesta instalação." });
    }
  }, [businessUnitId]);
  useEffect(() => { void load(); }, [load]);
  const current = state.unit === businessUnitId ? state : { combos: [], loading: true, error: "" };
  return { combos: current.combos, loading: current.loading, error: current.error, reload: load, businessUnitId };
}

/** Grava o combo inteiro: dados, etapas e opções (substitui etapas antigas ao editar). */
export async function saveCombo(unit: string, combo: Combo, sortOrder: number) {
  const { data, error } = await supabase.rpc("save_menu_combo", {
    p_unit: unit,
    p_combo_id: combo.id || null,
    p_sort_order: sortOrder,
    p_data: {
      name: combo.name.trim(),
      description: combo.description?.trim() || null,
      pricing_mode: combo.pricingMode,
      price: combo.pricingMode === "fixed" ? combo.price : null,
      discount: combo.pricingMode === "fixed" ? 0 : combo.discount,
      active: combo.active,
      slots: combo.slots.map((slot) => ({
        label: slot.label.trim(),
        options: slot.options.map((option) => ({
          menu_item_id: option.menuItemId,
          extra_price: option.extraPrice,
          is_free: option.isFree,
        })),
      })),
    },
  });
  if (error || !data) throw new Error(error?.message ?? "Não foi possível salvar o combo");
  return data;
}

export async function deleteCombo(id: string) {
  const { error } = await table("menu_combos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
