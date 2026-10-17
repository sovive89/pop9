import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({unit:'a',reads:[] as {table:string;filters:Record<string,unknown>}[],rpc:vi.fn(),failure:false,
  delayed:false,finish:null as null|((result:unknown)=>void)}));
vi.mock('@/hooks/useCurrentBusinessUnit',()=>({useCurrentBusinessUnit:()=>({businessUnitId:mock.unit})}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc,from:(table:string)=>{
  const filters:Record<string,unknown>={};const read={table,filters};mock.reads.push(read);
  const q={select:()=>q,order:()=>q,limit:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},is:(k:string,v:unknown)=>{filters[k]=v;return q;},
    in:(k:string,v:unknown)=>{filters[k]=v;return q;},then:(resolve:(result:unknown)=>unknown)=>{
      const unit=String(filters.business_unit_id);const data=table==='raw_materials'?[{id:unit,name:unit,unit:'g',tipo:'insumo',is_produced:false,current_stock:3,min_stock:5,average_cost:2,active:true}]:
        table==='stock_lot_balances'?[{id:unit,raw_material_id:unit,numero_lote:unit,origem:'compra',quantidade_entrada:10,quantidade_restante:6,data_entrada:'2026-10-13',validade:null}]:
        table==='suppliers'?[{id:unit,name:unit,active:true}]:table==='production_recipes'?[{id:unit,name:unit,output_raw_material_id:unit,output_quantity:1,active:true}]:[];
      if(table==='raw_materials'&&mock.delayed&&unit==='a'){mock.delayed=false;return new Promise(done=>{mock.finish=done;}).then(resolve);}
      return Promise.resolve({data,error:mock.failure?{message:'Falha'}:null}).then(resolve);
    }};return q;
}}}));
import {useStockData} from '@/hooks/useStockData';
beforeEach(()=>{mock.unit='a';mock.reads=[];mock.failure=false;mock.delayed=false;mock.finish=null;mock.rpc.mockReset().mockResolvedValue({data:'id',error:null});});
afterEach(cleanup);
describe('stock follows selected unit',()=>{
  it('scopes lots, materials, recipes, suppliers and labels and uses the ledger lot balance',async()=>{
    const view=renderHook(()=>useStockData());await waitFor(()=>expect(view.result.current.loading).toBe(false));
    for(const table of ['raw_materials','stock_lot_balances','production_recipes','suppliers','production_batches'])expect(mock.reads.find(r=>r.table===table)?.filters.business_unit_id).toBe('a');
    expect(mock.reads.find(r=>r.table==='production_recipe_inputs')?.filters.recipe_id).toEqual(['a']);
    expect(view.result.current.lotes[0].quantidadeRestante).toBe(6);expect(view.result.current.alerts[0].deficit).toBe(2);
  });
  it('hides the previous unit immediately and ignores an older response',async()=>{
    mock.delayed=true;const view=renderHook(()=>useStockData());await waitFor(()=>expect(mock.finish).not.toBeNull());mock.unit='b';view.rerender();
    expect(view.result.current.rawMaterials).toEqual([]);expect(view.result.current.lotes).toEqual([]);
    await waitFor(()=>expect(view.result.current.rawMaterials[0]?.id).toBe('b'));
    await act(async()=>mock.finish!({data:[{id:'a'}],error:null}));expect(view.result.current.rawMaterials[0].id).toBe('b');
  });
  it('reports a failed load instead of a successful empty stock',async()=>{
    mock.failure=true;const view=renderHook(()=>useStockData());await waitFor(()=>expect(view.result.current.loading).toBe(false));
    expect(view.result.current.error).toBe(true);expect(view.result.current.ready).toBe(false);
    mock.failure=false;await act(async()=>view.result.current.refreshAll());expect(view.result.current.error).toBe(false);
  });
  it('reuses the production request ID after an uncertain response and writes through one RPC',async()=>{
    mock.rpc.mockResolvedValueOnce({error:{message:'Falha de rede'}});const view=renderHook(()=>useStockData());await waitFor(()=>expect(view.result.current.ready).toBe(true));
    const input={recipeId:'r',quantityProduced:1,notes:'',inputsUsed:[{rawMaterialId:'a',quantityUsed:2}]};
    await act(async()=>{expect(await view.result.current.produceBatch(input)).toBe(false);});
    await act(async()=>{expect(await view.result.current.produceBatch(input)).toBe(true);});
    expect(mock.rpc.mock.calls[0][0]).toBe('produce_stock_batch');expect(mock.rpc.mock.calls[0][1]).toEqual(mock.rpc.mock.calls[1][1]);
    expect(mock.rpc.mock.calls[0][1].p_unit).toBe('a');
  });
});
