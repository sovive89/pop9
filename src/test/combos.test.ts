import { describe, expect, it } from "vitest";
import { comboAvailable, comboListPrice, comboPrice, comboToOrderItems, onTheFlyComboListPrice, onTheFlyComboPrice, onTheFlyComboToOrderItems, type Combo, type ComboMenuItem } from "@/lib/combos";

const items = new Map([
  ["burger", { id: "burger", name: "Burger", price: 30 }],
  ["fries", { id: "fries", name: "Fritas", price: 15 }],
  ["coke", { id: "coke", name: "Coca", price: 7 }],
  ["juice", { id: "juice", name: "Suco", price: 10 }],
]);
const opt = (menuItemId: string, extraPrice = 0, isFree = false) => ({ id: menuItemId, menuItemId, extraPrice, isFree });
const combo = (over: Partial<Combo> = {}): Combo => ({
  id: "c", name: "Combo Casa", description: null, pricingMode: "fixed", price: 39.9, discount: 0, active: true,
  slots: [{ id: "s1", label: "Lanche", options: [opt("burger")] }, { id: "s2", label: "Bebida", options: [opt("coke"), opt("juice", 3)] }], ...over,
});

describe("combos", () => {
  it("fixed price plus option surcharge", () => {
    expect(comboPrice(combo(), [opt("burger"), opt("coke")], items)).toBe(39.9);
    expect(comboPrice(combo(), [opt("burger"), opt("juice", 3)], items)).toBe(42.9);
  });

  it("percent and amount discounts over the chosen items", () => {
    expect(comboPrice(combo({ pricingMode: "percent", discount: 10, price: null }), [opt("burger"), opt("fries")], items)).toBe(40.5);
    expect(comboPrice(combo({ pricingMode: "amount", discount: 5, price: null }), [opt("burger"), opt("fries")], items)).toBe(40);
    expect(comboPrice(combo({ pricingMode: "amount", discount: 100, price: null }), [opt("burger")], items)).toBe(0);
  });

  it("calculates the selected options' list price and discounted combo value including surcharge", () => {
    const chosen = [opt("burger"), opt("juice", 3)];
    const discounted = combo({ pricingMode: "percent", discount: 10, price: null });
    expect(comboListPrice(chosen, items)).toBe(43);
    expect(comboPrice(discounted, chosen, items)).toBe(39);
  });

  it("calculates an on-the-fly combo with percent or currency discount and allocates exact total", () => {
    const ids = ["burger", "fries"];
    expect(onTheFlyComboListPrice(ids, items)).toBe(45);
    expect(onTheFlyComboPrice(ids, items, { mode: "percent", value: 10 })).toBe(40.5);
    expect(onTheFlyComboPrice(ids, items, { mode: "amount", value: 5 })).toBe(40);
    const lines = onTheFlyComboToOrderItems("Combo montado na hora", ids, items, { mode: "percent", value: 10 }, "g2");
    expect(lines.map((line) => line.name)).toEqual(["Burger", "Fritas"]);
    expect(lines.every((line) => line.comboGroupId === "g2" && line.comboName === "Combo montado na hora")).toBe(true);
    expect(Math.round(lines.reduce((sum, line) => sum + line.price, 0) * 100)).toBe(4050);
  });

  it("free item (Coca grátis) is not charged", () => {
    expect(comboPrice(combo({ pricingMode: "percent", discount: 0, price: null }), [opt("burger"), opt("coke", 0, true)], items)).toBe(30);
    expect(comboListPrice([opt("burger"), opt("coke", 0, true)], items)).toBe(37);
  });

  it("splits the combo price across order lines summing exactly", () => {
    const lines = comboToOrderItems(combo(), [opt("burger"), opt("fries"), opt("coke", 0, true)], items, "g1");
    expect(lines.map((l) => l.name)).toEqual(["Burger", "Fritas", "Coca"]);
    expect(lines.every((l) => l.comboGroupId === "g1" && l.comboName === "Combo Casa" && l.quantity === 1)).toBe(true);
    expect(Math.round(lines.reduce((s, l) => s + l.price, 0) * 100)).toBe(3990);
    expect(lines[0].price).toBeGreaterThan(lines[1].price);
  });

  it("is available only with options for every step that exist in the menu", () => {
    expect(comboAvailable(combo(), items)).toBe(true);
    expect(comboAvailable(combo({ slots: [{ id: "s", label: "X", options: [opt("gone")] }] }), items)).toBe(false);
    expect(comboAvailable(combo({ active: false }), items)).toBe(false);
  });

  it("excludes special/seasonal items by default but respects an explicit admin exception", () => {
    const classified = new Map<string, ComboMenuItem>(items);
    classified.set("special", { id: "special", name: "Prato sazonal", price: 42, comboEligible: false });
    classified.set("released", { id: "released", name: "Especial liberado", price: 39, comboEligible: true });
    expect(comboAvailable(combo({ slots: [{ id: "s", label: "Prato", options: [opt("special")] }] }), classified)).toBe(false);
    expect(comboAvailable(combo({ slots: [{ id: "s", label: "Prato", options: [opt("released")] }] }), classified)).toBe(true);
    expect(comboToOrderItems(combo(), [opt("special")], classified, "g3")).toEqual([]);
    expect(onTheFlyComboToOrderItems("Na hora", ["burger", "special"], classified, { mode: "amount", value: 2 }, "g4")).toEqual([]);
  });
});
