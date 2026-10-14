/**
 * Previsão e insights do painel Financeiro. Funções puras, sem acesso ao banco.
 * A previsão é estatística simples (sazonalidade por dia da semana + tendência linear): serve para
 * orientar, não para garantir. Com poucos dados, devolve null em vez de inventar.
 */
import { cmv } from "./finance";

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

export type ForecastPoint = { day: number; value: number; low: number; high: number };

/**
 * Previsão do faturamento diário. `history` = valores diários consecutivos (o último é o mais recente).
 * Exige ao menos 3 semanas. Faixa = ±1,28 desvio dos resíduos (~80% de confiança).
 */
export function forecastDaily(history: number[], horizon = 14): ForecastPoint[] | null {
  const n = history.length;
  if (n < 21 || !history.every((v) => Number.isFinite(v) && v >= 0) || horizon < 1) return null;
  const overall = mean(history);
  if (overall <= 0) return null;
  const sums = new Array(7).fill(0), counts = new Array(7).fill(0);
  history.forEach((v, i) => { sums[i % 7] += v; counts[i % 7]++; });
  const seasonal = sums.map((s, k) => s / counts[k] / overall);
  const adj = history.map((v, i) => v / (seasonal[i % 7] || 1));
  const tMean = (n - 1) / 2, yMean = mean(adj);
  let num = 0, den = 0;
  adj.forEach((y, t) => { num += (t - tMean) * (y - yMean); den += (t - tMean) ** 2; });
  const slope = den ? num / den : 0, intercept = yMean - slope * tMean;
  const fit = (t: number) => (intercept + slope * t) * (seasonal[t % 7] || 1);
  const resid = history.map((v, t) => v - fit(t));
  const sd = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));
  return Array.from({ length: horizon }, (_, h) => {
    const t = n + h, value = Math.max(0, fit(t));
    return { day: h + 1, value: Math.round(value * 100) / 100, low: Math.max(0, Math.round((value - 1.28 * sd) * 100) / 100), high: Math.round((value + 1.28 * sd) * 100) / 100 };
  });
}

export type MenuItemStat = {
  name: string; price: number; cost: number; units: number;
  category?: string; emoji?: string; imageUrl?: string;
  /** unidades produzidas/compradas e perdidas (sobra, queda, vencimento) no mesmo período das vendas */
  wasted?: number; wasteReason?: string;
};

export type ItemEconomics = {
  revenue: number; cmv: number | null;
  wasteRate: number; wasteCost: number;
  /** CMV contando também o que foi perdido: custo de tudo o que foi produzido ÷ receita */
  realCmv: number | null;
  /** lucro por unidade vendida depois de pagar o desperdício */
  realMargin: number;
};

/** Relaciona cardápio (preço), ficha (custo) e desperdício em números de um item. */
export function itemEconomics(i: MenuItemStat): ItemEconomics {
  const wasted = Number.isFinite(i.wasted) && (i.wasted ?? 0) > 0 ? i.wasted! : 0;
  const made = i.units + wasted;
  const revenue = i.price * i.units;
  return {
    revenue: Math.round(revenue * 100) / 100,
    cmv: cmv(i.cost * i.units, revenue),
    wasteRate: made > 0 ? Math.round((wasted / made) * 1000) / 1000 : 0,
    wasteCost: Math.round(wasted * i.cost * 100) / 100,
    realCmv: cmv(i.cost * made, revenue),
    realMargin: i.units > 0 ? Math.round(((revenue - i.cost * made) / i.units) * 100) / 100 : 0,
  };
}
export type MenuClass = "estrela" | "cavalo" | "quebra-cabeca" | "abacaxi";
export const MENU_CLASS_LABEL: Record<MenuClass, string> = {
  estrela: "Estrela (vende muito, margem alta)",
  cavalo: "Cavalo de batalha (vende muito, margem baixa)",
  "quebra-cabeca": "Quebra-cabeça (vende pouco, margem alta)",
  abacaxi: "Abacaxi (vende pouco, margem baixa)",
};

