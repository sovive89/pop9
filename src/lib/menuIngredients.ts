export interface MenuIngredientDraft {
  name: string;
  removable: boolean;
  extra_price: number | null;
  sort_order: number;
}

/** Usa as linhas editadas pelo usuário como fonte principal; a descrição é fallback para itens importados antigos. */
export const ingredientsFromDescription = (
  description: string,
  fallback: MenuIngredientDraft[],
): MenuIngredientDraft[] => {
  const explicit = fallback
    .filter((ingredient) => ingredient.name.trim())
    .map((ingredient, sort_order) => ({ ...ingredient, name: ingredient.name.trim(), sort_order }));
  if (explicit.length) return explicit;

  const names = description.split(",").map((value) => value.trim()).filter(Boolean);
  if (names.length < 2) return [];
  return names.map((name, sort_order) => ({
    name,
    removable: false,
    extra_price: null,
    sort_order,
  }));
};
