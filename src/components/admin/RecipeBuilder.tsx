import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Plus, Trash2, ChefHat, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useStockData, type RawMaterial, type ProductionRecipe } from "@/hooks/useStockData";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { toast } from "sonner";
import MenuPrefixField from '@/components/admin/MenuPrefixField';
import type { MenuRecipeDraft, RecipeMaterialDraft } from "@/lib/recipeDraft";
import { useRef } from "react";
import { STOCK_UNITS } from '@/lib/stockUnits';
import { toStockQuantity } from '@/lib/stockQuantityConversion';

interface MaterialInput {
  key: string;
  rawMaterialId: string;
  newName: string;
  newUnit: string;
  stockUnit: string;
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
  outputUnit: string;
  recipeCreated: boolean;
  subInputs: MaterialInput[];
}
export interface RecipeBuilderHandle {
  validate: () => boolean;
  importFromMenuItem: (sourceMenuItemId: string) => Promise<boolean>;
  getDraft: () => MenuRecipeDraft[];
}
interface Props { menuItemId?: string; menuItemName?: string; destination?: string; disabled?: boolean }

const emptyInput = (): MaterialInput => ({
  key: crypto.randomUUID(), rawMaterialId: "", newName: "", newUnit: "un", stockUnit: "", quantity: "",
});
const emptyRow = (): RecipeRow => ({ ...emptyInput(), isProduced: false, transformation: "desconto_direto", outputQuantity: "1", outputUnit: "un", recipeCreated: false, subInputs: [] });
const positive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
const labelClass = "block min-w-0 space-y-1 text-xs text-muted-foreground";

function MaterialFields({ input, materials, disabled, base = false, stockItemLabel = false, onChange, onRemove }: {
  input: MaterialInput; materials: RawMaterial[]; disabled: boolean; base?: boolean; stockItemLabel?: boolean;
  onChange: (patch: Partial<MaterialInput>) => void; onRemove: () => void;
}) {
  const material = materials.find(item => item.id === input.rawMaterialId);
  const unit = input.newUnit || material?.unit || "un";
  const name = base ? "Insumo-base" : stockItemLabel ? "Item do estoque" : "Insumo";
  const selectorType = stockItemLabel && !base ? "item de estoque" : "insumo";
  const canDefineUnit = !material || (material.isTheoretical && material.currentStock === 0);
  const stockUnit = input.stockUnit || material?.unit || unit;
  return <div className="min-w-0 space-y-2 rounded-lg border border-border bg-background/50 p-3">
    <div className="flex min-w-0 items-end gap-2">
      <label className={`${labelClass} flex-1`} htmlFor={`${input.key}-material`}>
        <span>{name}</span>
        <select id={`${input.key}-material`} aria-label={name} disabled={disabled}
          data-tooltip={stockItemLabel && !base ? "Selecione pelo nome um item de estoque desta unidade ou crie um novo item teórico. Use Desconto direto para baixar o estoque por venda." : "Selecione um insumo desta unidade ou crie um novo aqui. O cadastro novo terá saldo zero até uma compra ou produção."}
          value={input.rawMaterialId} onChange={event => { const selected = materials.find(item => item.id === event.target.value); onChange({ rawMaterialId: event.target.value, newName: "", newUnit: selected?.unit ?? "un", stockUnit: "" }); }}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-muted px-2 text-xs text-foreground">
          <option value="">Criar novo {selectorType}</option>
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
        onPick={suggestion => onChange({ rawMaterialId: suggestion.id, newName: '', newUnit: suggestion.unit ?? '', stockUnit: '' })}
        placeholder={base ? "Ex.: tomate" : stockItemLabel ? "Ex.: cerveja lata" : "Ex.: molho da casa"} className="h-9 min-w-0 text-xs" />
    </label>}
    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <p>Estoque controlado em <strong className="font-medium">{stockUnit}</strong></p>
      {canDefineUnit && <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="link" size="sm" disabled={disabled}
            aria-label={`Alterar unidade do estoque do ${name.toLowerCase()}`} className="h-7 px-0 text-xs">Alterar</Button>
        </DialogTrigger>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm p-4">
          <DialogHeader>
            <DialogTitle>Cadastro do {name.toLowerCase()}</DialogTitle>
            <DialogDescription>{material?.name || input.newName.trim() || `Novo ${selectorType}`} — escolha como o saldo será contado no estoque.</DialogDescription>
          </DialogHeader>
          <label className={labelClass} htmlFor={`${input.key}-stock-unit`}>
            <span>Unidade-base inicial do {name.toLowerCase()}</span>
            <select id={`${input.key}-stock-unit`} aria-label={`Unidade-base inicial do ${name.toLowerCase()}`}
              disabled={disabled} value={stockUnit}
              onChange={event => onChange({ stockUnit: event.target.value, ...(!input.quantity ? { newUnit: event.target.value } : {}) })}
              className="h-9 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground">
              {STOCK_UNITS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">A ficha pode usar outra medida compatível. Ex.: estoque em kg e consumo em g.</p>
        </DialogContent>
      </Dialog>}
    </div>
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
    {material?.isProduced && material.unit === "un" && <p className="text-xs text-muted-foreground">
      Produzido contado em unidades. Ex.: 1 hambúrguer por item do cardápio; os ingredientes em gramas são consumidos na produção.
    </p>}
    {material && toStockQuantity(1, unit, material.unit) === null && <p className="text-xs text-amber-500">
      Unidade-base cadastrada: {material.unit}. {material.isProduced ? "Use a quantidade de unidades produzidas nesta ficha." : "A medida-base das compras será verificada ao salvar a ficha."}
    </p>}
  </div>;
}

