import { describe, expect, it } from "vitest";
import { simplesEffectiveRate, simplesTax } from "@/lib/fiscal";

describe("Simples Nacional – Anexo I", () => {
  it("1ª faixa usa a alíquota nominal", () => expect(simplesEffectiveRate(100_000)).toBe(0.04));
  it("faixas seguintes descontam a parcela a deduzir", () => {
    expect(simplesEffectiveRate(360_000)).toBeCloseTo((360_000 * 0.073 - 5_940) / 360_000, 6);
    expect(simplesEffectiveRate(1_000_000)).toBeCloseTo(0.0845, 4); // (1M×10,7% − 22.500) ÷ 1M
  });
  it("acima do teto devolve null", () => expect(simplesEffectiveRate(5_000_000)).toBeNull());
  it("imposto do mês", () => expect(simplesTax(50_000, 100_000)).toBe(2000));
});
