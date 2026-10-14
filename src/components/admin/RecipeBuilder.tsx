import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { Plus, Trash2, ChefHat, Sparkles, Maximize2, Minimize2, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useStockData, type RawMaterial, type ItemType } from "@/hooks/useStockData";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { toast } from "sonner";
import MenuPrefixField from '@/components/admin/MenuPrefixField';
import { STOCK_UNITS } from '@/lib/stockUnits';
import { compatibleUnits, portionUnit, sameUnit } from "@/lib/units";
import {
  customerFields, describeRows, findMaterial, isPending, materialName, mergeDisplayIngredients, needsUnitChange,
  newInput, newRow, projectIngredients, rowFromSaved, splitDescription, stockQuantity, targetStockUnit, unitHint, validateRows,
  type DisplayIngredient, type MaterialInput, type RecipeRow, type SavedRecipeLine, type Transformation,
} from "@/lib/recipeLines";

const TRANSFORMATIONS: { value: Transformation; label: string }[] = [
  { value: "desconto_direto", label: "Desconto direto" },
  { value: "producao", label: "Produção" },
  { value: "porcionamento", label: "Porcionamento" },
];
const TYPE_GROUPS: { type: ItemType; label: string }[] = [
  { type: "insumo", label: "Insumos" },
  { type: "semiacabado", label: "Feitos na casa" },
  { type: "revenda", label: "Revenda" },
  { type: "produto_acabado", label: "Produtos acabados" },
];
const PLACEHOLDER: Record<string, string> = { g: "Ex.: 150", kg: "Ex.: 0,150", ml: "Ex.: 50", L: "Ex.: 0,05", un: "Ex.: 1" };

export interface RecipeBuilderHandle {
  validate: () => boolean;
  commit: (menuItemId: string) => Promise<boolean>;
  /** O que o cliente vê (linhas marcadas "Aparece no cardápio"); null enquanto a ficha não carregou. */
  ingredients: () => (DisplayIngredient & { sort_order: number })[] | null;
  /** Cria linhas para as partes da descrição que ainda não estão na ficha. Devolve quantas criou. */
  addFromDescription: (description: string, onlyIfEmpty?: boolean) => number;
  /** Descrição para o cliente montada da ficha, com as porções ("bacon 30 g"). */
  describe: () => string;
}
interface Props { menuItemId?: string; menuItemName?: string; disabled?: boolean; description?: string }

const positive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
const labelClass = "block min-w-0 space-y-1 text-xs text-muted-foreground";
const selectClass = "h-9 w-full min-w-0 rounded-md border border-border bg-muted px-2 text-xs text-foreground";
const legacyColumnError = (message: string) => /transformacao|display_name|removable|extra_price|only_as_extra|sort_order|column .* does not exist|schema cache/i.test(message);

