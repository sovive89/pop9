import type { OrderItem } from "@/utils/orders";

export type ComboPricingMode = "fixed" | "percent" | "amount";
export type ComboOption = { id: string; menuItemId: string; extraPrice: number; isFree: boolean };
export type ComboSlot = { id: string; label: string; options: ComboOption[] };
export type Combo = {
  id: string; name: string; description: string | null;
  pricingMode: ComboPricingMode; price: number | null; discount: number;
  active: boolean; slots: ComboSlot[];
};
/** Item do cardápio necessário para montar o combo (nome e preço de tabela). */
export type ComboMenuItem = { id: string; name: string; price: number; comboEligible?: boolean };
export type OnTheFlyDiscount = { mode: "percent" | "amount"; value: number };

const cents = (v: number) => Math.round(v * 100);
const eligible = (item: ComboMenuItem | undefined): item is ComboMenuItem => Boolean(item && item.comboEligible !== false);

/** Preço do combo para as opções escolhidas (uma por etapa). */
export function comboPrice(combo: Combo, chosen: ComboOption[], items: Map<string, ComboMenuItem>): number {
  const extras = chosen.reduce((s, o) => s + cents(o.extraPrice), 0);
  if (combo.pricingMode === "fixed") return (cents(combo.price ?? 0) + extras) / 100;
  const base = chosen.reduce((s, o) => s + (o.isFree ? 0 : cents(items.get(o.menuItemId)?.price ?? 0)), 0);
  const discounted = combo.pricingMode === "percent"
    ? Math.round(base * (1 - Math.min(100, Math.max(0, combo.discount)) / 100))
    : Math.max(0, base - cents(combo.discount));
  return (discounted + extras) / 100;
}

/** Soma dos itens avulsos (para mostrar a economia). */
export const comboListPrice = (chosen: ComboOption[], items: Map<string, ComboMenuItem>) =>
  chosen.reduce((s, o) => s + cents(items.get(o.menuItemId)?.price ?? 0) + cents(o.extraPrice), 0) / 100;

/** Opção padrão de cada etapa (a primeira). */
export const defaultChoice = (combo: Combo) => combo.slots.map((s) => s.options[0]).filter(Boolean);

/** Combo montável: todas as etapas têm opção e todos os itens existem no cardápio. */
export const comboAvailable = (combo: Combo, items: Map<string, ComboMenuItem>) =>
  combo.active && combo.slots.length > 0 &&
  combo.slots.every((s) => s.options.some((o) => eligible(items.get(o.menuItemId))));

/** Soma dos preços avulsos dos itens escolhidos para um combo montado no pedido. */
export function onTheFlyComboListPrice(menuItemIds: string[], items: Map<string, ComboMenuItem>): number {
  return menuItemIds.reduce((sum, id) => sum + (eligible(items.get(id)) ? cents(items.get(id)!.price) : 0), 0) / 100;
}

/** Preço final do combo montado na hora, com desconto percentual ou em reais. */
export function onTheFlyComboPrice(menuItemIds: string[], items: Map<string, ComboMenuItem>, discount: OnTheFlyDiscount): number {
  const list = cents(onTheFlyComboListPrice(menuItemIds, items));
  const value = Math.max(0, Number.isFinite(discount.value) ? discount.value : 0);
  const reduction = discount.mode === "percent"
    ? Math.round(list * Math.min(100, value) / 100)
    : Math.min(list, cents(value));
  return Math.max(0, list - reduction) / 100;
}

/** Cria linhas normais do pedido com o total descontado rateado e agrupado na conta. */
export function onTheFlyComboToOrderItems(
  name: string,
  menuItemIds: string[],
  items: Map<string, ComboMenuItem>,
  discount: OnTheFlyDiscount,
  groupId: string,
): OrderItem[] {
  const requested = menuItemIds.map((id) => items.get(id));
  if (requested.some((item) => !eligible(item))) return [];
  const valid = requested.filter(eligible);
  const total = cents(onTheFlyComboPrice(valid.map((item) => item.id), items, discount));
  const weights = valid.map((item) => cents(item.price));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  let assigned = 0;
  return valid.map((item, index) => {
    const share = index === valid.length - 1
      ? total - assigned
      : weightSum ? Math.floor(total * weights[index] / weightSum) : 0;
    assigned += share;
    return { menuItemId: item.id, name: item.name, price: share / 100, quantity: 1, comboGroupId: groupId, comboName: name };
  });
}

/**
 * Transforma o combo escolhido em linhas normais do pedido. O preço total é repartido
 * proporcionalmente ao preço de tabela de cada item (grátis entra com 0); o arredondamento
 * fica no último item, para a soma bater exatamente com o preço do combo.
 */
export function comboToOrderItems(
  combo: Combo, chosen: ComboOption[], items: Map<string, ComboMenuItem>, groupId: string,
): OrderItem[] {
  if (chosen.some((option) => !eligible(items.get(option.menuItemId)))) return [];
  const total = cents(comboPrice(combo, chosen, items));
  const weights = chosen.map((o) => (o.isFree ? 0 : cents(items.get(o.menuItemId)?.price ?? 0)) + cents(o.extraPrice));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let assigned = 0;
  return chosen.map((o, i) => {
    const last = i === chosen.length - 1;
    const share = last ? total - assigned : weightSum ? Math.floor((total * weights[i]) / weightSum) : 0;
    assigned += share;
    return {
      menuItemId: o.menuItemId,
      name: items.get(o.menuItemId)?.name ?? "Item",
      price: share / 100,
      quantity: 1,
      comboGroupId: groupId,
      comboName: combo.name,
    };
  });
}
