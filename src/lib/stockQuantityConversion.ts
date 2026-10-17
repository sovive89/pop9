/** Converte somente unidades da mesma dimensão para preservar o consumo real. */
const UNIT_FACTORS: Record<string, { dimension: string; factor: number }> = {
  g: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  l: { dimension: "volume", factor: 1000 },
  un: { dimension: "unit", factor: 1 },
  dz: { dimension: "unit", factor: 12 },
};

export function toStockQuantity(quantity: number, recipeUnit: string, stockUnit: string): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const source = recipeUnit.trim().toLowerCase();
  const target = stockUnit.trim().toLowerCase();
  if (source === target) return quantity;
  const from = UNIT_FACTORS[source];
  const to = UNIT_FACTORS[target];
  if (!from || !to || from.dimension !== to.dimension) return null;
  return Number((quantity * from.factor / to.factor).toFixed(6));
}
