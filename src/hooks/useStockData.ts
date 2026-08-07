import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  isProduced: boolean;
  currentStock: number;
  minStock: number;
  averageCost: number;
  active: boolean;
}

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

export interface ProductionRecipe {
  id: string;
  name: string;
  outputRawMaterialId: string;
  outputQuantity: number;
  shelfLifeDays: number | null;
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
  const [loading, setLoading] = useState(true);

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
        currentStock: Number(r.current_stock),
        minStock: Number(r.min_stock),
        averageCost: Number(r.average_cost),
        active: r.active,
      }))
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
    await Promise.all([loadRawMaterials(), loadSuppliers(), loadRecipes(), loadLabels(), loadAlerts()]);
    setLoading(false);
  }, [loadRawMaterials, loadSuppliers, loadRecipes, loadLabels, loadAlerts]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const createRawMaterial = async (input: {
    name: string;
    unit: string;
    isProduced: boolean;
    minStock: number;
  }) => {
    const { error } = await supabase.from("raw_materials").insert({
      name: input.name,
      unit: input.unit,
      is_produced: input.isProduced,
      min_stock: input.minStock,
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
  }) => {
    const { data: userData } = await supabase.auth.getUser();
    const batchInfo =
      input.boxCount && input.unitsPerBox
        ? { caixas: input.boxCount, unidades_por_caixa: input.unitsPerBox }
        : null;

    const { error } = await supabase.from("stock_movements").insert({
      raw_material_id: input.rawMaterialId,
      type: "entrada",
      quantity: input.quantity,
      reason: "compra",
      supplier_id: input.supplierId,
      unit_cost: input.unitCost,
      batch_info: batchInfo,
      created_by: userData.user?.id,
    });
    if (error) {
      toast.error("Erro ao registrar entrada: " + error.message);
      return false;
    }
    toast.success("Entrada registrada");
    await Promise.all([loadRawMaterials(), loadAlerts()]);
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
    inputs: ProductionRecipeInput[];
  }) => {
    const { data: recipeRow, error: recipeErr } = await supabase
      .from("production_recipes")
      .insert({
        name: input.name,
        output_raw_material_id: input.outputRawMaterialId,
        output_quantity: input.outputQuantity,
        shelf_life_days: input.shelfLifeDays,
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
      const { error: inputsErr } = await supabase.from("production_batch_inputs").insert(
        input.inputsUsed.map((i) => ({
          batch_id: batchRow.id,
          raw_material_id: i.rawMaterialId,
          quantity_used: i.quantityUsed,
        }))
      );
      if (inputsErr) {
        toast.error("Erro ao registrar consumo de insumos: " + inputsErr.message);
        return false;
      }
    }

    toast.success(`Lote produzido — etiqueta ${batchRow.batch_code}`);
    await Promise.all([loadRawMaterials(), loadLabels(), loadAlerts()]);
    return true;
  };

  return {
    rawMaterials,
    suppliers,
    recipes,
    labels,
    alerts,
    loading,
    refreshAll,
    createRawMaterial,
    registerPurchase,
    createSupplier,
    createRecipe,
    produceBatch,
  };
};
