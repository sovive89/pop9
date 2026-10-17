import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ComboBuilder from "@/components/ComboBuilder";
import type { Combo } from "@/lib/combos";

const menuItems = [{ id: "burger", name: "Burger", price: 30 }, { id: "coke", name: "Coca", price: 7 }, { id: "juice", name: "Suco", price: 10 }];
const option = (id: string) => ({ id, menuItemId: id, extraPrice: 0, isFree: false });
const combo: Combo = { id: "combo", name: "Combo Casa", description: null, pricingMode: "fixed", price: 29.9, discount: 0, active: true,
  slots: [{ id: "food", label: "Lanche", options: [option("burger")] }, { id: "drink", label: "Bebida", options: [option("coke")] }] };
afterEach(cleanup);

describe("pedido de combos cadastrados", () => {
  it("adiciona o combo pronto inteiro sem exigir escolhas do cliente", () => {
    const onAdd = vi.fn();
    render(<ComboBuilder combos={[combo]} menuItems={menuItems} onAdd={onAdd} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Combo Casa/ }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar combo" }));
    const lines = onAdd.mock.calls[0][0];
    expect(lines.map((line: { menuItemId: string }) => line.menuItemId)).toEqual(["burger", "coke"]);
    expect(Math.round(lines.reduce((sum: number, line: { price: number }) => sum + line.price, 0) * 100)).toBe(2990);
    expect(lines[0].comboGroupId).toBe(lines[1].comboGroupId);
  });

  it("mantém escolhas do cliente e o combo montado na hora", () => {
    const onAdd = vi.fn();
    const choices = { ...combo, slots: [combo.slots[0], { ...combo.slots[1], options: [option("coke"), option("juice")] }] };
    render(<ComboBuilder combos={[choices]} menuItems={menuItems} onAdd={onAdd} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Montar combo na hora/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Combo Casa/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Suco" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar combo" }));
    expect(onAdd.mock.calls[0][0].map((line: { menuItemId: string }) => line.menuItemId)).toEqual(["burger", "juice"]);
  });
});
