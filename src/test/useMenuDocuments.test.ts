import {act,renderHook,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({unit:"a",query:vi.fn()}));
const user={id:"admin"};
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user})}));
vi.mock("@/hooks/useCurrentBusinessUnit",()=>({useCurrentBusinessUnit:()=>({businessUnitId:mocks.unit,units:[{id:mocks.unit,name:mocks.unit}]})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
  let unit="";const query={select:()=>query,eq:(key:string,value:string)=>{if(key==="business_unit_id")unit=value;return query;},order:()=>query,then:(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>Promise.resolve(mocks.query(table,unit)).then(resolve,reject)};return query;
}}}));
import {useMenuDocuments} from "@/hooks/useMenuDocuments";
const item={id:"burger",sku:null,name:"Hambúrguer",description:"Especial",price:20,category:"burgers",image_url:null,menu_item_ingredients:[],menu_item_variants:[]};
beforeEach(()=>{mocks.unit="a";mocks.query.mockReset();});
describe("document exports use real unit menu data",()=>{
  it("hides old-unit exports immediately and discards late responses",async()=>{
    let resolveA!:(value:unknown)=>void;
    mocks.query.mockImplementation((table:string,unit:string)=>table==="menu_categories" ? {data:[],error:null} : unit==="a" ? new Promise(resolve=>{resolveA=resolve;}) : {data:[{...item,id:"burger-b"}],error:null});
    const {result,rerender,unmount}=renderHook(()=>useMenuDocuments());
    await waitFor(()=>expect(mocks.query).toHaveBeenCalledWith("menu_items","a"));mocks.unit="b";rerender();expect(result.current.items).toEqual([]);
    await waitFor(()=>expect(result.current.items[0]?.id).toBe("burger-b"));await act(async()=>{resolveA({data:[item],error:null});});expect(result.current.items[0]?.id).toBe("burger-b");unmount();
  });
  it("does not replace a failed or empty query with fictitious static products",async()=>{
    mocks.query.mockResolvedValue({data:null,error:{message:"failed"}});const {result,unmount}=renderHook(()=>useMenuDocuments());await waitFor(()=>expect(result.current.error).toBe(true));expect(result.current.items).toEqual([]);unmount();
    mocks.query.mockResolvedValue({data:[],error:null});const next=renderHook(()=>useMenuDocuments());await waitFor(()=>expect(next.result.current.loading).toBe(false));expect(next.result.current.items).toEqual([]);expect(next.result.current.error).toBe(false);next.unmount();
  });
});
