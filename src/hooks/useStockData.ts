import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MenuRecipeDraft } from "@/lib/recipeDraft";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

export type ItemType = "insumo" | "semiacabado" | "produto_acabado" | "revenda";

export interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  isProduced: boolean;
  itemType: ItemType;
  categoria: string | null;
  currentStock: number;
  minStock: number;
  averageCost: number;
  active: boolean;
  isTheoretical: boolean;
}

export interface Lote {
  id: string;
  rawMaterialId: string;
  numeroLote: string;
  origem: "compra" | "producao";
  quantidadeEntrada: number;
  quantidadeRestante: number;
  dataEntrada: string;
  validade: string | null;
  fornecedorId: string | null;
  precoUnitario: number | null;
  unidadeCompra: string | null;
  quantidadeCompra: number | null;
  fatorConversao: number | null;
  custoTotal: number | null;
  caixas: number | null;
  conteudoPorCaixa: number | null;
  statusValidade: "sem_validade" | "vencido" | "vence_em_breve" | "valido";
}

/**
 * Payload aceito pela edição de lote de compra.
 *
 * Todos os valores são JSON nativo para que o contrato também seja válido
 * como `p_data` da RPC, sem converter um Record genérico por cast. O caller
 * da tela monta exatamente este formato.
 */
export type PurchaseLotEditData = {
  quantidade_compra: number;
  fator_conversao: number;
  unidade_compra: string;
  custo_total: number | null;
  fornecedor_id: string | null;
  validade: string | null;
  numero_lote: string;
  caixas: number | null;
  conteudo_por_caixa: number | null;
};

export interface AlocacaoFefo {
  loteId: string | null; // null = sem lote rastreado suficiente (fallback, não bloqueia)
  numeroLote: string | null;
  validade: string | null;
  quantidade: number;
}

/**
 * FEFO (First-Expired-First-Out): dado um insumo e uma quantidade a
 * consumir, decide de quais lotes tirar, priorizando quem vence primeiro
 * (nulos — sem validade — por último), com empate resolvido por ordem de
 * entrada (FIFO). Se os lotes rastreados não cobrirem a quantidade toda
 * (ex.: insumo comprado antes da migration de lotes existir), o restante
 * vira uma alocação com loteId: null — não bloqueia a produção, só fica
 * sem rastreio de lote para essa parte.
 *
 * Função pura (não depende de estado do hook) para poder ser reusada tanto
 * no cálculo real (produceBatch) quanto numa prévia na tela antes de
 * confirmar.
 */
export const alocarFefo = (
  rawMaterialId: string,
  quantidadeNecessaria: number,
  lotesDisponiveis: Lote[]
): AlocacaoFefo[] => {
  const candidatos = lotesDisponiveis
    .filter((l) => l.rawMaterialId === rawMaterialId && l.quantidadeRestante > 0)
    .sort((a, b) => {
      if (a.validade && b.validade) {
        const cmp = a.validade.localeCompare(b.validade);
        if (cmp !== 0) return cmp;
      } else if (a.validade && !b.validade) {
        return -1; // quem tem validade sai antes de quem não tem
      } else if (!a.validade && b.validade) {
        return 1;
      }
      return a.dataEntrada.localeCompare(b.dataEntrada); // empate: FIFO
    });

  const alocacao: AlocacaoFefo[] = [];
  let restante = quantidadeNecessaria;
  for (const lote of candidatos) {
    if (restante <= 0.0001) break;
    const consumir = Math.min(lote.quantidadeRestante, restante);
    if (consumir > 0) {
      alocacao.push({ loteId: lote.id, numeroLote: lote.numeroLote, validade: lote.validade, quantidade: consumir });
      restante -= consumir;
    }
  }
  if (restante > 0.0001) {
    alocacao.push({ loteId: null, numeroLote: null, validade: null, quantidade: restante });
  }
  return alocacao;
};

export interface Supplier {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
}

export type ProductionRecipeInput = {
  id?: string;
  rawMaterialId: string;
  quantity: number;
}

export type FichaTipo = "producao" | "mise_en_place" | "porcionamento";

export interface ProductionRecipe {
  id: string;
  name: string;
  outputRawMaterialId: string;
  outputQuantity: number;
  shelfLifeDays: number | null;
  tipo: FichaTipo;
  perdaEsperada: number | null;
  tempoProducao: number | null;
  active: boolean;
  inputs: ProductionRecipeInput[];
}

