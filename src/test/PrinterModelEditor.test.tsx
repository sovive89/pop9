import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import PrinterModelEditor from "@/components/admin/PrinterModelEditor";
import { defaultPrintLayout, type PrintLayout } from "@/lib/printLayout";

afterEach(cleanup);
const props = () => ({ open: true, onOpenChange: vi.fn(), trigger: "comanda_cozinha" as const, value: { ...defaultPrintLayout(), header: "Salvo" }, onApply: vi.fn(), preview: (_layout: PrintLayout) => '<html><body>TESTE</body></html>' });
describe("printer model editing", () => {
  it("keeps edits local until apply, and cancellation does not overwrite the saved model", () => {
    const p = props();render(<PrinterModelEditor {...p} />);
    fireEvent.change(screen.getByLabelText("Cabeçalho adicional"), { target: { value: "Rascunho" } });
    expect(p.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(p.onOpenChange).toHaveBeenCalledWith(false);expect(p.onApply).not.toHaveBeenCalled();
  });
  it("applies independent visibility settings and restores the default model", () => {
    const p = props();render(<PrinterModelEditor {...p} />);
    fireEvent.click(screen.getByText("Mostrar modificações e observações"));
    expect(screen.getByRole("alert")).toHaveTextContent("não aparecerão");
    fireEvent.click(screen.getByText("Aplicar alterações"));
    expect(p.onApply).toHaveBeenCalledWith(expect.objectContaining({ header: "Salvo", showModifications: false }));
    fireEvent.click(screen.getByText("Restaurar padrão"));
    fireEvent.click(screen.getByText("Aplicar alterações"));
    expect(p.onApply).toHaveBeenLastCalledWith(defaultPrintLayout());
  });
});
