import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import FinanceTab from "@/components/admin/FinanceTab";

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
});
