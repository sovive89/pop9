/** Theoretical recipe only: saving this payload never moves real inventory. */
export type RecipeMaterialDraft = {
  rawMaterialId: string;
  newName: string;
  newUnit: string;
  quantity: number;
};
export type MenuRecipeDraft = RecipeMaterialDraft & {
  transformation?: "desconto_direto" | "producao" | "porcionamento";
  preparation: null | { requestId?: string; outputQuantity: number; inputs: RecipeMaterialDraft[] };
};