const RecipeBuilder = forwardRef<RecipeBuilderHandle, Props>(({ menuItemId, menuItemName, destination, disabled = false }, ref) => {
  const { rawMaterials, recipes, ready: stockReady, savePreparation } = useStockData();
  const { businessUnitId } = useCurrentBusinessUnit();
  const materialsRef = useRef(rawMaterials); materialsRef.current = rawMaterials;
  const recipesRef = useRef(recipes); recipesRef.current = recipes;
  const currentUnit = useRef(businessUnitId); currentUnit.current = businessUnitId;
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [loaded, setLoaded] = useState(!menuItemId);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState<string | null>(null);
  const [collapsedRecipes, setCollapsedRecipes] = useState<string[]>([]);

  const preparationFields = useCallback((recipe: ProductionRecipe | undefined, unit: string) => ({
    isProduced: Boolean(recipe), recipeCreated: Boolean(recipe), outputUnit: unit,
    outputQuantity: String(recipe?.outputQuantity ?? 1),
    subInputs: (recipe?.inputs ?? []).map(input => ({ ...emptyInput(), rawMaterialId: input.rawMaterialId,
      newUnit: materialsRef.current.find(m => m.id === input.rawMaterialId)?.unit ?? "un", quantity: String(input.quantity) })),
  }), []);

  useEffect(() => {
    setRows([]);
    if (!menuItemId) { setLoaded(true); setLoadError(""); return; }
    if (!stockReady) { setLoaded(false); return; }
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
        if (cancelled || currentUnit.current !== businessUnitId) return;
        const error = recipeResult.error ?? ingredientResult.error;
        if (error) { setLoadError("Não foi possível carregar a ficha técnica: " + error.message); return; }
        const recipeRows = (recipeResult.data ?? []).map(item => {
          const loaded = item as typeof item & { display_unit?: string | null; display_quantity?: number | null; transformacao?: string };
          const material = materialsRef.current.find(m => m.id === item.raw_material_id);
          const recipe = recipesRef.current?.find(r => r.outputRawMaterialId === item.raw_material_id);
          return { ...emptyRow(), ...preparationFields(recipe, material?.unit ?? "un"), key: item.id,
            rawMaterialId: item.raw_material_id, newUnit: loaded.display_unit || material?.unit || "un",
            quantity: String(loaded.display_quantity ?? item.quantity), transformation: (loaded.transformacao ?? "desconto_direto") as Transformation };
        });
        const linkedIds = new Set(recipeRows.map(row => row.rawMaterialId));
        const ingredientRows = (ingredientResult.data ?? [])
          .filter(ingredient => !materialsRef.current.some(material => linkedIds.has(material.id) && material.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase()))
          .map(ingredient => {
            const material = materialsRef.current.find(item => item.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase());
            const recipe = recipesRef.current?.find(r => r.outputRawMaterialId === material?.id);
            return { ...emptyRow(), ...preparationFields(recipe, material?.unit ?? "un"), key: crypto.randomUUID(),
              rawMaterialId: material?.id ?? "", newName: material ? "" : ingredient.name, newUnit: material?.unit ?? "un",
              quantity: material?.isProduced && material.unit === "un" ? "1" : "", transformation: (recipe ? "producao" : "desconto_direto") as Transformation };
          });
        setRows([...recipeRows, ...ingredientRows]);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [menuItemId, businessUnitId, retry, stockReady, preparationFields]);

  const updateRow = (key: string, patch: Partial<RecipeRow>) =>
    setRows(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
  const updateSubInput = (rowKey: string, key: string, patch: Partial<MaterialInput>) =>
    setRows(previous => previous.map(row => row.key === rowKey ? { ...row, subInputs: row.subInputs.map(input => input.key === key ? { ...input, ...patch } : input) } : row));

  const materialDraft = (input: MaterialInput): RecipeMaterialDraft => ({
    rawMaterialId: input.rawMaterialId, newName: input.newName.trim(), newUnit: input.newUnit,
    ...(input.stockUnit ? { stockUnit: input.stockUnit } : {}),
    quantity: Number(input.quantity),
  });
  const rowDraft = (row: RecipeRow, includeSaved = false): MenuRecipeDraft => ({ ...materialDraft(row), transformation: row.transformation,
    preparation: row.isProduced && (includeSaved || !row.recipeCreated) ? {
      requestId: row.key, outputQuantity: Number(row.outputQuantity), outputUnit: row.outputUnit, inputs: row.subInputs.map(materialDraft),
    } : null,
  });
  const saveProducedRecipe = async (row: RecipeRow) => {
    if (savingRecipe || row.recipeCreated || !businessUnitId || !loaded) return;
    if (!positive(row.outputQuantity) || !row.subInputs.length || row.subInputs.some(input => !positive(input.quantity))) {
      toast.error("Informe rendimento e todos os insumos-base com quantidade maior que zero."); return;
    }
    setSavingRecipe(row.key);
    try {
      const outputId = await savePreparation(rowDraft(row, true));
      if (!outputId || currentUnit.current !== businessUnitId) return;
      updateRow(row.key, { rawMaterialId: outputId, recipeCreated: true });
      setCollapsedRecipes(previous => [...previous, row.key]);
    } finally { setSavingRecipe(null); }
  };

  const validate = () => {
    const fail = (message: string) => { toast.error(message); return false; };
    if (!loaded) return fail(loadError || "Aguarde o carregamento da ficha técnica.");
    if (rows.length && !businessUnitId) return fail("Selecione uma unidade antes de cadastrar os insumos da ficha técnica.");
    const validMaterial = (input: MaterialInput) => (input.rawMaterialId || input.newName.trim()) && STOCK_UNITS.some(u => u === input.newUnit) && (!input.stockUnit || STOCK_UNITS.some(u => u === input.stockUnit)) && positive(input.quantity);
    for (const [index, row] of rows.entries()) {
      if (!validMaterial(row)) return fail(`Insumo ${index + 1}: informe nome, unidade de medida e quantidade maior que zero.`);
      if (row.isProduced && !row.recipeCreated && (!positive(row.outputQuantity) || !STOCK_UNITS.some(u => u === row.outputUnit) || !row.subInputs.length || row.subInputs.some(input => !validMaterial(input))))
        return fail(`Receita do insumo ${index + 1}: informe a quantidade de referência e os insumos-base com nome, unidade e quantidade maior que zero.`);
    }
    return true;
  };

  useImperativeHandle(ref, () => ({
    validate,
    importFromMenuItem: async sourceMenuItemId => {
      if (!businessUnitId || !loaded) return false;
      const [source, lines] = await Promise.all([
        supabase.from("menu_items").select("id").eq("id", sourceMenuItemId).eq("business_unit_id", businessUnitId).single(),
        supabase.from("recipe_items").select("raw_material_id,quantity,display_quantity,display_unit,transformacao").eq("menu_item_id", sourceMenuItemId),
      ]);
      if (currentUnit.current !== businessUnitId) return false;
      if (source.error || lines.error) {
        toast.error("Não foi possível carregar a ficha de Documentos.");
        return false;
      }
      if (!lines.data?.length) {
        toast.error("Esta ficha ainda não tem ingredientes e quantidades gravados.");
        return false;
      }
      const imported = lines.data.map(line => {
        const material = rawMaterials.find(m => m.id === line.raw_material_id);
        const recipe = recipes?.find(r => r.outputRawMaterialId === line.raw_material_id);
        const transformation = (line.transformacao ?? "desconto_direto") as Transformation;
        return { ...emptyRow(), ...preparationFields(recipe, material?.unit ?? "un"), rawMaterialId: line.raw_material_id,
          newUnit: line.display_unit || material?.unit || "un",
          quantity: String(line.display_quantity ?? line.quantity),
          transformation };
      });
      setRows(imported);
      toast.success("Ficha carregada. Revise e salve para vincular ao item.");
      return true;
    },
    getDraft: () => rows.map(row => rowDraft(row)),
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
        data-tooltip="Adicione um item existente do estoque ou crie um novo cadastro teórico, sem movimentar saldo."><Plus className="h-3 w-3" /> {destination === "bar" ? "Adicionar item do estoque" : "Adicionar insumo"}</Button>
    </div>
    <p className="text-xs text-muted-foreground">Monte os insumos e as quantidades por item. Os novos cadastros e receitas serão salvos junto com o item, sem movimentar estoque.</p>
    {destination === "bar" && <p className="rounded-md border border-border bg-background/50 p-2 text-xs text-muted-foreground">Bebida pronta: selecione pelo nome o item do estoque e use <strong>Desconto direto</strong>. Se for preparada na cozinha, selecione o setor Cozinha no item e configure <strong>Produção</strong> nesta ficha.</p>}
    {!loaded && !loadError && <p className="text-xs text-muted-foreground" role="status">Carregando ficha técnica…</p>}
    {loadError && <div role="alert" className="space-y-2 text-xs text-destructive">{loadError}<br />
      <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div>}
    {loaded && !rows.length && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Clique em “Adicionar insumo” para começar a ficha técnica.</p>}
    {rows.map(row => {
      const unit = row.outputUnit;
      return <div key={row.key} className="min-w-0 space-y-3 rounded-lg bg-secondary/30 p-3">
        <MaterialFields input={row} materials={rawMaterials} disabled={disabled} stockItemLabel={destination === "bar"}
          onChange={patch => {
            if (patch.rawMaterialId !== undefined) {
              const material = rawMaterials.find(m => m.id === patch.rawMaterialId);
              const recipe = recipes?.find(r => r.outputRawMaterialId === patch.rawMaterialId);
              updateRow(row.key, { ...patch, ...preparationFields(recipe, material?.unit ?? patch.newUnit ?? "un"),
                quantity: material?.isProduced && material.unit === "un" ? "1" : row.quantity,
                transformation: recipe ? "producao" : "desconto_direto" });
            } else updateRow(row.key, { ...patch, ...(patch.newUnit && !row.isProduced ? { outputUnit: patch.newUnit } : {}) });
          }}
          onRemove={() => setRows(previous => previous.filter(item => item.key !== row.key))} />
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" disabled={disabled} checked={row.isProduced} aria-label="É produzido: tem receita própria"
            data-tooltip="Ative para um insumo preparado na casa, como molho ou massa. Cadastre abaixo os insumos-base e as quantidades da receita."
            onChange={event => updateRow(row.key, { isProduced: event.target.checked, outputUnit: row.newUnit, transformation: event.target.checked ? "producao" : "desconto_direto",
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
            <span>Rendimento da receita ({unit})</span>
            <Input id={`${row.key}-output`} aria-label="Quantidade de referência da receita" type="number" min="0.001" step="any"
              data-tooltip="Quanto esta receita representa na unidade do insumo produzido. Ex.: receita para 1 kg de molho. Os insumos-base abaixo devem corresponder a essa quantidade; a produção real é lançada depois."
              value={row.outputQuantity} onChange={event => updateRow(row.key, { outputQuantity: event.target.value })} className="h-9 min-w-0 text-xs sm:max-w-48" />
          </label>
          <label className={labelClass} htmlFor={`${row.key}-output-unit`}>
            <span>Unidade do rendimento</span>
            <select id={`${row.key}-output-unit`} aria-label="Unidade do rendimento" value={row.outputUnit}
              className="h-9 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground"
              onChange={event => {
                const outputUnit = event.target.value;
                const incompatible = toStockQuantity(1, row.newUnit, outputUnit) === null;
                updateRow(row.key, { outputUnit, ...(!row.rawMaterialId && incompatible ? { stockUnit: outputUnit } : {}), ...(incompatible ? { newUnit: outputUnit, quantity: outputUnit === "un" ? "1" : "" } : {}) });
              }}>
              {STOCK_UNITS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">O rendimento pode ser 1 un e usar ingredientes em g ou kg. Na venda, informe quantas unidades produzidas entram no prato.</p>
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
