/** Theoretical recipe only: saving this payload never moves real inventory. */
export type RecipeMaterialDraft = {
  rawMaterialId: string;
  newName: string;
  newUnit: string;
  /** Initial stock measure, independent of the quantity shown in the recipe. */
  stockUnit?: string;
  quantity: number;
};
export type MenuRecipeDraft = RecipeMaterialDraft & {
  transformation?: "desconto_direto" | "producao" | "porcionamento";
  preparation: null | { requestId?: string; outputQuantity: number; outputUnit?: string; inputs: RecipeMaterialDraft[] };
};
