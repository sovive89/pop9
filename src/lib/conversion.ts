/**
 * Conversão de cardápio e fichas técnicas entre planilhas/CSV e o rascunho canônico do Pop9
 * (MenuImportDraft). Funções puras: nada é gravado aqui. O rascunho segue para a conferência
 * e para o apply_menu_import existente, que decidem o que entra.
 *
 * Layout "uma linha por ingrediente" (cabeçalhos aceitos em PT/EN, sem diferenciar acento):
 *   item | categoria | preco | descricao | insumo | quantidade | unidade
 * Linhas só com item/categoria/preço criam o item sem ficha; linhas seguintes com o mesmo item
 * (ou com item vazio) adicionam ingredientes à ficha.
 */
import { sanitizeDraft, normalizeUnit, slug, type MenuImportDraft } from "../../supabase/functions/_shared/menu-import-schema";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Lê CSV com aspas, vírgula ou ponto e vírgula (detecta pelo cabeçalho). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const HEADERS: Record<string, string[]> = {
  item: ["item", "produto", "prato", "nome", "name", "item do cardapio"],
  category: ["categoria", "category", "grupo"],
  price: ["preco", "preço", "valor", "price", "preco de venda"],
  description: ["descricao", "description", "detalhes"],
  material: ["insumo", "ingrediente", "material", "ingredient"],
  quantity: ["quantidade", "qtd", "qtde", "quantity", "qty"],
  unit: ["unidade", "un", "medida", "unit"],
};

function columnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, idx) => {
    const key = fold(h);
    for (const [field, names] of Object.entries(HEADERS)) {
      if (map[field] === undefined && names.some((n) => fold(n) === key)) map[field] = idx;
    }
  });
  return map;
}

/** Aceita "R$ 1.234,56", "12,5", "12.5". */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export type ConversionResult = { draft: MenuImportDraft; warnings: string[]; rowsRead: number; rowsIgnored: number };

/** Converte linhas de planilha (primeira linha = cabeçalho) no rascunho canônico. */
export function rowsToDraft(rows: string[][]): ConversionResult {
  const warnings: string[] = [];
  if (rows.length < 2) return { draft: { categories: [], items: [], notes: [] }, warnings: ["A planilha não tem linhas de dados."], rowsRead: 0, rowsIgnored: 0 };
  const cols = columnMap(rows[0]);
  if (cols.item === undefined) {
    return { draft: { categories: [], items: [], notes: [] }, warnings: ["Coluna do item não encontrada (use: item, produto, prato ou nome)."], rowsRead: 0, rowsIgnored: rows.length - 1 };
  }
  const cell = (r: string[], f: string) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "").trim());
  const items = new Map<string, { name: string; description: string; price: number; category: string; recipe: { material: string; unit: string; quantity: number; preparation: null }[] }>();
  const categories = new Map<string, string>();
  let current = "", ignored = 0;

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = cell(r, "item") || current;
    if (!name) { ignored++; warnings.push(`Linha ${line}: sem item e sem item anterior; ignorada.`); return; }
    current = name;
    const key = fold(name);
    let item = items.get(key);
    if (!item) {
      item = { name, description: "", price: 0, category: "", recipe: [] };
      items.set(key, item);
    }
    const category = cell(r, "category");
    if (category) { item.category = slug(category); categories.set(slug(category), category); }
    const price = parseMoney(cell(r, "price"));
    if (price > 0) item.price = price;
    const description = cell(r, "description");
    if (description) item.description = description;

    const material = cell(r, "material");
    if (!material) return;
    const rawQty = cell(r, "quantity").replace(",", ".");
    const quantity = Number(rawQty);
    const unit = normalizeUnit(cell(r, "unit"));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      ignored++;
      warnings.push(`Linha ${line}: "${material}" sem quantidade válida; ingrediente não importado (nenhuma quantidade foi inventada).`);
      return;
    }
    if (!unit) {
      ignored++;
      warnings.push(`Linha ${line}: "${material}" sem unidade; ingrediente não importado.`);
      return;
    }
    item.recipe.push({ material, unit, quantity, preparation: null });
  });

  const { draft, warnings: schemaWarnings } = sanitizeDraft({
    categories: [...categories].map(([key, label]) => ({ key, label, destination: "kitchen" })),
    items: [...items.values()].map((it) => ({
      ...it,
      ingredients: it.recipe.map((l) => ({ name: l.material, removable: false, extraPrice: 0 })),
    })),
    notes: ["Convertido de planilha. Confira antes de aplicar."],
  });
  return { draft, warnings: [...warnings, ...schemaWarnings], rowsRead: rows.length - 1, rowsIgnored: ignored };
}

export function csvToDraft(text: string): ConversionResult {
  return rowsToDraft(parseCsv(text));
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exporta o rascunho/cardápio para CSV (ponto e vírgula, decimal com vírgula) aberto direto no Excel. */
export function draftToCsv(draft: MenuImportDraft): string {
  const header = ["item", "categoria", "preco", "descricao", "insumo", "quantidade", "unidade"];
  const label = new Map(draft.categories.map((c) => [c.key, c.label]));
  const lines = [header.join(";")];
  for (const it of draft.items) {
    const base = [it.name, label.get(it.category) ?? it.category, String(it.price).replace(".", ","), it.description];
    if (!it.recipe.length) lines.push([...base, "", "", ""].map(esc).join(";"));
    it.recipe.forEach((l, i) => {
      const lead = i === 0 ? base : [it.name, "", "", ""];
      lines.push([...lead, l.material, String(l.quantity).replace(".", ","), l.unit].map(esc).join(";"));
    });
  }
  return lines.join("\r\n") + "\r\n";
}