export interface ProductionLabel {
  batchId: string;
  batchCode: string | null;
  productName: string;
  unit: string;
  quantityProduced: number;
  producedAt: string;
  expiresAt: string | null;
  statusValidade: "sem_validade" | "vencido" | "vence_hoje" | "valido";
}

export interface LowStockAlert {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  deficit: number;
}

type StockState = {
  scope: string; rawMaterials: RawMaterial[]; suppliers: Supplier[]; recipes: ProductionRecipe[];
  labels: ProductionLabel[]; alerts: LowStockAlert[]; lotes: Lote[]; error: boolean;
};
const EMPTY_STOCK: StockState = { scope: "", rawMaterials: [], suppliers: [], recipes: [], labels: [], alerts: [], lotes: [], error: false };
const positive = (value: number) => Number.isFinite(value) && value > 0;
const statusValidade = (validade: string | null): Lote["statusValidade"] => {
  if (!validade) return "sem_validade";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dias = (new Date(`${validade}T00:00:00`).getTime() - today.getTime()) / 86_400_000;
  return dias < 0 ? "vencido" : dias <= 3 ? "vence_em_breve" : "valido";
};

export const useStockData = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  const epoch = useRef({ unit: businessUnitId, version: 0 });
  if (epoch.current.unit !== businessUnitId) epoch.current = { unit: businessUnitId, version: epoch.current.version + 1 };
  const scope = `${businessUnitId}:${epoch.current.version}`;
  const current = useRef(scope); current.current = scope;
  const generation = useRef(0);
  const invalidateRequests = useCallback(() => { generation.current++; }, []);
  const [state, setState] = useState<StockState>(EMPTY_STOCK);
  const [busy, setBusy] = useState(false);
  const visible = Boolean(businessUnitId) && state.scope === scope;
  const stock = visible ? state : EMPTY_STOCK;
  const requests = useRef(new Map<string, { payload: string; id: string }>());
  const requestId = (kind: string, data: unknown) => {
    const key = `${scope}:${kind}`, payload = JSON.stringify(data);
    const previous = requests.current.get(key);
    if (previous?.payload === payload) return previous.id;
    const id = crypto.randomUUID(); requests.current.set(key, { payload, id }); return id;
  };

  const refreshAll = useCallback(async () => {
    if (!businessUnitId || current.current !== scope) return;
    const request = ++generation.current; setBusy(true);
    try {
      const [materials, suppliers, recipes, batches, lots] = await Promise.all([
        supabase.from("raw_materials").select("*").eq("business_unit_id", businessUnitId).eq("active", true).order("name"),
        supabase.from("suppliers").select("*").eq("business_unit_id", businessUnitId).eq("active", true).order("name"),
        supabase.from("production_recipes").select("*").eq("business_unit_id", businessUnitId).eq("active", true).order("name"),
        supabase.from("production_batches").select("id").eq("business_unit_id", businessUnitId).order("produced_at", { ascending: false }).limit(50),
        supabase.from("stock_lot_balances").select("*").eq("business_unit_id", businessUnitId).is("cancelado_em", null).order("validade", { ascending: true, nullsFirst: false }),
      ]);
      const failure = [materials, suppliers, recipes, batches, lots].find(result => result.error);
      if (failure?.error) throw failure.error;
      if (current.current !== scope || request !== generation.current) return;
      const recipeIds = (recipes.data ?? []).map(r => r.id), batchIds = (batches.data ?? []).map(b => b.id);
      const [inputs, labels] = await Promise.all([
        recipeIds.length ? supabase.from("production_recipe_inputs").select("*").in("recipe_id", recipeIds) : Promise.resolve({ data: [], error: null }),
        batchIds.length ? supabase.from("production_labels").select("*").in("batch_id", batchIds).order("produced_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      ]);
      if (inputs.error || labels.error) throw inputs.error ?? labels.error;
      if (current.current !== scope || request !== generation.current) return;
      const rawMaterials: RawMaterial[] = (materials.data ?? []).map(r => ({
        id: r.id, name: r.name, unit: r.unit, isProduced: r.is_produced, itemType: r.tipo as ItemType,
        categoria: r.categoria ?? null, currentStock: Number(r.current_stock), minStock: Number(r.min_stock), averageCost: Number(r.average_cost), active: r.active, isTheoretical: r.is_theoretical,
      }));
      setState({ scope, error: false, rawMaterials,
        suppliers: (suppliers.data ?? []).map(s => ({ id: s.id, name: s.name, document: s.document, phone: s.phone, email: s.email, active: s.active })),
        recipes: (recipes.data ?? []).map(r => ({
          id: r.id, name: r.name, outputRawMaterialId: r.output_raw_material_id, outputQuantity: Number(r.output_quantity),
          shelfLifeDays: r.shelf_life_days, tipo: (r.tipo as FichaTipo | null) ?? "producao", perdaEsperada: r.perda_esperada == null ? null : Number(r.perda_esperada),
          tempoProducao: r.tempo_producao ?? null, active: r.active,
          inputs: (inputs.data ?? []).filter(i => i.recipe_id === r.id).map(i => ({ id: i.id, rawMaterialId: i.raw_material_id, quantity: Number(i.quantity) })),
        })),
        labels: (labels.data ?? []).map(l => ({ batchId: l.batch_id!, batchCode: l.batch_code, productName: l.product_name!, unit: l.unit!,
          quantityProduced: Number(l.quantity_produced), producedAt: l.produced_at!, expiresAt: l.expires_at, statusValidade: l.status_validade as ProductionLabel["statusValidade"] })),
        alerts: rawMaterials.filter(r => r.currentStock < r.minStock).map(r => ({ id: r.id, name: r.name, unit: r.unit, currentStock: r.currentStock, minStock: r.minStock, deficit: r.minStock - r.currentStock })),
        lotes: (lots.data ?? []).map(l => ({
          id: l.id, rawMaterialId: l.raw_material_id, numeroLote: l.numero_lote, origem: l.origem as Lote["origem"],
          quantidadeEntrada: Number(l.quantidade_entrada), quantidadeRestante: Math.max(0, Number(l.quantidade_restante)),
          dataEntrada: l.data_entrada, validade: l.validade, fornecedorId: l.fornecedor_id, precoUnitario: l.preco_unitario == null ? null : Number(l.preco_unitario),
          unidadeCompra: l.unidade_compra, quantidadeCompra: l.quantidade_compra == null ? null : Number(l.quantidade_compra),
          fatorConversao: l.fator_conversao == null ? null : Number(l.fator_conversao), custoTotal: l.custo_total == null ? null : Number(l.custo_total),
          caixas: l.caixas == null ? null : Number(l.caixas), conteudoPorCaixa: l.conteudo_por_caixa == null ? null : Number(l.conteudo_por_caixa), statusValidade: statusValidade(l.validade),
        })),
      });
    } catch {
      if (current.current === scope && request === generation.current) setState({ ...EMPTY_STOCK, scope, error: true });
    } finally {
      if (current.current === scope && request === generation.current) setBusy(false);
    }
  }, [businessUnitId, scope]);
  useEffect(() => { void refreshAll(); return invalidateRequests; }, [refreshAll, invalidateRequests]);

  const complete = async (result: { error: { message: string } | null }, message: string, kind?: string) => {
    if (current.current !== scope) return false;
    if (result.error) { toast.error("Não foi possível salvar: " + result.error.message); return false; }
    if (kind) requests.current.delete(`${scope}:${kind}`);
    toast.success(message); await refreshAll(); return true;
  };
  const createRawMaterialRecord = async (input: { name: string; unit: string; itemType: ItemType; minStock: number; categoria?: string | null }) => {
    if (!businessUnitId || current.current !== scope) return null;
    if (!input.name.trim() || !input.unit.trim() || !Number.isFinite(input.minStock) || input.minStock < 0) { toast.error("Informe nome, unidade e estoque mínimo válido"); return null; }
    const { data, error } = await supabase.from("raw_materials").insert({ name: input.name.trim(), unit: input.unit.trim(), tipo: input.itemType,
      is_theoretical: true, min_stock: input.minStock, categoria: input.categoria || null, business_unit_id: businessUnitId }).select("id").single();
    if (current.current !== scope) return null;
    if (error || !data) { toast.error("Erro ao criar insumo: " + (error?.message ?? "ID não retornado")); return null; }
    await complete({ error: null }, "Insumo criado"); return data.id;
  };
  const savePreparation = async (input: MenuRecipeDraft) => {
    if (!businessUnitId || current.current !== scope) return null;
    const { data, error } = await supabase.rpc("save_stock_preparation", { p_unit: businessUnitId, p_data: input });
    if (!await complete({ error }, "Ficha de produção salva, sem movimentar estoque")) return null;
    return data;
  };
  const updateRawMaterialCategory = async (id: string, categoria: string) => {
    if (!businessUnitId || current.current !== scope) return false;
    return complete(await supabase.from("raw_materials").update({ categoria }).eq("id", id).eq("business_unit_id", businessUnitId), "Categoria atualizada");
  };
  const createRawMaterial = async (input: Parameters<typeof createRawMaterialRecord>[0]) => Boolean(await createRawMaterialRecord(input));

  const registerPurchase = async (input: {
    rawMaterialId: string; quantity: number; unitCost: number | null; supplierId: string | null; boxCount?: number; unitsPerBox?: number;
    purchaseUnit: string; purchaseQuantity: number; conversionFactor: number; totalCost: number | null; validade?: string | null; numeroLote?: string | null; dataEntrada?: string;
  }) => {
    if (!businessUnitId || current.current !== scope) return false;
    if (![input.quantity, input.purchaseQuantity, input.conversionFactor].every(positive)
      || Math.abs(input.quantity - input.purchaseQuantity * input.conversionFactor) > 0.000001) { toast.error("Quantidade e conversão do lote inconsistentes"); return false; }
    if ([input.totalCost, input.unitCost].some(value => value != null && (!Number.isFinite(value) || value < 0))) { toast.error("Informe um custo válido ou deixe-o vazio"); return false; }
    return complete(await supabase.rpc("register_stock_purchase", { p_unit: businessUnitId, p_lote_id: requestId("purchase", input), p_data: input }), "Entrada e lote registrados", "purchase");
  };
  const createSupplier = async (input: { name: string; document: string; phone: string; email: string }) => {
    if (!businessUnitId || current.current !== scope) return false;
    return complete(await supabase.from("suppliers").insert({ ...input, business_unit_id: businessUnitId }), "Fornecedor criado");
  };
  const createRecipe = async (input: { name: string; outputRawMaterialId: string; outputQuantity: number; shelfLifeDays: number | null;
    tipo?: FichaTipo; perdaEsperada?: number | null; tempoProducao?: number | null; inputs: ProductionRecipeInput[] }) => {
    if (!businessUnitId || current.current !== scope) return false;
    if (!positive(input.outputQuantity) || !input.inputs.length || input.inputs.some(i => !positive(i.quantity))) { toast.error("Informe rendimento e insumos com quantidade maior que zero"); return false; }
    return complete(await supabase.rpc("create_stock_recipe", { p_unit: businessUnitId, p_recipe_id: requestId("recipe", input), p_data: input }), "Receita de produção criada", "recipe");
  };
  const produceBatch = async (input: { recipeId: string; quantityProduced: number; notes: string; inputsUsed: { rawMaterialId: string; quantityUsed: number }[] }) => {
    if (!businessUnitId || current.current !== scope) return false;
    if (!positive(input.quantityProduced) || !input.inputsUsed.length || input.inputsUsed.some(i => !positive(i.quantityUsed))) { toast.error("Informe quantidade produzida e todos os consumos maiores que zero"); return false; }
    return complete(await supabase.rpc("produce_stock_batch", { p_unit: businessUnitId, p_batch_id: requestId("production", input), p_data: input }), "Produção, consumos e lote registrados", "production");
  };
  const managePurchaseLot = async (loteId: string, action: "edit" | "cancel", data?: PurchaseLotEditData) => {
    if (!businessUnitId || current.current !== scope) return false;
    const args: Database["public"]["Functions"]["manage_purchase_lot"]["Args"] = { p_lote_id: loteId, p_action: action, ...(data === undefined ? {} : { p_data: data }) };
    return complete(await supabase.rpc("manage_purchase_lot", args), action === "cancel" ? "Lote cancelado com histórico preservado" : "Lote atualizado");
  };
  const transferStockLot = async (input: { lotId: string; targetUnitId: string; targetRawMaterialId: string; quantity: number }) => {
    if (!businessUnitId || current.current !== scope || !positive(input.quantity)) return false;
    const args: Database["public"]["Functions"]["transfer_stock_lot"]["Args"] = {
      p_transfer_id: requestId("transfer", input), p_source_lote_id: input.lotId,
      p_target_unit_id: input.targetUnitId, p_target_raw_material_id: input.targetRawMaterialId,
      p_quantity: input.quantity,
    };
    return complete(await supabase.rpc("transfer_stock_lot", args), "Transferência registrada; origem e destino atualizados", "transfer");
  };
  return { ...stock, ready: visible && !state.error, loading: Boolean(businessUnitId) && (!visible || busy), refreshAll, createRawMaterial, createRawMaterialRecord, savePreparation, updateRawMaterialCategory, registerPurchase, createSupplier, createRecipe, produceBatch, managePurchaseLot, transferStockLot };
};
