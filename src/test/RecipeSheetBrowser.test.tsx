import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/utils/recipeSheets", () => ({ exportJsonFiles:mock.load }));
import RecipeSheetBrowser from "@/components/admin/RecipeSheetBrowser";
afterEach(() => { cleanup();mock.load.mockReset(); });
describe("in-app recipe sheets", () => {
  it("opens ingredients and yield without downloading a file", async () => {
    mock.load.mockResolvedValue({"recipe.json":JSON.stringify({id:"r",nome:"Molho",tipo:"producao",saida:{quantidade:1,unidade:"kg"},componentes:[{nome:"Tomate",quantidade:500,unidade:"g"}]})});
    render(<RecipeSheetBrowser businessUnitId="a" />);
    await waitFor(()=>expect(screen.getByText("Molho · Produção")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Molho · Produção"));expect(screen.getByText("Tomate")).toBeInTheDocument();expect(screen.getByText("Rendimento: 1 kg")).toBeInTheDocument();
  });
  it("discards an old unit's response after switching", async () => {
    let finish!: (value:Record<string,string>)=>void;
    mock.load.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({});
    const {rerender}=render(<RecipeSheetBrowser businessUnitId="a" />);rerender(<RecipeSheetBrowser businessUnitId="b" />);
    await act(async()=>{finish({"a.json":JSON.stringify({id:"a",nome:"Privado A",tipo:"cardapio",componentes:[]})});});
    expect(screen.queryByText(/Privado A/)).not.toBeInTheDocument();expect(screen.getByText(/Nenhuma ficha cadastrada/)).toBeInTheDocument();
  });
});
