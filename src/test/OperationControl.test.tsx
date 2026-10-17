import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ open: false, activeSessions: 0, canCashier: true, change: vi.fn(), reload: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/hooks/useUnitOperation", () => ({ useUnitOperation: () => ({ identity: "admin:unit", businessUnitId: "unit", open: mock.open, activeSessions: mock.activeSessions, loading: false, error: false, reload: mock.reload }), setUnitOperation: mock.change }));
vi.mock("@/hooks/useUnitRoles", () => ({ useUnitRoles: () => ({ canCashier: mock.canCashier, loading: false, error: false }) }));
import OperationControl from "@/components/OperationControl";
beforeEach(() => { mock.open = false;mock.activeSessions = 0;mock.canCashier = true;mock.change.mockReset().mockResolvedValue(undefined);mock.reload.mockClear(); });
describe("operation buttons", () => {
  it("starts an operation for the selected unit", async () => { render(<OperationControl />);fireEvent.click(screen.getByRole("button", { name: "Iniciar operação" }));await waitFor(() => expect(mock.change).toHaveBeenCalledWith("unit", true)); });
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
