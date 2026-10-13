import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), scope: "admin:unit" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: "unit", units: [{ id: "unit", name: "Loja teste" }] }) }));
vi.mock("@/hooks/usePrinterConfigs", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/usePrinterConfigs")>("@/hooks/usePrinterConfigs");
  return { ...actual, usePrinterConfigs: () => ({ printers: [], loading: false, error: false, scope: mock.scope, reload: vi.fn(), createPrinter: mock.create, updatePrinter: mock.update, deletePrinter: vi.fn() }) };
});
import PrintersTab from "@/components/admin/PrintersTab";
beforeEach(() => { mock.scope = "admin:unit";mock.create.mockReset().mockResolvedValue(true);mock.update.mockReset(); });
describe("printer preset configuration", () => {
  it("applies the bar model, previews only bar items and saves the sector/settings", async () => {
    render(<PrintersTab />);fireEvent.click(screen.getByRole("button", { name: "Nova impressora" }));
    fireEvent.change(screen.getByLabelText("Modelo predefinido"), { target: { value: "bar" } });fireEvent.click(screen.getByRole("button", { name: "Aplicar modelo" }));
    expect(screen.getByLabelText("Setor da impressora")).toHaveValue("bar");fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    const frame = screen.getByTitle("Prévia do modelo de impressão");expect(frame.getAttribute("srcdoc")).toContain("SUCO DE EXEMPLO");expect(frame.getAttribute("srcdoc")).not.toContain("HAMBÚRGUER DE EXEMPLO");expect(frame).toHaveAttribute("sandbox", "");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));await waitFor(() => expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Impressora Bar", setor: "bar", destinos: ["bar"], paperWidth: 80, copies: 1, autoCut: true, gatilhos: ["comanda_cozinha"] })));
  });
  it("closes the old-unit form on a scope change instead of saving it in the next unit", () => {
    const { rerender } = render(<PrintersTab />);fireEvent.click(screen.getByRole("button", { name: "Nova impressora" }));fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Impressora da unidade anterior" } });
    mock.scope = "admin:other";rerender(<PrintersTab />);expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(mock.create).not.toHaveBeenCalled();
  });
});
