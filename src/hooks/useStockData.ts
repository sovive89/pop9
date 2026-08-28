import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  statusValidade: "sem_validade" | "vencido" | "vence_em_breve" | "valido";
}

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

export interface ProductionRecipeInput {
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

export const useStockData = () => {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recipes, setRecipes] = useState<ProductionRecipe[]>([]);
  const [labels, setLabels] = useState<ProductionLabel[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);

  const statusValidade = (validade: string | null): Lote["statusValidade"] => {
    if (!validade) return "sem_validade";
    const dias = (new Date(validade).getTime() - Date.now()) / 86_400_000;
    if (dias < 0) return "vencido";
    if (dias <= 3) return "vence_em_breve";
    return "valido";
  };

  const loadRawMaterials = useCallback(async () => {
    const { data, error } = await supabase
      .from("raw_materials")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) {
      toast.error("Erro ao carregar insumos");
      return;
    }
    setRawMaterials(
      (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        unit: r.unit,
        isProduced: r.is_produced,
        // `tipo` é a coluna real do banco (enum item_tipo, existe desde
        // 07/08 via uma migration nunca versionada aqui). is_produced é
        // sempre derivado dela por trigger — nunca a fonte de verdade.
        itemType: r.tipo as ItemType,
        categoria: r.categoria ?? null,
        currentStock: Number(r.current_stock),
        minStock: Number(r.min_stock),
        averageCost: Number(r.average_cost),
        active: r.active,
      }))
    );
  }, []);

  const loadLotes = useCallback(async () => {
    const { data: lotesData, error } = await supabase
      .from("lotes")
      .select("*")
      .order("validade", { ascending: true, nullsFirst: false });
    if (error) {
      // Tabela pode ainda não existir localmente se a migration
      // 20260828041000 não tiver sido aplicada neste ambiente — falha
      // silenciosa aqui não deve travar o resto do estoque.
      return;
    }

    const { data: consumoData } = await supabase
      .from("stock_movements")
      .select("lote_id, quantity")
      .eq("type", "saida")
      .not("lote_id", "is", null);

    // Consumo de produção (FEFO) fica registrado em production_batch_inputs,
    // não em stock_movements — ver comentário em produceBatch. Coluna nova
    // (migration 20260828050000): se ainda não foi aplicada, a query dá
    // erro e simplesmente não soma nada, sem quebrar o resto dos lotes.
    const { data: consumoProducaoData, error: consumoProducaoErr } = await supabase
      .from("production_batch_inputs")
      .select("lote_id, quantity_used")
      .not("lote_id", "is", null);

    const consumoPorLote = new Map<string, number>();
    for (const m of consumoData ?? []) {
      if (!m.lote_id) continue;
      consumoPorLote.set(m.lote_id, (consumoPorLote.get(m.lote_id) ?? 0) + Number(m.quantity));
    }
    if (!consumoProducaoErr) {
      for (const p of consumoProducaoData ?? []) {
        if (!p.lote_id) continue;
        consumoPorLote.set(p.lote_id, (consumoPorLote.get(p.lote_id) ?? 0) + Number(p.quantity_used));
      }
    }

    setLotes(
      (lotesData ?? []).map((l) => {
        const entrada = Number(l.quantidade_entrada);
        const consumido = consumoPorLote.get(l.id) ?? 0;
        return {
          id: l.id,
          rawMaterialId: l.raw_material_id,
          numeroLote: l.numero_lote,
          origem: l.origem as Lote["origem"],
          quantidadeEntrada: entrada,
          quantidadeRestante: Math.max(0, entrada - consumido),
          dataEntrada: l.data_entrada,
          validade: l.validade,
          fornecedorId: l.fornecedor_id,
          precoUnitario: l.preco_unitario !== null ? Number(l.preco_unitario) : null,
          statusValidade: statusValidade(l.validade),
        };
      })
    );
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) {
      toast.error("Erro ao carregar fornecedores");
      return;
    }
    setSuppliers(
      (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        document: s.document,
        phone: s.phone,
        email: s.email,
        active: s.active,
      }))
    );
  }, []);

  const loadRecipes = useCallback(async () => {
    const { data: recipesData, error: rErr } = await supabase
      .from("production_recipes")
      .select("*")
      .eq("active", true)
      .order("name");
    if (rErr) {
      toast.error("Erro ao carregar receitas de produção");
      return;
    }
    const { data: inputsData } = await supabase
      .from("production_recipe_inputs")
      .select("*");

    setRecipes(
      (recipesData ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        outputRawMaterialId: r.output_raw_material_id,
        outputQuantity: Number(r.output_quantity),
        shelfLifeDays: r.shelf_life_days,
        tipo: (r.tipo as FichaTipo | null) ?? "producao",
        perdaEsperada: r.perda_esperada !== null && r.perda_esperada !== undefined ? Number(r.perda_esperada) : null,
        tempoProducao: r.tempo_producao ?? null,
        active: r.active,
        inputs: (inputsData ?? [])
          .filter((i) => i.recipe_id === r.id)
          .map((i) => ({ id: i.id, rawMaterialId: i.raw_material_id, quantity: Number(i.quantity) })),
      }))
    );
  }, []);

  const loadLabels = useCallback(async () => {
    const { data, error } = await supabase
      .from("production_labels")
      .select("*")
      .order("produced_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Erro ao carregar etiquetas de produção");
      return;
    }
    setLabels(
      (data ?? []).map((l) => ({
        batchId: l.batch_id!,
        batchCode: l.batch_code,
        productName: l.product_name!,
        unit: l.unit!,
        quantityProduced: Number(l.quantity_produced),
        producedAt: l.produced_at!,
        expiresAt: l.expires_at,
        statusValidade: l.status_validade as ProductionLabel["statusValidade"],
      }))
    );
  }, []);

  const loadAlerts = useCallback(async () => {
    const { data, error } = await supabase.from("low_stock_alerts").select("*");
    if (error) return;
    setAlerts(
      (data ?? []).map((a) => ({
        id: a.id!,
        name: a.name!,
        unit: a.unit!,
        currentStock: Number(a.current_stock),
        minStock: Number(a.min_stock),
        deficit: Number(a.deficit),
      }))
    );
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadRawMaterials(), loadSuppliers(), loadRecipes(), loadLabels(), loadAlerts(), loadLotes()]);
    setLoading(false);
  }, [loadRawMaterials, loadSuppliers, loadRecipes, loadLabels, loadAlerts, loadLotes]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const createRawMaterial = async (input: {
    name: string;
    unit: string;
    itemType: ItemType;
    minStock: number;
    categoria?: string | null;
  }) => {
    const { error } = await supabase.from("raw_materials").insert({
      name: input.name,
      unit: input.unit,
      tipo: input.itemType,
      // is_produced não é enviado: o trigger trg_sync_raw_material_is_produced
      // (migration 20260828041000) deriva a partir de tipo no insert.
      min_stock: input.minStock,
      categoria: input.categoria || null,
    });
    if (error) {
      toast.error("Erro ao criar insumo: " + error.message);
      return false;
    }
    toast.success("Insumo criado");
    await loadRawMaterials();
    return true;
  };

  const registerPurchase = async (input: {
    rawMaterialId: string;
    quantity: number;
    unitCost: number | null;
    supplierId: string | null;
    boxCount?: number;
    unitsPerBox?: number;
    validade?: string | null; // YYYY-MM-DD, opcional — pilar "Lotes/Validade"
    numeroLote?: string | null; // opcional; se vazio, gera um código
  }) => {
    const { data: userData } = await supabase.auth.getUser();
    const batchInfo =
      input.boxCount && input.unitsPerBox
        ? { caixas: input.boxCount, unidades_por_caixa: input.unitsPerBox }
        : null;

    // 1) Sempre cria o lote primeiro — é o que dá rastreabilidade e permite
    // FEFO depois, tanto para entrada manual quanto (no futuro) XML/OCR:
    // as três portas de compra convergem para esta mesma chamada.
    const numeroLote =
      input.numeroLote?.trim() ||
      `L-${new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14)}`;

    const { data: loteRow, error: loteErr } = await supabase
      .from("lotes")
      .insert({
        raw_material_id: input.rawMaterialId,
        numero_lote: numeroLote,
        origem: "compra",
        quantidade_entrada: input.quantity,
        validade: input.validade || null,
        fornecedor_id: input.supplierId,
        preco_unitario: input.unitCost,
      })
      .select()
      .single();

    // Se a tabela `lotes` ainda não existir neste ambiente (migration
    // 20260828041000 não aplicada), não bloqueia a entrada: cai para o
    // comportamento anterior, sem lote_id. Loga o motivo para não confundir
    // um erro real de dado com "banco desatualizado".
    if (loteErr) {
      console.warn("Não foi possível criar lote (tabela pode não existir ainda):", loteErr.message);
    }

    const { error } = await supabase.from("stock_movements").insert({
      raw_material_id: input.rawMaterialId,
      type: "entrada",
      quantity: input.quantity,
      reason: "compra",
      supplier_id: input.supplierId,
      unit_cost: input.unitCost,
      batch_info: batchInfo,
      lote_id: loteRow?.id ?? null,
      created_by: userData.user?.id,
    });
    if (error) {
      toast.error("Erro ao registrar entrada: " + error.message);
      return false;
    }
    toast.success(loteRow ? `Entrada registrada — lote ${numeroLote}` : "Entrada registrada");
    await Promise.all([loadRawMaterials(), loadAlerts(), loadLotes()]);
    return true;
  };

  const createSupplier = async (input: { name: string; document: string; phone: string; email: string }) => {
    const { error } = await supabase.from("suppliers").insert(input);
    if (error) {
      toast.error("Erro ao criar fornecedor: " + error.message);
      return false;
    }
    toast.success("Fornecedor criado");
    await loadSuppliers();
    return true;
  };

  const createRecipe = async (input: {
    name: string;
    outputRawMaterialId: string;
    outputQuantity: number;
    shelfLifeDays: number | null;
    tipo?: FichaTipo;
    perdaEsperada?: number | null;
    tempoProducao?: number | null;
    inputs: ProductionRecipeInput[];
  }) => {
    const { data: recipeRow, error: recipeErr } = await supabase
      .from("production_recipes")
      .insert({
        name: input.name,
        output_raw_material_id: input.outputRawMaterialId,
        output_quantity: input.outputQuantity,
        shelf_life_days: input.shelfLifeDays,
        tipo: input.tipo ?? "producao",
        perda_esperada: input.perdaEsperada ?? null,
        tempo_producao: input.tempoProducao ?? null,
      })
      .select()
      .single();

    if (recipeErr || !recipeRow) {
      toast.error("Erro ao criar receita: " + recipeErr?.message);
      return false;
    }

    if (input.inputs.length > 0) {
      const { error: inputsErr } = await supabase.from("production_recipe_inputs").insert(
        input.inputs.map((i) => ({
          recipe_id: recipeRow.id,
          raw_material_id: i.rawMaterialId,
          quantity: i.quantity,
        }))
      );
      if (inputsErr) {
        toast.error("Erro ao salvar insumos da receita: " + inputsErr.message);
        return false;
      }
    }

    toast.success("Receita de produção criada");
    await loadRecipes();
    return true;
  };

  const produceBatch = async (input: {
    recipeId: string;
    quantityProduced: number;
    notes: string;
    inputsUsed: { rawMaterialId: string; quantityUsed: number }[];
  }) => {
    const { data: userData } = await supabase.auth.getUser();

    const { data: batchRow, error: batchErr } = await supabase
      .from("production_batches")
      .insert({
        recipe_id: input.recipeId,
        quantity_produced: input.quantityProduced,
        notes: input.notes || null,
        produced_by: userData.user?.id,
      })
      .select()
      .single();

    if (batchErr || !batchRow) {
      toast.error("Erro ao registrar produção: " + batchErr?.message);
      return false;
    }

    if (input.inputsUsed.length > 0) {
      // FEFO de verdade: em vez de uma linha só com a quantidade total,
      // decide de qual(is) lote(s) ela sai (mais próximo do vencimento
      // primeiro) e grava uma linha por lote consumido. Não toca em
      // stock_movements — ver comentário na migration 20260828050000 sobre
      // por que isso ficou de fora de propósito (risco de dupla contagem
      // com um trigger que já existe e não conhecemos o código).
      const rows = input.inputsUsed.flatMap((i) => {
        const alocacao = alocarFefo(i.rawMaterialId, i.quantityUsed, lotes);
        return alocacao.map((a) => ({
          batch_id: batchRow.id,
          raw_material_id: i.rawMaterialId,
          quantity_used: a.quantidade,
          lote_id: a.loteId,
        }));
      });
      const { error: inputsErr } = await supabase.from("production_batch_inputs").insert(rows);
      if (inputsErr) {
        toast.error("Erro ao registrar consumo de insumos: " + inputsErr.message);
        return false;
      }
    }

    // Cria o lote de saída da produção (pilar "Lotes → Validade" do Stock
    // Core). Não mexe em stock_movements/current_stock — isso já é feito por
    // um trigger existente que não conhecemos o código exato (ver
    // 1-PLANO.md). Esta escrita é só o registro de rastreabilidade do lote
    // em si, então uma falha aqui não deve desfazer a produção já
    // registrada — só avisa, como já fazemos em registerPurchase para
    // ambientes sem a migration aplicada.
    const recipe = recipes.find((r) => r.id === input.recipeId);
    if (recipe) {
      const { error: loteErr } = await supabase.from("lotes").insert({
        raw_material_id: recipe.outputRawMaterialId,
        numero_lote: batchRow.batch_code ?? `P-${batchRow.id.slice(0, 8)}`,
        origem: "producao",
        quantidade_entrada: input.quantityProduced,
        validade: batchRow.expires_at ?? null,
        receita_id: input.recipeId,
        batch_id: batchRow.id,
      });
      if (loteErr) {
        console.warn("Não foi possível registrar o lote de produção (migration de lotes pendente?):", loteErr.message);
      }
    }

    toast.success(`Lote produzido — etiqueta ${batchRow.batch_code}`);
    await Promise.all([loadRawMaterials(), loadLabels(), loadAlerts(), loadLotes()]);
    return true;
  };

  return {
    rawMaterials,
    suppliers,
    recipes,
    labels,
    alerts,
    lotes,
    loading,
    refreshAll,
    createRawMaterial,
    registerPurchase,
    createSupplier,
    createRecipe,
    produceBatch,
  };
};
