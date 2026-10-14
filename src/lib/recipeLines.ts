import { convertible, convertQuantity, friendlyQuantity, normalizeUnit, parsePortion, portionUnit, storedUnit } from "@/lib/units";

/**
 * Linhas da ficha técnica de um item do cardápio. Cada linha é um insumo com a porção
 * por item vendido e, opcionalmente, como ele aparece para o cliente. A lista de
 * ingredientes do cardápio (menu_item_ingredients) é uma projeção destas linhas.
 */
export type Transformation = "desconto_direto" | "producao" | "porcionamento";

export interface MaterialInput {
  key: string;
  rawMaterialId: string;
  /** Nome do insumo novo (criado ao salvar). */
  newName: string;
  /** Porção como digitada, na unidade qtyUnit. */
  quantity: string;
  qtyUnit: string;
}

export interface RecipeRow extends MaterialInput {
  transformation: Transformation;
  isProduced: boolean;
  outputQuantity: string;
  recipeCreated: boolean;
  subInputs: MaterialInput[];
  showToCustomer: boolean;
  displayName: string;
  removable: boolean;
  extraPrice: string;
  onlyExtra: boolean;
}

export type MaterialRef = { id: string; name: string; unit: string };
export type DisplayIngredient = { name: string; removable: boolean; extra_price: number | null; extra_only?: boolean | null };
export type SavedRecipeLine = {
  id: string; raw_material_id: string; quantity: number | string;
  transformacao?: string | null; display_name?: string | null; removable?: boolean | null;
  extra_price?: number | string | null; only_as_extra?: boolean | null; sort_order?: number | null;
};

export const nameKey = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const parse = (value: string) => Number(String(value).replace(",", "."));

export const newInput = (): MaterialInput => ({ key: crypto.randomUUID(), rawMaterialId: "", newName: "", quantity: "", qtyUnit: "g" });

export const newRow = (): RecipeRow => ({
  ...newInput(), transformation: "desconto_direto", isProduced: false, outputQuantity: "1", recipeCreated: false, subInputs: [],
  showToCustomer: false, displayName: "", removable: false, extraPrice: "", onlyExtra: false,
});

export const findMaterial = (input: MaterialInput, materials: MaterialRef[]) =>
  input.rawMaterialId ? materials.find((m) => m.id === input.rawMaterialId) : undefined;

export const materialName = (input: MaterialInput, materials: MaterialRef[]) =>
  input.rawMaterialId ? findMaterial(input, materials)?.name ?? "" : input.newName.trim();

export const materialByName = (name: string, materials: MaterialRef[]) =>
  materials.find((m) => nameKey(m.name) === nameKey(name));

/** A unidade escolhida obriga a trocar a unidade do cadastro (ex.: insumo em "un", porção em g). */
export function needsUnitChange(input: MaterialInput, materials: MaterialRef[]): boolean {
  const material = findMaterial(input, materials);
  return Boolean(material) && !convertible(input.qtyUnit, material!.unit);
}

/**
 * Unidade em que o estoque vai guardar o insumo depois de salvar: a do cadastro quando a
 * porção é da mesma grandeza (g ↔ kg); senão, a unidade escolhida passa a ser a do insumo
 * (só para insumo novo ou ainda sem movimento).
 */
export function targetStockUnit(input: MaterialInput, materials: MaterialRef[]): string {
  const material = findMaterial(input, materials);
  if (material && convertible(input.qtyUnit, material.unit)) return storedUnit(material.unit);
  return storedUnit(input.qtyUnit);
}

const blank = (value: string) => value.trim() === "";

/** Linha ainda sem porção definida: aparece na tela, mas não é gravada nem baixa estoque. */
export function isPending(row: RecipeRow): boolean {
  if (blank(row.quantity)) return true;
  return row.isProduced && (blank(row.outputQuantity) || !row.subInputs.length ||
    row.subInputs.some((sub) => blank(sub.quantity) || (!sub.rawMaterialId && blank(sub.newName))));
}

/** Partes da descrição separadas por vírgula, ponto e vírgula ou quebra de linha. */
export function splitDescription(description: string): string[] {
  const seen = new Set<string>();
  return description.split(/[,;\n]/).map((part) => part.trim().replace(/\.$/, "").trim())
    .filter((part) => part && !seen.has(nameKey(part)) && seen.add(nameKey(part)));
}

