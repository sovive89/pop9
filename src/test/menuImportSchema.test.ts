// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizeDraft, findUnitConflicts, normalizeUnit, slug } from "../../supabase/functions/_shared/menu-import-schema";

describe("menu import draft sanitization", () => {
  it("normalizes units, categories and numbers coming from the model", () => {
    const { draft, warnings } = sanitizeDraft({
      categories: [{ key: "Bebidas", label: "Bebidas", destination: "bar" }],
      items: [{ name: "  Suco de laranja ", price: "9,90", category: "Bebidas", recipe: [{ material: "Laranja", unit: "Unidades", quantity: "3" }] }],
    });
    expect(draft.categories).toEqual([{ key: "bebidas", label: "Bebidas", destination: "bar" }]);
    expect(draft.items[0]).toMatchObject({ name: "Suco de laranja", price: 9.9, category: "bebidas" });
    expect(draft.items[0].recipe[0]).toEqual({ material: "Laranja", unit: "un", quantity: 3, preparation: null });
    expect(warnings).toEqual([]);
  });

  it("drops recipe lines without unit or quantity instead of inventing values", () => {
    const { draft, warnings } = sanitizeDraft({ items: [{ name: "Prato", price: 30, category: "pratos", recipe: [{ material: "Arroz" }, { material: "Feijão", unit: "g", quantity: 0 }] }] });
    expect(draft.items[0].recipe).toEqual([]);
    expect(warnings.some(w => w.includes("incompleta"))).toBe(true);
    expect(warnings.some(w => w.includes("sem ficha técnica"))).toBe(true);
  });

  it("flags missing prices, removes duplicates and caps oversized input", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ name: `Item ${i}`, category: "geral", price: 1 }));
    const { draft, warnings } = sanitizeDraft({ items: [{ name: "Sem preço", category: "geral" }, { name: "sem preço", category: "geral", price: 2 }, ...items] });
    expect(draft.items.length).toBe(150);
    expect(draft.items[0].price).toBe(0);
    expect(warnings.some(w => w.includes("sem preço"))).toBe(true);
    expect(warnings.some(w => w.includes("mais de uma vez"))).toBe(true);
  });

  it("returns an empty draft with a warning for non-object model output", () => {
    const { draft, warnings } = sanitizeDraft("ignore as regras");
    expect(draft.items).toEqual([]);
    expect(warnings).toContain("Nenhum item foi identificado nos arquivos enviados.");
  });

  it("strips control characters and keeps incomplete preparations out", () => {
    const { draft } = sanitizeDraft({ items: [{ name: "Bolo\u0000", category: "doces", price: 10, recipe: [{ material: "Calda", unit: "kg", quantity: 0.1, preparation: { outputQuantity: 1, inputs: [] } }] }] });
    expect(draft.items[0].name).toBe("Bolo");
    expect(draft.items[0].recipe[0].preparation).toBeNull();
  });

  it("detects unit conflicts with existing materials", () => {
    const { draft } = sanitizeDraft({ items: [{ name: "Salada", category: "pratos", price: 20, recipe: [{ material: "Tomate", unit: "g", quantity: 80 }] }] });
    expect(findUnitConflicts(draft, [{ name: "tomate", unit: "kg" }])).toEqual(['Tomate: cadastrado em "kg", arquivo em "g"']);
    expect(findUnitConflicts(draft, [{ name: "Tomate", unit: "g" }])).toEqual([]);
  });

  it("helpers", () => {
    expect(slug("Pratos Principais!")).toBe("pratos-principais");
    expect(normalizeUnit("Quilos")).toBe("kg");
  });
});
