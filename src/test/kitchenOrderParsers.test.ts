import { describe, expect, it } from "vitest";
import { parseIngredientMods } from "../lib/kitchen-order-parsers";
import { parseIngredientMods as parseSessionMods } from "../lib/session-row-parsers";
import { getItemExtrasTotal } from "@/utils/orders";

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

  it("shares the parser across views and normalizes a null optional price", () => {
    expect(parseIngredientMods).toBe(parseSessionMods);
    const input = [{ name: "Cebola", action: "remove", extraPrice: null }, { name: "Bacon", action: "extra", extraPrice: 0 }];
    expect(parseIngredientMods(input)).toEqual([{ name: "Cebola", action: "remove" }, { name: "Bacon", action: "extra", extraPrice: 0 }]);
    expect(parseSessionMods(input)).toEqual(parseIngredientMods(input));
  });

  it("clamps negative legacy prices without losing other paid extras", () => {
    const mods = parseIngredientMods([{ name: "Bacon", action: "extra", extraPrice: 4.5 }, { name: "Cebola", action: "extra", extraPrice: -2 }]);
    expect(mods).toEqual([{ name: "Bacon", action: "extra", extraPrice: 4.5 }, { name: "Cebola", action: "extra", extraPrice: 0 }]);
    expect(getItemExtrasTotal({ menuItemId: "m", name: "Burger", price: 20, quantity: 1, ingredientMods: mods })).toBe(4.5);
  });

  it("makes an unidentified legacy label explicit without hiding its paid amount", () => {
    const mods = parseIngredientMods([{ name: "   ", action: "extra", extraPrice: 2 }, { name: "", action: "remove" }]);
    expect(mods).toEqual([{ name: "Adicional sem identificação", action: "extra", extraPrice: 2 }, { name: "Ingrediente sem identificação", action: "remove" }]);
    expect(getItemExtrasTotal({ menuItemId: "m", name: "Burger", price: 20, quantity: 1, ingredientMods: mods })).toBe(2);
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
