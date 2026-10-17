import { describe, expect, it } from "vitest";
import { buildInsights, classifyMenu, forecastDaily, itemEconomics, sampleData } from "@/lib/insights";

describe("previsão", () => {
  it("recusa histórico curto ou inválido", () => {
    expect(forecastDaily(new Array(10).fill(100))).toBeNull();
    expect(forecastDaily([...new Array(20).fill(100), NaN])).toBeNull();
  });
  it("repete o padrão semanal e a tendência", () => {
    const week = [70, 75, 85, 95, 120, 150, 135];
    const hist = Array.from({ length: 28 }, (_, i) => week[i % 7]);
    const f = forecastDaily(hist, 7)!;
    f.forEach((p, i) => expect(p.value).toBeCloseTo(week[i], 0));
    expect(f[0].low).toBeLessThanOrEqual(f[0].value);
    expect(f[0].high).toBeGreaterThanOrEqual(f[0].value);
  });
  it("capta crescimento", () => {
    const hist = Array.from({ length: 28 }, (_, i) => 100 + i * 5);
    const f = forecastDaily(hist, 7)!;
    const next = f.reduce((a, p) => a + p.value, 0), last = hist.slice(-7).reduce((a, v) => a + v, 0);
    expect(next).toBeGreaterThan(last);
  });
});

describe("engenharia de cardápio", () => {
  it("classifica nos 4 quadrantes", () => {
    const r = classifyMenu([
      { name: "A", price: 30, cost: 5, units: 500 },   // margem alta, vende muito
      { name: "B", price: 10, cost: 8, units: 400 },   // margem baixa, vende muito
      { name: "C", price: 40, cost: 10, units: 20 },   // margem alta, vende pouco
      { name: "D", price: 10, cost: 9, units: 10 },    // margem baixa, vende pouco
    ]);
    expect(Object.fromEntries(r.map((x) => [x.item.name, x.cls]))).toEqual({ A: "estrela", B: "cavalo", C: "quebra-cabeca", D: "abacaxi" });
  });
});

describe("insights com a amostra", () => {
  it("gera alertas coerentes", () => {
    const { history, items } = sampleData();
    const forecast = forecastDaily(history, 14);
    const list = buildInsights({ items, targetCmv: 0.3, monthlyFixed: 30000, forecast, history, breakEvenRevenue: 90000 });
    expect(list.length).toBeGreaterThan(2);
    expect(list.some((i) => i.title.startsWith("Previsão"))).toBe(true);
    expect(sampleData().history).toEqual(history); // determinística
  });
});

describe("desperdício", () => {
  it("relaciona preço, ficha e perda", () => {
    const e = itemEconomics({ name: "A", price: 20, cost: 5, units: 90, wasted: 10 });
    expect(e.wasteRate).toBe(0.1);
    expect(e.wasteCost).toBe(50);
    expect(e.cmv).toBe(0.25);
    expect(e.realCmv).toBeCloseTo(0.2778, 3); // 5×100 ÷ 1800
    expect(e.realMargin).toBeCloseTo(14.44, 2); // (1800 − 5×100) ÷ 90
  });
  it("sem perda não altera o CMV", () => {
    const e = itemEconomics({ name: "B", price: 10, cost: 3, units: 10 });
    expect(e.realCmv).toBe(e.cmv);
    expect(e.wasteCost).toBe(0);
  });
  it("gera insight de desperdício alto", () => {
    const { history, items } = sampleData();
    const list = buildInsights({ items, targetCmv: 0.3, monthlyFixed: 1, forecast: null, history, breakEvenRevenue: null });
    expect(list.some((i) => i.title.includes("desperdício"))).toBe(true);
  });
});

import { summarizeWaste } from "@/lib/insights";
describe("perdas registradas", () => {
  it("agrupa por insumo, soma o prejuízo e acha o motivo mais comum", () => {
    const s = summarizeWaste([
      { rawMaterialId: "a", name: "Tomate", unit: "g", quantity: 500, unitCost: 0.01, motivo: "Vencimento" },
      { rawMaterialId: "a", name: "Tomate", unit: "g", quantity: 300, unitCost: 0.01, motivo: "Vencimento" },
      { rawMaterialId: "a", name: "Tomate", unit: "g", quantity: 100, unitCost: 0.01, motivo: "Queda" },
      { rawMaterialId: "b", name: "Bacon", unit: "g", quantity: 200, unitCost: 0.05, motivo: null },
      { rawMaterialId: "c", name: "Inválido", unit: "g", quantity: -1, unitCost: 1, motivo: null },
    ]);
    expect(s.map((x) => x.name)).toEqual(["Bacon", "Tomate"]); // 10,00 > 9,00
    expect(s[1]).toMatchObject({ quantity: 900, cost: 9, events: 3, topMotivo: "Vencimento" });
  });
});