/** Engenharia de cardápio: margem em R$ por unidade × popularidade, cortando na mediana dos itens. */
export function classifyMenu(items: MenuItemStat[]): { item: MenuItemStat; margin: number; cmv: number | null; cls: MenuClass }[] {
  const valid = items.filter((i) => Number.isFinite(i.price) && Number.isFinite(i.cost) && i.price > 0 && i.units >= 0);
  if (!valid.length) return [];
  const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mMed = median(valid.map((i) => i.price - i.cost)), uMed = median(valid.map((i) => i.units));
  return valid.map((item) => {
    const margin = Math.round((item.price - item.cost) * 100) / 100;
    const highM = margin >= mMed, highU = item.units >= uMed;
    const cls: MenuClass = highU ? (highM ? "estrela" : "cavalo") : highM ? "quebra-cabeca" : "abacaxi";
    return { item, margin, cmv: cmv(item.cost, item.price), cls };
  });
}

export type Insight = { level: "alerta" | "atencao" | "oportunidade" | "info"; title: string; detail: string };

export function buildInsights(input: {
  items: MenuItemStat[]; targetCmv: number; monthlyFixed: number;
  forecast: ForecastPoint[] | null; history: number[]; breakEvenRevenue: number | null;
}): Insight[] {
  const out: Insight[] = [];
  const rows = classifyMenu(input.items);
  const revenue = rows.reduce((s, r) => s + r.item.price * r.item.units, 0);
  const cost = rows.reduce((s, r) => s + r.item.cost * r.item.units, 0);
  const total = revenue > 0 ? cost / revenue : null;
  if (total != null && total > input.targetCmv) {
    out.push({ level: "alerta", title: `CMV geral em ${(total * 100).toFixed(1)}%`, detail: `Acima da meta de ${(input.targetCmv * 100).toFixed(0)}%. Cada ponto percentual a menos libera cerca de R$ ${(revenue / 100).toFixed(0)} no período.` });
  }
  rows.filter((r) => r.cmv != null && r.cmv > input.targetCmv + 0.05 && r.cls !== "abacaxi")
    .sort((a, b) => b.item.units - a.item.units).slice(0, 3)
    .forEach((r) => out.push({ level: "atencao", title: `${r.item.name}: CMV ${(r.cmv! * 100).toFixed(0)}%`, detail: "Item popular com custo alto. Revise a ficha, o rendimento ou reajuste o preço." }));
  rows.filter((r) => r.cls === "quebra-cabeca").slice(0, 2)
    .forEach((r) => out.push({ level: "oportunidade", title: `Divulgue ${r.item.name}`, detail: `Margem de R$ ${r.margin.toFixed(2)} por unidade, mas vende pouco. Destaque no cardápio ou sugira no pedido.` }));
  rows.filter((r) => r.cls === "abacaxi").slice(0, 2)
    .forEach((r) => out.push({ level: "info", title: `Reveja ${r.item.name}`, detail: "Vende pouco e deixa pouca margem. Considere ajustar o preço, trocar a receita ou retirar do cardápio." }));
  input.items.map((i) => ({ i, e: itemEconomics(i) })).filter((x) => x.e.wasteRate >= 0.08)
    .sort((a, b) => b.e.wasteCost - a.e.wasteCost).slice(0, 2)
    .forEach(({ i, e }) => out.push({ level: e.wasteRate >= 0.15 ? "alerta" : "atencao", title: `${i.name}: ${(e.wasteRate * 100).toFixed(0)}% de desperdício`,
      detail: `R$ ${e.wasteCost.toFixed(0)} perdidos no período${i.wasteReason ? ` (${i.wasteReason})` : ""}. O CMV real sobe de ${((e.cmv ?? 0) * 100).toFixed(0)}% para ${((e.realCmv ?? 0) * 100).toFixed(0)}%.` }));
  if (input.forecast && input.history.length >= 14) {
    const h = input.forecast.length, next = input.forecast.reduce((s, p) => s + p.value, 0);
    const last = input.history.slice(-h).reduce((s, v) => s + v, 0);
    if (last > 0) {
      const delta = (next - last) / last;
      out.push({ level: delta < -0.05 ? "atencao" : "info", title: `Previsão dos próximos ${h} dias: R$ ${next.toFixed(0)}`, detail: `${delta >= 0 ? "Alta" : "Queda"} de ${(Math.abs(delta) * 100).toFixed(1)}% frente aos ${h} dias anteriores.` });
    }
    if (input.breakEvenRevenue != null && input.breakEvenRevenue > 0) {
      const monthly = (next / h) * 30;
      out.push(monthly >= input.breakEvenRevenue
        ? { level: "info", title: "Acima do ponto de equilíbrio", detail: `Projeção mensal de R$ ${monthly.toFixed(0)} contra equilíbrio de R$ ${input.breakEvenRevenue.toFixed(0)}.` }
        : { level: "alerta", title: "Abaixo do ponto de equilíbrio", detail: `Projeção mensal de R$ ${monthly.toFixed(0)} não cobre R$ ${input.breakEvenRevenue.toFixed(0)} necessários para pagar os custos fixos.` });
    }
  }
  return out;
}

