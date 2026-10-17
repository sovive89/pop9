import { createRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecipeBuilder, { type RecipeBuilderHandle } from "@/components/admin/RecipeBuilder";
const mocks = vi.hoisted(() => ({ error: vi.fn(), from: vi.fn(), unit: "unit-1", loadError: null as { message: string } | null }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/hooks/useCurrentBusinessUnit", () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: mocks.unit }) }));
vi.mock("@/hooks/useStockData", () => ({ useStockData: () => ({ ready: true,
  rawMaterials: [{ id: "tomato", name: "Tomate", unit: "g" }, { id: "blend", name: "Blend 200g", unit: "un", isProduced: true },
    { id: "initial", name: "Queijo inicial", unit: "un", isTheoretical: true, currentStock: 0 }],
  recipes: [{ id: "blend-recipe", outputRawMaterialId: "blend", outputQuantity: 1, inputs: [{ rawMaterialId: "tomato", quantity: 200 }] }],
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
beforeEach(() => { vi.clearAllMocks(); mocks.unit="unit-1";mocks.loadError=null;
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: async () => ({ data: [], error: mocks.loadError }) }) })); });
afterEach(cleanup);
const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
function produced() {
  fireEvent.click(screen.getByRole("button", { name: "Adicionar insumo" }));
  fill("Nome do novo insumo", "Molho"); fill("Unidade de medida do insumo", "kg");fill("Quantidade do insumo por item", "0.05");
  fireEvent.click(screen.getByLabelText("É produzido: tem receita própria"));
}
describe("technical recipe draft", () => {
  it("autocomplete reuses an existing material and its unit", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);
    fireEvent.click(screen.getByRole("button", {name:"Adicionar insumo"}));
    const name=screen.getByLabelText("Nome do novo insumo");fireEvent.focus(name);fireEvent.change(name,{target:{value:"tom"}});
    fireEvent.keyDown(name,{key:"ArrowDown"});fireEvent.keyDown(name,{key:"Enter"});
    expect(screen.getByLabelText("Insumo")).toHaveValue("tomato");expect(screen.getByLabelText("Unidade de medida do insumo")).toHaveValue("g");
    fill("Quantidade do insumo por item","150");expect(ref.current!.validate()).toBe(true);
    expect(ref.current!.getDraft()).toEqual([expect.objectContaining({rawMaterialId:"tomato",quantity:150,preparation:null})]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("includes produced material and bases in one payload without writing inventory", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);produced();
    fill("Nome do novo insumo-base","Tomate novo");fill("Unidade de medida do insumo-base","g");fill("Quantidade do insumo-base","800");fill("Quantidade de referência da receita","2");
    expect(ref.current!.validate()).toBe(true);expect(ref.current!.getDraft()).toEqual([{rawMaterialId:"",newName:"Molho",newUnit:"kg",quantity:0.05, transformation:"producao",
      preparation:{requestId:expect.any(String),outputQuantity:2,outputUnit:"kg",inputs:[{rawMaterialId:"",newName:"Tomate novo",newUnit:"g",quantity:800}]}}]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("can reuse an existing base material", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);produced();fill("Insumo-base","tomato");fill("Quantidade do insumo-base","250");
    expect(screen.getByLabelText("Unidade de medida do insumo-base")).toHaveValue("g");expect(ref.current!.validate()).toBe(true);
    expect(ref.current!.getDraft()[0].preparation!.inputs[0]).toMatchObject({rawMaterialId:"tomato",quantity:250});
  });
  it("rejects nonpositive quantities before a save", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);produced();fill("Nome do novo insumo-base","Tomate");fill("Quantidade do insumo-base","0");
    expect(ref.current!.validate()).toBe(false);expect(mocks.error).toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
  });
  it("blocks saving when the previous recipe cannot be read", async () => {
    mocks.loadError={message:"Não autorizado"};const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref} menuItemId="existing"/>);
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Não autorizado"));expect(ref.current!.validate()).toBe(false);
  });
  it("clears a new-item recipe when changing units", () => {
    const ref=createRef<RecipeBuilderHandle>();const view=render(<RecipeBuilder ref={ref}/>);produced();mocks.unit="unit-2";view.rerender(<RecipeBuilder ref={ref}/>);
    expect(ref.current!.getDraft()).toEqual([]);
  });
  it("can yield one produced unit while consuming bases in grams", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);produced();
    fill("Unidade do rendimento","un");fill("Insumo-base","tomato");fill("Quantidade do insumo-base","200");
    expect(screen.getByLabelText("Quantidade do insumo por item")).toHaveValue(1);
    expect(screen.getByLabelText("Unidade de medida do insumo")).toHaveValue("un");
    expect(ref.current!.validate()).toBe(true);expect(ref.current!.getDraft()[0]).toMatchObject({quantity:1,newUnit:"un",
      preparation:{outputQuantity:1,outputUnit:"un",inputs:[{rawMaterialId:"tomato",quantity:200,newUnit:"g"}]}});
  });
  it("reuses the existing produced recipe and defaults to one unit per menu item", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);
    fireEvent.click(screen.getByRole("button",{name:"Adicionar insumo"}));fill("Insumo","blend");
    expect(screen.getByLabelText("Quantidade do insumo por item")).toHaveValue(1);
    expect(screen.getByLabelText("Quantidade do insumo-base")).toHaveValue(200);
    expect(screen.getByLabelText("Unidade de medida do insumo-base")).toHaveValue("g");
    expect(screen.queryByRole("button",{name:"Salvar receita de produção"})).not.toBeInTheDocument();
    expect(ref.current!.getDraft()[0]).toMatchObject({rawMaterialId:"blend",quantity:1,newUnit:"un",preparation:null});
  });
  it("lets the initial stock unit differ from the displayed recipe measure", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);
    fireEvent.click(screen.getByRole("button",{name:"Adicionar insumo"}));fill("Nome do novo insumo","Queijo");
    expect(screen.queryByLabelText("Unidade-base inicial do insumo")).not.toBeInTheDocument();
    fill("Unidade de medida do insumo","g");expect(screen.getByText(/Estoque controlado em/)).toHaveTextContent('Estoque controlado em g');
    fireEvent.click(screen.getByRole('button',{name:'Alterar unidade do estoque do insumo'}));
    fill("Unidade-base inicial do insumo","kg");fireEvent.click(screen.getByRole('button',{name:'Close'}));
    fill("Unidade de medida do insumo","g");fill("Quantidade do insumo por item","30");
    expect(screen.queryByLabelText("Unidade-base inicial do insumo")).not.toBeInTheDocument();
    expect(screen.getByText(/Estoque controlado em/)).toHaveTextContent('Estoque controlado em kg');
    expect(ref.current!.getDraft()[0]).toMatchObject({stockUnit:"kg",newUnit:"g",quantity:30});
    expect(ref.current!.validate()).toBe(true);
  });
  it("makes the initial measure editable before use and preserves an entered quantity", () => {
    const ref=createRef<RecipeBuilderHandle>();render(<RecipeBuilder ref={ref}/>);
    fireEvent.click(screen.getByRole("button",{name:"Adicionar insumo"}));fill("Insumo","initial");
    fill("Unidade de medida do insumo","g");fill("Quantidade do insumo por item","30");
    fireEvent.click(screen.getByRole('button',{name:'Alterar unidade do estoque do insumo'}));fill("Unidade-base inicial do insumo","kg");
    fireEvent.click(screen.getByRole('button',{name:'Close'}));
    expect(ref.current!.getDraft()[0]).toMatchObject({rawMaterialId:"initial",stockUnit:"kg",newUnit:"g",quantity:30});
    fill("Insumo","blend");expect(screen.queryByRole('button',{name:'Alterar unidade do estoque do insumo'})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Unidade-base inicial do insumo")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Estoque controlado em/)[0]).toHaveTextContent('Estoque controlado em un');
  });
});