/** Porção convertida para a unidade do estoque (o que o banco grava); null se inválida. */
export function stockQuantity(input: MaterialInput, materials: MaterialRef[]): number | null {
  const typed = parse(input.quantity);
  if (!Number.isFinite(typed) || typed <= 0) return null;
  const converted = convertQuantity(typed, input.qtyUnit, targetStockUnit(input, materials));
  return converted !== null && converted > 0 ? converted : null;
}

/** Linha gravada → linha editável, mostrando a porção numa unidade legível. */
export function rowFromSaved(line: SavedRecipeLine, materials: MaterialRef[]): RecipeRow {
  const unit = materials.find((m) => m.id === line.raw_material_id)?.unit ?? "un";
  const shown = friendlyQuantity(Number(line.quantity), unit);
  const displayName = line.display_name?.trim() ?? "";
  const transformation = (["producao", "porcionamento"].includes(line.transformacao ?? "") ? line.transformacao : "desconto_direto") as Transformation;
  return {
    ...newRow(), key: line.id, rawMaterialId: line.raw_material_id,
    quantity: String(shown.quantity), qtyUnit: shown.unit, transformation,
    showToCustomer: Boolean(displayName), displayName,
    removable: Boolean(line.removable), extraPrice: line.extra_price == null ? "" : String(Number(line.extra_price)),
    onlyExtra: Boolean(line.only_as_extra),
  };
}

/** O que o cliente vê e pode tirar/adicionar (gravado em menu_item_ingredients). */
export function projectIngredients(rows: RecipeRow[]): (DisplayIngredient & { sort_order: number })[] {
  return rows
    .filter((row) => row.showToCustomer && row.displayName.trim())
    .map((row, index) => ({
      name: row.displayName.trim(),
      removable: !row.onlyExtra && row.removable,
      extra_price: row.extraPrice.trim() === "" ? null : Math.max(0, parse(row.extraPrice)),
      extra_only: row.onlyExtra && row.extraPrice.trim() !== "",
      sort_order: index,
    }));
}

/** Campos de cliente gravados na linha da ficha (recipe_items). Linha oculta não leva nenhum. */
export function customerFields(row: RecipeRow) {
  const shown = row.showToCustomer && row.displayName.trim() !== "";
  const extra = shown && row.extraPrice.trim() !== "" ? Math.max(0, parse(row.extraPrice)) : null;
  return {
    display_name: shown ? row.displayName.trim() : null,
    removable: shown && !row.onlyExtra && row.removable,
    extra_price: extra,
    only_as_extra: shown && row.onlyExtra && extra !== null,
  };
}

/**
 * Primeira inconsistência da ficha, em linguagem de cozinha; null quando está tudo certo.
 * `unlocked` = insumos sem movimento, lote ou outra ficha: só eles podem trocar de unidade.
 */
export function validateRows(rows: RecipeRow[], materials: MaterialRef[], unlocked: Set<string>): string | null {
  const shownNames = new Set<string>();
  const check = (input: MaterialInput, label: string): string | null => {
    const name = materialName(input, materials);
    if (!name) return `${label}: escolha um insumo ou dê nome ao novo.`;
    if (needsUnitChange(input, materials) && !unlocked.has(input.rawMaterialId)) {
      const unit = findMaterial(input, materials)!.unit;
      return `${label} (${name}): o estoque já usa "${unit}" e não dá para trocar (tem movimento ou outra ficha). Use uma unidade compatível.`;
    }
    if (stockQuantity(input, materials) === null) return `${label} (${name}): informe a quantidade, maior que zero.`;
    return null;
  };
  for (const [index, row] of rows.entries()) {
    const n = index + 1;
    const pending = isPending(row);
    const problem = pending ? null : check(row, `Linha ${n}`);
    if (problem) return problem;
    if (row.isProduced && !pending) {
      if (!(parse(row.outputQuantity) > 0) || !row.subInputs.length) return `Receita da linha ${n}: informe o rendimento e os insumos-base.`;
      for (const sub of row.subInputs) {
        const subProblem = check(sub, `Receita da linha ${n}`);
        if (subProblem) return subProblem;
      }
    }
    if (!row.showToCustomer) continue;
    const name = row.displayName.trim();
    if (!name) return `Linha ${n}: escreva o nome que o cliente vê.`;
    if (name.length > 80) return `Linha ${n}: nome para o cliente muito longo (máx. 80).`;
    const key = nameKey(name);
    if (shownNames.has(key)) return `"${name}" aparece duas vezes para o cliente. Use nomes diferentes.`;
    shownNames.add(key);
    if (row.extraPrice.trim() !== "" && !(parse(row.extraPrice) >= 0)) return `Linha ${n}: preço do adicional inválido.`;
    if (row.onlyExtra && row.extraPrice.trim() === "") return `Linha ${n}: "só como adicional" precisa do preço do adicional (pode ser 0).`;
  }
  return null;
}

