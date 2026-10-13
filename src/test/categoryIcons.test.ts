import { describe, expect, it } from "vitest";
import { CATEGORY_ICON_OPTIONS, suggestCategoryIcon } from "@/utils/categoryIcons";

describe("category icons", () => {
  it("offers a larger catalog with unique names that all resolve", () => {
    const names = CATEGORY_ICON_OPTIONS.map((o) => o.name);
    expect(names.length).toBeGreaterThan(50);
    expect(new Set(names).size).toBe(names.length);
  });
  it("suggests an icon that matches the category name", () => {
    const cases: [string, string][] = [
      ["Hambúrgueres", "sandwich"], ["Sucos naturais", "citrus"], ["Bebidas", "cup-soda"], ["Açaí", "ice-cream-bowl"],
      ["Sobremesas", "dessert"], ["Frango", "drumstick"], ["Combos", "gift"], ["Cervejas", "beer"], ["Drinks", "martini"],
      ["Porções", "cooking-pot"], ["Massas", "wheat"], ["Café da manhã", "egg-fried"], ["Cafés", "coffee"], ["Kids", "baby"],
    ];
    for (const [label, icon] of cases) expect([label, suggestCategoryIcon(label)]).toEqual([label, icon]);
    expect(CATEGORY_ICON_OPTIONS.map((o) => o.name)).toEqual(expect.arrayContaining(cases.map(([, i]) => i)));
  });
});
