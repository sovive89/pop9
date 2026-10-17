import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ select: vi.fn().mockReturnValue(true) }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId:"a",units:[{id:"a",name:"Unidade A"},{id:"b",name:"Unidade B"}],selectBusinessUnit:mock.select,loading:false }) }));
import BusinessUnitSelector from "@/components/BusinessUnitSelector";
afterEach(() => { cleanup();vi.restoreAllMocks();mock.select.mockClear(); });
describe("persistent unit selector", () => {
  it("keeps the active unit visible and cancels switching when edits are retained", () => {
    vi.spyOn(window,"confirm").mockReturnValue(false);render(<BusinessUnitSelector />);
    expect(screen.getByRole("combobox",{name:"Unidade ativa"})).toHaveValue("a");
    fireEvent.change(screen.getByRole("combobox"),{target:{value:"b"}});expect(mock.select).not.toHaveBeenCalled();
  });
  it("changes context after warning without calling operation controls", () => {
    vi.spyOn(window,"confirm").mockReturnValue(true);render(<BusinessUnitSelector />);
    fireEvent.change(screen.getByRole("combobox"),{target:{value:"b"}});expect(mock.select).toHaveBeenCalledWith("b");
  });
});
