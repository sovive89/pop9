import type { IngredientMod } from "@/utils/orders";

type IngredientModRecord = {
  name: string;
  action: "remove" | "extra";
  extraPrice?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIngredientMod = (value: unknown): value is IngredientModRecord => {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  if (value.action !== "remove" && value.action !== "extra") return false;
  if (
    value.extraPrice !== undefined &&
    (typeof value.extraPrice !== "number" || !Number.isFinite(value.extraPrice))
  ) {
    return false;
  }
  return true;
};

/**
 * Converts the JSON value stored by Supabase only when every modifier has the
 * shape expected by the kitchen UI. Malformed payloads are ignored as a whole.
 */
export const parseIngredientMods = (value: unknown): IngredientMod[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const modifiers = value.filter(isIngredientMod);
  return modifiers.length === value.length ? modifiers : undefined;
};
