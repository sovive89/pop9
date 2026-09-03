import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Plus, Trash2, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useStockData } from "@/hooks/useStockData";
import { toast } from "sonner";

interface SubInput {
  rawMaterialId: string;
  quantity: string;
}

interface RecipeRow {
  key: string;
  rawMaterialId: string; // "" = criando um novo insumo (newName abaixo)
  newName: string;
  newUnit: string;
  isProduced: boolean; // insumo novo é "produzido" (tem receita própria, diferente da ficha técnica do prato)
  quantity: string;
  subInputs: SubInput[];
}

export interface RecipeBuilderHandle {
  /** Cria os insumos/receitas novos (se houver) e grava recipe_items pro menu_item. */
  commit: (menuItemId: string) => Promise<boolean>;
}

interface Props {
  menuItemId?: string; // ausente = item novo, ainda sem recipe_items pra carregar
}

const emptyRow = (): RecipeRow => ({
  key: crypto.randomUUID(),
  rawMaterialId: "",
  newName: "",
  newUnit: "un",
  isProduced: false,
  quantity: "",
  subInputs: [],
});

const RecipeBuilder = forwardRef<RecipeBuilderHandle, Props>(({ menuItemId }, ref) => {
  const { rawMaterials, createRawMaterial, createRecipe, refreshAll } = useStockData();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [loaded, setLoaded] = useState(!menuItemId);

  useEffect(() => {
    if (!menuItemId) return;
    supabase
      .from("recipe_items")
      .select("id, raw_material_id, quantity")
      .eq("menu_item_id", menuItemId)
      .then(({ data }) => {
        setRows(
          (data ?? []).map((r) => ({
            ...emptyRow(),
            key: r.id,
            rawMaterialId: r.raw_material_id,
            quantity: String(r.quantity),
          }))
        );
        setLoaded(true);
      });
  }, [menuItemId]);

  useImperativeHandle(ref, () => ({
    commit: async (targetMenuItemId: string) => {
      const validRows = rows.filter((r) => (r.rawMaterialId || r.newName.trim()) && r.quantity);
      if (validRows.length === 0) {
        await supabase.from("recipe_items").delete().eq("menu_item_id", targetMenuItemId);
        return true;
      }

      const resolvedIds: string[] = [];

      for (const row of validRows) {
        if (row.rawMaterialId) {
          resolvedIds.push(row.rawMaterialId);
          continue;
        }

        // Ingrediente novo: cria em raw_materials como "teórico" (current_stock
        // fica 0 até o primeiro lançamento real de compra/produção) — não
        // precisa pré-cadastrar em Estoque antes de montar o cardápio.
        const created = await createRawMaterial({
          name: row.newName.trim(),
          unit: row.newUnit.trim() || "un",
          itemType: row.isProduced ? "semiacabado" : "insumo",
          minStock: 0,
        });
        if (!created) return false;

        await refreshAll();
        const { data: newMaterial } = await supabase
          .from("raw_materials")
          .select("id")
          .eq("name", row.newName.trim())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!newMaterial) {
          toast.error("Erro ao localizar insumo recém-criado");
          return false;
        }

        if (row.isProduced) {
          // Ficha técnica do INGREDIENTE (diferente da ficha técnica do
          // prato): uma production_recipe própria, com seus próprios
          // insumos-base.
          const subInputs = row.subInputs.filter((s) => s.rawMaterialId && s.quantity);
          const recipeOk = await createRecipe({
            name: `Receita — ${row.newName.trim()}`,
            outputRawMaterialId: newMaterial.id,
            outputQuantity: 1,
            shelfLifeDays: null,
            inputs: subInputs.map((s) => ({ rawMaterialId: s.rawMaterialId, quantity: Number(s.quantity) })),
          });
          if (!recipeOk) return false;
        }

        resolvedIds.push(newMaterial.id);
      }

      await supabase.from("recipe_items").delete().eq("menu_item_id", targetMenuItemId);
      const { error } = await supabase.from("recipe_items").insert(
        validRows.map((row, i) => ({
          menu_item_id: targetMenuItemId,
          raw_material_id: resolvedIds[i],
          quantity: Number(row.quantity),
        }))
      );
      if (error) {
        toast.error("Erro ao salvar ficha técnica: " + error.message);
        return false;
      }
      return true;
    },
  }));

  const addRow = () => setRows([...rows, emptyRow()]);
  const removeRow = (key: string) => setRows(rows.filter((r) => r.key !== key));
  const updateRow = (key: string, patch: Partial<RecipeRow>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addSubInput = (rowKey: string) =>
    updateRow(rowKey, {
      subInputs: [...(rows.find((r) => r.key === rowKey)?.subInputs ?? []), { rawMaterialId: "", quantity: "" }],
    });

  if (!loaded) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <ChefHat className="h-3.5 w-3.5" /> Ficha técnica
        </label>
        <button onClick={addRow} className="text-xs text-primary hover:underline flex items-center gap-1">
          <Plus className="h-3 w-3" /> Adicionar insumo
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Insumos que ainda não existem no estoque são criados automaticamente como "teóricos" (sem estoque real até o primeiro lançamento).
      </p>

      {rows.map((row) => (
        <div key={row.key} className="rounded-lg bg-secondary/30 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={row.rawMaterialId}
              onChange={(e) => updateRow(row.key, { rawMaterialId: e.target.value, newName: "" })}
              className="flex-1 h-8 rounded-md border border-border bg-muted px-2 text-xs text-foreground"
            >
              <option value="">— Criar novo insumo —</option>
              {rawMaterials.map((rm) => (
                <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</option>
              ))}
            </select>
            <Input
              type="number"
              step="0.001"
              value={row.quantity}
              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
              placeholder="Qtd"
              className="h-8 text-xs w-20"
            />
            <button onClick={() => removeRow(row.key)} className="text-destructive hover:text-destructive/80">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {!row.rawMaterialId && (
            <div className="flex items-center gap-2 pl-2">
              <Input
                value={row.newName}
                onChange={(e) => updateRow(row.key, { newName: e.target.value })}
                placeholder="Nome do novo insumo"
                className="h-8 text-xs flex-1"
              />
              <Input
                value={row.newUnit}
                onChange={(e) => updateRow(row.key, { newUnit: e.target.value })}
                placeholder="un"
                className="h-8 text-xs w-16"
              />
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={row.isProduced}
                  onChange={(e) => updateRow(row.key, { isProduced: e.target.checked })}
                />
                É produzido (tem receita própria)
              </label>
            </div>
          )}

          {!row.rawMaterialId && row.isProduced && (
            <div className="pl-4 space-y-1.5 border-l-2 border-primary/30 ml-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">Receita deste insumo (insumos-base):</p>
                <button onClick={() => addSubInput(row.key)} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-2.5 w-2.5" /> Adicionar
                </button>
              </div>
              {row.subInputs.map((sub, si) => (
                <div key={si} className="flex items-center gap-2">
                  <select
                    value={sub.rawMaterialId}
                    onChange={(e) => {
                      const next = [...row.subInputs];
                      next[si] = { ...next[si], rawMaterialId: e.target.value };
                      updateRow(row.key, { subInputs: next });
                    }}
                    className="flex-1 h-7 rounded-md border border-border bg-muted px-2 text-[10px] text-foreground"
                  >
                    <option value="">Selecione...</option>
                    {rawMaterials.map((rm) => (
                      <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="0.001"
                    value={sub.quantity}
                    onChange={(e) => {
                      const next = [...row.subInputs];
                      next[si] = { ...next[si], quantity: e.target.value };
                      updateRow(row.key, { subInputs: next });
                    }}
                    placeholder="Qtd"
                    className="h-7 text-[10px] w-16"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

RecipeBuilder.displayName = "RecipeBuilder";

export default RecipeBuilder;
