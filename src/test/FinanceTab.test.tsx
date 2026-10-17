import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ error: false, payments: [] as {amount:number;service_charge:number}[], reload: vi.fn() }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: "unit-1", units: [{id:"unit-1",name:"Bar teste"}] }) }));
vi.mock("@/hooks/useOperationalReportData", () => ({ useOperationalReportData: () => ({ payments: mock.payments, orders: [], loading: false, error: mock.error, reload: mock.reload }) }));
vi.mock("@/components/admin/WasteSection", () => ({ default: () => <p>Perdas reais</p> }));
import FinanceTab from "@/components/admin/FinanceTab";
afterEach(() => { cleanup(); mock.payments = []; mock.error = false; });
describe("Financeiro sem demonstração", () => {
  it("shows the empty active unit without invented products or fixed costs", () => {
    render(<MemoryRouter><FinanceTab /></MemoryRouter>);
    expect(screen.getByText(/Nenhum pagamento confirmado/)).toBeInTheDocument();
    expect(screen.queryByText("Batata Frita")).not.toBeInTheDocument();
    expect(screen.queryByText(/amostra/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Atualizar financeiro"}));expect(mock.reload).toHaveBeenCalled();
  });
  it("separates actual principal receipts from service charges", () => {
    mock.payments = [{amount:20,service_charge:2},{amount:30,service_charge:3}];
    render(<MemoryRouter><FinanceTab /></MemoryRouter>);
    expect(screen.getByText(/50,00/)).toBeInTheDocument();expect(screen.getByText(/5,00/)).toBeInTheDocument();
  });
  it("does not present a failed lookup as zero revenue", () => {
    mock.error=true;render(<MemoryRouter><FinanceTab /></MemoryRouter>);
    expect(screen.getByRole("alert")).toBeInTheDocument();expect(screen.queryByText("Recebimentos confirmados")).not.toBeInTheDocument();
  });
});
