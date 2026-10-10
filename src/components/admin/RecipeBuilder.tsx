import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Plus, Trash2, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useStockData, type RawMaterial, type ItemType } from "@/hooks/useStockData";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { toast } from "sonner";
import MenuPrefixField from '@/components/admin/MenuPrefixField';

interface MaterialInput {
  key: string;
  rawMaterialId: string;
  newName: string;
  newUnit: string;
  quantity: string;
}
interface RecipeRow extends MaterialInput {
  isProduced: boolean;
  outputQuantity: string;
  recipeCreated: boolean;
  subInputs: MaterialInput[];
}
export interface RecipeBuilderHandle {
  validate: () => boolean;
  commit: (menuItemId: string) => Promise<boolean>;
}
interface Props { menuItemId?: string; disabled?: boolean }

const emptyInput = (): MaterialInput => ({
  key: crypto.randomUUID(), rawMaterialId: "", newName: "", newUnit: "un", quantity: "",
});
const emptyRow = (): RecipeRow => ({ ...emptyInput(), isProduced: false, outputQuantity: "1", recipeCreated: false, subInputs: [] });
const positive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
const labelClass = "block min-w-0 space-y-1 text-xs text-muted-foreground";

function MaterialFields({ input, materials, disabled, base = false, onChange, onRemove }: {
  input: MaterialInput; materials: RawMaterial[]; disabled: boolean; base?: boolean;
  onChange: (patch: Partial<MaterialInput>) => void; onRemove: () => void;
}) {
  const material = materials.find(item => item.id === input.rawMaterialId);
  const unit = material?.unit ?? input.newUnit;
  const name = base ? "Insumo-base" : "Insumo";
  return <div className="min-w-0 space-y-2 rounded-lg border border-border bg-background/50 p-3">
    <div className="flex min-w-0 items-end gap-2">
      <label className={`${labelClass} flex-1`} htmlFor={`${input.key}-material`}>
        <span>{name}</span>
        <select id={`${input.key}-material`} aria-label={name} disabled={disabled}
          data-tooltip="Selecione um insumo desta unidade ou crie um novo aqui. O cadastro novo terá saldo zero até uma compra ou produção."
          value={input.rawMaterialId} onChange={event => onChange({ rawMaterialId: event.target.value, newName: "" })}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-muted px-2 text-xs text-foreground">
          <option value="">Criar novo insumo</option>
          {materials.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
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
          suggestions={materials.map(row => ({ id: row.id, label: row.name, value: row.name, kind: 'material', unit: row.unit }))}
          onPick={suggestion => onChange({ rawMaterialId: suggestion.id, newName: '', newUnit: suggestion.unit ?? '' })}
          placeholder={base ? "Ex.: tomate" : "Ex.: molho da casa"} className="h-9 min-w-0 text-xs" />
      </label>}
      <label className={labelClass} htmlFor={`${input.key}-unit`}>
        <span>Unidade de medida</span>
        <Input id={`${input.key}-unit`} aria-label={`Unidade de medida do ${name.toLowerCase()}`}
          data-tooltip={input.rawMaterialId ? "Use a unidade já cadastrada para este insumo. Converta a quantidade antes de preencher a ficha." : "Defina a unidade usada nesta ficha e no estoque: g, kg, ml, L ou un. Não é um lançamento de compra."}
          disabled={disabled} readOnly={Boolean(input.rawMaterialId)} value={unit}
          onChange={event => onChange({ newUnit: event.target.value })} placeholder="g, kg, ml, L, un" className="h-9 min-w-0 text-xs" />
      </label>
      <label className={labelClass} htmlFor={`${input.key}-quantity`}>
        <span>{base ? "Quantidade na receita" : "Quantidade por item"}{unit ? ` (${unit})` : ""}</span>
        <Input id={`${input.key}-quantity`} aria-label={base ? "Quantidade do insumo-base" : "Quantidade do insumo por item"}
          data-tooltip={base ? "Quantidade deste insumo-base necessária para a quantidade de referência da receita. Informe na unidade exibida." : "Quantidade consumida para preparar uma unidade do item do cardápio. Informe na unidade exibida."}
          type="number" min="0.001" step="any" disabled={disabled} value={input.quantity}
          onChange={event => onChange({ quantity: event.target.value })} placeholder="Ex.: 0,150" className="h-9 min-w-0 text-xs" />
      </label>
    </div>
  </div>;
}

