import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  Flame,
  Plus,
  Package,
  Factory,
  Truck,
  AlertTriangle,
  Tag,
  Trash2,
  Search,
  CalendarClock,
  Boxes,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useStockData, ProductionRecipeInput, ItemType, FichaTipo, alocarFefo } from "@/hooks/useStockData";
import { STOCK_UNITS } from "@/lib/stockUnits";
import { STOCK_CATEGORIES, stockCategory, type StockCategory } from "@/lib/stockCategories";

import StockOCRDialog, { type StockOCRItem } from "./StockOCRDialog";

type SubView = StockCategory | "produzidos" | "producao" | "fornecedores";

const STATUS_LABELS: Record<string, string> = {
  valido: "Válido",
  vence_hoje: "Vence hoje",
  vence_em_breve: "Vence em breve",
  vencido: "Vencido",
  sem_validade: "Sem validade",
};
const STATUS_COLORS: Record<string, string> = {
  valido: "bg-success/15 text-success-foreground border-success/30",
  vence_hoje: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  vence_em_breve: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  vencido: "bg-destructive/15 text-destructive border-destructive/30",
  sem_validade: "bg-muted text-muted-foreground border-border",
};

const ITEM_TYPE_OPTIONS: { value: ItemType; label: string; hint: string }[] = [
  { value: "insumo", label: "Insumo", hint: "comprado de fornecedor, usado em receitas" },
  { value: "semiacabado", label: "Semiacabado", hint: "produzido internamente, vira insumo de outra receita" },
  { value: "produto_acabado", label: "Produto acabado", hint: "produzido internamente, pronto para venda" },
  { value: "revenda", label: "Revenda", hint: "comprado pronto, vendido sem transformação" },
];
const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  insumo: "Insumo",
  semiacabado: "Semiacabado",
  produto_acabado: "Produto acabado",
  revenda: "Revenda",
};

const FICHA_TIPO_OPTIONS: { value: FichaTipo; label: string }[] = [
  { value: "producao", label: "Produção" },
  { value: "mise_en_place", label: "Mise en place" },
  { value: "porcionamento", label: "Porcionamento" },
];