function MaterialFields({ input, materials, unlocked, disabled, base = false, onChange, onRemove }: {
  input: MaterialInput; materials: RawMaterial[]; unlocked: boolean; disabled: boolean; base?: boolean;
  onChange: (patch: Partial<MaterialInput>) => void; onRemove: () => void;
}) {
  const material = findMaterial(input, materials);
  const name = base ? "Insumo-base" : "Insumo";
  // Insumo com histórico só aceita unidades da mesma grandeza (g ↔ kg); sem histórico, qualquer uma.
  const options: string[] = !material || unlocked ? [...STOCK_UNITS] : compatibleUnits(material.unit);
  const units = options.some(unit => sameUnit(unit, input.qtyUnit)) ? options : [input.qtyUnit, ...options];
  // Receita de produção só consome insumo e semiacabado (revenda e produto acabado não entram).
  const choices = base ? materials.filter(item => ["insumo", "semiacabado"].includes(item.itemType ?? "insumo")) : materials;
  const hint = unitHint(input, materials);
  return <div className="min-w-0 space-y-2 rounded-lg border border-border bg-background/50 p-3">
    <div className="flex min-w-0 items-end gap-2">
      <label className={`${labelClass} flex-1`} htmlFor={`${input.key}-material`}>
        <span>{name}</span>
        <select id={`${input.key}-material`} aria-label={name} disabled={disabled}
          data-tooltip="Insumo do Estoque que este ingrediente consome. Escolha um já cadastrado ou deixe em 'Criar novo insumo' para cadastrá-lo ao salvar a ficha."
          value={input.rawMaterialId}
          onChange={event => {
            const chosen = materials.find(item => item.id === event.target.value);
            onChange({ rawMaterialId: event.target.value, newName: "", qtyUnit: chosen ? portionUnit(chosen.unit) : input.qtyUnit });
          }}
          className={selectClass}>
          <option value="">Criar novo insumo</option>
          {TYPE_GROUPS.map(group => {
            const items = choices.filter(item => (item.itemType ?? "insumo") === group.type);
            return items.length ? <optgroup key={group.type} label={group.label}>
              {items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
            </optgroup> : null;
          })}
        </select>
      </label>
      <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={onRemove}
        aria-label={`Remover ${name.toLowerCase()}`} data-tooltip={`Remova este ${name.toLowerCase()} da ficha em edição. O cadastro no estoque será mantido.`}
        className="h-9 w-9 shrink-0 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
      {!input.rawMaterialId && <label className={`${labelClass} col-span-2 sm:col-span-1`} htmlFor={`${input.key}-name`}>
        <span>Nome do novo {name.toLowerCase()}</span>
        <MenuPrefixField id={`${input.key}-name`} label={`Nome do novo ${name.toLowerCase()}`} disabled={disabled}
          value={input.newName} onChange={value => onChange({ newName: value })} mode="whole"
          suggestions={choices.map(row => ({ id: row.id, label: row.name, value: row.name, kind: 'material', unit: row.unit }))}
          onPick={suggestion => onChange({ rawMaterialId: suggestion.id, newName: '', qtyUnit: portionUnit(suggestion.unit ?? input.qtyUnit) })}
          placeholder={base ? "Ex.: tomate" : "Ex.: bacon"} className="h-9 min-w-0 text-xs" />
      </label>}
      <label className={labelClass} htmlFor={`${input.key}-unit`}>
        <span>Unidade de medida</span>
        <select id={`${input.key}-unit`} aria-label={`Unidade de medida do ${name.toLowerCase()}`} disabled={disabled}
          data-tooltip="Unidade em que você digita a quantidade. Se o Estoque usa outra da mesma grandeza (kg ↔ g, L ↔ ml), o sistema converte. Insumo novo ou ainda sem movimento passa a usar a unidade escolhida."
          value={input.qtyUnit} onChange={event => onChange({ qtyUnit: event.target.value })} className={selectClass}>
          {units.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label className={labelClass} htmlFor={`${input.key}-quantity`}>
        <span>{base ? "Quantidade na receita" : "Quantidade por item"} ({input.qtyUnit})</span>
        <Input id={`${input.key}-quantity`} aria-label={base ? "Quantidade do insumo-base" : "Quantidade do insumo por item"}
          data-tooltip={base ? "Quanto deste insumo-base entra na receita, para o rendimento informado acima." : "Quanto deste insumo vai em uma unidade vendida do item. Ex.: 30 g de bacon por lanche."}
          type="number" min="0.001" step="any" disabled={disabled} value={input.quantity}
          onChange={event => onChange({ quantity: event.target.value })} placeholder={PLACEHOLDER[input.qtyUnit] ?? "Ex.: 1"} className="h-9 min-w-0 text-xs" />
      </label>
    </div>
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>;
}

function CustomerFields({ row, fallbackName, disabled, onChange }: {
  row: RecipeRow; fallbackName: string; disabled: boolean; onChange: (patch: Partial<RecipeRow>) => void;
}) {
  return <div className="min-w-0 space-y-2 rounded-lg border border-dashed border-border p-2">
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" checked={row.showToCustomer} disabled={disabled} aria-label="Aparece no cardápio"
        data-tooltip="Mostra este ingrediente ao cliente e ao garçom no pedido, com as opções de tirar ou adicionar. Sal, óleo e temperos ficam ocultos, mas continuam baixando do estoque."
        onChange={event => onChange({ showToCustomer: event.target.checked, displayName: row.displayName || fallbackName })} />
      Aparece no cardápio
    </label>
    {row.showToCustomer && <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
      <label className={`${labelClass} col-span-2`}>
        <span>Nome para o cliente</span>
        <Input aria-label="Nome para o cliente" value={row.displayName} maxLength={80} disabled={disabled}
          data-tooltip="Como o ingrediente aparece no cardápio e na comanda (ex.: Bacon crocante). Os pedidos 'sem' e 'extra' usam este nome."
          onChange={event => onChange({ displayName: event.target.value })} className="h-9 min-w-0 text-xs" />
      </label>
      <label className={labelClass}>
        <span>Adicional (R$)</span>
        <Input aria-label="Preço do adicional" type="number" min="0" step="0.01" placeholder="Não oferece" value={row.extraPrice} disabled={disabled}
          data-tooltip="Preço para pedir uma porção extra. Vazio = não é oferecido como adicional; 0 = adicional grátis. Cada extra baixa a porção de novo."
          onChange={event => onChange({ extraPrice: event.target.value, ...(event.target.value.trim() === "" ? { onlyExtra: false } : {}) })} className="h-9 min-w-0 text-xs" />
      </label>
      <div className="col-span-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:col-span-1 sm:flex-col sm:items-start sm:justify-end sm:gap-1">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={row.removable && !row.onlyExtra} disabled={disabled || row.onlyExtra} aria-label="Cliente pode tirar"
            data-tooltip="O cliente pode pedir sem este ingrediente. Pedido 'sem' não baixa a porção do estoque."
            onChange={event => onChange({ removable: event.target.checked })} />
          Pode tirar
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={row.onlyExtra} disabled={disabled || row.extraPrice.trim() === ""} aria-label="Só como adicional"
            data-tooltip="Não faz parte do item padrão; só entra (e só baixa estoque) quando o cliente pede como adicional. Ex.: ovo extra."
            onChange={event => onChange({ onlyExtra: event.target.checked, ...(event.target.checked ? { removable: false } : {}) })} />
          Só adicional
        </label>
      </div>
    </div>}
  </div>;
}

const RecipeBuilder = forwardRef<RecipeBuilderHandle, Props>(({ menuItemId, menuItemName, disabled = false, description = "" }, ref) => {
  const { rawMaterials, createRawMaterialRecord, createRecipe, loading: stockLoading, refreshAll } = useStockData();
  const { businessUnitId } = useCurrentBusinessUnit();
  const [rows, setRowsState] = useState<RecipeRow[]>([]);
  // Cópia síncrona das linhas: o salvamento logo depois de "puxar da descrição" já enxerga as novas.
  const rowsRef = useRef<RecipeRow[]>([]);
  const applyRows = (next: RecipeRow[] | ((previous: RecipeRow[]) => RecipeRow[])) => {
    const value = typeof next === "function" ? next(rowsRef.current) : next;
    rowsRef.current = value;
    setRowsState(value);
  };
  const [saved, setSaved] = useState<{ lines: SavedRecipeLine[]; ingredients: DisplayIngredient[] } | null>(menuItemId ? null : { lines: [], ingredients: [] });
  const [loaded, setLoaded] = useState(!menuItemId);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const checkedLocks = useRef(new Set<string>());
  const built = useRef(!menuItemId);

  // 1) Carrega a ficha gravada e os ingredientes exibidos ao cliente (uma vez por item).
  useEffect(() => {
    if (!menuItemId) return;
    let cancelled = false;
    built.current = false;
    setLoaded(false);
    setSaved(null);
    setLoadError("");
    void (async () => {
      const [recipe, ingredients] = await Promise.all([
        supabase.from("recipe_items").select("*").eq("menu_item_id", menuItemId),
        supabase.from("menu_item_ingredients").select("*").eq("menu_item_id", menuItemId),
      ]);
      if (cancelled) return;
      const error = recipe.error ?? ingredients.error;
      if (error) { setLoadError("Não foi possível carregar a ficha técnica: " + error.message); return; }
      setSaved({ lines: (recipe.data ?? []) as SavedRecipeLine[], ingredients: (ingredients.data ?? []) as DisplayIngredient[] });
    })();
    return () => { cancelled = true; };
  }, [menuItemId, retry]);

  // 2) Monta as linhas quando o Estoque carregou (para mostrar a porção na unidade certa).
  //    Ingrediente exibido ao cliente sem linha na ficha vira linha pendente para completar.
  useEffect(() => {
    if (!saved || built.current || stockLoading) return;
    built.current = true;
    const lines = [...saved.lines].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    applyRows(mergeDisplayIngredients(lines.map(line => rowFromSaved(line, rawMaterials)), saved.ingredients, rawMaterials));
    setLoaded(true);
  }, [saved, stockLoading, rawMaterials]);

  // 3) Descobre quais insumos ainda podem trocar de unidade (sem movimento, lote, receita ou outra ficha).
  const materialIds = useMemo(() => [...new Set(rows.flatMap(row => [row.rawMaterialId, ...row.subInputs.map(sub => sub.rawMaterialId)]).filter(Boolean))], [rows]);
  useEffect(() => {
    const pending = materialIds.filter(id => !checkedLocks.current.has(id));
    if (!pending.length) return;
    pending.forEach(id => checkedLocks.current.add(id));
    void (async () => {
      try {
        const results = await Promise.all([
          supabase.from("stock_movements").select("raw_material_id").in("raw_material_id", pending).limit(1000),
          supabase.from("lotes").select("raw_material_id").in("raw_material_id", pending).limit(1000),
          supabase.from("production_recipe_inputs").select("raw_material_id").in("raw_material_id", pending).limit(1000),
          supabase.from("production_recipes").select("output_raw_material_id").in("output_raw_material_id", pending).limit(1000),
          supabase.from("recipe_items").select("raw_material_id, menu_item_id").in("raw_material_id", pending).limit(1000),
        ]);
        if (results.some(result => result.error)) return; // sem certeza: mantém travado, que é o lado seguro
        const [movements, lots, inputs, outputs, uses] = results.map(result => (result.data ?? []) as Record<string, string>[]);
        const busy = new Set([
          ...movements.map(r => r.raw_material_id), ...lots.map(r => r.raw_material_id), ...inputs.map(r => r.raw_material_id),
          ...outputs.map(r => r.output_raw_material_id), ...uses.filter(r => r.menu_item_id !== menuItemId).map(r => r.raw_material_id),
        ]);
        setUnlocked(previous => new Set([...previous, ...pending.filter(id => !busy.has(id))]));
      } catch { /* sem conexão: a unidade continua travada */ }
    })();
  }, [materialIds, menuItemId]);

  const updateRow = (key: string, patch: Partial<RecipeRow>) =>
    applyRows(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
  const updateSubInput = (rowKey: string, key: string, patch: Partial<MaterialInput>) =>
    applyRows(previous => previous.map(row => row.key === rowKey ? { ...row, subInputs: row.subInputs.map(input => input.key === key ? { ...input, ...patch } : input) } : row));

  const addFromDescription = (text: string, onlyIfEmpty = false) => {
    if (!loaded || (onlyIfEmpty && rowsRef.current.length)) return 0;
    const parts = splitDescription(text);
    if (!parts.length) return 0;
    const before = rowsRef.current.length;
    applyRows(previous => mergeDisplayIngredients(previous, parts.map(name => ({ name, removable: true, extra_price: null })), rawMaterials));
    return rowsRef.current.length - before;
  };

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

  const validate = () => {
    const fail = (message: string) => { toast.error(message); return false; };
    if (!loaded) return fail(loadError || "Aguarde o carregamento da ficha técnica.");
    const current = rowsRef.current;
    if (current.length && !businessUnitId) return fail("Selecione uma unidade antes de cadastrar os insumos da ficha técnica.");
    const problem = validateRows(current, rawMaterials, unlocked);
    return problem ? fail(problem) : true;
  };

  useImperativeHandle(ref, () => ({
    validate,
    addFromDescription,
    describe: () => describeRows(rowsRef.current),
    ingredients: () => (loaded ? projectIngredients(rowsRef.current) : null),
    commit: async targetMenuItemId => {
      if (!validate()) return false;
      const current = rowsRef.current;
      // Insumo existente cuja unidade muda (ex.: blend cadastrado em "un" e porção em g).
      const fixUnit = async (input: MaterialInput) => {
        if (!needsUnitChange(input, rawMaterials)) return true;
        const { error } = await supabase.rpc("set_raw_material_unit", {
          p_material: input.rawMaterialId, p_unit: targetStockUnit(input, rawMaterials), p_menu_item: targetMenuItemId,
        });
        if (error) toast.error(`Não foi possível trocar a unidade de "${materialName(input, rawMaterials)}": ${error.message}`);
        return !error;
      };
      const resolve = async (input: MaterialInput, itemType: ItemType, onCreated: (id: string) => void) => {
        if (input.rawMaterialId) return await fixUnit(input) ? input.rawMaterialId : null;
        const id = await createRawMaterialRecord({ name: input.newName.trim(), unit: targetStockUnit(input, rawMaterials), itemType, minStock: 0 });
        if (id) {
          // Acabou de nascer: sem movimento nem outra ficha, pode trocar de unidade sem consulta.
          checkedLocks.current.add(id);
          setUnlocked(previous => new Set(previous).add(id));
          onCreated(id);
        }
        return id;
      };
      const complete = current.filter(row => !isPending(row));
      const pendingCount = current.filter(row => isPending(row) && (row.rawMaterialId || row.newName.trim() || row.showToCustomer)).length;
      const payload: { id: string; menu_item_id: string; raw_material_id: string; quantity: number; transformacao: Transformation;
        display_name: string | null; removable: boolean; extra_price: number | null; only_as_extra: boolean; sort_order: number }[] = [];
      const producedDocuments: { id: string; row: RecipeRow; inputs: { id: string; quantity: number; unit: string }[] }[] = [];
      for (const [index, row] of complete.entries()) {
        const quantity = stockQuantity(row, rawMaterials)!;
        const outputItemType: ItemType = "semiacabado";
        const id = await resolve(row, row.isProduced ? outputItemType : "insumo", id => updateRow(row.key, { rawMaterialId: id }));
        if (!id) return false;
        if (row.isProduced && row.rawMaterialId) {
          await supabase.from("raw_materials").update({ tipo: outputItemType })
            .eq("id", id).eq("business_unit_id", businessUnitId);
        }
        if (row.isProduced && !row.recipeCreated) {
          const inputs: { rawMaterialId: string; quantity: number; unit: string }[] = [];
          for (const input of row.subInputs) {
            const baseId = await resolve(input, "insumo", id => updateSubInput(row.key, input.key, { rawMaterialId: id }));
            if (!baseId) return false;
            inputs.push({ rawMaterialId: baseId, quantity: stockQuantity(input, rawMaterials)!, unit: targetStockUnit(input, rawMaterials) });
          }
          producedDocuments.push({ id, row, inputs: inputs.map(input => ({ id: input.rawMaterialId, quantity: input.quantity, unit: input.unit })) });
          const outputName = row.newName.trim() || rawMaterials.find(material => material.id === id)?.name || "Componente produzido";
          if (!await createRecipe({ name: `Receita — ${outputName}`, outputRawMaterialId: id,
            outputQuantity: Number(row.outputQuantity), shelfLifeDays: null,
            tipo: row.transformation === "porcionamento" ? "porcionamento" : "producao",
            inputs: inputs.map(({ rawMaterialId, quantity: used }) => ({ rawMaterialId, quantity: used })) })) return false;
          updateRow(row.key, { recipeCreated: true });
        }
        payload.push({ id: row.key, menu_item_id: targetMenuItemId, raw_material_id: id, quantity, transformacao: row.transformation,
          ...customerFields(row), sort_order: index });
      }
      // Grava antes de remover linhas antigas: uma falha não apaga a ficha existente, e IDs
      // estáveis fazem a nova tentativa atualizar as mesmas linhas.
      const existing = await supabase.from("recipe_items").select("id").eq("menu_item_id", targetMenuItemId);
      if (existing.error) { toast.error("Erro ao consultar ficha técnica: " + existing.error.message); return false; }
      if (payload.length) {
        let { error } = await supabase.from("recipe_items").upsert(payload, { onConflict: "id" });
        if (error && legacyColumnError(error.message)) {
          // Banco ainda sem as colunas novas: grava o essencial para não perder a ficha.
          const legacyPayload = payload.map(({ id, menu_item_id, raw_material_id, quantity }) => ({ id, menu_item_id, raw_material_id, quantity }));
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
      const materialNameOf = (id: string, fallback: string) => rawMaterials.find(material => material.id === id)?.name ?? fallback;
      const ingredients = complete.map((row, index) => {
        const produced = producedDocuments.find(item => item.row.key === row.key);
        return {
          id: row.key,
          name: materialNameOf(payload[index]?.raw_material_id ?? row.rawMaterialId, row.newName.trim()),
          display_name: customerFields(row).display_name,
          raw_material_id: payload[index]?.raw_material_id ?? row.rawMaterialId,
          quantity: payload[index]?.quantity ?? stockQuantity(row, rawMaterials),
          unit: targetStockUnit(row, rawMaterials),
          process: row.transformation,
          output_type: row.isProduced ? "semiacabado" : undefined,
          theoretical: true,
          recipe: produced ? {
            yield: { quantity: Number(produced.row.outputQuantity), unit: targetStockUnit(produced.row, rawMaterials) },
            ingredients: produced.inputs.map(input => ({ id: input.id, name: materialNameOf(input.id, ""), raw_material_id: input.id, quantity: input.quantity, unit: input.unit })),
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
          output: { type: "raw_material", id: produced.id, name: materialNameOf(produced.id, produced.row.newName.trim()), unit: targetStockUnit(produced.row, rawMaterials), quantity: Number(produced.row.outputQuantity) },
          ingredients: produced.inputs.map(input => ({ id: input.id, name: materialNameOf(input.id, ""), raw_material_id: input.id, quantity: input.quantity, unit: input.unit, process: "desconto_direto", theoretical: true })),
        });
      }
      if (pendingCount) toast.warning?.(`${pendingCount} ingrediente(s) sem quantidade ficaram pendentes na ficha e ainda não baixam estoque.`);
      void refreshAll?.();
      return true;
    },
  }));

  const pending = rows.filter(row => isPending(row) && (row.rawMaterialId || row.newName.trim() || row.showToCustomer)).length;
  return <section className="min-w-0 space-y-3" aria-label="Ficha técnica do item">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h4 tabIndex={0} data-tooltip="Cada linha é um ingrediente do item: o insumo do Estoque, a transformação, a unidade e a quantidade por item vendido. É a ficha que baixa o estoque a cada venda."
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><ChefHat className="h-3.5 w-3.5" /> Ficha técnica</h4>
        <Button type="button" variant="ghost" size="sm" onClick={() => setHelpOpen(true)} className="h-7 gap-1 px-2 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Como montar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {description.trim() && <Button type="button" variant="outline" size="sm" disabled={disabled || !loaded}
          data-tooltip="Cria uma linha da ficha para cada ingrediente da descrição (separados por vírgula) que ainda não estiver aqui."
          onClick={() => { const added = addFromDescription(description); if (!added) toast.error("Todos os ingredientes da descrição já estão na ficha."); }}>
          <ListPlus className="h-3 w-3" /> Puxar da descrição
        </Button>}
        <Button type="button" variant="outline" size="sm" disabled={disabled || !loaded} onClick={() => applyRows(previous => [...previous, newRow()])}
          data-tooltip="Adicione um insumo existente ou crie um novo com saldo zero, diretamente no cardápio."><Plus className="h-3 w-3" /> Adicionar insumo</Button>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Para cada ingrediente: escolha o insumo, a transformação, a unidade e a quantidade por item. Os insumos novos entram no Estoque ao salvar, sem movimentar saldo.</p>
    {pending > 0 && <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600">{pending} ingrediente(s) sem quantidade: ficam pendentes e não baixam estoque até você completar.</p>}
    {!loaded && !loadError && <p className="text-xs text-muted-foreground" role="status">Carregando ficha técnica…</p>}
    {loadError && <div role="alert" className="space-y-2 text-xs text-destructive">{loadError}<br />
      <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div>}
    {loaded && !rows.length && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Escreva os ingredientes na descrição, separados por vírgula, e saia do campo: cada um vira uma linha aqui. Ou clique em “Adicionar insumo”.</p>}
    {rows.map(row => {
      const unit = targetStockUnit(row, rawMaterials);
      return <div key={row.key} className="min-w-0 space-y-3 rounded-lg bg-secondary/30 p-3">
        <MaterialFields input={row} materials={rawMaterials} unlocked={unlocked.has(row.rawMaterialId)} disabled={disabled}
          onChange={patch => updateRow(row.key, { ...patch, ...(patch.rawMaterialId !== undefined ? { isProduced: false, recipeCreated: false, subInputs: [], transformation: "desconto_direto" as Transformation } : {}) })}
          onRemove={() => applyRows(previous => previous.filter(item => item.key !== row.key))} />
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className={labelClass} htmlFor={`${row.key}-transformacao`}>
            <span>Transformação</span>
            <select id={`${row.key}-transformacao`} aria-label="Transformação" disabled={disabled}
              data-tooltip="Desconto direto: o insumo sai do estoque como está. Produção: é feito na casa a partir de outros insumos (molho, massa). Porcionamento: é dividido em porções padrão."
              value={row.transformation}
              onChange={event => { const transformation = event.target.value as Transformation; const isProduced = transformation === "producao"; updateRow(row.key, { transformation, isProduced, subInputs: isProduced && !row.subInputs.length ? [newInput()] : row.subInputs }); }}
              className={selectClass}>
              {TRANSFORMATIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-xs text-muted-foreground">
            <input type="checkbox" disabled={disabled} checked={row.isProduced} aria-label="É produzido: tem receita própria"
              data-tooltip="Ative para um insumo preparado na casa, como molho ou massa. Ele vira 'feito na casa' no Estoque (entra por produção, não por compra); os insumos-base da receita é que entram por compra."
              onChange={event => updateRow(row.key, { isProduced: event.target.checked, transformation: event.target.checked ? "producao" : "desconto_direto",
                subInputs: event.target.checked && !row.subInputs.length ? [newInput()] : row.subInputs })} />
            É produzido: tem receita própria
          </label>
        </div>
        {row.isProduced && <fieldset className="min-w-0 space-y-3 border-l-2 border-primary/30 pl-3" disabled={disabled || row.recipeCreated}>
          <legend className="mb-2 text-xs font-medium text-foreground">Receita de {materialName(row, rawMaterials) || "novo insumo"}</legend>
          <label className={labelClass} htmlFor={`${row.key}-output`}>
            <span>Quantidade de referência da receita ({unit})</span>
            <Input id={`${row.key}-output`} aria-label="Quantidade de referência da receita" type="number" min="0.001" step="any"
              data-tooltip="Quanto esta receita rende, na unidade do item produzido. Ex.: receita para 1 kg de molho. Os insumos-base abaixo correspondem a esse rendimento; a produção real é lançada depois."
              value={row.outputQuantity} onChange={event => updateRow(row.key, { outputQuantity: event.target.value })} className="h-9 min-w-0 text-xs sm:max-w-48" />
          </label>
          {!positive(row.outputQuantity) && <p className="text-[11px] text-amber-600">Informe o rendimento da receita.</p>}
          <p className="text-xs text-muted-foreground">Informe os insumos-base para {row.outputQuantity || "…"} {unit}. Você pode criar cada um aqui, mesmo sem estoque disponível.</p>
          {row.subInputs.map(input => <MaterialFields key={input.key} input={input} materials={rawMaterials} unlocked={unlocked.has(input.rawMaterialId)} base disabled={disabled || row.recipeCreated}
            onChange={patch => updateSubInput(row.key, input.key, patch)}
            onRemove={() => updateRow(row.key, { subInputs: row.subInputs.filter(item => item.key !== input.key) })} />)}
          <Button type="button" variant="outline" size="sm" disabled={disabled || row.recipeCreated}
            data-tooltip="Adicione um insumo-base à receita. Preencha nome, unidade de medida e quantidade; o novo insumo será cadastrado com saldo zero."
            onClick={() => updateRow(row.key, { subInputs: [...row.subInputs, newInput()] })}><Plus className="h-3 w-3" /> Adicionar insumo-base</Button>
          {row.recipeCreated && <p className="text-xs text-muted-foreground">Receita já cadastrada. Tente salvar o item novamente para concluir o vínculo.</p>}
        </fieldset>}
        <CustomerFields row={row} fallbackName={materialName(row, rawMaterials)} disabled={disabled} onChange={patch => updateRow(row.key, patch)} />
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
          <li><strong>1. Liste os ingredientes na descrição</strong>, separados por vírgula. Ao sair do campo, cada um vira uma linha da ficha.</li>
          <li><strong>2. Em cada linha, escolha o insumo e a transformação.</strong> Use um insumo do Estoque ou crie um novo aqui.</li>
          <li><strong>3. Informe a unidade e a quantidade por item.</strong> Pode digitar em g mesmo que o estoque seja em kg: o sistema converte.</li>
          <li><strong>4. Se for feito na casa, marque "É produzido"</strong> e informe o rendimento e os insumos-base.</li>
          <li><strong>5. Marque o que o cliente vê</strong> (pode tirar, adicional R$). Sal e óleo ficam ocultos e continuam baixando.</li>
          <li><strong>6. Salve e gere a descrição com quantidades.</strong> Depois disso, editar a descrição não muda a ficha.</li>
        </ol>
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Nada é comprado ou movimentado agora. Insumo novo entra no Estoque como teórico e deixa de ser teórico na primeira compra ou produção. Item produzido entra por produção, não por compra.</p>
      </DialogContent>
    </Dialog>
  </section>;
});
RecipeBuilder.displayName = "RecipeBuilder";
export default RecipeBuilder;
