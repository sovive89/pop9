export const STOCK_UNITS = [
  "g",
  "kg",
  "ml",
  "L",
  "un",
  "caixa",
  "pacote",
  "saco",
  "cx",
  "dz",
  "pct",
] as const;

export type StockUnit = (typeof STOCK_UNITS)[number];