const UnitStockTab = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [removingMaterial,setRemovingMaterial] = useState<string | null>(null);
  const {
    rawMaterials,
    suppliers,
    recipes,
    labels,
    alerts,
    lotes,
    loading,
    createRawMaterial,
    refreshAll,
    updateRawMaterialCategory,
    registerPurchase,
    managePurchaseLot,
    createSupplier,
    createRecipe,
    produceBatch,
    error: stockError,
  } = useStockData();

  const removeMaterialCard = async (id:string,name:string) => {
    if(!businessUnitId || removingMaterial || !window.confirm(`Remover o card de "${name}" do estoque? O histórico será preservado.`)) return;
    setRemovingMaterial(id);
    try {
      const checks = await Promise.all([
        supabase.from("recipe_items").select("id").eq("raw_material_id",id).limit(1),
        supabase.from("production_recipe_inputs").select("id").eq("raw_material_id",id).limit(1),
        supabase.from("production_recipes").select("id").eq("output_raw_material_id",id).limit(1),
        supabase.from("lotes").select("id").eq("raw_material_id",id).limit(1),
        supabase.from("stock_movements").select("id").eq("raw_material_id",id).limit(1),
      ]);
      if(checks.some(result=>result.error)) throw new Error("Não foi possível verificar os vínculos do insumo.");
      if(checks.some(result=>(result.data?.length??0)>0)) {
        toast.error("Insumo vinculado a fichas, lotes ou movimentações. Remova os vínculos ativos antes de arquivar; o histórico não será apagado.");
        return;
      }
      const {error} = await supabase.from("raw_materials").update({active:false})
        .eq("id",id).eq("business_unit_id",businessUnitId);
      if(error) throw error;
      toast.success("Card de insumo removido. Cadastro arquivado sem excluir o histórico.");
      await refreshAll();
    }catch(error){toast.error(error instanceof Error?error.message:"Não foi possível remover o card.");}
    finally{setRemovingMaterial(null);}
  };
  const [view, setView] = useState<SubView>("insumos");
  const [search, setSearch] = useState("");

  const [newMaterialOpen, setNewMaterialOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [ocrOpen, setOCROpen] = useState(false);
  const [purchaseTarget, setPurchaseTarget] = useState<string | null>(null);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newRecipeOpen, setNewRecipeOpen] = useState(false);
  const [produceOpen, setProduceOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [matName, setMatName] = useState("");
  const [matUnit, setMatUnit] = useState("");
  const [matItemType, setMatItemType] = useState<ItemType>("insumo");
  const [matCategoria, setMatCategoria] = useState<StockCategory>("insumos");
  const [matMinStock, setMatMinStock] = useState("");

  const [pQuantity, setPQuantity] = useState("");
  const [pUnitCost, setPUnitCost] = useState("");
  const [pTotalCost, setPTotalCost] = useState("");
  const [pPurchaseUnit, setPPurchaseUnit] = useState("");
  const [pConversion, setPConversion] = useState("1");
  const [pSupplierId, setPSupplierId] = useState<string>("");
  const [pValidade, setPValidade] = useState("");
  const [pDataEntrada, setPDataEntrada] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [pNumeroLote, setPNumeroLote] = useState("");

  const [supName, setSupName] = useState("");
  const [supDocument, setSupDocument] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supEmail, setSupEmail] = useState("");

  const [recName, setRecName] = useState("");
  const [recOutputId, setRecOutputId] = useState<string>("");
  const [recOutputQty, setRecOutputQty] = useState("");
  const [recShelfDays, setRecShelfDays] = useState("");
  const [recTipo, setRecTipo] = useState<FichaTipo>("producao");
  const [recPerdaEsperada, setRecPerdaEsperada] = useState("");
  const [recTempoProducao, setRecTempoProducao] = useState("");
  const [recInputs, setRecInputs] = useState<ProductionRecipeInput[]>([{ rawMaterialId: "", quantity: 0 }]);

  const [prodRecipeId, setProdRecipeId] = useState<string>("");
  const [prodQuantity, setProdQuantity] = useState("");
  const [prodNotes, setProdNotes] = useState("");
  const [prodInputs, setProdInputs] = useState<{ rawMaterialId: string; quantityUsed: number }[]>([]);

  // Prévia do FEFO: de qual(is) lote(s) cada insumo do "Produzir Lote" vai
  // sair, antes de confirmar. Puramente informativo — quem decide de
  // verdade, na hora de salvar, é o banco, com saldo atualizado e bloqueio
  // dos insumos. A prévia pode mudar se outro pedido consumir esses lotes.
  const fefoPreview = useMemo(() => {
    const preview: Record<string, ReturnType<typeof alocarFefo>> = {};
    prodInputs.forEach((inp) => {
      if (!inp.rawMaterialId || inp.quantityUsed <= 0) return;
      preview[inp.rawMaterialId] = alocarFefo(inp.rawMaterialId, inp.quantityUsed, lotes);
    });
    return preview;
  }, [prodInputs, lotes]);

  const materialsById = useMemo(
    () => Object.fromEntries(rawMaterials.map((m) => [m.id, m])),
    [rawMaterials]
  );

  // Um preparo só pertence ao estoque físico após sua primeira produção
  // (ou quando existir um lote de origem produção). Antes, sua receita fica em Produção.
  const isProducedMaterial = (m: (typeof rawMaterials)[number]) =>
    m.isProduced || m.itemType === "semiacabado" || m.itemType === "produto_acabado";
  const hasProductionHistory = (id: string) =>
    lotes.some(l => l.rawMaterialId === id && l.origem === "producao") ||
    labels.some(label => label.productName === materialsById[id]?.name);
  const isCategoryView = (value: SubView): value is StockCategory =>
    STOCK_CATEGORIES.some(category => category.value === value);
  const filteredMaterials = rawMaterials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    (view === "produzidos"
      ? isProducedMaterial(m) && hasProductionHistory(m.id)
      : isCategoryView(view) && !isProducedMaterial(m) &&
        stockCategory(m.categoria, m.itemType) === view)
  );

  const resetMaterialForm = () => {
    setMatName("");
    setMatUnit("");
    setMatItemType("insumo");
    setMatCategoria("insumos");
    setMatMinStock("");
  };

  const resetPurchaseForm = () => {
    setPQuantity("");
    setPUnitCost("");
    setPTotalCost("");
    setPPurchaseUnit("");
    setPConversion("1");
    setPSupplierId("");
    setPValidade("");
    setPDataEntrada(new Date().toLocaleDateString("en-CA"));
    setPNumeroLote("");
    setPurchaseTarget(null);
    setEditingLotId(null);
  };

  const reviewOCRItem = (item: StockOCRItem, materialId: string, mode: "documento" | "produtos") => {
    resetPurchaseForm();
    setPurchaseTarget(materialId);
    const unit = materialsById[materialId]?.unit ?? "";
    setPPurchaseUnit(unit);
    // Foto de geladeira não distingue mercadoria nova: quantidade sempre digitada na conferência.
    const detectedUnit = item.unidade.trim().toLowerCase();
    const sameUnit = detectedUnit === unit.toLowerCase();
    if (mode === "documento" && sameUnit) {
      setPQuantity(item.quantidade && item.quantidade > 0 ? String(item.quantidade) : "");
      setPUnitCost(item.valorUnitario != null ? String(item.valorUnitario) : "");
    }
    setPNumeroLote(item.lote ?? "");
    setPValidade(item.validade ?? "");
    setOCROpen(false);
    setPurchaseOpen(true);
  };

  const resetSupplierForm = () => {
    setSupName("");
    setSupDocument("");
    setSupPhone("");
    setSupEmail("");
  };

  const resetRecipeForm = () => {
    setRecName("");
    setRecOutputId("");
    setRecOutputQty("");
    setRecShelfDays("");
    setRecTipo("producao");
    setRecPerdaEsperada("");
    setRecTempoProducao("");
    setRecInputs([{ rawMaterialId: "", quantity: 0 }]);
  };

  const resetProduceForm = () => {
    setProdRecipeId("");
    setProdQuantity("");
    setProdNotes("");
    setProdInputs([]);
  };

  const handleCreateMaterial = async () => {
    if (!matName.trim() || !matUnit.trim()) return;
    setSaving(true);
    const ok = await createRawMaterial({
      name: matName.trim(),
      unit: matUnit.trim(),
      itemType: matItemType,
      minStock: Number(matMinStock) || 0,
      categoria: matCategoria.trim() || null,
    });
    setSaving(false);
    if (ok) {
      setNewMaterialOpen(false);
      resetMaterialForm();
    }
  };

  const openPurchase = (rawMaterialId: string) => {
    resetPurchaseForm();
    const material = materialsById[rawMaterialId];
    const previous = lotes
      .filter((l) => l.rawMaterialId === rawMaterialId && l.origem === "compra")
      .sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada))[0];
    // Prefill only; all values remain independently editable.
    setPPurchaseUnit(previous?.unidadeCompra || material?.unit || "");
    setPConversion(String(previous?.fatorConversao ?? 1));
    setPQuantity(previous?.quantidadeCompra != null ? String(previous.quantidadeCompra) : "");
    setPTotalCost(previous?.custoTotal != null ? String(previous.custoTotal) : "");
    setPUnitCost(previous?.custoTotal != null && previous?.quantidadeCompra
      ? String(previous.custoTotal / previous.quantidadeCompra) : "");
    setPSupplierId(previous?.fornecedorId || "");
    setPValidade(previous?.validade || "");
    setPNumeroLote(""); // Never reuse the previous lot identifier.
    setEditingLotId(null);
    setPurchaseTarget(rawMaterialId);
    setPurchaseOpen(true);
  };

  const openEditLot = (lot: (typeof lotes)[number]) => {
    resetPurchaseForm();
    setEditingLotId(lot.id);
    setPurchaseTarget(lot.rawMaterialId);
    setPQuantity(String(lot.quantidadeCompra ?? lot.quantidadeEntrada));
    setPPurchaseUnit(lot.unidadeCompra || materialsById[lot.rawMaterialId]?.unit || "");
    setPConversion(String(lot.fatorConversao ?? 1));
    const cost = lot.custoTotal ?? (lot.precoUnitario == null ? null : lot.precoUnitario * lot.quantidadeEntrada);
    setPTotalCost(cost == null ? "" : String(cost));
    setPUnitCost(cost == null ? "" : String(cost / (lot.quantidadeCompra ?? lot.quantidadeEntrada)));
    setPSupplierId(lot.fornecedorId || "");
    setPValidade(lot.validade || "");
    setPDataEntrada(lot.dataEntrada.slice(0, 10));
    setPNumeroLote(lot.numeroLote);
    setPurchaseOpen(true);
  };

  const purchaseBaseUnit = purchaseTarget ? materialsById[purchaseTarget]?.unit || "" : "";
  const samePurchaseUnit = pPurchaseUnit === purchaseBaseUnit;
  const automaticConversions: Record<string, number> = { "kg:g": 1000, "g:kg": 0.001, "L:ml": 1000, "ml:L": 0.001 };
  const automaticConversion = samePurchaseUnit ? 1 : automaticConversions[`${pPurchaseUnit}:${purchaseBaseUnit}`];
  const requiresManualConversion = Boolean(pPurchaseUnit && purchaseBaseUnit && automaticConversion === undefined);
  const crossDimension = (["kg", "g"].includes(pPurchaseUnit) && ["un", "L", "ml"].includes(purchaseBaseUnit)) ||
    (["L", "ml"].includes(pPurchaseUnit) && ["un", "kg", "g"].includes(purchaseBaseUnit)) ||
    (pPurchaseUnit === "un" && ["kg", "g", "L", "ml"].includes(purchaseBaseUnit));

  const handleRegisterPurchase = async () => {
    if (!purchaseTarget || !pQuantity || !pPurchaseUnit.trim()) return;
    const purchaseQuantity = Number(pQuantity);
    const conversionFactor = automaticConversion ?? Number(pConversion);
    if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0 ||
        !Number.isFinite(conversionFactor) || conversionFactor <= 0) return;
    const normalizedQuantity = purchaseQuantity * conversionFactor;
    const totalCost = pTotalCost === "" ? null : Number(pTotalCost);
    if (totalCost !== null && (!Number.isFinite(totalCost) || totalCost < 0)) return;
    setSaving(true);
    const ok = editingLotId
      ? await managePurchaseLot(editingLotId, "edit", {
          quantidade_compra: purchaseQuantity,
          fator_conversao: conversionFactor,
          unidade_compra: pPurchaseUnit,
          custo_total: totalCost,
          fornecedor_id: pSupplierId || null,
          validade: pValidade || null,
          numero_lote: pNumeroLote.trim(),
          // Preserve historical packaging details when editing an existing lot.
          caixas: lotes.find(l => l.id === editingLotId)?.caixas ?? null,
          conteudo_por_caixa: lotes.find(l => l.id === editingLotId)?.conteudoPorCaixa ?? null,
        })
      : await registerPurchase({
      rawMaterialId: purchaseTarget,
      quantity: normalizedQuantity,
      purchaseQuantity,
      purchaseUnit: pPurchaseUnit,
      conversionFactor,
      totalCost,
      unitCost: totalCost === null ? null : totalCost / normalizedQuantity,
      supplierId: pSupplierId || null,
      validade: pValidade || null,
      dataEntrada: pDataEntrada,
      numeroLote: pNumeroLote.trim() || null,
    });
    setSaving(false);
    if (ok) {
      setPurchaseOpen(false);
      resetPurchaseForm();
    }
  };

  const handleCreateSupplier = async () => {
    if (!supName.trim()) return;
    setSaving(true);
    const ok = await createSupplier({
      name: supName.trim(),
      document: supDocument.trim(),
      phone: supPhone.trim(),
      email: supEmail.trim(),
    });
    setSaving(false);
    if (ok) {
      setNewSupplierOpen(false);
      resetSupplierForm();
    }
  };

  const updateRecInput = (idx: number, patch: Partial<ProductionRecipeInput>) => {
    setRecInputs((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleCreateRecipe = async () => {
    if (!recName.trim() || !recOutputId || !recOutputQty) return;
    setSaving(true);
    const ok = await createRecipe({
      name: recName.trim(),
      outputRawMaterialId: recOutputId,
      outputQuantity: Number(recOutputQty),
      shelfLifeDays: recShelfDays ? Number(recShelfDays) : null,
      tipo: recTipo,
      perdaEsperada: recPerdaEsperada ? Number(recPerdaEsperada) : null,
      tempoProducao: recTempoProducao ? Number(recTempoProducao) : null,
      inputs: recInputs.filter((i) => i.rawMaterialId && i.quantity > 0),
    });
    setSaving(false);
    if (ok) {
      setNewRecipeOpen(false);
      resetRecipeForm();
    }
  };

  const openProduce = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe || !recipe.active) return;
    setProdRecipeId(recipeId);
    setProdQuantity(recipe ? String(recipe.outputQuantity) : "");
    setProdInputs(recipe ? recipe.inputs.map((i) => ({ rawMaterialId: i.rawMaterialId, quantityUsed: i.quantity })) : []);
    setProduceOpen(true);
  };

  const selectedProductionRecipe = recipes.find((recipe) => recipe.id === prodRecipeId);
  const outputUnit = selectedProductionRecipe ? materialsById[selectedProductionRecipe.outputRawMaterialId]?.unit : "";
  const outputQuantity = Number(prodQuantity);
  const invalidProductionQuantity = !Number.isFinite(outputQuantity) || outputQuantity <= 0;
  const insufficientInputs = prodInputs.filter((input) => {
    const material = materialsById[input.rawMaterialId];
    return !material || !Number.isFinite(input.quantityUsed) || input.quantityUsed <= 0 ||
      input.quantityUsed > material.currentStock;
  });
  const handleProductionQuantityChange = (value: string) => {
    setProdQuantity(value);
    const recipe = selectedProductionRecipe;
    const quantity = Number(value);
    if (!recipe || !Number.isFinite(quantity) || quantity <= 0 || recipe.outputQuantity <= 0) {
      setProdInputs([]);
      return;
    }
    const factor = quantity / recipe.outputQuantity;
    setProdInputs(recipe.inputs.map((input) => ({
      rawMaterialId: input.rawMaterialId,
      quantityUsed: Number((input.quantity * factor).toFixed(6)),
    })));
  };

  const handleProduceBatch = async () => {
    if (!prodRecipeId || invalidProductionQuantity || !prodInputs.length || insufficientInputs.length) return;
    setSaving(true);
    const ok = await produceBatch({
      recipeId: prodRecipeId,
      quantityProduced: Number(prodQuantity),
      notes: prodNotes,
      inputsUsed: prodInputs.filter((i) => i.rawMaterialId && i.quantityUsed > 0),
    });
    setSaving(false);
    if (ok) {
      setProduceOpen(false);
      resetProduceForm();
    }
  };

  if (stockError) return <div role="alert" className="space-y-3 rounded-lg border border-destructive p-4">
    <p>Não foi possível carregar o estoque desta unidade.</p>
    <Button variant="outline" onClick={() => void refreshAll()}>Tentar novamente</Button>
  </div>;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Flame className="h-6 w-6 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => setOCROpen(true)}>Entrada por foto ou nota</Button>
      {businessUnitId && <StockOCRDialog open={ocrOpen} onOpenChange={setOCROpen} businessUnitId={businessUnitId} materials={rawMaterials} onReview={reviewOCRItem} />}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-2">
            <AlertTriangle className="h-4 w-4" />
            {alerts.length} insumo{alerts.length > 1 ? "s" : ""} no estoque mínimo ou abaixo
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <Badge key={a.id} variant="outline" className="border-destructive/40 text-destructive">
                {a.name}: {a.currentStock} {a.unit} (mín. {a.minStock})
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/30 p-1" role="tablist" aria-label="Áreas operacionais">
        {([
          { key: "insumos" as const, label: "Estoque", icon: Package },
          { key: "producao" as const, label: "Produção", icon: Factory },
          { key: "fornecedores" as const, label: "Fornecedores", icon: Truck },
        ]).map(({ key, label, icon: Icon }) => {
          const selected = key === "insumos" ? isCategoryView(view) || view === "produzidos" : view === key;
          return <button key={key} type="button" role="tab" aria-selected={selected}
            onClick={() => setView(key)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium sm:text-sm ${selected
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"}`}>
            <Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span>
          </button>;
        })}
      </div>

      {(isCategoryView(view) || view === "produzidos") && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="stock-category-filter">Categoria</label>
          <select id="stock-category-filter" value={view} onChange={event => setView(event.target.value as SubView)}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground">
            {STOCK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            <option value="produzidos">Itens produzidos</option>
          </select>
        </div>
      )}

      {(isCategoryView(view) || view === "produzidos") && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {view === "produzidos"
              ? "Somente itens com produção registrada aparecem nesta aba. Antes disso, a ficha técnica fica em Produção."
              : "Cada insumo fica cadastrado com saldo zero até a primeira entrada. Quantidade e unidade de compra são definidas individualmente em cada lote."}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar insumo..."
                className="h-10 pl-9"
              />
            </div>
            {isCategoryView(view) && <Button data-tooltip="Cadastrar insumo teórico nesta categoria." aria-label="Cadastrar insumo" onClick={() => { setMatItemType("insumo"); setMatCategoria(view); setNewMaterialOpen(true); }} size="icon" className="h-10 w-10 shrink-0">
              <Plus className="h-4 w-4" />
            </Button>}
          </div>

          {filteredMaterials.map((m) => {
            const low = m.currentStock <= m.minStock;
            return (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      {m.name}
                      {m.itemType !== "insumo" && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                          {ITEM_TYPE_LABELS[m.itemType]}
                        </Badge>
                      )}
                      {m.isTheoretical && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">
                          Teórico · aguardando 1º lote
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.categoria ? `${m.categoria} · ` : ""}Custo médio: R$ {m.averageCost.toFixed(2)} / {m.unit}
                    </p>
                  </div>
                  {isCategoryView(view) && <Button type="button" size="icon" variant="ghost"
                    aria-label={`Remover card de ${m.name}`} title="Remover card do estoque"
                    disabled={removingMaterial!==null}
                    onClick={()=>void removeMaterialCard(m.id,m.name)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>}
                  {isCategoryView(view) && <Button data-tooltip="Registrar entrada deste insumo, com quantidade, unidade, custo e dados do lote." size="sm" variant="outline" onClick={() => openPurchase(m.id)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Entrada
                  </Button>}
                </div>
                {lotes.some(l => l.rawMaterialId === m.id) && (
                  <details className="rounded-lg border border-border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Histórico de lotes ({lotes.filter(l => l.rawMaterialId === m.id).length})</summary>
                    <div className="mt-3 space-y-2">
                      {lotes.filter(l => l.rawMaterialId === m.id).sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada)).map(lot => (
                        <div key={lot.id} className="rounded-md bg-muted/40 p-3 space-y-1">
                          <div className="flex justify-between gap-2"><strong>{lot.numeroLote}</strong><span>{lot.dataEntrada.slice(0, 10)}</span></div>
                          <p>Entrada: {lot.quantidadeCompra ?? lot.quantidadeEntrada} {lot.unidadeCompra || m.unit} · Saldo: {lot.quantidadeRestante} {m.unit}</p>
                          <p>Validade: {lot.validade || "Não informada"} · Custo do lote: {lot.custoTotal == null ? "Não informado" : lot.custoTotal.toLocaleString("pt-BR", {style: "currency", currency: "BRL"})}</p>
                          {lot.origem === "compra" && <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEditLot(lot)}>Abrir / editar</Button>
                            <Button size="sm" variant="destructive" onClick={async () => { if (window.confirm(`Cancelar o lote ${lot.numeroLote}? A operação preservará o histórico.`)) await managePurchaseLot(lot.id, "cancel"); }}>Cancelar</Button>
                          </div>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {isCategoryView(view) && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Organizar em</span>
                    <select aria-label={`Categoria de ${m.name}`} value={stockCategory(m.categoria, m.itemType)}
                      onChange={event => void updateRawMaterialCategory(m.id, event.target.value)}
                      className="h-8 rounded-md border border-border bg-background px-2 text-foreground">
                      {STOCK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                )}
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  low ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground"
                }`}>
                  <span>
                    Estoque: <strong>{m.currentStock}</strong> {m.unit}
                  </span>
                  <span className="text-xs opacity-80">mín. {m.minStock} {m.unit}</span>
                </div>
              </div>
            );
          })}
          {filteredMaterials.length === 0 && (
            <p className="text-center text-muted-foreground py-8">{view === "produzidos" ? "Nenhum item produzido ainda. Use Produção para registrar o primeiro lote." : "Nenhum item cadastrado nesta categoria."}</p>
          )}
        </div>
      )}

      {view === "producao" && (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-foreground">Receitas de produção</h3><Button size="sm" onClick={() => openProduce(recipes.find(r => r.active)?.id ?? "")} disabled={!recipes.some(r => r.active)}><Factory className="h-3.5 w-3.5 mr-1" /> Produzir</Button></div>
              <Button data-tooltip="Cadastre uma receita de produção e os insumos necessários, sem produzir um lote." size="sm" variant="outline" onClick={() => setNewRecipeOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Nova receita
              </Button>
            </div>
            <div className="space-y-2">
              {recipes.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Rende {r.outputQuantity} {materialsById[r.outputRawMaterialId]?.unit ?? ""} de{" "}
                      {materialsById[r.outputRawMaterialId]?.name ?? "?"}
                      {r.shelfLifeDays ? ` · validade ${r.shelfLifeDays}d` : ""}
                    </p>
                  </div>
                  <Button data-tooltip="Informe a quantidade produzida para registrar um lote real desta receita." size="sm" onClick={() => openProduce(r.id)}>
                    <Factory className="h-3.5 w-3.5 mr-1" /> Produzir
                  </Button>
                </div>
              ))}
              {recipes.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma receita cadastrada</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Tag className="h-4 w-4" /> Etiquetas de lotes produzidos
            </h3>
            <div className="space-y-2">
              {labels.map((l) => (
                <div key={l.batchId} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-foreground">{l.productName}</p>
                    <Badge variant="outline" className={STATUS_COLORS[l.statusValidade]}>
                      {STATUS_LABELS[l.statusValidade]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lote {l.batchCode} · {l.quantityProduced} {l.unit} · produzido em{" "}
                    {new Date(l.producedAt).toLocaleDateString("pt-BR")}
                    {l.expiresAt && ` · válido até ${new Date(l.expiresAt).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
              ))}
              {labels.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhum lote produzido ainda</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Boxes className="h-4 w-4" /> Lotes (compra + produção)
            </h3>
            <div className="space-y-2">
              {lotes.map((l) => (
                <div key={l.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-foreground">
                      {materialsById[l.rawMaterialId]?.name ?? "?"}
                    </p>
                    <Badge variant="outline" className={STATUS_COLORS[l.statusValidade]}>
                      {STATUS_LABELS[l.statusValidade]}
                    </Badge>
                  </div>
                  {l.origem === "compra" && (
                    <div className="flex gap-2 mb-2">
                      <Button data-tooltip="Corrija os dados deste lote de compra, mantendo o histórico." size="sm" variant="outline" disabled={saving} onClick={() => openEditLot(l)}>Editar</Button>
                      <Button data-tooltip="Abra a confirmação para cancelar o lote de compra e ajustar o saldo." size="sm" variant="destructive" disabled={saving} onClick={async () => {
                        if (!window.confirm(`Cancelar lote ${l.numeroLote}? O histórico será preservado. Lotes consumidos não podem ser cancelados.`)) return;
                        setSaving(true);
                        try { await managePurchaseLot(l.id, "cancel"); }
                        finally { setSaving(false); }
                      }}>Excluir</Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Lote {l.numeroLote} · {l.origem === "compra" ? "compra" : "produção"} ·{" "}
                    {l.quantidadeRestante} / {l.quantidadeEntrada} {materialsById[l.rawMaterialId]?.unit ?? ""} restantes
                    {l.validade && ` · válido até ${new Date(l.validade).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
              ))}
              {lotes.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">
                  Nenhum lote registrado ainda (aplique a migration de lotes para ativar esta seção)
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {view === "fornecedores" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button data-tooltip="Cadastre um fornecedor para associar às compras de insumos." onClick={() => setNewSupplierOpen(true)} size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo fornecedor
            </Button>
          </div>
          {suppliers.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium text-foreground">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {[s.document, s.phone, s.email].filter(Boolean).join(" · ") || "Sem contato registrado"}
              </p>
            </div>
          ))}
          {suppliers.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum fornecedor cadastrado</p>
          )}
        </div>
      )}

      <Dialog open={newMaterialOpen} onOpenChange={(o) => { setNewMaterialOpen(o); if (!o) resetMaterialForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Insumo</DialogTitle>
            <DialogDescription>
              Cadastre um insumo bruto (comprado) ou um item que só existe depois de produzido internamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nome</Label>
              <Input value={matName} onChange={(e) => setMatName(e.target.value)} placeholder="Ex: Carne bovina" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Unidade de medida</Label>
              <select aria-label="Unidade de medida do novo insumo" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={matUnit} onChange={(e) => setMatUnit(e.target.value)}>
                <option value="">Selecione...</option>
                {STOCK_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Estoque mínimo (para alerta)</Label>
              <Input type="number" value={matMinStock} onChange={(e) => setMatMinStock(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Categoria do estoque</Label>
              <select aria-label="Categoria do estoque" value={matCategoria} onChange={e => setMatCategoria(e.target.value as StockCategory)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                {STOCK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tipo de item</Label>
              <div className="grid grid-cols-1 gap-2">
                {ITEM_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMatItemType(opt.value)}
                    className={`w-full flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      matItemType === opt.value
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Factory className="h-4 w-4" /> {opt.label}
                    </span>
                    <span className="text-xs opacity-80">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewMaterialOpen(false)} disabled={saving}>Cancelar</Button>
            <Button data-tooltip="Salve o cadastro do insumo sem lançar uma entrada de estoque." onClick={handleCreateMaterial} disabled={saving || !matName.trim() || !matUnit.trim()}>
              {saving ? "Aguarde..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseOpen} onOpenChange={(o) => { setPurchaseOpen(o); if (!o) resetPurchaseForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLotId ? "Editar lote" : "Registrar Entrada"}</DialogTitle>
            <DialogDescription>
              {purchaseTarget && `Compra de ${materialsById[purchaseTarget]?.name}. Toda entrada fica salva no histórico.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unidade da compra</Label>
                <Select value={pPurchaseUnit} onValueChange={(v) => {
                  setPPurchaseUnit(v);
                  const base = purchaseTarget ? materialsById[purchaseTarget]?.unit : "";
                  const factor: Record<string, number> = { "kg:g": 1000, "g:kg": 0.001, "L:ml": 1000, "ml:L": 0.001 };
                  setPConversion(String(v === base ? 1 : factor[`${v}:${base}`] ?? ""));
                }}>
                  <SelectTrigger><SelectValue placeholder="Escolha..." /></SelectTrigger>
                  <SelectContent>
                    {[...new Set([purchaseTarget ? materialsById[purchaseTarget]?.unit : "", "kg", "g", "L", "ml", "un", "pé", "ramo", "maço", "cabeça", "cacho", "bandeja", "caixa", "pacote", "saco", "fardo", "galão", "botijão", "dúzia", "garrafa", "lata", "pote", "frasco", "rolo"].filter(Boolean))].map((u) => (
                      <SelectItem key={u} value={u!}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantidade comprada</Label>
                <Input type="number" min="0" step="any" value={pQuantity} onChange={(e) => {
                  const q = e.target.value;
                  setPQuantity(q);
                  if (pUnitCost !== "" && q !== "") setPTotalCost(String(Number(q) * Number(pUnitCost)));
                }} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Equivalência: 1 {pPurchaseUnit || "unidade de compra"} corresponde a quantos {purchaseTarget ? materialsById[purchaseTarget]?.unit : "na unidade de estoque"}?</Label>
              <Input type="number" min="0" step="any" value={pConversion} onChange={(e) => setPConversion(e.target.value)} placeholder="Informe a conversão exata" />
              <p className="text-xs text-muted-foreground">
                Entrada no estoque: {Number(pQuantity) > 0 && Number(pConversion) > 0
                  ? (Number(pQuantity) * Number(pConversion)).toLocaleString("pt-BR") : "—"} {purchaseTarget ? materialsById[purchaseTarget]?.unit : ""}.
                Para caixa, pacote ou unidade sem equivalência conhecida, informe a conversão; o sistema não estima pesos.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Custo unitário (R$/{pPurchaseUnit || "un"})</Label>
                <Input type="number" min="0" step="0.01" value={pUnitCost} onChange={(e) => {
                  setPUnitCost(e.target.value);
                  setPTotalCost(e.target.value === "" || pQuantity === "" ? "" : String(Number(e.target.value) * Number(pQuantity)));
                }} />
              </div>
              <div className="space-y-2">
                <Label>Custo total do lote (R$)</Label>
                <Input type="number" min="0" step="0.01" value={pTotalCost} onChange={(e) => {
                  setPTotalCost(e.target.value);
                  setPUnitCost(e.target.value === "" || !(Number(pQuantity) > 0) ? "" : String(Number(e.target.value) / Number(pQuantity)));
                }} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Fornecedor (opcional)</Label>
              <Select value={pSupplierId} onValueChange={setPSupplierId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!editingLotId && <div className="space-y-2 border-t border-border pt-3">
              <Label>Data de entrada do lote</Label>
              <Input type="date" value={pDataEntrada} max={new Date().toLocaleDateString("en-CA")} onChange={(e) => setPDataEntrada(e.target.value)} />
            </div>}
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" /> Validade (opcional)
                </Label>
                <Input type="date" value={pValidade} onChange={(e) => setPValidade(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Nº do lote (opcional)</Label>
                <Input value={pNumeroLote} onChange={(e) => setPNumeroLote(e.target.value)} placeholder="Gerado automaticamente" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPurchaseOpen(false)} disabled={saving}>Cancelar</Button>
            <Button data-tooltip="Salve os dados da compra ou da correção do lote e atualize o estoque real." onClick={handleRegisterPurchase} disabled={saving || !(Number(pQuantity) > 0) || !((automaticConversion ?? Number(pConversion)) > 0) || !pPurchaseUnit}>
              {saving ? "Aguarde..." : editingLotId ? "Salvar alterações" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newSupplierOpen} onOpenChange={(o) => { setNewSupplierOpen(o); if (!o) resetSupplierForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nome</Label>
              <Input value={supName} onChange={(e) => setSupName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">CNPJ/CPF</Label>
              <Input value={supDocument} onChange={(e) => setSupDocument(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Telefone</Label>
              <Input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">E-mail</Label>
              <Input value={supEmail} onChange={(e) => setSupEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewSupplierOpen(false)} disabled={saving}>Cancelar</Button>
            <Button data-tooltip="Salve o cadastro do fornecedor." onClick={handleCreateSupplier} disabled={saving || !supName.trim()}>
              {saving ? "Aguarde..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newRecipeOpen} onOpenChange={(o) => { setNewRecipeOpen(o); if (!o) resetRecipeForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Receita de Produção</DialogTitle>
            <DialogDescription>Defina o porcionamento: quais insumos entram e o que sai.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nome da receita</Label>
              <Input value={recName} onChange={(e) => setRecName(e.target.value)} placeholder="Ex: Porcionamento hambúrguer 100g" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Item produzido (saída)</Label>
                <Select value={recOutputId} onValueChange={setRecOutputId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {rawMaterials
                      .filter((m) => m.itemType !== "revenda")
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Rendimento padrão</Label>
                <Input type="number" value={recOutputQty} onChange={(e) => setRecOutputQty(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Validade padrão (dias, opcional)</Label>
              <Input type="number" value={recShelfDays} onChange={(e) => setRecShelfDays(e.target.value)} placeholder="Ex: 3" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tipo de ficha</Label>
              <Select value={recTipo} onValueChange={(v) => setRecTipo(v as FichaTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FICHA_TIPO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Perda esperada % (opcional)</Label>
                <Input type="number" value={recPerdaEsperada} onChange={(e) => setRecPerdaEsperada(e.target.value)} placeholder="Ex: 5" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Tempo de produção (min, opcional)</Label>
                <Input type="number" value={recTempoProducao} onChange={(e) => setRecTempoProducao(e.target.value)} placeholder="Ex: 30" />
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-sm text-muted-foreground">Insumos consumidos por lote</Label>
              {recInputs.map((inp, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={inp.rawMaterialId} onValueChange={(v) => updateRecInput(idx, { rawMaterialId: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Insumo..." /></SelectTrigger>
                    <SelectContent>
                      {rawMaterials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-24"
                    value={inp.quantity || ""}
                    onChange={(e) => updateRecInput(idx, { quantity: Number(e.target.value) })}
                    placeholder="Qtd"
                  />
                  <button data-tooltip="Remova este insumo da receita em edição." aria-label="Remova este insumo da receita em edição."
                    type="button"
                    onClick={() => setRecInputs((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button data-tooltip="Adicione um insumo e sua quantidade à receita de produção."
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRecInputs((prev) => [...prev, { rawMaterialId: "", quantity: 0 }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar insumo
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewRecipeOpen(false)} disabled={saving}>Cancelar</Button>
            <Button data-tooltip="Salve a receita e suas quantidades de referência. A produção real será lançada depois." onClick={handleCreateRecipe} disabled={saving || !recName.trim() || !recOutputId || !recOutputQty}>
              {saving ? "Aguarde..." : "Criar receita"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={produceOpen} onOpenChange={(o) => { setProduceOpen(o); if (!o) resetProduceForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Produzir Lote</DialogTitle>
            <div className="space-y-1"><Label htmlFor="production-recipe-select">Ficha técnica do item produzido</Label><select id="production-recipe-select" className="w-full rounded-md border bg-background p-2 text-sm" value={prodRecipeId} onChange={event => openProduce(event.target.value)}>{recipes.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <DialogDescription>
              Ao confirmar, gera etiqueta automaticamente (código + validade) e credita o item produzido no estoque.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Quantidade produzida (real)</Label>
              <div className="flex items-center gap-2"><Input type="number" min="0" step="any" value={prodQuantity} onChange={(e) => handleProductionQuantityChange(e.target.value)} /><span className="text-sm text-muted-foreground">{outputUnit}</span></div>
              <p className="text-xs text-muted-foreground">Receita: {selectedProductionRecipe?.name ?? "Não selecionada"} · rendimento padrão: {selectedProductionRecipe?.outputQuantity} {outputUnit}. Insumos calculados proporcionalmente.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Insumos necessários (ajuste o consumo real se necessário)</Label>
              {insufficientInputs.length > 0 && <p role="alert" className="text-sm text-destructive">Estoque insuficiente, insumo ausente ou quantidade inválida. Regularize os insumos antes de produzir.</p>}
              {prodInputs.map((inp, idx) => {
                const alocacao = fefoPreview[inp.rawMaterialId];
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex gap-2 items-center">
                      <span className="flex-1 text-sm text-foreground">
                        {materialsById[inp.rawMaterialId]?.name ?? "?"} — disponível: {materialsById[inp.rawMaterialId]?.currentStock ?? 0} {materialsById[inp.rawMaterialId]?.unit ?? ""}
                      </span>
                      <Input
                        type="number"
                        className="w-24"
                        value={inp.quantityUsed || ""}
                        onChange={(e) =>
                          setProdInputs((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, quantityUsed: Number(e.target.value) } : p))
                          )
                        }
                      />
                      <span className="text-xs text-muted-foreground w-8">{materialsById[inp.rawMaterialId]?.unit}</span>
                    </div>
                    {alocacao && alocacao.length > 0 && (
                      <p className="text-[11px] text-muted-foreground pl-1 flex items-center gap-1">
                        <Boxes className="h-3 w-3 shrink-0" />
                        FEFO: {alocacao.map((a, i) => (
                          <span key={i}>
                            {i > 0 && " + "}
                            {a.quantidade.toFixed(a.quantidade % 1 === 0 ? 0 : 2)}
                            {" "}
                            {a.loteId
                              ? `do lote ${a.numeroLote}${a.validade ? ` (val. ${new Date(a.validade).toLocaleDateString("pt-BR")})` : ""}`
                              : "sem lote rastreado"}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Observações (opcional)</Label>
              <Input value={prodNotes} onChange={(e) => setProdNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setProduceOpen(false)} disabled={saving}>Cancelar</Button>
            <Button data-tooltip="Confirme a produção: registre o lote e o consumo dos insumos." onClick={handleProduceBatch} disabled={saving || invalidProductionQuantity || !prodInputs.length || insufficientInputs.length > 0}>
              {saving ? "Aguarde..." : "Confirmar produção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StockTab = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  return <UnitStockTab key={businessUnitId ?? "no-unit"} />;
};
export default StockTab;
