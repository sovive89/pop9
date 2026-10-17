import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ unit: "a", export: vi.fn(), zip: vi.fn(), download: vi.fn() }));
vi.mock("@/hooks/useMenuDocuments", () => ({ useMenuDocuments: () => ({ items: [], loading: false, error: false, businessUnitId: mock.unit, unitName: mock.unit, scope: mock.unit, reload: vi.fn() }) }));
vi.mock("@/components/admin/RecipeSheetBrowser", () => ({ default: () => null }));
vi.mock("@/components/admin/OperationalLinks", () => ({ default: () => null }));
vi.mock("@/utils/recipeSheets", () => ({ exportJsonFiles: mock.export, zipFiles: mock.zip, templateFiles: () => ({ "template.csv": "example" }) }));
vi.mock("@/utils/fileExport", () => ({ downloadBlob: mock.download, safeFileName: (value: string) => value }));
import DocumentsTab from "@/components/admin/DocumentsTab";
beforeEach(() => { mock.unit = "a";mock.export.mockReset();mock.zip.mockReset().mockResolvedValue(new Uint8Array([1, 2]));mock.download.mockReset(); });
const view = () => <MemoryRouter><DocumentsTab /></MemoryRouter>;
describe("technical-sheet export respects unit changes", () => {
  it("discards the export when the unit changes while reading the recipes", async () => {
    let finish!: (value: unknown) => void;mock.export.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(view());fireEvent.click(screen.getByRole("button", { name: "Exportar fichas em JSON" }));
    await waitFor(() => expect(mock.export).toHaveBeenCalledWith("a"));mock.unit = "b";rerender(view());
    await act(async () => { finish({ "recipes.csv": "private-a" }); });expect(mock.download).not.toHaveBeenCalled();
  });
  it("discards an export that finishes after the Central is closed", async () => {
    let finish!: (value: unknown) => void;mock.export.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { unmount } = render(view());fireEvent.click(screen.getByRole("button", { name: "Exportar fichas em JSON" }));await waitFor(() => expect(mock.export).toHaveBeenCalled());
    unmount();await act(async () => { finish({ "recipes.json": "private" }); });expect(mock.download).not.toHaveBeenCalled();
  });
});
