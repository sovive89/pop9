import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecipeBuilder, { type RecipeBuilderHandle } from "@/components/admin/RecipeBuilder";

const mocks = vi.hoisted(() => ({
  createMaterial: vi.fn(), createRecipe: vi.fn(), error: vi.fn(), from: vi.fn(),
  upsert: vi.fn(), remove: vi.fn(), existing: [] as { id: string }[], loadError: null as { message: string } | null,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: "unit-1" }) }));
vi.mock("@/hooks/useStockData", () => ({ useStockData: () => ({
  rawMaterials: [{ id: "tomato", name: "Tomate", unit: "g" }],
  createRawMaterialRecord: mocks.createMaterial, createRecipe: mocks.createRecipe,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing = [];
  mocks.loadError = null;
  mocks.createMaterial.mockImplementation(async ({ name }: { name: string }) => `id-${name}`);
  mocks.createRecipe.mockResolvedValue(true);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.remove.mockReturnValue({ eq: () => ({ in: async () => ({ error: null }) }) });
  mocks.from.mockImplementation(() => ({
    select: () => ({ eq: async () => ({ data: mocks.existing, error: mocks.loadError }) }),
    upsert: mocks.upsert, delete: mocks.remove,
  }));
});
afterEach(cleanup);

const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
function createProducedIngredient() {
  fireEvent.click(screen.getByRole("button", { name: "Adicionar insumo" }));
  fill("Nome do novo insumo", "Molho");
  fill("Unidade de medida do insumo", "kg");
  fill("Quantidade do insumo por item", "0.05");
  fireEvent.click(screen.getByLabelText("É produzido: tem receita própria"));
}

describe("menu-first recipe building", () => {
  it("opens usable base ingredient fields and creates theoretical ingredients without stock movements", async () => {
    const ref = createRef<RecipeBuilderHandle>();
    render(<RecipeBuilder ref={ref} />);
    createProducedIngredient();
    expect(screen.getByLabelText("Nome do novo insumo-base")).toBeVisible();
    fill("Nome do novo insumo-base", "Tomate novo");
    fill("Unidade de medida do insumo-base", "g");
    fill("Quantidade do insumo-base", "800");
    fill("Quantidade de referência da receita", "2");
    let result: boolean;
    await act(async () => { result = await ref.current!.commit("menu-item"); });
    expect(result!).toBe(true);
    expect(mocks.createMaterial).toHaveBeenCalledWith({ name: "Molho", unit: "kg", itemType: "semiacabado", minStock: 0 });
    expect(mocks.createMaterial).toHaveBeenCalledWith({ name: "Tomate novo", unit: "g", itemType: "insumo", minStock: 0 });
    expect(mocks.createRecipe).toHaveBeenCalledWith(expect.objectContaining({
      outputRawMaterialId: "id-Molho", outputQuantity: 2, inputs: [{ rawMaterialId: "id-Tomate novo", quantity: 800 }],
    }));
    expect(mocks.upsert).toHaveBeenCalledWith([expect.objectContaining({ menu_item_id: "menu-item", raw_material_id: "id-Molho", quantity: 0.05 })], { onConflict: "id" });
    expect(mocks.from.mock.calls.every(([table]) => table === "recipe_items")).toBe(true);
  });

  it("reuses an existing base ingredient and shows its registered unit", async () => {
    const ref = createRef<RecipeBuilderHandle>();
    render(<RecipeBuilder ref={ref} />);
    createProducedIngredient();
    fill("Insumo-base", "tomato");
    expect(screen.getByLabelText("Unidade de medida do insumo-base")).toHaveValue("g");
    expect(screen.getByLabelText("Unidade de medida do insumo-base")).toHaveAttribute("readonly");
    fill("Quantidade do insumo-base", "250");
    await act(async () => { await ref.current!.commit("menu-item"); });
    expect(mocks.createMaterial).toHaveBeenCalledTimes(1);
    expect(mocks.createRecipe).toHaveBeenCalledWith(expect.objectContaining({ inputs: [{ rawMaterialId: "tomato", quantity: 250 }] }));
  });

  it("rejects missing or non-positive quantities before saving any data", async () => {
    const ref = createRef<RecipeBuilderHandle>();
    render(<RecipeBuilder ref={ref} />);
    createProducedIngredient();
    fill("Nome do novo insumo-base", "Tomate");
    fill("Quantidade do insumo-base", "0");
    expect(ref.current!.validate()).toBe(false);
    await act(async () => { expect(await ref.current!.commit("menu-item")).toBe(false); });
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.createMaterial).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("preserves the previous recipe when loading fails", async () => {
    mocks.loadError = { message: "Não autorizado" };
    const ref = createRef<RecipeBuilderHandle>();
    render(<RecipeBuilder ref={ref} menuItemId="existing-menu-item" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não autorizado"));
    expect(await ref.current!.commit("existing-menu-item")).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not erase saved rows when an upsert fails and retries without duplicating created ingredients", async () => {
    mocks.existing = [{ id: "old-row" }];
    mocks.upsert.mockResolvedValueOnce({ error: { message: "Falha de rede" } });
    const ref = createRef<RecipeBuilderHandle>();
    render(<RecipeBuilder ref={ref} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar insumo" }));
    fill("Nome do novo insumo", "Farinha");
    fill("Quantidade do insumo por item", "0.1");
    await act(async () => { expect(await ref.current!.commit("menu-item")).toBe(false); });
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => { expect(await ref.current!.commit("menu-item")).toBe(true); });
    expect(mocks.createMaterial).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
});
