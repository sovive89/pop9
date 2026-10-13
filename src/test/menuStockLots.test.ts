// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { stockDatabase } from './helpers/stockDatabase';
const U='00000000-0000-0000-0000-000000000001',V='00000000-0000-0000-0000-000000000002',A='00000000-0000-0000-0000-000000000011';
const B='00000000-0000-0000-0000-000000000021',R='00000000-0000-0000-0000-000000000022',S='00000000-0000-0000-0000-000000000023';
const L1='00000000-0000-0000-0000-000000000031',L2='00000000-0000-0000-0000-000000000032',PB='00000000-0000-0000-0000-000000000041';
const PR='00000000-0000-0000-0000-000000000051',O='00000000-0000-0000-0000-000000000061',OI='00000000-0000-0000-0000-000000000071';
let db:PGlite;
const recipeLine=(id:string,qty:number)=>({rawMaterialId:id,newName:'',newUnit:'',quantity:qty,preparation:null});
const menu=(recipe:unknown[])=>({name:'Burger',price:29,category:'burgers',description:'',image_url:null,status:'published',active:true,ingredients:[],variants:[],recipe});
async function call(name:string,id:string,data:unknown,unit=U) {return db.query(`select public.${name}($1,$2,$3::jsonb)`,[unit,id,JSON.stringify(data)]);}
async function n(sql:string) {return Number(Object.values((await db.query<Record<string,string>>(sql)).rows[0])[0]);}
async function purchase(id:string,raw=B,qty=100,validade='2026-12-31',cost=20) {return call('register_stock_purchase',id,{rawMaterialId:raw,quantity:qty,unitCost:cost/qty,supplierId:null,purchaseQuantity:qty,conversionFactor:1,purchaseUnit:'g',totalCost:cost,validade});}
async function sell(qty=1) {await db.query("insert into orders values($1,$2,'pending')",[O,U]);await db.query('insert into order_items values($1,$2,$3,$4)',[OI,O,'burger',qty]);}
async function remaining(lot:string) {return Number((await db.query<{quantidade_restante:string}>('select quantidade_restante from stock_lot_balances where id=$1',[lot])).rows[0].quantidade_restante);}
const prodRecipe={name:'Blend',outputRawMaterialId:R,outputQuantity:1000,shelfLifeDays:3,inputs:[{rawMaterialId:B,quantity:600}]};
const production={recipeId:PR,quantityProduced:1000,notes:'',inputsUsed:[{rawMaterialId:B,quantityUsed:600}]};
beforeAll(async()=>{db=await stockDatabase();},30000);
beforeEach(async()=>{
  await db.exec('truncate technical_documents, stock_movements,production_batch_inputs,lotes,production_batches,production_recipe_inputs,production_recipes,recipe_items,menu_item_ingredients,menu_item_variants,order_items,orders,menu_items,menu_categories,raw_materials,suppliers,user_roles cascade');
  await db.query("select set_config('test.user',$1,false)",[A]);await db.query("insert into user_roles values($1,'admin',$2)",[A,U]);
  await db.query("insert into menu_categories(business_unit_id,key,label) values($1,'burgers','Hambúrgueres')",[U]);
  await db.query("insert into raw_materials(id,business_unit_id,name,unit,tipo) values($1,$2,'Carne','g','insumo'),($3,$2,'Blend','g','semiacabado'),($4,$2,'Sal','g','insumo')",[B,U,R,S]);
});
afterAll(async()=>{await db?.close();});
describe('menu → recipes → stock → lots',()=>{
  it('saves menu and produced recipes without stock and reuses materials on retry',async()=>{
    const payload=menu([{rawMaterialId:'',newName:'Molho',newUnit:'g',quantity:30,preparation:{outputQuantity:1000,inputs:[{rawMaterialId:S,newName:'',newUnit:'',quantity:20}]}}]);
    await call('save_menu_item_with_recipe','burger',payload);await call('save_menu_item_with_recipe','burger',payload);
    expect(await n('select count(*) from menu_items')).toBe(1);expect(await n('select count(*) from production_recipes')).toBe(1);
    expect(await n('select sum(current_stock) from raw_materials')).toBe(0);expect(await n('select count(*) from stock_movements')).toBe(0);
    expect(await n('select count(*) from lotes')).toBe(0);expect(await n('select count(*) from recipe_items')).toBe(1);
  });
  it('rolls back publication, option replacement and new materials when the recipe fails',async()=>{
    await call('save_menu_item_with_recipe','burger',menu([recipeLine(B,200)]));
    const changed={...menu([{rawMaterialId:'',newName:'Novo',newUnit:'g',quantity:10,preparation:null},recipeLine(S,-1)]),price:45};
    await expect(call('save_menu_item_with_recipe','burger',changed)).rejects.toThrow('Quantidade da ficha');
    expect(await n("select price from menu_items where id='burger'")).toBe(29);expect(await n('select quantity from recipe_items')).toBe(200);
    expect(await n("select count(*) from raw_materials where name='Novo'")).toBe(0);
  });
  it('rejects foreign units, unauthenticated operators and cross-unit ingredients',async()=>{
    await expect(call('save_menu_item_with_recipe','burger',menu([]),V)).rejects.toThrow('Sem permissão');
    await db.query('update raw_materials set business_unit_id=$1 where id=$2',[V,B]);
    await expect(call('save_menu_item_with_recipe','burger',menu([recipeLine(B,1)]))).rejects.toThrow('outra unidade');
    expect(await n('select count(*) from menu_items')).toBe(0);
    await db.exec("select set_config('test.user','',false)");await expect(purchase(L1)).rejects.toThrow('Sem permissão');
  });
  it('creates a purchase atomically, validates conversions and prevents duplicate retries',async()=>{
    await purchase(L1);await purchase(L1);expect(await n('select current_stock from raw_materials where id=\''+B+'\'')).toBe(100);
    expect(await remaining(L1)).toBe(100);expect(await n('select count(*) from stock_movements')).toBe(1);
    await expect(call('register_stock_purchase',L2,{rawMaterialId:B,quantity:100,purchaseQuantity:2,conversionFactor:10,purchaseUnit:'caixa',totalCost:20})).rejects.toThrow('conversão');
    expect(await n('select count(*) from lotes')).toBe(1);
  });
  it('splits sales by FEFO and restores exactly those lots after a recipe change',async()=>{
    await purchase(L1,B,100,'2026-12-31');await purchase(L2,B,50,'2026-11-30');
    await call('save_menu_item_with_recipe','burger',menu([recipeLine(B,90)]));await sell();
    expect(await remaining(L2)).toBe(0);expect(await remaining(L1)).toBe(60);
    expect(await n("select sum(quantity) from stock_movements where reason='venda'")).toBe(90);
    await call('save_menu_item_with_recipe','burger',menu([recipeLine(B,999)]));await db.query("update orders set status='cancelled' where id=$1",[O]);
    await db.query("update orders set status='cancelled' where id=$1",[O]);
    expect(await remaining(L1)).toBe(100);expect(await remaining(L2)).toBe(50);
    expect(await n("select sum(quantity) from stock_movements where reason='estorno_cancelamento'")).toBe(90);
    expect(await n(`select current_stock from raw_materials where id='${B}'`)).toBe(150);
  });
  it('produces a tracked item, consumes bases once and sells only the produced stock',async()=>{
    await purchase(L1,B,500,'2026-12-31',100);await purchase(L2,B,200,'2026-11-30',20);
    await call('create_stock_recipe',PR,prodRecipe);await call('produce_stock_batch',PB,production);await call('produce_stock_batch',PB,production);
    expect(await remaining(L2)).toBe(0);expect(await remaining(L1)).toBe(100);
    expect(await n(`select current_stock from raw_materials where id='${B}'`)).toBe(100);
    expect(await n(`select current_stock from raw_materials where id='${R}'`)).toBe(1000);
    expect(await n("select sum(quantity) from stock_movements where reason='producao_consumo'")).toBe(600);
    expect(await n('select sum(quantity_used) from production_batch_inputs')).toBe(600);
    expect(await n(`select preco_unitario from lotes where batch_id='${PB}'`)).toBeCloseTo(0.1);
    await call('save_menu_item_with_recipe','burger',menu([recipeLine(R,200)]));await sell(2);
    expect(await n(`select current_stock from raw_materials where id='${B}'`)).toBe(100);
    expect(await n(`select current_stock from raw_materials where id='${R}'`)).toBe(600);
    expect(await n(`select quantidade_restante from stock_lot_balances where batch_id='${PB}'`)).toBe(600);
  });
  it('rolls back production output, lots and earlier consumptions if a later write fails',async()=>{
    await purchase(L1,B,1000);await purchase(L2,S,1000);
    await call('create_stock_recipe',PR,{...prodRecipe,inputs:[{rawMaterialId:B,quantity:600},{rawMaterialId:S,quantity:20}]});
    await db.exec(`alter table stock_movements add constraint fail_second check(reason<>'producao_consumo' or raw_material_id<>'${S}')`);
    try {await expect(call('produce_stock_batch',PB,{...production,inputsUsed:[{rawMaterialId:B,quantityUsed:600},{rawMaterialId:S,quantityUsed:20}]})).rejects.toThrow('fail_second');}
    finally {await db.exec('alter table stock_movements drop constraint fail_second');}
    expect(await n('select count(*) from production_batches')).toBe(0);expect(await n('select count(*) from production_batch_inputs')).toBe(0);
    expect(await n('select count(*) from lotes')).toBe(2);expect(await remaining(L1)).toBe(1000);expect(await remaining(L2)).toBe(1000);
    expect(await n(`select current_stock from raw_materials where id='${R}'`)).toBe(0);
  });
  it('rejects empty, incomplete and circular production recipes',async()=>{
    await expect(call('create_stock_recipe',PR,{...prodRecipe,inputs:[]})).rejects.toThrow('inválida');
    await expect(call('create_stock_recipe',PR,{...prodRecipe,inputs:[{rawMaterialId:R,quantity:1}]})).rejects.toThrow('circular');
    expect(await n('select count(*) from production_recipes')).toBe(0);
    await call('create_stock_recipe',PR,prodRecipe);await expect(call('produce_stock_batch',PB,{...production,inputsUsed:[{rawMaterialId:S,quantityUsed:20}]})).rejects.toThrow('todos os insumos');
    expect(await n('select count(*) from production_batches')).toBe(0);
  });
  it('keeps untracked legacy stock compatible without silently inventing a lot',async()=>{
    await db.query('update raw_materials set current_stock=50 where id=$1',[B]);
    await call('save_menu_item_with_recipe','burger',menu([recipeLine(B,100)]));await sell();
    expect(await n("select count(*) from stock_movements where reason='venda' and lote_id is null")).toBe(1);
    expect(await n(`select current_stock from raw_materials where id='${B}'`)).toBe(-50);
  });
  it('counts duplicate recipe lines together without double consumption of produced bases',async()=>{
    await purchase(L1,B,100);await call('save_menu_item_with_recipe','burger',menu([recipeLine(B,10),recipeLine(B,20)]));await sell(2);
    expect(await remaining(L1)).toBe(40);expect(await n("select sum(quantity) from stock_movements where reason='venda'")).toBe(60);
  });
  it('blocks editing consumed quantity, then allows lot correction and cancellation after refund',async()=>{
    await purchase(L1);await call('save_menu_item_with_recipe','burger',menu([recipeLine(B,30)]));await sell();
    const edit={quantidade_compra:80,fator_conversao:1,unidade_compra:'g',custo_total:16};
    await expect(db.query('select manage_purchase_lot($1,\'edit\',$2::jsonb)',[L1,JSON.stringify(edit)])).rejects.toThrow('Lote consumido');
    await db.query("update orders set status='cancelled' where id=$1",[O]);await db.query('select manage_purchase_lot($1,\'edit\',$2::jsonb)',[L1,JSON.stringify(edit)]);
    expect(await remaining(L1)).toBe(80);expect(await n(`select current_stock from raw_materials where id='${B}'`)).toBe(80);
    await db.query("select manage_purchase_lot($1,'cancel')",[L1]);expect(await n(`select current_stock from raw_materials where id='${B}'`)).toBe(0);
    expect(await n('select count(*) from lotes where cancelado_em is not null')).toBe(1);
  });
  it('refuses an incompatible lot on direct stock movements',async()=>{
    await purchase(L1);await expect(db.query("insert into stock_movements(raw_material_id,business_unit_id,type,quantity,reason,lote_id) values($1,$2,'saida',10,'ajuste',$3)",[S,U,L1])).rejects.toThrow('Lote incompatível');
    expect(await remaining(L1)).toBe(100);
  });
  it('normalizes recipe grams to stock kilograms while retaining the displayed quantity',async()=>{
    await db.query("update raw_materials set unit='kg' where id=$1",[B]);await purchase(L1,B,1);
    await call('save_menu_item_with_recipe','burger',menu([{...recipeLine(B,200),newUnit:'g'}]));await sell();
    expect(await n('select quantity from recipe_items')).toBeCloseTo(0.2);
    expect(await n('select display_quantity from recipe_items')).toBe(200);expect(await remaining(L1)).toBeCloseTo(0.8);
    const body=(await db.query<{document:{ingredients:{quantity:number;unit:string}[]}}>("select document from technical_documents where entity_type='menu_item'")).rows[0].document;
    expect(body.ingredients[0]).toMatchObject({quantity:200,unit:'g'});
  });
  it('saves a produced recipe and its new bases together, with compatible base units',async()=>{
    await db.query("update raw_materials set unit='kg' where id=$1",[B]);
    const ingredient={rawMaterialId:'',newName:'Molho',newUnit:'g',quantity:30,transformation:'producao',
      preparation:{requestId:PR,outputQuantity:1000,inputs:[{rawMaterialId:B,newName:'',newUnit:'g',quantity:600}]}};
    await db.query('select save_stock_preparation($1,$2::jsonb)',[U,JSON.stringify(ingredient)]);
    await db.query('select save_stock_preparation($1,$2::jsonb)',[U,JSON.stringify(ingredient)]);
    expect(await n('select quantity from production_recipe_inputs')).toBeCloseTo(0.6);expect(await n('select count(*) from production_recipes')).toBe(1);
    expect(await n("select count(*) from technical_documents where entity_type='raw_material'")).toBe(1);expect(await n('select count(*) from lotes')).toBe(0);
  });
  it('defines a menu-inferred theoretical base unit only before its first recipe use',async()=>{
    await call('save_menu_item_with_recipe','burger',{...menu([]),status:'draft',ingredients:[{name:'Tomate',removable:true,extra_price:null}]});
    const raw=(await db.query<{id:string;unit:string;is_theoretical:boolean}>("select * from raw_materials where name='Tomate'")).rows[0];
    expect(raw.unit).toBe('un');expect(raw.is_theoretical).toBe(true);
    await call('save_menu_item_with_recipe','burger',menu([{...recipeLine(raw.id,20),newUnit:'g'}]));
    expect((await db.query<{unit:string}>('select unit from raw_materials where id=$1',[raw.id])).rows[0].unit).toBe('g');
    expect(await n('select quantity from recipe_items')).toBe(20);
    await purchase(L1,raw.id,100);await expect(call('save_menu_item_with_recipe','burger',menu([{...recipeLine(raw.id,20),newUnit:'ml'}]))).rejects.toThrow('incompatível');
    expect(await remaining(L1)).toBe(100);
  });
});
