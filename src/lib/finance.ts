/**
 * Cálculos comerciais do Pop9 (CMV, margem, preço sugerido, canais, ponto de equilíbrio).
 * Funções puras: não leem nem gravam no banco. Percentuais entram como fração (0.30 = 30%).
 * Valores inválidos devolvem null em vez de um número enganoso.
 */
import { toStockQuantity } from "./stockQuantityConversion";

const round = (n: number, d = 2) => Number(n.toFixed(d));
const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Linha de ficha técnica: quantidade na unidade da receita + custo médio na unidade do estoque. */
export type CostLine = {
  quantity: number;
  recipeUnit: string;
  stockUnit: string;
  /** custo médio por 1 unidade do estoque (ex.: R$/g) */
  unitCost: number | null | undefined;
  /** perda/aparas: 0.1 = 10% a mais precisa ser comprado */
  wasteRate?: number;
};

export type RecipeCost = { total: number; missing: number; incompatible: number; complete: boolean };

/** Custo teórico da ficha. Conta linhas sem custo ou com unidade incompatível, em vez de ignorá-las em silêncio. */
export function recipeCost(lines: CostLine[], yieldQuantity = 1): RecipeCost | null {
  if (!fin(yieldQuantity) || yieldQuantity <= 0) return null;
  let total = 0, missing = 0, incompatible = 0;
  for (const l of lines) {
    if (!fin(l.unitCost) || l.unitCost < 0) { missing++; continue; }
    const qty = toStockQuantity(l.quantity, l.recipeUnit, l.stockUnit);
    if (qty == null) { incompatible++; continue; }
    const waste = fin(l.wasteRate) && l.wasteRate >= 0 && l.wasteRate < 1 ? 1 / (1 - l.wasteRate) : 1;
    total += qty * waste * l.unitCost;
  }
  return { total: round(total / yieldQuantity, 4), missing, incompatible, complete: missing === 0 && incompatible === 0 };
}

/** CMV = custo ÷ preço de venda. */
export function cmv(cost: number, price: number): number | null {
  if (!fin(cost) || !fin(price) || price <= 0 || cost < 0) return null;
  return round(cost / price, 4);
}
/** Margem bruta sobre o preço = (preço − custo) ÷ preço. */
export function grossMargin(cost: number, price: number): number | null {
  const c = cmv(cost, price);
  return c == null ? null : round(1 - c, 4);
}
/** Markup sobre o custo = (preço − custo) ÷ custo. */
export function markup(cost: number, price: number): number | null {
  if (!fin(cost) || !fin(price) || cost <= 0 || price < 0) return null;
  return round((price - cost) / cost, 4);
}

/** Preço pelo CMV alvo: custo ÷ CMV. */
export function priceByCmv(cost: number, targetCmv: number): number | null {
  if (!fin(cost) || cost < 0 || !fin(targetCmv) || targetCmv <= 0 || targetCmv > 1) return null;
  return round(cost / targetCmv);
}
/** Preço por markup sobre o custo. */
export function priceByMarkup(cost: number, markupRate: number): number | null {
  if (!fin(cost) || cost < 0 || !fin(markupRate) || markupRate < 0) return null;
  return round(cost * (1 + markupRate));
}

export type PricingInput = {
  cost: number;
  /** embalagem, descartáveis etc. por unidade vendida */
  packaging?: number;
  /** custo fixo rateado por unidade vendida */
  fixedPerUnit?: number;
  /** percentuais sobre o preço: impostos, taxa de cartão, comissão do canal... */
  deductions?: number[];
  /** lucro líquido desejado sobre o preço */
  targetProfit: number;
};
export type PricingResult = {
  price: number;
  deductionsTotal: number;
  deductionsValue: number;
  profit: number;
  profitRate: number;
  cmv: number;
};

/**
 * Preço que cobre custos, taxas e ainda deixa o lucro desejado:
 * preço = (custo + embalagem + fixo) ÷ (1 − Σ deduções − lucro). Sem solução (≤ 0) devolve null.
 */
