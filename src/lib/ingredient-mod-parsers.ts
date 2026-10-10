import type { IngredientMod } from '@/utils/orders';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validate the entire list; a null optional price is normalized as absent. */
export function parseIngredientMods(value: unknown): IngredientMod[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: IngredientMod[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' ||
        (entry.action !== 'remove' && entry.action !== 'extra')) return undefined;
    const price = entry.extraPrice;
    if (price !== undefined && price !== null &&
        (typeof price !== 'number' || !Number.isFinite(price))) return undefined;
    parsed.push({
      name: entry.name,
      action: entry.action,
      ...(typeof price === 'number' ? { extraPrice: price } : {}),
    });
  }
  return parsed;
}
