import { describe, expect, it } from "vitest";
import { buildRuleError, priceBuiltCombo, type BuildRule } from "@/lib/buildRule";

const items = new Map([
  ["a", { id: "a", name: "A", price: 20 }],
  ["b", { id: "b", name: "B", price: 10 }],
  ["x", { id: "x", name: "X", price: 5, comboEligible: false }],
]);
const rule: BuildRule = { enabled: true, minItems: 2, maxItems: 3, discount: { mode: "percent", value: 10 } };

describe("regra do monte o seu combo", () => {
  it("aplica o desconto quando cumpre a regra", () => expect(priceBuiltCombo(rule, ["a", "b"], items)).toEqual({ list: 30, price: 27 }));
  it("recusa menos que o mínimo, mais que o máximo, item não elegível ou regra desligada", () => {
    expect(priceBuiltCombo(rule, ["a"], items)).toBeNull();
    expect(priceBuiltCombo(rule, ["a", "b", "a", "b"], items)).toBeNull();
    expect(priceBuiltCombo(rule, ["a", "x"], items)).toBeNull();
    expect(priceBuiltCombo({ ...rule, enabled: false }, ["a", "b"], items)).toBeNull();
  });
  it("valida limites", () => {
    expect(buildRuleError(rule)).toBe("");
    expect(buildRuleError({ ...rule, maxItems: 1 })).not.toBe("");
    expect(buildRuleError({ ...rule, discount: { mode: "percent", value: 120 } })).not.toBe("");
  });
});