const RecipeBuilder = forwardRef<RecipeBuilderHandle, Props>(({ menuItemId, disabled = false }, ref) => {
  const { rawMaterials, createRawMaterialRecord, createRecipe } = useStockData();
  const { businessUnitId } = useCurrentBusinessUnit();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [loaded, setLoaded] = useState(!menuItemId);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!menuItemId) { setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    setLoadError("");
    void supabase.from("recipe_items").select("id, raw_material_id, quantity").eq("menu_item_id", menuItemId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setLoadError("Não foi possível carregar a ficha técnica: " + error.message); return; }
        setRows((data ?? []).map(item => ({ ...emptyRow(), key: item.id, rawMaterialId: item.raw_material_id, quantity: String(item.quantity) })));
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [menuItemId, retry]);

  const updateRow = (key: string, patch: Partial<RecipeRow>) =>
    setRows(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
  const updateSubInput = (rowKey: string, key: string, patch: Partial<MaterialInput>) =>
    setRows(previous => previous.map(row => row.key === rowKey ? { ...row, subInputs: row.subInputs.map(input => input.key === key ? { ...input, ...patch } : input) } : row));

  const validate = () => {
    const fail = (message: string) => { toast.error(message); return false; };
    if (!loaded) return fail(loadError || "Aguarde o carregamento da ficha técnica.");
    if (rows.length && !businessUnitId) return fail("Selecione uma unidade antes de cadastrar os insumos da ficha técnica.");
    const validMaterial = (input: MaterialInput) => (input.rawMaterialId || (input.newName.trim() && input.newUnit.trim())) && positive(input.quantity);
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
      const payload: { id: string; menu_item_id: string; raw_material_id: string; quantity: number }[] = [];
      for (const row of rows) {
        const id = await resolve(row, row.isProduced ? "semiacabado" : "insumo", id => updateRow(row.key, { rawMaterialId: id }));
        if (!id) return false;
        if (row.isProduced && !row.recipeCreated) {
          const inputs: { rawMaterialId: string; quantity: number }[] = [];
          for (const input of row.subInputs) {
            const baseId = await resolve(input, "insumo", id => updateSubInput(row.key, input.key, { rawMaterialId: id }));
            if (!baseId) return false;
            inputs.push({ rawMaterialId: baseId, quantity: Number(input.quantity) });
          }
          if (!await createRecipe({ name: `Receita — ${row.newName.trim()}`, outputRawMaterialId: id,
            outputQuantity: Number(row.outputQuantity), shelfLifeDays: null, inputs })) return false;
          updateRow(row.key, { recipeCreated: true });
        }
        payload.push({ id: row.key, menu_item_id: targetMenuItemId, raw_material_id: id, quantity: Number(row.quantity) });
      }
      // Save before removing obsolete rows so a failed write does not erase the
      // existing recipe. Stable row IDs also make a retry update the same rows.
      const existing = await supabase.from("recipe_items").select("id").eq("menu_item_id", targetMenuItemId);
      if (existing.error) { toast.error("Erro ao consultar ficha técnica: " + existing.error.message); return false; }
      if (payload.length) {
        const { error } = await supabase.from("recipe_items").upsert(payload, { onConflict: "id" });
        if (error) { toast.error("Erro ao salvar ficha técnica: " + error.message); return false; }
      }
      const retained = new Set(payload.map(item => item.id));
      const removed = (existing.data ?? []).filter(item => !retained.has(item.id)).map(item => item.id);
      if (removed.length) {
        const { error } = await supabase.from("recipe_items").delete().eq("menu_item_id", targetMenuItemId).in("id", removed);
        if (error) { toast.error("Erro ao remover insumos da ficha técnica: " + error.message); return false; }
      }
      return true;
    },
  }));

  return <section className="min-w-0 space-y-3" aria-label="Ficha técnica do item">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 tabIndex={0} data-tooltip="Monte primeiro o cardápio e a ficha técnica. Os novos insumos são cadastrados no estoque com saldo zero; compras e produção são lançadas depois."
        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><ChefHat className="h-3.5 w-3.5" /> Ficha técnica</h4>
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
        {!row.rawMaterialId && <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" disabled={disabled} checked={row.isProduced} aria-label="É produzido: tem receita própria"
            data-tooltip="Ative para um insumo preparado na casa, como molho ou massa. Cadastre abaixo os insumos-base e as quantidades da receita."
            onChange={event => updateRow(row.key, { isProduced: event.target.checked,
              subInputs: event.target.checked && !row.subInputs.length ? [emptyInput()] : row.subInputs })} />
          É produzido: tem receita própria
        </label>}
        {row.isProduced && <fieldset className="min-w-0 space-y-3 border-l-2 border-primary/30 pl-3" disabled={disabled || row.recipeCreated}>
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
          {row.recipeCreated && <p className="text-xs text-muted-foreground">Receita já cadastrada. Tente salvar o item novamente para concluir o vínculo.</p>}
        </fieldset>}
      </div>;
    })}
  </section>;
});
RecipeBuilder.displayName = "RecipeBuilder";
export default RecipeBuilder;
