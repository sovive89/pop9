import type { IngredientMod } from '@/utils/orders';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read legacy JSON; clamp negative extras like checkout_snapshot, without
 * dropping other valid prices. Unknown labels are explicit, never invented. */
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
      name: entry.name.trim() || (entry.action === 'extra' ? 'Adicional sem identificação' : 'Ingrediente sem identificação'),
      action: entry.action,
      ...(typeof price === 'number' ? { extraPrice: Math.max(0, price) } : {}),
    });
  }
  return parsed;
}
