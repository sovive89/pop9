import { describe, expect, it } from "vitest";
import { ingredientsFromDescription } from "@/lib/menuIngredients";

describe("ingredientsFromDescription", () => {
  it("preserva as linhas manuais e seus preços mesmo se a descrição contiver vírgulas", () => {
    expect(ingredientsFromDescription("Pão, carne e molho da casa", [
      { name: "Bacon", removable: true, extra_price: 4, sort_order: 3 },
      { name: "Cebola", removable: false, extra_price: null, sort_order: 7 },
    ])).toEqual([
      { name: "Bacon", removable: true, extra_price: 4, sort_order: 0 },
      { name: "Cebola", removable: false, extra_price: null, sort_order: 1 },
    ]);
  });

  it("extrai uma lista simples da descrição quando não há linhas manuais", () => {
    expect(ingredientsFromDescription("Pão brioche, queijo, molho especial", [])).toEqual([
      { name: "Pão brioche", removable: false, extra_price: null, sort_order: 0 },
      { name: "queijo", removable: false, extra_price: null, sort_order: 1 },
      { name: "molho especial", removable: false, extra_price: null, sort_order: 2 },
    ]);
  });

  it("não cria linhas a partir de uma descrição sem lista", () => {
    expect(ingredientsFromDescription("Hambúrguer artesanal com molho da casa", [])).toEqual([]);
  });
});
