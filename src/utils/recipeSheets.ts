import { supabase } from "@/integrations/supabase/client";
import { buildCsv } from "@/utils/fileExport";

// Fichas técnicas em planilha, nos dois sentidos: o mesmo formato serve para exportar o
// cadastro atual e para preencher e reenviar pela "Importar com IA" do Cardápio.
export const SHEET_HEADER = ["Categoria", "Item", "Descrição", "Preço", "Insumo", "Quantidade", "Unidade"];
export const PREP_HEADER = ["Preparo", "Rendimento", "Unidade do rendimento", "Insumo-base", "Quantidade", "Unidade"];

const README = `FICHAS TÉCNICAS — PØP9

Arquivos:
- fichas-tecnicas.csv: uma linha por insumo de cada item vendido. Repita Categoria/Item/Preço em
  cada linha do mesmo item. Quantidade é o quanto sai de UM item vendido, na unidade indicada.
- preparos-da-casa.csv: receitas de insumos produzidos na casa (molhos, massas). Rendimento é
  quanto a receita produz; as quantidades dos insumos-base correspondem a esse rendimento.

Unidades aceitas: g, kg, ml, l, un, cx, pct, dz.

Para cadastrar: preencha, salve como CSV ou XLSX e envie em Admin → Cardápio → Importar com IA.
A IA monta um rascunho para você revisar; nada é gravado sem a sua confirmação. Insumos novos
entram no estoque com saldo zero, aguardando o primeiro lote.
`;

export function templateFiles(): Record<string, string> {
  return {
    "fichas-tecnicas.csv": buildCsv([SHEET_HEADER,
      ["Hambúrgueres", "X-Burger", "Pão brioche, blend 150 g e molho da casa", "29.90", "Pão brioche", "1", "un"],
      ["Hambúrgueres", "X-Burger", "Pão brioche, blend 150 g e molho da casa", "29.90", "Blend bovino", "150", "g"],
      ["Hambúrgueres", "X-Burger", "Pão brioche, blend 150 g e molho da casa", "29.90", "Molho da casa", "30", "g"],
      ["Bebidas", "Suco de laranja", "500 ml", "9.90", "Laranja", "4", "un"]]),
    "preparos-da-casa.csv": buildCsv([PREP_HEADER,
      ["Molho da casa", "1", "kg", "Maionese", "700", "g"],
      ["Molho da casa", "1", "kg", "Ketchup", "250", "g"],
      ["Molho da casa", "1", "kg", "Páprica", "20", "g"]]),
    "LEIA-ME.txt": README,
  };
}

type Row = { name: string; description: string | null; price: number; category: string; recipe_items: { quantity: number; raw_materials: { name: string; unit: string } | null }[] };
type Prep = { output_quantity: number; raw_materials: { name: string; unit: string } | null; production_recipe_inputs: { quantity: number; raw_materials: { name: string; unit: string } | null }[] };

/** Exporta as fichas atuais da unidade no mesmo formato dos modelos. */
export async function exportFiles(businessUnitId: string): Promise<Record<string, string>> {
  const [{ data: items, error: e1 }, { data: cats, error: e2 }, { data: preps, error: e3 }] = await Promise.all([
    supabase.from("menu_items").select("name, description, price, category, recipe_items(quantity, raw_materials(name, unit))").eq("business_unit_id", businessUnitId).order("category").order("sort_order"),
    supabase.from("menu_categories").select("key, label").eq("business_unit_id", businessUnitId),
    supabase.from("production_recipes").select("output_quantity, raw_materials(name, unit), production_recipe_inputs(quantity, raw_materials(name, unit))").eq("business_unit_id", businessUnitId).eq("active", true),
  ]);
  if (e1 || e2 || e3) throw Error("Não foi possível ler as fichas técnicas da unidade.");
  const label = new Map((cats ?? []).map((c) => [c.key, c.label]));
  const sheet: unknown[][] = [SHEET_HEADER];
  for (const item of (items ?? []) as unknown as Row[]) {
    const base = [label.get(item.category) ?? item.category, item.name, item.description ?? "", Number(item.price).toFixed(2)];
    if (!item.recipe_items?.length) sheet.push([...base, "", "", ""]);
    for (const line of item.recipe_items ?? []) sheet.push([...base, line.raw_materials?.name ?? "", line.quantity, line.raw_materials?.unit ?? ""]);
  }
  const prep: unknown[][] = [PREP_HEADER];
  for (const recipe of (preps ?? []) as unknown as Prep[]) {
    for (const input of recipe.production_recipe_inputs ?? []) {
      prep.push([recipe.raw_materials?.name ?? "", recipe.output_quantity, recipe.raw_materials?.unit ?? "", input.raw_materials?.name ?? "", input.quantity, input.raw_materials?.unit ?? ""]);
    }
  }
  return { "fichas-tecnicas.csv": buildCsv(sheet), "preparos-da-casa.csv": buildCsv(prep), "LEIA-ME.txt": README };
}

