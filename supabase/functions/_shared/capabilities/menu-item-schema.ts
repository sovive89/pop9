/** Contract foundation only. No lookup, persistence or authorization happens here. */
export const MENU_DRAFT_SCHEMA_VERSION = 1 as const;
export const MENU_DRAFT_LIMITS = Object.freeze({
  name: 120, description: 400, ingredientName: 80, materialName: 80,
  displayIngredients: 30, recipeLines: 30, priceCents: 10_000_000,
});

export type MaterialChoice =
  | { kind: 'existing'; candidateRef: string }
  | { kind: 'new'; name: string };
export type MenuItemDraftV1 = {
  name: string;
  description: string | null;
  priceCents: number | null;
  categoryRef: string | null;
  displayIngredients: { name: string; removable: boolean; extraPriceCents: number | null }[];
  recipe: { material: MaterialChoice; quantity: string | null; unit: string | null }[];
};
export type FieldError = { path: string; code: string; message: string };
export class DraftContractError extends Error {
  constructor(public readonly path: string, message: string) {
    super(message);
    this.name = 'DraftContractError';
  }
}

function fail(path: string, message: string): never {
  throw new DraftContractError(path, message);
}
export function strictRecord(value: unknown, fields: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Objeto inválido.');
  const row = value as Record<string, unknown>;
  if (Object.getPrototypeOf(row) !== Object.prototype && Object.getPrototypeOf(row) !== null) fail(path, 'Objeto inválido.');
  for (const field of Object.keys(row)) {
    if (!fields.includes(field)) fail(path ? `${path}.${field}` : field, 'Campo não permitido.');
  }
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(row, field)) fail(path ? `${path}.${field}` : field, 'Campo ausente; use null para um valor pendente.');
  }
  return row;
}
function boundedText(value: unknown, limit: number, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > limit) fail(path, 'Texto inválido ou muito longo.');
  const result = value.trim();
  if (!allowEmpty && !result) fail(path, 'Preencha este campo.');
  return result;
}
export function candidateRef(value: unknown, path: string): string {
  const ref = boundedText(value, 100, path);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(ref)) fail(path, 'Referência candidata inválida.');
  return ref;
}
function cents(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MENU_DRAFT_LIMITS.priceCents) {
    fail(path, 'Informe centavos inteiros dentro do limite permitido.');
  }
  return value;
}

/** Exact decimal string, at most nine integer and six fractional digits. Never rounds. */
export function normalizeQuantity(value: unknown, path = 'quantity'): string {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,6})?$/.test(value)) {
    fail(path, 'Use decimal positivo com ponto e até seis casas decimais.');
  }
  const [integer, fraction = ''] = value.split('.');
  const head = integer.replace(/^0+(?=\d)/, '');
  const tail = fraction.replace(/0+$/, '');
  if (head === '0' && !tail) fail(path, 'A quantidade deve ser maior que zero.');
  return tail ? `${head}.${tail}` : head;
}
function limitedArray(value: unknown, limit: number, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > limit) fail(path, 'Lista inválida ou muito longa.');
  return value;
}
export function parseMenuItemDraft(value: unknown): MenuItemDraftV1 {
  const row = strictRecord(value, ['name', 'description', 'priceCents', 'categoryRef', 'displayIngredients', 'recipe'], '');
  return {
    name: boundedText(row.name, MENU_DRAFT_LIMITS.name, 'name'),
    description: row.description === null ? null : boundedText(row.description, MENU_DRAFT_LIMITS.description, 'description', true),
    priceCents: cents(row.priceCents, 'priceCents'),
    categoryRef: row.categoryRef === null ? null : candidateRef(row.categoryRef, 'categoryRef'),
    displayIngredients: limitedArray(row.displayIngredients, MENU_DRAFT_LIMITS.displayIngredients, 'displayIngredients').map((value, i) => {
      const path = `displayIngredients.${i}`;
      const input = strictRecord(value, ['name', 'removable', 'extraPriceCents'], path);
      if (typeof input.removable !== 'boolean') fail(`${path}.removable`, 'Informe se o ingrediente pode ser retirado.');
      return { name: boundedText(input.name, MENU_DRAFT_LIMITS.ingredientName, `${path}.name`), removable: input.removable, extraPriceCents: cents(input.extraPriceCents, `${path}.extraPriceCents`) };
    }),
    recipe: limitedArray(row.recipe, MENU_DRAFT_LIMITS.recipeLines, 'recipe').map((value, i) => {
      const path = `recipe.${i}`;
      const line = strictRecord(value, ['material', 'quantity', 'unit'], path);
      const input = line.material;
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail(`${path}.material`, 'Selecione um insumo.');
      const kind = (input as Record<string, unknown>).kind;
      let material: MaterialChoice;
      if (kind === 'existing') {
        const choice = strictRecord(input, ['kind', 'candidateRef'], `${path}.material`);
        material = { kind, candidateRef: candidateRef(choice.candidateRef, `${path}.material.candidateRef`) };
      } else if (kind === 'new') {
        const choice = strictRecord(input, ['kind', 'name'], `${path}.material`);
        material = { kind, name: boundedText(choice.name, MENU_DRAFT_LIMITS.materialName, `${path}.material.name`) };
      } else fail(`${path}.material.kind`, 'Tipo de referência não permitido.');
      // A unit is an exact registered label. No lowercasing, aliases or conversions here.
      return { material, quantity: line.quantity === null ? null : normalizeQuantity(line.quantity, `${path}.quantity`), unit: line.unit === null ? null : boundedText(line.unit, 30, `${path}.unit`) };
    }),
  };
}

/** Missing critical values block a preview that could be confirmed. Zero is explicit. */
export function draftBlockers(draft: MenuItemDraftV1): FieldError[] {
  const result: FieldError[] = [];
  const add = (path: string, message: string) => result.push({ path, code: 'required', message });
  if (draft.priceCents === null) add('priceCents', 'Defina o preço; o banco atual não admite preço ausente.');
  if (draft.categoryRef === null) add('categoryRef', 'Selecione uma categoria desta unidade.');
  draft.displayIngredients.forEach((row, i) => {
    if (row.extraPriceCents === null) add(`displayIngredients.${i}.extraPriceCents`, 'Confirme o adicional; use zero quando não houver cobrança.');
  });
  draft.recipe.forEach((row, i) => {
    if (row.quantity === null) add(`recipe.${i}.quantity`, 'Informe a quantidade usada por item.');
    if (row.unit === null) add(`recipe.${i}.unit`, 'Informe a unidade de medida.');
  });
  return result;
}
