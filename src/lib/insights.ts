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

export type MenuItemStat = { name: string; price: number; cost: number; units: number };
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
    { name: "X-Burger", price: 32, cost: 9.8, units: 410 },
    { name: "X-Bacon", price: 36, cost: 13.9, units: 380 },
    { name: "Burger Duplo", price: 42, cost: 17.5, units: 120 },
    { name: "Batata Frita", price: 22, cost: 4.2, units: 300 },
    { name: "Onion Rings", price: 24, cost: 5.1, units: 70 },
    { name: "Refrigerante", price: 7, cost: 2.6, units: 520 },
    { name: "Suco Natural", price: 12, cost: 3.1, units: 90 },
    { name: "Milk-shake", price: 18, cost: 9.5, units: 60 },
  ];
  return { history, items };
}
