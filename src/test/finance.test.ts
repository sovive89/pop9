import { describe, expect, it } from "vitest";
import { breakEven, breakEvenMix, cmv, grossMargin, markup, priceByChannel, priceByCmv, priceByMarkup, recipeCost, suggestPrice } from "@/lib/finance";

describe("custo da ficha", () => {
  it("converte a unidade da receita para a do estoque e soma", () => {
    const r = recipeCost([
      { quantity: 200, recipeUnit: "g", stockUnit: "g", unitCost: 0.03 },   // 6,00
      { quantity: 50, recipeUnit: "g", stockUnit: "kg", unitCost: 30 },      // 0,05 kg × 30 = 1,50
      { quantity: 2, recipeUnit: "un", stockUnit: "un", unitCost: 0.5 },     // 1,00
    ]);
    expect(r).toEqual({ total: 8.5, missing: 0, incompatible: 0, complete: true });
  });
  it("aplica perda e divide pelo rendimento", () => {
    const r = recipeCost([{ quantity: 1, recipeUnit: "kg", stockUnit: "kg", unitCost: 10, wasteRate: 0.5 }], 4);
    expect(r?.total).toBe(5); // 10 ÷ 0,5 = 20 por receita ÷ 4
  });
  it("sinaliza custo ausente e unidade incompatível em vez de ignorar", () => {
    const r = recipeCost([
      { quantity: 1, recipeUnit: "g", stockUnit: "g", unitCost: null },
      { quantity: 1, recipeUnit: "g", stockUnit: "ml", unitCost: 1 },
    ]);
    expect(r).toMatchObject({ total: 0, missing: 1, incompatible: 1, complete: false });
    expect(recipeCost([], 0)).toBeNull();
  });
});

describe("CMV, margem e markup", () => {
  it("calcula os indicadores", () => {
    expect(cmv(10, 40)).toBe(0.25);
    expect(grossMargin(10, 40)).toBe(0.75);
    expect(markup(10, 40)).toBe(3);
  });
  it("rejeita entradas inválidas", () => {
    expect(cmv(10, 0)).toBeNull();
    expect(markup(0, 10)).toBeNull();
    expect(cmv(NaN, 10)).toBeNull();
  });
});

describe("preço sugerido", () => {
  it("por CMV alvo e por markup", () => {
    expect(priceByCmv(10, 0.3)).toBe(33.33);
    expect(priceByMarkup(10, 2)).toBe(30);
    expect(priceByCmv(10, 0)).toBeNull();
  });
  it("cobre custo, taxas e lucro desejado", () => {
    const r = suggestPrice({ cost: 10, deductions: [0.1, 0.05], targetProfit: 0.2 })!;
    expect(r.price).toBe(15.38); // 10 ÷ (1 − 0,15 − 0,20)
    expect(r.profit).toBeCloseTo(r.price * 0.2, 1);
    expect(r.cmv).toBeCloseTo(0.65, 2);
  });
  it("devolve null quando taxas + lucro consomem o preço todo", () => {
    expect(suggestPrice({ cost: 10, deductions: [0.5, 0.3], targetProfit: 0.2 })).toBeNull();
    expect(suggestPrice({ cost: 10, deductions: [1.2], targetProfit: 0 })).toBeNull();
  });
  it("preço por canal sobe com a comissão", () => {
    const [salao, ifood] = priceByChannel({ cost: 10, targetProfit: 0.2, deductions: [0.05] }, [
      { name: "Salão", commission: 0 },
      { name: "iFood", commission: 0.27, packaging: 1 },
    ]);
    expect(ifood.result!.price).toBeGreaterThan(salao.result!.price);
    expect(ifood.result!.profitRate).toBeCloseTo(0.2, 1);
  });
});

describe("ponto de equilíbrio", () => {
  it("unidades e faturamento para cobrir os fixos", () => {
    const r = breakEven({ fixedCosts: 10000, price: 40, variableCost: 10, deductions: [0.1] })!;
    expect(r.contributionPerUnit).toBe(26);
    expect(r.units).toBe(385);
    expect(r.revenue).toBe(15400);
  });
  it("inclui lucro desejado e recusa contribuição negativa", () => {
    expect(breakEven({ fixedCosts: 1000, price: 20, variableCost: 10, targetProfit: 1000 })!.units).toBe(200);
    expect(breakEven({ fixedCosts: 1000, price: 10, variableCost: 12 })).toBeNull();
  });
  it("mix de itens pondera pela participação nas vendas", () => {
    const r = breakEvenMix(3000, [
      { price: 30, variableCost: 10, weight: 3 },
      { price: 50, variableCost: 20, weight: 1 },
    ])!;
    // contribuição média = 0,75×20 + 0,25×30 = 22,5 → 3000 ÷ 22,5 = 133,3 → 134
    expect(r.units).toBe(134);
    expect(breakEvenMix(100, [])).toBeNull();
  });
});
