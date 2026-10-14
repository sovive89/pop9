import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import FinanceTab from "@/components/admin/FinanceTab";

vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: "unit-1" }) }));
vi.mock("@/hooks/useStockData", () => ({ useStockData: () => ({ rawMaterials: [{ id: "m1", name: "Tomate", unit: "g", active: true, isTheoretical: false }] }) }));
vi.mock("@/hooks/useWaste", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useWaste")>()),
  useWaste: () => ({ unit: "unit-1", loaded: true, error: false, reload: async () => {}, summary: [{ rawMaterialId: "m1", name: "Tomate", unit: "g", quantity: 900, cost: 9, events: 3, topMotivo: "Vencimento" }] }),
}));

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
beforeAll(() => { vi.stubGlobal("ResizeObserver", ResizeObserverStub); });
afterAll(() => { vi.unstubAllGlobals(); });
afterEach(cleanup);

describe("Financeiro", () => {
  it("mostra cada item como card ligado ao cardápio, à ficha e ao desperdício", () => {
    render(<MemoryRouter><FinanceTab /></MemoryRouter>);
    expect(screen.getByText(/Dados de amostra/)).toBeInTheDocument();
    const card = screen.getByRole("article", { name: "Batata Frita" });
    expect(card).toHaveTextContent("Desperdício");
    expect(card).toHaveTextContent("CMV real");
    expect(card.querySelector('a[href="/admin?sec=menu"]')).not.toBeNull();
    expect(card.querySelector('a[href="/admin?sec=stock"]')).not.toBeNull();
    expect(screen.getAllByText("Sugerir foto").length).toBeGreaterThan(0); // amostra não tem foto
  });
  it("mostra as perdas reais por insumo e o formulário de registro", () => {
    render(<MemoryRouter><FinanceTab /></MemoryRouter>);
    const card = screen.getByRole("article", { name: "Tomate" });
    expect(card).toHaveTextContent("900 g perdidos em 3 registros");
    expect(card).toHaveTextContent("Vencimento");
    fireEvent.click(screen.getByRole("button", { name: "Registrar perda" }));
    expect(screen.getByLabelText("Insumo perdido")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo da perda")).toBeInTheDocument();
  });
});
