import { describe, expect, it } from "vitest";
import { csvToDraft, draftToCsv, parseCsv, parseMoney } from "@/lib/conversion";

const CSV = `Item;Categoria;Preço;Descrição;Insumo;Quantidade;Unidade
X-Burger;Lanches;"R$ 32,50";Pão e blend;Pão brioche;1;un
;;;;Hambúrguer blend;200;gramas
;;;;Bacon;30,5;g
Suco;Bebidas;8;;Polpa de fruta;100;g`;

describe("parseCsv / parseMoney", () => {
  it("lê aspas, ponto e vírgula e BOM", () => {
    expect(parseCsv('﻿a;b\r\n"x;y";"he said ""hi"""\r\n')).toEqual([["a", "b"], ["x;y", 'he said "hi"']]);
  });
  it("entende moeda brasileira", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("")).toBe(0);
  });
});

describe("planilha → rascunho", () => {
  it("agrupa linhas por item e normaliza unidades", () => {
    const { draft, warnings } = csvToDraft(CSV);
    expect(draft.items).toHaveLength(2);
    const burger = draft.items[0];
    expect(burger).toMatchObject({ name: "X-Burger", price: 32.5 });
    expect(burger.recipe.map((l) => [l.material, l.quantity, l.unit])).toEqual([
      ["Pão brioche", 1, "un"], ["Hambúrguer blend", 200, "g"], ["Bacon", 30.5, "g"],
    ]);
    expect(draft.categories.map((c) => c.label).sort()).toEqual(["Bebidas", "Lanches"]);
    expect(warnings).toEqual([]);
  });
  it("não inventa quantidade nem unidade", () => {
    const { draft, warnings, rowsIgnored } = csvToDraft("item;insumo;quantidade;unidade\nPrato;Sal;;g\nPrato;Pimenta;2;");
    expect(draft.items[0].recipe).toEqual([]);
    expect(rowsIgnored).toBe(2);
    expect(warnings.some((w) => w.includes("sem quantidade"))).toBe(true);
    expect(warnings.some((w) => w.includes("sem unidade"))).toBe(true);
  });
  it("avisa quando falta a coluna do item", () => {
    expect(csvToDraft("foo;bar\n1;2").warnings[0]).toMatch(/Coluna do item/);
  });
});

describe("rascunho → CSV", () => {
  it("ida e volta preserva itens e fichas", () => {
    const first = csvToDraft(CSV).draft;
    const again = csvToDraft(draftToCsv(first)).draft;
    expect(again.items.map((i) => [i.name, i.price, i.recipe.map((l) => [l.material, l.quantity, l.unit])]))
      .toEqual(first.items.map((i) => [i.name, i.price, i.recipe.map((l) => [l.material, l.quantity, l.unit])]));
  });
});