/**
 * Ficha gerada pela IA → os mesmos CSVs de "Baixar modelos"/"Exportar fichas" (podem ser
 * editados e reenviados em Cardápio → Importar com IA).
 */
export function draftToSheetFiles(draft: { categories: { key: string; label: string }[]; items: { name: string; description: string; price: number; category: string; recipe: { material: string; unit: string; quantity: number; preparation: { outputQuantity: number; inputs: { material: string; unit: string; quantity: number }[] } | null }[] }[]; notes: string[] }): Record<string, string> {
  const label = new Map(draft.categories.map((c) => [c.key, c.label]));
  const sheet: unknown[][] = [SHEET_HEADER];
  const prep: unknown[][] = [PREP_HEADER];
  for (const item of draft.items) {
    const base = [label.get(item.category) ?? item.category, item.name, item.description, Number(item.price || 0).toFixed(2)];
    if (!item.recipe.length) sheet.push([...base, "", "", ""]);
    for (const line of item.recipe) {
      sheet.push([...base, line.material, line.quantity, line.unit]);
      for (const input of line.preparation?.inputs ?? []) prep.push([line.material, line.preparation!.outputQuantity, line.unit, input.material, input.quantity, input.unit]);
    }
  }
  const notes = draft.notes.length ? `\nObservações da IA:\n- ${draft.notes.join("\n- ")}\n` : "";
  return { "fichas-tecnicas.csv": buildCsv(sheet), "preparos-da-casa.csv": buildCsv(prep), "LEIA-ME.txt": README + notes };
}

export async function zipFiles(files: Record<string, string>): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import("fflate");
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
}


/** Exporta cada ficha cadastrada como JSON independente, com referências entre fichas. */
export async function exportJsonFiles(businessUnitId: string): Promise<Record<string,string>> {
  const [{data:items,error:itemError},{data:recipes,error:recipeError}] = await Promise.all([
    supabase.from("menu_items").select("id,name,description,price,category,recipe_items(raw_material_id,quantity,raw_materials(name,unit))")
      .eq("business_unit_id",businessUnitId).order("name"),
    supabase.from("production_recipes").select("id,name,tipo,output_quantity,output_raw_material_id,raw_materials(name,unit),production_recipe_inputs(raw_material_id,quantity,raw_materials(name,unit))")
      .eq("business_unit_id",businessUnitId).eq("active",true).order("name")
  ]);
  if(itemError || recipeError)throw new Error("Falha ao carregar fichas técnicas.");
  const byOutput=new Map((recipes??[]).map(r=>[r.output_raw_material_id,r]));
  const files:Record<string,string>={};
  const fileName=(type:string,name:string,id:string)=>`${type}-${name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").toLowerCase()}-${id.slice(0,8)}.json`;
  for(const r of recipes??[]){
    files[fileName("producao",r.name,r.id)]=JSON.stringify({
      schema:"pop9.ficha.v1",tipo:r.tipo??"producao",id:r.id,business_unit_id:businessUnitId,nome:r.name,
      saida:{insumo_id:r.output_raw_material_id,nome:r.raw_materials?.name??null,quantidade:Number(r.output_quantity),unidade:r.raw_materials?.unit??null},
      componentes:(r.production_recipe_inputs??[]).map(i=>({tipo:"insumo",insumo_id:i.raw_material_id,nome:i.raw_materials?.name??null,quantidade:Number(i.quantity),unidade:i.raw_materials?.unit??null}))
    },null,2);
  }
  for(const item of items??[]){
    files[fileName("cardapio",item.name,item.id)]=JSON.stringify({
      schema:"pop9.ficha.v1",tipo:"cardapio",id:item.id,business_unit_id:businessUnitId,nome:item.name,
      descricao:item.description,preco:Number(item.price),categoria:item.category,
      componentes:(item.recipe_items??[]).map(i=>{
        const r=byOutput.get(i.raw_material_id);
        return {tipo:r?"ficha_referenciada":"insumo",insumo_id:i.raw_material_id,nome:i.raw_materials?.name??null,
          quantidade:Number(i.quantity),unidade:i.raw_materials?.unit??null,...(r?{ficha_id:r.id}: {})};
      })
    },null,2);
  }
  return files;
}