/**
 * Liga ingredientes exibidos ao cliente às linhas da ficha. A porção escrita no nome
 * ("30g de bacon") vira quantidade da linha, e o insumo é o "bacon" do Estoque.
 * Ingrediente sem linha correspondente vira uma linha nova para a pessoa completar.
 */
export function mergeDisplayIngredients(rows: RecipeRow[], ingredients: DisplayIngredient[], materials: MaterialRef[]): RecipeRow[] {
  // "bacon 30 g", "30g de bacon" e "Bacon" são o mesmo ingrediente.
  const baseKey = (text: string) => nameKey(parsePortion(text).name);
  const out = rows.map((row) => ({ ...row }));
  const shown = new Set(out.filter((row) => row.showToCustomer).map((row) => baseKey(row.displayName)));
  for (const ingredient of ingredients) {
    const display = ingredient.name.trim();
    if (!display || shown.has(baseKey(display))) continue;
    const portion = parsePortion(display);
    const onlyExtra = Boolean(ingredient.extra_only) && ingredient.extra_price != null;
    const flags = {
      showToCustomer: true, displayName: display, onlyExtra,
      removable: !onlyExtra && ingredient.removable,
      extraPrice: ingredient.extra_price == null ? "" : String(Number(ingredient.extra_price)),
    };
    const index = out.findIndex((row) => !row.showToCustomer && baseKey(materialName(row, materials)) === baseKey(display));
    if (index >= 0) {
      out[index] = { ...out[index], ...flags };
    } else {
      const material = materialByName(portion.name, materials) ?? materialByName(display, materials);
      out.push({
        ...newRow(), ...flags,
        rawMaterialId: material?.id ?? "", newName: material ? "" : portion.name,
        quantity: portion.quantity === null ? "" : String(portion.quantity),
        qtyUnit: portion.unit ?? (material ? portionUnit(material.unit) : "un"),
      });
    }
    shown.add(baseKey(display));
  }
  return out;
}

const formatQuantity = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/**
 * Descrição para o cliente montada da ficha: "Pão brioche, hambúrguer blend 200 g, bacon 30 g".
 * Só entram as linhas que aparecem no cardápio e fazem parte do item (adicionais ficam de fora).
 */
export function describeRows(rows: RecipeRow[]): string {
  return rows
    .filter((row) => row.showToCustomer && row.displayName.trim() && !row.onlyExtra)
    .map((row) => {
      const name = parsePortion(row.displayName).name;
      const qty = parse(row.quantity);
      const unit = storedUnit(row.qtyUnit);
      if (!Number.isFinite(qty) || qty <= 0 || (unit === "un" && qty === 1)) return name;
      return `${name} ${formatQuantity(qty)} ${unit}`;
    })
    .join(", ");
}

export const unitHint = (input: MaterialInput, materials: MaterialRef[]): string => {
  const material = findMaterial(input, materials);
  const target = targetStockUnit(input, materials);
  const qty = stockQuantity(input, materials);
  if (material && needsUnitChange(input, materials)) {
    return `Ao salvar, "${material.name}" passa de ${material.unit} para ${target} no Estoque.`;
  }
  if (!material) return input.newName.trim() ? `Novo insumo, controlado em ${target} no Estoque.` : "";
  if (qty !== null && normalizeUnit(input.qtyUnit) !== normalizeUnit(target)) return `Baixa ${String(qty).replace(".", ",")} ${target} do estoque por item.`;
  return "";
};
