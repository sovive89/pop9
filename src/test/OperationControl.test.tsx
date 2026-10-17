import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ open: false, activeSessions: 0, canCashier: true, change: vi.fn(), select: vi.fn(), reload: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ units: [{ id: "unit", name: "Unidade teste" }, { id: "other", name: "Outra unidade" }], businessUnitId: "unit", selectBusinessUnit: mock.select }) }));
vi.mock("@/hooks/useUnitOperation", () => ({ useUnitOperation: () => ({ identity: "admin:unit", businessUnitId: "unit", open: mock.open, activeSessions: mock.activeSessions, loading: false, error: false, reload: mock.reload }), setUnitOperation: mock.change }));
vi.mock("@/hooks/useUnitRoles", () => ({ useUnitRoles: () => ({ canCashier: mock.canCashier, loading: false, error: false }) }));
import OperationControl from "@/components/OperationControl";
beforeEach(() => { mock.open = false;mock.activeSessions = 0;mock.canCashier = true;mock.change.mockReset().mockResolvedValue(undefined);mock.reload.mockClear();mock.select.mockClear(); });
describe("operation buttons", () => {
  it("starts an operation for the selected unit", async () => { render(<OperationControl />);fireEvent.click(screen.getByRole("button", { name: "Iniciar operação" }));expect(mock.change).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button", { name: "Confirmar abertura" }));await waitFor(() => expect(mock.change).toHaveBeenCalledWith("unit", true)); });
  it("opens the chosen unit and changes context only after server confirmation", async () => {
    render(<OperationControl />);fireEvent.click(screen.getByRole("button", {name:"Iniciar operação"}));
    fireEvent.change(screen.getByRole("combobox",{name:"Unidade da operação"}),{target:{value:"other"}});
    expect(mock.change).not.toHaveBeenCalled();expect(mock.select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Confirmar abertura"}));
    await waitFor(()=>expect(mock.change).toHaveBeenCalledWith("other",true));
    await waitFor(()=>expect(mock.select).toHaveBeenCalledWith("other"));
  });
  it("preserves the active unit if opening the chosen unit is refused", async () => {
    mock.change.mockRejectedValueOnce(new Error("Sem permissão"));render(<OperationControl />);
    fireEvent.click(screen.getByRole("button",{name:"Iniciar operação"}));
    fireEvent.change(screen.getByRole("combobox",{name:"Unidade da operação"}),{target:{value:"other"}});
    fireEvent.click(screen.getByRole("button",{name:"Confirmar abertura"}));
    await waitFor(()=>expect(mock.reload).toHaveBeenCalled());expect(mock.select).not.toHaveBeenCalled();
  });
  it("requires confirmation and blocks closing while comandas remain open", async () => {
    mock.open = true;mock.activeSessions = 1;render(<OperationControl />);fireEvent.click(screen.getByRole("button", { name: "Fechar operação" }));
    expect(screen.getByRole("button", { name: "Confirmar fechamento" })).toBeDisabled();expect(mock.change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar comandas" }));expect(mock.reload).toHaveBeenCalled();
  });
  it("closes only after confirmation when all comandas are finalized", async () => {
    mock.open = true;render(<OperationControl />);fireEvent.click(screen.getByRole("button", { name: "Fechar operação" }));expect(mock.change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar fechamento" }));await waitFor(() => expect(mock.change).toHaveBeenCalledWith("unit", false));
  });
  it("does not expose start/close to attendants", () => { mock.canCashier = false;render(<OperationControl />);expect(screen.queryByRole("button", { name: "Iniciar operação" })).not.toBeInTheDocument(); });
});
