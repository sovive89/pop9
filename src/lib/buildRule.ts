import { onTheFlyComboPrice, onTheFlyComboListPrice, type ComboMenuItem, type OnTheFlyDiscount } from "@/lib/combos";

/** Regra do "Monte o seu combo": quantos itens elegíveis o cliente escolhe e qual desconto ganha. */
export type BuildRule = { enabled: boolean; minItems: number; maxItems: number; discount: OnTheFlyDiscount };
export const DEFAULT_BUILD_RULE: BuildRule = { enabled: false, minItems: 2, maxItems: 6, discount: { mode: "percent", value: 0 } };

/** Mensagem de erro da regra, ou "" se estiver válida. */
export function buildRuleError(rule: BuildRule): string {
  const { minItems, maxItems, discount } = rule;
  if (!Number.isInteger(minItems) || !Number.isInteger(maxItems) || minItems < 2 || maxItems > 20) return "Use de 2 a 20 itens.";
  if (maxItems < minItems) return "O máximo não pode ser menor que o mínimo.";
  if (!Number.isFinite(discount.value) || discount.value < 0) return "Desconto inválido.";
  if (discount.mode === "percent" && discount.value > 100) return "O desconto não passa de 100%.";
  return "";
}

/** Valida a escolha do cliente e calcula o preço; null se não cumpre a regra. */
export function priceBuiltCombo(rule: BuildRule, itemIds: string[], items: Map<string, ComboMenuItem>) {
  if (!rule.enabled || buildRuleError(rule) || itemIds.length < rule.minItems || itemIds.length > rule.maxItems) return null;
  if (itemIds.some((id) => !items.get(id) || items.get(id)!.comboEligible === false)) return null;
  return { list: onTheFlyComboListPrice(itemIds, items), price: onTheFlyComboPrice(itemIds, items, rule.discount) };
}
