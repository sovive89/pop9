// @vitest-environment node
import { describe,expect,it } from "vitest";
import { unzipSync,strFromU8 } from "fflate";
import {menuCsv,buildMenuPdf,buildMenuPackage,exportInstructions} from "@/utils/menuExport";
import type {DocumentMenuItem} from "@/hooks/useMenuDocuments";
import {safeFileName,buildCsv} from "@/utils/fileExport";
const item:DocumentMenuItem={id:"burger-1",sku:"B01",name:"Hambúrguer especial",description:'Pão, carne e "queijo"\nPreparado na hora.',price:24.5,category:"lanches",categoryLabel:"Lanches",imageUrl:null,ingredients:[{name:"Bacon",removable:false,extraPrice:3},{name:"Cebola",removable:true,extraPrice:0}],variants:["Ao ponto","Bem passado"]};
describe("menu documents generated artifacts",()=>{
  it("exports quoted UTF-8 CSV with prices and all registered options",()=>{
    const csv=menuCsv([item]);expect(csv.startsWith("\uFEFF")).toBe(true);expect(csv).toContain('"24.50"');expect(csv).toContain('"Ao ponto | Bem passado"');expect(csv).toContain('"Bacon: 3.00"');expect(csv).toContain('"Cebola"');expect(csv).toContain('""queijo""');
  });
  it("neutralizes formulas and path names without losing Unicode display data",()=>{
    expect(buildCsv([["=CMD(1)"," +2","@SUM(A1)","-3","Normal"]])).toContain('"\'=CMD(1)"');expect(safeFileName("../../Hambúrguer especial")).toBe("Hamburguer-especial");
  });
  it("produces a real multipage PDF without dropping long menu descriptions",async()=>{
    const bytes=await buildMenuPdf("Confit Burguer",Array.from({length:20},(_,index)=>({...item,id:String(index),name:`Produto ${index+1}`,description:"Descrição detalhada com ingredientes. ".repeat(20)})));
    const pdf=Buffer.from(bytes).toString("latin1");expect(pdf.startsWith("%PDF-")).toBe(true);expect(pdf.match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);expect(pdf).toContain("%%EOF");
  });
  it("includes PDF, CSV, original images, manifest and honest platform instructions in each ZIP",async()=>{
    const image={itemId:item.id,fileName:"imagens/001-burger.png",bytes:new Uint8Array([1,2,3]),mime:"image/png"};
    for(const target of ["ifood","99food"] as const){
      const bytes=await buildMenuPackage(target,"Confit Burguer",[item],[image],["Item sem imagem"]);
      const files=unzipSync(bytes);expect(Object.keys(files)).toEqual(expect.arrayContaining(["cardapio.pdf","cardapio.csv","imagens.csv","LEIA-ME.txt","imagens/001-burger.png"]));
      expect(strFromU8(files["LEIA-ME.txt"])).toContain("Item sem imagem");expect(strFromU8(files["LEIA-ME.txt"])).toContain("não é um modelo oficial");expect(files[image.fileName]).toEqual(image.bytes);
      expect(strFromU8(files["imagens.csv"])).toContain("001-burger.png");expect(strFromU8(files["cardapio.csv"])).toContain("Hambúrguer especial");
    }
  });
  it("embeds readable product images into the PDF and reports malformed image files",async()=>{
    const bytes=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGO8kinBQApgIkn1qIZRDUNKAwBGrgF1ijymmAAAAABJRU5ErkJggg==","base64"));
    const pdf=await buildMenuPdf("Confit",[item],[{itemId:item.id,fileName:"burger.png",bytes,mime:"image/png"}]);
    expect(Buffer.from(pdf).toString("latin1")).toContain("/Subtype /Image");
    const missing:string[]=[];
    await buildMenuPdf("Confit",[item],[{itemId:item.id,fileName:"broken.png",bytes:new Uint8Array([1,2]),mime:"image/png"}],message=>missing.push(message));
    expect(missing[0]).toContain("não foi possível incluí-la no PDF");
  });
  it("gives different verified submission paths for iFood and 99Food",()=>{
    expect(exportInstructions("ifood",[])).toContain("digitalização");expect(exportInstructions("99food",[])).toContain("Cardápio da Loja");
  });
});
