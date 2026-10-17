// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizeDraft, findUnitConflicts, normalizeUnit, slug, toCatalogDraft } from "../../supabase/functions/_shared/menu-import-schema";

describe("menu import catalog-only drafts", () => {
  it("retains ingredient names and strips any recipe quantity/production from extraction", () => {
    const { draft } = sanitizeDraft({ items: [{
      name: "Sanduíche", description: "Queijo e molho da casa", category: "lanches", price: 25,
      ingredients: [{ name: "Queijo", removable: true, extraPrice: 0 }],
      recipe: [{ material: "Queijo", unit: "g", quantity: 40 },
        { material: "Molho da casa", unit: "ml", quantity: 20,
          preparation: { outputQuantity: 1000, inputs: [{ material: "Tomate", unit: "g", quantity: 500 }] } }],
    }] });
    const catalog = toCatalogDraft(draft);
    expect(catalog.items[0].recipe).toEqual([]);
    expect(catalog.items[0].ingredients.map(i => i.name)).toEqual(["Queijo", "Molho da casa"]);
    expect(catalog.items[0].price).toBe(25);
    expect(catalog.items[0].description).toBe("Queijo e molho da casa");
    expect(draft.items[0].recipe).toHaveLength(2);
  });
});

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

  it("accepts bounded photo-crop coordinates and rejects out-of-image boxes", () => {
    const { draft, warnings } = sanitizeDraft({ items: [
      { name: "Burger", category: "lanches", imageCrop: { fileIndex: 1, x: 0.1, y: 0.2, width: 0.6, height: 0.5 } },
      { name: "Pizza", category: "lanches", imageCrop: { fileIndex: 1, x: 0.8, y: 0.2, width: 0.4, height: 0.5 } },
    ] });
    expect(draft.items[0].imageCrop).toEqual({ fileIndex: 1, x: 0.1, y: 0.2, width: 0.6, height: 0.5 });
    expect(draft.items[1].imageCrop).toBeUndefined();
    expect(warnings.some(message => message.includes("coordenadas inválidas"))).toBe(true);
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
