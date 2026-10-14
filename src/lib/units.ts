import { STOCK_UNITS } from "@/lib/stockUnits";

/**
 * Unidades da ficha técnica. O estoque guarda cada insumo numa unidade só (a do cadastro);
 * na ficha a pessoa escolhe a unidade em que digita a porção e o sistema converte
 * dentro da mesma grandeza (massa, volume ou contagem) antes de gravar.
 * Ex.: insumo em kg, ficha com 150 g → grava 0,15.
 */
type Scale = { base: "g" | "ml" | "un"; factor: number };
const SCALE: Record<string, Scale> = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
  un: { base: "un", factor: 1 },
  dz: { base: "un", factor: 12 },
};
const ALIASES: Record<string, string> = {
  gr: "g", grs: "g", grama: "g", gramas: "g", quilo: "kg", quilos: "kg", kgs: "kg",
  lt: "l", lts: "l", litro: "l", litros: "l", mls: "ml",
  und: "un", unid: "un", "un.": "un", unidade: "un", unidades: "un", fatia: "un", fatias: "un",
  duzia: "dz", dúzia: "dz",
};

/** Forma comparável: minúscula e sem apelidos ("Gramas" → "g", "L" → "l"). */
export function normalizeUnit(raw: string | null | undefined): string {
  const unit = (raw ?? "").trim().toLowerCase();
  return ALIASES[unit] ?? unit;
}

/** Forma gravada no cadastro, a mesma da lista de unidades do Estoque (litro = "L"). */
export function storedUnit(raw: string | null | undefined): string {
  const unit = normalizeUnit(raw);
  return unit === "l" ? "L" : unit;
}

export const sameUnit = (a: string, b: string) => normalizeUnit(a) === normalizeUnit(b);

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Converte entre unidades da mesma grandeza. null quando não há conversão (ex.: un → g). */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  const a = normalizeUnit(from);
  const b = normalizeUnit(to);
  if (a === b) return quantity;
  const sa = SCALE[a];
  const sb = SCALE[b];
  if (!sa || !sb || sa.base !== sb.base) return null;
  return round((quantity * sa.factor) / sb.factor);
}

export const convertible = (from: string, to: string) => convertQuantity(1, from, to) !== null;

/** Unidades em que dá para digitar a porção sem mudar o cadastro (a do estoque primeiro). */
export function compatibleUnits(stockUnit: string): string[] {
  const own = storedUnit(stockUnit);
  return [own, ...STOCK_UNITS.filter((u) => !sameUnit(u, own) && convertible(u, own))];
}

/** Unidade natural de uma porção: quem compra em kg costuma medir a porção em g. */
export function portionUnit(stockUnit: string): string {
  const unit = normalizeUnit(stockUnit);
  return unit === "kg" ? "g" : unit === "l" ? "ml" : storedUnit(unit);
}

/** Unidade sugerida para o estoque a partir da porção digitada (150 g → kg, 300 ml → L). */
export function stockUnitFor(portion: string): string {
  const unit = normalizeUnit(portion);
  return unit === "g" ? "kg" : unit === "ml" ? "L" : storedUnit(unit);
}

/** Mostra uma quantidade gravada no estoque de forma legível (0,15 kg → 150 g). */
export function friendlyQuantity(quantity: number, stockUnit: string): { quantity: number; unit: string } {
  const unit = normalizeUnit(stockUnit);
  if ((unit === "kg" || unit === "l") && quantity > 0 && quantity < 1) {
    return { quantity: round(quantity * 1000), unit: portionUnit(unit) };
  }
  return { quantity, unit: storedUnit(unit) };
}

const PORTION = /(\d+(?:[.,]\d+)?)\s*(kg|kgs|gramas|grama|grs|gr|g|ml|mls|litros|litro|lts|lt|l|unidades|unidade|unid|und|un|fatias|fatia)(?![a-zà-ú])/i;

/**
 * Separa a porção escrita no nome de um ingrediente: "30g de bacon" → bacon, 30 g;
 * "hambúrguer 200g blend" → hambúrguer blend, 200 g. Sem porção, devolve só o nome.
 */
export function parsePortion(text: string): { name: string; quantity: number | null; unit: string | null } {
  const raw = text.trim();
  const match = PORTION.exec(raw);
  if (!match) return { name: raw, quantity: null, unit: null };
  const name = (raw.slice(0, match.index) + " " + raw.slice(match.index + match[0].length))
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(de|do|da|com)\s+/i, "")
    .replace(/\s+(de|do|da|com)$/i, "")
    .trim();
  const quantity = Number(match[1].replace(",", "."));
  if (!name || !Number.isFinite(quantity) || quantity <= 0) return { name: raw, quantity: null, unit: null };
  return { name, quantity, unit: storedUnit(match[2]) };
}
