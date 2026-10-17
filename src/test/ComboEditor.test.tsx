import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Combo } from "@/lib/combos";

const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue("saved"), saved: vi.fn(), cancel: vi.fn() }));
vi.mock("@/hooks/useCombos", () => ({ saveCombo: mocks.save, deleteCombo: vi.fn(), useCombos: vi.fn() }));
vi.mock("@/hooks/useUnitRoles", () => ({ useUnitRoles: () => ({ roles: ["admin"], loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ComboEditor } from "@/components/admin/CombosTab";

const menu = [
  { id: "burger", name: "Burger", price: 30, active: true, status: "published", category: "food", comboEligible: true },
  { id: "fries", name: "Fritas", price: 15, active: true, status: "published", category: "food", comboEligible: true },
  { id: "draft", name: "Rascunho", price: 9, active: true, status: "draft", category: "food", comboEligible: true },
];
const option = (id: string) => ({ id, menuItemId: id, extraPrice: 0, isFree: false });
const ready = (): Combo => ({ id: "ready", name: "Combo Casa", description: null, pricingMode: "fixed", price: 39.9, discount: 0, active: true,
  slots: [{ id: "s1", label: "Lanche", options: [option("burger")] }, { id: "s2", label: "Porção", options: [option("fries")] }] });
const show = (initial = ready()) => render(<ComboEditor initial={initial} menu={menu} categories={[{ key: "food", label: "Comida" }]}
  unit="unit-a" sortOrder={2} onSaved={mocks.saved} onCancel={mocks.cancel} />);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("cadastro administrativo de combos", () => {
  it.each([
    ["fixed", "Preço do combo (R$)", "35.90", 35.9, 0],
    ["percent", "Desconto (%)", "10", null, 10],
    ["amount", "Desconto (R$)", "5", null, 5],
  ])("salva um combo pronto com cobrança %s na unidade ativa", async (mode, field, value, price, discount) => {
    show();
    expect(screen.getByLabelText("Tipo de combo")).toHaveValue("ready");
    fireEvent.change(screen.getByLabelText("Como cobrar"), { target: { value: mode } });
    fireEvent.change(screen.getByLabelText(field as string), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar combo" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenCalledWith("unit-a", expect.objectContaining({ pricingMode: mode, price, discount,
      slots: ready().slots }), 2);
  });

  it("cria componentes fixos e permite duas unidades do mesmo item em linhas distintas", async () => {
    show({ ...ready(), id: "", name: "", slots: [{ id: "s1", label: "Item 1", options: [] }, { id: "s2", label: "Item 2", options: [] }] });
    expect(screen.getByRole("button", { name: "Salvar combo" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Duplo Burger" } });
    for (const label of ["Item 1", "Item 2"]) {
      fireEvent.change(screen.getByLabelText(`Categoria da etapa ${label}`), { target: { value: "food" } });
      expect(screen.queryByRole("option", { name: /Rascunho/ })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(`Escolher item da categoria para etapa ${label}`), { target: { value: "burger" } });
      expect(screen.queryByLabelText(`Escolher item da categoria para etapa ${label}`)).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Salvar combo" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const saved = mocks.save.mock.calls[0][1] as Combo;
    expect(saved.slots.map((slot) => slot.options.map((opt) => opt.menuItemId))).toEqual([["burger"], ["burger"]]);
  });

  it("preserva as opções dos combos do cliente e exige removê-las antes de mudar para pronto", async () => {
    const initial = ready();
    initial.slots[0].options.push(option("fries"));
    show(initial);
    expect(screen.getByLabelText("Tipo de combo")).toHaveValue("choices");
    expect(screen.getByRole("option", { name: /Combo pronto/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar combo" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith("unit-a", initial, 2));
  });

  it("bloqueia gravar um combo com item que deixou de ser elegível", () => {
    const initial = ready();
    initial.slots[0].options = [option("removed")];
    show(initial);
    expect(screen.getByRole("button", { name: "Salvar combo" })).toBeDisabled();
    expect(screen.getByText(/Publique e libere este item/)).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
