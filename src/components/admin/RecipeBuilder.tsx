import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Plus, Trash2, ChefHat, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useStockData, type RawMaterial, type ItemType } from "@/hooks/useStockData";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { toast } from "sonner";
import MenuPrefixField from '@/components/admin/MenuPrefixField';
import { STOCK_UNITS } from '@/lib/stockUnits';
import { toStockQuantity } from '@/lib/stockQuantityConversion';

interface MaterialInput {
  key: string;
  rawMaterialId: string;
  newName: string;
  newUnit: string;
  quantity: string;
}
type Transformation = "desconto_direto" | "producao" | "porcionamento";
const TRANSFORMATIONS: { value: Transformation; label: string }[] = [
  { value: "desconto_direto", label: "Desconto direto" },
  { value: "producao", label: "Produção" },
  { value: "porcionamento", label: "Porcionamento" },
];
interface RecipeRow extends MaterialInput {
  isProduced: boolean;
  transformation: Transformation;
  outputQuantity: string;
  recipeCreated: boolean;
  subInputs: MaterialInput[];
}
export interface RecipeBuilderHandle {
  validate: () => boolean;
  commit: (menuItemId: string) => Promise<boolean>;
}
interface Props { menuItemId?: string; menuItemName?: string; disabled?: boolean }

const emptyInput = (): MaterialInput => ({
  key: crypto.randomUUID(), rawMaterialId: "", newName: "", newUnit: "un", quantity: "",
});
const emptyRow = (): RecipeRow => ({ ...emptyInput(), isProduced: false, transformation: "desconto_direto", outputQuantity: "1", recipeCreated: false, subInputs: [] });
const positive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
const labelClass = "block min-w-0 space-y-1 text-xs text-muted-foreground";

