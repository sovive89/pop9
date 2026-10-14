import { describe, expect, it } from "vitest";
import { buildInsights, classifyMenu, forecastDaily, sampleData } from "@/lib/insights";

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
