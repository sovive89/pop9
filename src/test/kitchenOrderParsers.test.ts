import { describe, expect, it } from "vitest";
import { parseIngredientMods } from "../lib/kitchen-order-parsers";

describe("parseIngredientMods", () => {
  it("returns valid modifiers with remove and extra actions", () => {
    const modifiers = parseIngredientMods([
      { name: "Cebola", action: "remove" },
      { name: "Bacon", action: "extra", extraPrice: 4.5 },
    ]);

    expect(modifiers).toEqual([
      { name: "Cebola", action: "remove" },
      { name: "Bacon", action: "extra", extraPrice: 4.5 },
    ]);
  });

  it("returns an empty list for the database default", () => {
    expect(parseIngredientMods([])).toEqual([]);
  });

  it("rejects malformed JSON instead of asserting it as IngredientMod[]", () => {
    expect(parseIngredientMods(null)).toBeUndefined();
    expect(parseIngredientMods({ name: "Cebola", action: "remove" })).toBeUndefined();
    expect(parseIngredientMods([{ name: "Cebola", action: "replace" }])).toBeUndefined();
    expect(parseIngredientMods([{ name: "Bacon", action: "extra", extraPrice: "4.5" }])).toBeUndefined();
    expect(parseIngredientMods([{ name: "Bacon", action: "extra", extraPrice: Number.NaN }])).toBeUndefined();
    expect(parseIngredientMods([{ name: "Bacon", action: "extra" }, "invalid"])).toBeUndefined();
  });
});