function MaterialFields({ input, materials, disabled, base = false, onChange, onRemove }: {
  input: MaterialInput; materials: RawMaterial[]; disabled: boolean; base?: boolean;
  onChange: (patch: Partial<MaterialInput>) => void; onRemove: () => void;
}) {
  const material = materials.find(item => item.id === input.rawMaterialId);
  const unit = input.newUnit || material?.unit || "un";
  const name = base ? "Insumo-base" : "Insumo";
  return <div className="min-w-0 space-y-2 rounded-lg border border-border bg-background/50 p-3">
    <div className="flex min-w-0 items-end gap-2">
      <label className={`${labelClass} flex-1`} htmlFor={`${input.key}-material`}>
        <span>{name}</span>
        <select id={`${input.key}-material`} aria-label={name} disabled={disabled}
          data-tooltip="Selecione um insumo desta unidade ou crie um novo aqui. O cadastro novo terá saldo zero até uma compra ou produção."
          value={input.rawMaterialId} onChange={event => { const selected = materials.find(item => item.id === event.target.value); onChange({ rawMaterialId: event.target.value, newName: "", newUnit: selected?.unit ?? "un" }); }}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-muted px-2 text-xs text-foreground">
          <option value="">Criar novo insumo</option>
          {materials.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={onRemove}
        aria-label={`Remover ${name.toLowerCase()}`} data-tooltip={`Remova este ${name.toLowerCase()} da ficha em edição. O cadastro no estoque será mantido.`}
        className="h-9 w-9 shrink-0 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    </div>
    {!input.rawMaterialId && <label className={labelClass} htmlFor={`${input.key}-name`}>
      <span>Nome do novo {name.toLowerCase()}</span>
      <MenuPrefixField id={`${input.key}-name`} label={`Nome do novo ${name.toLowerCase()}`} disabled={disabled}
        value={input.newName} onChange={value => onChange({ newName: value })} mode="whole"
        suggestions={materials.map(row => ({ id: row.id, label: row.name, value: row.name, kind: 'material', unit: row.unit }))}
        onPick={suggestion => onChange({ rawMaterialId: suggestion.id, newName: '', newUnit: suggestion.unit ?? '' })}
        placeholder={base ? "Ex.: tomate" : "Ex.: molho da casa"} className="h-9 min-w-0 text-xs" />
    </label>}
    <div className="min-w-0 space-y-1">
      <span className="text-xs text-muted-foreground">Quantidade usada na receita</span>
      <div className="flex min-w-0 items-center gap-2">
        <Input id={`${input.key}-quantity`} aria-label={base ? "Quantidade do insumo-base" : "Quantidade do insumo por item"}
          data-tooltip="Informe quanto deste insumo entra na ficha técnica, na unidade escolhida ao lado."
          type="number" min="0.001" step="any" disabled={disabled} value={input.quantity}
          onChange={event => onChange({ quantity: event.target.value })} placeholder="Ex.: 150" className="h-9 min-w-0 flex-1 text-xs" />
        <select id={`${input.key}-unit`} aria-label={`Unidade de medida do ${name.toLowerCase()}`}
          data-tooltip="Unidade desta receita, independente da unidade da embalagem comprada. Apenas conversões válidas são gravadas no estoque."
          disabled={disabled} value={unit}
          onChange={event => onChange({ newUnit: event.target.value })}
          className="h-9 w-24 shrink-0 rounded-md border border-border bg-background px-2 text-xs text-foreground">
          {STOCK_UNITS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    </div>
  </div>;
}

const RecipeBuilder = forwardRef<RecipeBuilderHandle, Props>(({ menuItemId, menuItemName, disabled = false }, ref) => {
  const { rawMaterials, createRawMaterialRecord, createRecipe } = useStockData();
  const { businessUnitId } = useCurrentBusinessUnit();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [loaded, setLoaded] = useState(!menuItemId);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState<string | null>(null);
  const [collapsedRecipes, setCollapsedRecipes] = useState<string[]>([]);

  useEffect(() => {
    if (!menuItemId) { setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    setLoadError("");
    const recipeRequest = async () => {
      const result = await supabase.from("recipe_items").select("id, raw_material_id, quantity, transformacao, display_quantity, display_unit").eq("menu_item_id", menuItemId);
      if (result.error && /transformacao|column .* does not exist|schema cache/i.test(result.error.message)) {
        return supabase.from("recipe_items").select("id, raw_material_id, quantity").eq("menu_item_id", menuItemId);
      }
      return result;
    };
    void Promise.all([
      recipeRequest(),
      supabase.from("menu_item_ingredients").select("id, name").eq("menu_item_id", menuItemId),
    ]).then(([recipeResult, ingredientResult]) => {
        if (cancelled) return;
        const error = recipeResult.error ?? ingredientResult.error;
        if (error) { setLoadError("Não foi possível carregar a ficha técnica: " + error.message); return; }
        const recipeRows = (recipeResult.data ?? []).map(item => { const loaded = item as typeof item & { display_unit?: string | null; display_quantity?: number | null; transformacao?: string }; const transformation = (loaded.transformacao ?? "desconto_direto") as Transformation; const material = rawMaterials.find(m => m.id === item.raw_material_id); return { ...emptyRow(), key: item.id, rawMaterialId: item.raw_material_id, newUnit: loaded.display_unit || material?.unit || "un", quantity: String(loaded.display_quantity ?? item.quantity), transformation, isProduced: transformation === "producao" }; });
        const linkedIds = new Set(recipeRows.map(row => row.rawMaterialId));
        const ingredientRows = (ingredientResult.data ?? [])
          .filter(ingredient => !rawMaterials.some(material => linkedIds.has(material.id) && material.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase()))
          .map(ingredient => {
            const material = rawMaterials.find(item => item.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase());
            return { ...emptyRow(), key: crypto.randomUUID(), rawMaterialId: material?.id ?? "", newName: material ? "" : ingredient.name, newUnit: material?.unit ?? "un" };
          });
        setRows([...recipeRows, ...ingredientRows]);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [menuItemId, retry, rawMaterials]);

  const updateRow = (key: string, patch: Partial<RecipeRow>) =>
    setRows(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
  const updateSubInput = (rowKey: string, key: string, patch: Partial<MaterialInput>) =>
    setRows(previous => previous.map(row => row.key === rowKey ? { ...row, subInputs: row.subInputs.map(input => input.key === key ? { ...input, ...patch } : input) } : row));

  const saveTechnicalDocument = async (entityType: "menu_item" | "raw_material", entityId: string, document: Record<string, unknown>) => {
    if (!businessUnitId) return;
    try {
      const latest = await supabase.from("technical_documents").select("revision")
        .eq("business_unit_id", businessUnitId).eq("document_type", "ficha_tecnica")
        .eq("entity_type", entityType).eq("entity_id", entityId).order("revision", { ascending: false }).limit(1);
      const revision = Number(latest.data?.[0]?.revision ?? 0) + 1;
      const { error } = await supabase.from("technical_documents").insert({
        business_unit_id: businessUnitId, document_type: "ficha_tecnica", entity_type: entityType,
        entity_id: entityId, revision, status: "draft", document: JSON.parse(JSON.stringify(document)),
      });
      if (error) toast.error("Ficha salva, mas o documento JSON não foi atualizado: " + error.message);
    } catch (error) {
      toast.error("Ficha salva, mas o documento JSON ainda não está disponível neste ambiente: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const saveProducedRecipe = async (row: RecipeRow) => {
    if (savingRecipe || row.recipeCreated || !businessUnitId || !loaded) return;
    const valid = (input: MaterialInput) => (input.rawMaterialId || input.newName.trim()) && positive(input.quantity) && STOCK_UNITS.includes(input.newUnit as typeof STOCK_UNITS[number]);
    if (!valid(row) || !positive(row.outputQuantity) || !row.subInputs.length || row.subInputs.some(input => !valid(input))) {
      toast.error("Informe nome, quantidade, unidade, rendimento e todos os insumos-base da receita.");
      return;
    }
    setSavingRecipe(row.key);
    try {
      const resolve = async (input: MaterialInput, itemType: ItemType): Promise<string | null> =>
        input.rawMaterialId || await createRawMaterialRecord({
          name: input.newName.trim(), unit: input.newUnit, itemType, minStock: 0,
        });
      // O cadastro de saída é teórico. Nenhum lote ou saldo é criado aqui.
      const outputId = await resolve(row, "semiacabado");
      if (!outputId) return;
      updateRow(row.key, { rawMaterialId: outputId });
      const inputs: { rawMaterialId: string; quantity: number }[] = [];
      for (const input of row.subInputs) {
        const id = await resolve(input, "insumo");
        if (!id) return;
        const stockUnit = rawMaterials.find(m => m.id === id)?.unit ?? input.newUnit;
        const quantity = toStockQuantity(Number(input.quantity), input.newUnit, stockUnit);
        if (quantity === null) {
          toast.error(`Unidade incompatível para o insumo-base: ${input.newName || rawMaterials.find(m => m.id === id)?.name || id}.`);
          return;
        }
        inputs.push({ rawMaterialId: id, quantity });
        updateSubInput(row.key, input.key, { rawMaterialId: id });
      }
      const outputName = row.newName.trim() || rawMaterials.find(m => m.id === outputId)?.name || "Item produzido";
      const created = await createRecipe({
        name: `Receita — ${outputName}`, outputRawMaterialId: outputId,
        outputQuantity: Number(row.outputQuantity), shelfLifeDays: null,
        tipo: row.transformation === "porcionamento" ? "porcionamento" : "producao", inputs,
      });
      if (!created) return;
      updateRow(row.key, { recipeCreated: true });
      setCollapsedRecipes(previous => [...previous, row.key]);
      await saveTechnicalDocument("raw_material", outputId, {
        schema_version: 1, document_type: "ficha_tecnica", status: "draft", revision: 1,
        output: { type: "raw_material", id: outputId, name: outputName, unit: row.newUnit, quantity: Number(row.outputQuantity) },
        ingredients: inputs.map(input => ({
          raw_material_id: input.rawMaterialId,
          name: rawMaterials.find(m => m.id === input.rawMaterialId)?.name || row.subInputs.find(m => m.rawMaterialId === input.rawMaterialId)?.newName || "",
          quantity: input.quantity,
          unit: rawMaterials.find(m => m.id === input.rawMaterialId)?.unit || row.subInputs.find(m => m.rawMaterialId === input.rawMaterialId)?.newUnit || "un",
          process: "desconto_direto",
        })),
      });
      toast.success("Ficha técnica de produção salva. O estoque só será movimentado após produzir.");
    } finally {
      setSavingRecipe(null);
    }
  };

  const validate = () => {
    const fail = (message: string) => { toast.error(message); return false; };
    if (!loaded) return fail(loadError || "Aguarde o carregamento da ficha técnica.");
    if (rows.length && !businessUnitId) return fail("Selecione uma unidade antes de cadastrar os insumos da ficha técnica.");
    const validMaterial = (input: MaterialInput) => (input.rawMaterialId || input.newName.trim()) && STOCK_UNITS.some(u => u === input.newUnit) && positive(input.quantity);
    for (const [index, row] of rows.entries()) {
      if (!validMaterial(row)) return fail(`Insumo ${index + 1}: informe nome, unidade de medida e quantidade maior que zero.`);
      if (row.isProduced && (!positive(row.outputQuantity) || !row.subInputs.length || row.subInputs.some(input => !validMaterial(input))))
        return fail(`Receita do insumo ${index + 1}: informe a quantidade de referência e os insumos-base com nome, unidade e quantidade maior que zero.`);
    }
    return true;
  };

  useImperativeHandle(ref, () => ({
    validate,
    commit: async targetMenuItemId => {
      if (!validate()) return false;
      const resolve = async (input: MaterialInput, itemType: ItemType, onCreated: (id: string) => void) => {
        if (input.rawMaterialId) return input.rawMaterialId;
        const id = await createRawMaterialRecord({ name: input.newName.trim(), unit: input.newUnit.trim(), itemType, minStock: 0 });
        if (id) onCreated(id);
        return id;
      };
      const payload: { id: string; menu_item_id: string; raw_material_id: string; quantity: number; display_quantity: number; display_unit: string; transformacao: Transformation }[] = [];
      const producedDocuments: { id: string; row: RecipeRow; inputs: { id: string; quantity: number }[] }[] = [];
      for (const row of rows) {
        const createsOutput = row.transformation !== "desconto_direto";
        const outputItemType: ItemType = "semiacabado";
        const id = await resolve(row, createsOutput ? outputItemType : "insumo", id => updateRow(row.key, { rawMaterialId: id }));
        if (!id) return false;
        if (row.isProduced && row.rawMaterialId) {
          await supabase.from("raw_materials").update({ tipo: outputItemType })
            .eq("id", id).eq("business_unit_id", businessUnitId);
        }
        if (row.isProduced && !row.recipeCreated) {
          const inputs: { rawMaterialId: string; quantity: number }[] = [];
          for (const input of row.subInputs) {
            const baseId = await resolve(input, "insumo", id => updateSubInput(row.key, input.key, { rawMaterialId: id }));
            if (!baseId) return false;
            inputs.push({ rawMaterialId: baseId, quantity: Number(input.quantity) });
          }
          producedDocuments.push({ id, row, inputs: inputs.map(input => ({ id: input.rawMaterialId, quantity: input.quantity })) });
          const outputName = row.newName.trim() || rawMaterials.find(material => material.id === id)?.name || "Componente produzido";
          if (!await createRecipe({ name: `Receita — ${outputName}`, outputRawMaterialId: id,
          outputQuantity: Number(row.outputQuantity), shelfLifeDays: null,
            tipo: row.transformation === "porcionamento" ? "porcionamento" : "producao", inputs })) return false;
          updateRow(row.key, { recipeCreated: true });
        }
        const stockUnit = rawMaterials.find(material => material.id === id)?.unit ?? row.newUnit;
        const normalized = toStockQuantity(Number(row.quantity), row.newUnit, stockUnit);
        if (normalized === null) {
          toast.error(`A receita usa ${row.newUnit}, mas o cadastro de ${row.newName || rawMaterials.find(m => m.id === id)?.name || "insumo"} está em ${stockUnit}. Conclua a definição da unidade-base antes de salvar: não é seguro converter essas medidas automaticamente.`);
          return false;
        }
        payload.push({ id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.key) ? row.key : crypto.randomUUID(), menu_item_id: targetMenuItemId, raw_material_id: id, quantity: normalized, display_quantity: Number(row.quantity), display_unit: row.newUnit, transformacao: row.transformation });
      }
      // Save before removing obsolete rows so a failed write does not erase the
      // existing recipe. Stable row IDs also make a retry update the same rows.
      const existing = await supabase.from("recipe_items").select("id").eq("menu_item_id", targetMenuItemId);
      if (existing.error) { toast.error("Erro ao consultar ficha técnica: " + existing.error.message); return false; }
      if (payload.length) {
        let { error } = await supabase.from("recipe_items").upsert(payload, { onConflict: "id" });
        if (error && /transformacao|column .* does not exist|schema cache/i.test(error.message)) {
          const legacyPayload = payload.map(({ transformacao: _transformacao, ...item }) => item);
          ({ error } = await supabase.from("recipe_items").upsert(legacyPayload, { onConflict: "id" }));
        }
        if (error) { toast.error("Erro ao salvar ficha técnica: " + error.message); return false; }
      }
      const retained = new Set(payload.map(item => item.id));
      const removed = (existing.data ?? []).filter(item => !retained.has(item.id)).map(item => item.id);
      if (removed.length) {
        const { error } = await supabase.from("recipe_items").delete().eq("menu_item_id", targetMenuItemId).in("id", removed);
        if (error) { toast.error("Erro ao remover insumos da ficha técnica: " + error.message); return false; }
      }
      // A confirmação depende de uma leitura real do banco, não apenas do retorno do upsert.
      const verified = await supabase.from("recipe_items")
        .select("id,raw_material_id,quantity").eq("menu_item_id", targetMenuItemId);
      if (verified.error) {
        toast.error("Ficha enviada, mas não foi possível confirmar a gravação: " + verified.error.message);
        return false;
      }
      const actual = verified.data ?? [];
      const expected = new Map(payload.map(line => [line.raw_material_id, (payload.filter(p => p.raw_material_id === line.raw_material_id)).reduce((sum,p) => sum + p.quantity, 0)]));
      const recorded = new Map<string,number>();
      for (const line of actual) recorded.set(line.raw_material_id, (recorded.get(line.raw_material_id) ?? 0) + Number(line.quantity));
      if (actual.length !== payload.length || [...expected].some(([id,quantity]) => Math.abs((recorded.get(id) ?? NaN) - quantity) > 0.000001)) {
        toast.error("A ficha técnica não foi confirmada no banco. Mantenha o editor aberto e tente salvar novamente.");
        return false;
      }
      const materialName = (id: string, fallback: string) => rawMaterials.find(material => material.id === id)?.name ?? fallback;
      const materialUnit = (id: string, fallback: string) => rawMaterials.find(material => material.id === id)?.unit ?? fallback;
      const ingredients = rows.map(row => {
        const produced = producedDocuments.find(item => item.row.key === row.key);
        return {
          id: row.key,
          name: materialName(row.rawMaterialId, row.newName.trim()),
          raw_material_id: row.rawMaterialId,
          quantity: Number(row.quantity),
          unit: row.newUnit,
          process: row.transformation,
          output_type: row.transformation !== "desconto_direto" ? "semiacabado" : undefined,
          theoretical: true,
          recipe: produced ? {
            yield: { quantity: Number(produced.row.outputQuantity), unit: materialUnit(produced.id, produced.row.newUnit) },
            ingredients: produced.inputs.map(input => ({ id: input.id, name: materialName(input.id, ""), raw_material_id: input.id, quantity: input.quantity, unit: materialUnit(input.id, "un") })),
          } : undefined,
        };
      });
      await saveTechnicalDocument("menu_item", targetMenuItemId, {
        schema_version: 1, document_type: "ficha_tecnica", status: "draft", revision: 1,
        output: { type: "menu_item", id: targetMenuItemId, name: menuItemName ?? "", unit: "un", quantity: 1 }, ingredients,
      });
      for (const produced of producedDocuments) {
        await saveTechnicalDocument("raw_material", produced.id, {
          schema_version: 1, document_type: "ficha_tecnica", status: "draft", revision: 1,
          output: { type: "raw_material", id: produced.id, name: materialName(produced.id, produced.row.newName.trim()), unit: materialUnit(produced.id, produced.row.newUnit), quantity: Number(produced.row.outputQuantity) },
          ingredients: produced.inputs.map(input => ({ id: input.id, name: materialName(input.id, ""), raw_material_id: input.id, quantity: input.quantity, unit: materialUnit(input.id, "un"), process: "desconto_direto", theoretical: true })),
        });
      }
      return true;
    },
  }));

  return <section className="min-w-0 space-y-3" aria-label="Ficha técnica do item">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h4 tabIndex={0} data-tooltip="Monte primeiro o cardápio e a ficha técnica. Os novos insumos são cadastrados no estoque com saldo zero; compras e produção são lançadas depois."
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><ChefHat className="h-3.5 w-3.5" /> Ficha técnica</h4>
        <Button type="button" variant="ghost" size="sm" onClick={() => setHelpOpen(true)} className="h-7 gap-1 px-2 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Como montar
        </Button>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled || !loaded} onClick={() => setRows(previous => [...previous, emptyRow()])}
        data-tooltip="Adicione um insumo existente ou crie um novo com saldo zero, diretamente no cardápio."><Plus className="h-3 w-3" /> Adicionar insumo</Button>
    </div>
    <p className="text-xs text-muted-foreground">Monte os insumos e as quantidades por item. Os novos cadastros e receitas serão salvos junto com o item, sem movimentar estoque.</p>
    {!loaded && !loadError && <p className="text-xs text-muted-foreground" role="status">Carregando ficha técnica…</p>}
    {loadError && <div role="alert" className="space-y-2 text-xs text-destructive">{loadError}<br />
      <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div>}
    {loaded && !rows.length && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Clique em “Adicionar insumo” para começar a ficha técnica.</p>}
    {rows.map(row => {
      const unit = rawMaterials.find(material => material.id === row.rawMaterialId)?.unit ?? row.newUnit;
      return <div key={row.key} className="min-w-0 space-y-3 rounded-lg bg-secondary/30 p-3">
        <MaterialFields input={row} materials={rawMaterials} disabled={disabled}
          onChange={patch => updateRow(row.key, { ...patch, ...(patch.rawMaterialId !== undefined ? { isProduced: false, recipeCreated: false, subInputs: [] } : {}) })}
          onRemove={() => setRows(previous => previous.filter(item => item.key !== row.key))} />
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" disabled={disabled} checked={row.isProduced} aria-label="É produzido: tem receita própria"
            data-tooltip="Ative para um insumo preparado na casa, como molho ou massa. Cadastre abaixo os insumos-base e as quantidades da receita."
            onChange={event => updateRow(row.key, { isProduced: event.target.checked, transformation: event.target.checked ? "producao" : "desconto_direto",
              subInputs: event.target.checked && !row.subInputs.length ? [emptyInput()] : row.subInputs })} />
          É produzido: tem receita própria
        </label>
        <label className={labelClass} htmlFor={`${row.key}-transformacao`}>
          <span>Transformação</span>
          <select id={`${row.key}-transformacao`} aria-label="Transformação" disabled={disabled}
            value={row.transformation}
            onChange={event => { const transformation = event.target.value as Transformation; const isProduced = transformation === "producao"; updateRow(row.key, { transformation, isProduced, subInputs: isProduced && !row.subInputs.length ? [emptyInput()] : row.subInputs }); }}
            className="h-9 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground">
            {TRANSFORMATIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {row.isProduced && row.recipeCreated && collapsedRecipes.includes(row.key) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCollapsedRecipes(previous => previous.filter(key => key !== row.key))}>
            <ChefHat className="h-3.5 w-3.5" /> Ficha técnica de produção salva — visualizar
          </Button>
        )}
        {row.isProduced && !collapsedRecipes.includes(row.key) && <fieldset className="min-w-0 space-y-3 border-l-2 border-primary/30 pl-3" disabled={disabled || row.recipeCreated}>
          <legend className="mb-2 text-xs font-medium text-foreground">Receita de {row.newName.trim() || "novo insumo"}</legend>
          <label className={labelClass} htmlFor={`${row.key}-output`}>
            <span>Quantidade de referência da receita ({unit})</span>
            <Input id={`${row.key}-output`} aria-label="Quantidade de referência da receita" type="number" min="0.001" step="any"
              data-tooltip="Quanto esta receita representa na unidade do insumo produzido. Ex.: receita para 1 kg de molho. Os insumos-base abaixo devem corresponder a essa quantidade; a produção real é lançada depois."
              value={row.outputQuantity} onChange={event => updateRow(row.key, { outputQuantity: event.target.value })} className="h-9 min-w-0 text-xs sm:max-w-48" />
          </label>
          <p className="text-xs text-muted-foreground">Informe os insumos-base para {row.outputQuantity || "…"} {unit}. Você pode criar cada um aqui, mesmo sem estoque disponível.</p>
          {row.subInputs.map(input => <MaterialFields key={input.key} input={input} materials={rawMaterials} base disabled={disabled || row.recipeCreated}
            onChange={patch => updateSubInput(row.key, input.key, patch)}
            onRemove={() => updateRow(row.key, { subInputs: row.subInputs.filter(item => item.key !== input.key) })} />)}
          <Button type="button" variant="outline" size="sm" disabled={disabled || row.recipeCreated}
            data-tooltip="Adicione um insumo-base à receita. Preencha nome, unidade de medida e quantidade; o novo insumo será cadastrado com saldo zero."
            onClick={() => updateRow(row.key, { subInputs: [...row.subInputs, emptyInput()] })}><Plus className="h-3 w-3" /> Adicionar insumo-base</Button>
          {!row.recipeCreated && <Button type="button" size="sm" disabled={disabled || savingRecipe !== null}
            aria-label="Salvar receita de produção" onClick={() => void saveProducedRecipe(row)}>
            {savingRecipe === row.key ? "Salvando receita…" : "Salvar receita"}
          </Button>}
          {row.recipeCreated && <p className="text-xs text-muted-foreground">Ficha técnica de produção salva. O item produzido só entra no estoque após confirmar a produção.</p>}
        </fieldset>}
      </div>;
    })}
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className={`w-[calc(100%-2rem)] p-4 ${helpExpanded ? "max-w-lg" : "max-w-sm"}`}>
        <DialogHeader className="relative pr-8">
          <DialogTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Orientação da montagem</DialogTitle>
          <DialogDescription>Você pode começar pelo cardápio ou pelo Estoque. A ficha técnica conecta os dois lados.</DialogDescription>
          <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-7 w-7" onClick={() => setHelpExpanded(value => !value)} aria-label={helpExpanded ? "Usar janela compacta" : "Expandir janela de orientação"}>
            {helpExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li><strong>1. Adicione o componente.</strong> Ex.: pão, queijo, molho ou hambúrguer.</li>
          <li><strong>2. Vincule ao estoque.</strong> Use um insumo já cadastrado no Estoque ou crie-o aqui. Se for novo, ele aparecerá como teórico, aguardando o primeiro lote.</li>
          <li><strong>3. Informe a quantidade por item.</strong> Use a unidade cadastrada: g, kg, ml, L ou un.</li>
          <li><strong>4. Se for produzido, marque a opção.</strong> Informe o rendimento e os insumos-base da receita.</li>
          <li><strong>5. Salve o cardápio.</strong> Nada é comprado ou movimentado agora; somente o cadastro e a ficha técnica são criados.</li>
        </ol>
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">A relação é bidirecional: um insumo criado no Estoque pode ser usado depois no cardápio; um insumo criado na ficha aparece no Estoque. Ao registrar a primeira compra ou produção, ele deixa de ser teórico.</p>
      </DialogContent>
    </Dialog>
  </section>;
});
RecipeBuilder.displayName = "RecipeBuilder";
export default RecipeBuilder;