export function suggestPrice(input: PricingInput): PricingResult | null {
  const { cost, packaging = 0, fixedPerUnit = 0, deductions = [], targetProfit } = input;
  if (![cost, packaging, fixedPerUnit, targetProfit].every(fin) || cost < 0 || packaging < 0 || fixedPerUnit < 0 || targetProfit < 0) return null;
  if (!deductions.every((d) => fin(d) && d >= 0 && d < 1)) return null;
  const ded = deductions.reduce((a, b) => a + b, 0);
  const denom = 1 - ded - targetProfit;
  if (denom <= 0.0001) return null;
  const price = round((cost + packaging + fixedPerUnit) / denom);
  const deductionsValue = round(price * ded);
  const profit = round(price - cost - packaging - fixedPerUnit - deductionsValue);
  return { price, deductionsTotal: round(ded, 4), deductionsValue, profit, profitRate: round(profit / price, 4), cmv: round(cost / price, 4) };
}

export type Channel = { name: string; commission: number; packaging?: number; extraDeductions?: number[] };
/** Preço do mesmo item em cada canal (salão, delivery, iFood...), mantendo o lucro-alvo. */
export function priceByChannel(base: Omit<PricingInput, "packaging"> & { packaging?: number }, channels: Channel[]) {
  return channels.map((c) => ({
    channel: c.name,
    result: suggestPrice({
      ...base,
      packaging: (base.packaging ?? 0) + (c.packaging ?? 0),
      deductions: [...(base.deductions ?? []), c.commission, ...(c.extraDeductions ?? [])],
    }),
  }));
}

export type BreakEvenInput = {
  fixedCosts: number;
  price: number;
  /** custo variável por unidade (ingredientes + embalagem) */
  variableCost: number;
  /** percentuais variáveis sobre o preço (impostos, cartão, comissão) */
  deductions?: number[];
  /** lucro desejado no período; 0 = ponto de equilíbrio puro */
  targetProfit?: number;
};
export type BreakEven = { contributionPerUnit: number; contributionRate: number; units: number; revenue: number };

/** Unidades e faturamento necessários para cobrir os custos fixos (e o lucro desejado, se houver). */
export function breakEven(input: BreakEvenInput): BreakEven | null {
  const { fixedCosts, price, variableCost, deductions = [], targetProfit = 0 } = input;
  if (![fixedCosts, price, variableCost, targetProfit].every(fin) || fixedCosts < 0 || price <= 0 || variableCost < 0 || targetProfit < 0) return null;
  if (!deductions.every((d) => fin(d) && d >= 0 && d < 1)) return null;
  const contribution = price * (1 - deductions.reduce((a, b) => a + b, 0)) - variableCost;
  if (contribution <= 0) return null;
  const units = Math.ceil((fixedCosts + targetProfit) / contribution);
  return { contributionPerUnit: round(contribution), contributionRate: round(contribution / price, 4), units, revenue: round(units * price) };
}

/** Ponto de equilíbrio do mix: cada item com preço, custo variável e participação nas vendas (pesos). */
export function breakEvenMix(
  fixedCosts: number,
  items: { price: number; variableCost: number; weight: number }[],
  deductions: number[] = [],
): { units: number; revenue: number; contributionRate: number } | null {
  const w = items.reduce((a, i) => a + (fin(i.weight) && i.weight > 0 ? i.weight : 0), 0);
  if (!fin(fixedCosts) || fixedCosts < 0 || w <= 0 || !items.length) return null;
  if (!deductions.every((d) => fin(d) && d >= 0 && d < 1)) return null;
  const ded = deductions.reduce((a, b) => a + b, 0);
  let avgPrice = 0, avgContribution = 0;
  for (const i of items) {
    if (!fin(i.price) || !fin(i.variableCost) || i.price <= 0 || i.variableCost < 0) return null;
    const share = Math.max(i.weight, 0) / w;
    avgPrice += share * i.price;
    avgContribution += share * (i.price * (1 - ded) - i.variableCost);
  }
  if (avgContribution <= 0) return null;
  const units = Math.ceil(fixedCosts / avgContribution);
  return { units, revenue: round(units * avgPrice), contributionRate: round(avgContribution / avgPrice, 4) };
}
