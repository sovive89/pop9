/**
 * Fiscal (fase 1: cálculo). Alíquota efetiva do Simples Nacional, Anexo I (comércio),
 * conforme a tabela da LC 123/2006 vigente. Serve de dedução percentual no preço (finance.ts).
 * NÃO emite nota: emissão (NFC-e/NF-e) depende de certificado digital, CSC e provedor/SEFAZ.
 * Restaurantes com ST/monofásico (bebidas) têm segregação de PIS/COFINS/ICMS: confirmar com o contador.
 */
export type SimplesBracket = { upTo: number; rate: number; deduction: number };

export const SIMPLES_ANEXO_I: SimplesBracket[] = [
  { upTo: 180_000, rate: 0.04, deduction: 0 },
  { upTo: 360_000, rate: 0.073, deduction: 5_940 },
  { upTo: 720_000, rate: 0.095, deduction: 13_860 },
  { upTo: 1_800_000, rate: 0.107, deduction: 22_500 },
  { upTo: 3_600_000, rate: 0.143, deduction: 87_300 },
  { upTo: 4_800_000, rate: 0.19, deduction: 378_000 },
];

/** Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12. RBT12 = receita bruta dos últimos 12 meses. */
export function simplesEffectiveRate(rbt12: number, table: SimplesBracket[] = SIMPLES_ANEXO_I): number | null {
  if (!Number.isFinite(rbt12) || rbt12 < 0) return null;
  const limit = table[table.length - 1].upTo;
  if (rbt12 > limit) return null; // acima do teto do Simples
  const b = table.find((x) => rbt12 <= x.upTo)!;
  if (rbt12 === 0) return b.rate;
  return Number((((rbt12 * b.rate) - b.deduction) / rbt12).toFixed(6));
}

/** Imposto devido sobre o faturamento do mês. */
export function simplesTax(monthRevenue: number, rbt12: number): number | null {
  const r = simplesEffectiveRate(rbt12);
  if (r == null || !Number.isFinite(monthRevenue) || monthRevenue < 0) return null;
  return Number((monthRevenue * r).toFixed(2));
}