/** Dados de AMOSTRA determinísticos, só para demonstrar o painel. Nunca vêm do banco. */
export function sampleData() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dow = [0.7, 0.75, 0.85, 0.95, 1.2, 1.5, 1.35];
  const history = Array.from({ length: 56 }, (_, i) => Math.round(2400 * dow[i % 7] * (1 + i * 0.004) * (0.92 + rnd() * 0.16)));
  const items: MenuItemStat[] = [
    { name: "X-Burger", category: "Lanches", emoji: "🍔", price: 32, cost: 9.8, units: 410, wasted: 12, wasteReason: "sobra de chapa" },
    { name: "X-Bacon", category: "Lanches", emoji: "🥓", price: 36, cost: 13.9, units: 380, wasted: 18, wasteReason: "bacon queimado" },
    { name: "Burger Duplo", category: "Lanches", emoji: "🍔", price: 42, cost: 17.5, units: 120, wasted: 6 },
    { name: "Batata Frita", category: "Porções", emoji: "🍟", price: 22, cost: 4.2, units: 300, wasted: 45, wasteReason: "óleo e sobra do balcão" },
    { name: "Onion Rings", category: "Porções", emoji: "🧅", price: 24, cost: 5.1, units: 70, wasted: 14, wasteReason: "massa vencida" },
    { name: "Refrigerante", category: "Bebidas", emoji: "🥤", price: 7, cost: 2.6, units: 520, wasted: 4 },
    { name: "Suco Natural", category: "Bebidas", emoji: "🧃", price: 12, cost: 3.1, units: 90, wasted: 20, wasteReason: "fruta passada" },
    { name: "Milk-shake", category: "Sobremesas", emoji: "🥤", price: 18, cost: 9.5, units: 60, wasted: 3 },
  ];
  return { history, items };
}

export type WasteMovement = { rawMaterialId: string; name: string; unit: string; quantity: number; unitCost: number | null; motivo: string | null };
export type WasteSummary = { rawMaterialId: string; name: string; unit: string; quantity: number; cost: number; events: number; topMotivo: string | null };

/** Agrupa as perdas registradas por insumo: quantidade, valor perdido e motivo mais frequente. Ordena pelo maior prejuízo. */
export function summarizeWaste(rows: WasteMovement[]): WasteSummary[] {
  const map = new Map<string, WasteSummary & { motivos: Map<string, number> }>();
  for (const r of rows) {
    if (!Number.isFinite(r.quantity) || r.quantity <= 0) continue;
    const cur = map.get(r.rawMaterialId) ?? { rawMaterialId: r.rawMaterialId, name: r.name, unit: r.unit, quantity: 0, cost: 0, events: 0, topMotivo: null, motivos: new Map() };
    cur.quantity += r.quantity;
    cur.cost += r.quantity * (r.unitCost ?? 0);
    cur.events++;
    const m = r.motivo?.trim();
    if (m) cur.motivos.set(m, (cur.motivos.get(m) ?? 0) + 1);
    map.set(r.rawMaterialId, cur);
  }
  return [...map.values()].map(({ motivos, ...s }) => ({
    ...s, quantity: Math.round(s.quantity * 1000) / 1000, cost: Math.round(s.cost * 100) / 100,
    topMotivo: [...motivos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  })).sort((a, b) => b.cost - a.cost);
}
