// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,beforeEach,afterAll,describe,it,expect} from "vitest";
const UNIT="00000000-0000-0000-0000-000000000001",OTHER="00000000-0000-0000-0000-000000000002";
const READY="00000000-0000-0000-0000-0000000000c1",CHOICE="00000000-0000-0000-0000-0000000000c2",PCT="00000000-0000-0000-0000-0000000000c3",BACON="00000000-0000-0000-0000-0000000000d1",DUplo="00000000-0000-0000-0000-0000000000d2",LETTUCE="00000000-0000-0000-0000-0000000000d3",ONION="00000000-0000-0000-0000-0000000000d4";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;grant usage on schema auth to authenticated,service_role;
    create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select '{"role":"service_role"}'::jsonb$$;
    create table public.profiles(user_id uuid,full_name text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.business_units(id uuid primary key,active boolean default true,name text,disabled_modules text[] not null default '{}');
    create table public.user_roles(user_id uuid,role text,business_unit_id uuid);
    create table public.integrations(id uuid primary key default gen_random_uuid(),business_unit_id uuid,provider text unique,status text default 'NOT_CONNECTED',config jsonb default '{}',connected_at timestamptz,last_sync_at timestamptz,error_message text,created_at timestamptz default now(),updated_at timestamptz default now());
    alter table public.integrations enable row level security;
    create table public.menu_categories(key text,business_unit_id uuid,destination text);
    create table public.menu_items(id text primary key,business_unit_id uuid,name text,price numeric,active boolean default true,status text default 'published',category text,combo_eligible boolean default true);
    create table public.menu_item_ingredients(id uuid primary key default gen_random_uuid(),menu_item_id text,name text,removable boolean default false,extra_price numeric,sort_order integer default 0);
    create table public.menu_item_variants(id uuid primary key default gen_random_uuid(),menu_item_id text,name text,sort_order integer default 0);
    create table public.operation_periods(id uuid primary key default gen_random_uuid(),business_unit_id uuid,closed_at timestamptz);
    create table public.sessions(id uuid primary key default gen_random_uuid(),business_unit_id uuid,table_number integer,zone text,origin text,status text default 'active',ended_at timestamptz,created_by uuid);
    create table public.session_clients(id uuid primary key default gen_random_uuid(),session_id uuid,business_unit_id uuid,name text,phone text,email text,bairro text,left_at timestamptz);
    create table public.orders(id uuid primary key default gen_random_uuid(),business_unit_id uuid,session_id uuid,client_id uuid,origin text,source text,external_id text,subtotal numeric,total numeric,status text default 'pending');
    create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid,menu_item_id text,name text,price numeric,quantity integer,observation text,destination text,ingredient_mods jsonb default '[]',combo_group_id uuid,combo_name text);
    create table public.payments(id uuid primary key default gen_random_uuid(),session_id uuid,client_id uuid,business_unit_id uuid,amount numeric,service_charge numeric default 0,status text default 'confirmed',created_by uuid);
    create table public.menu_combos(id uuid primary key,business_unit_id uuid,name text,description text,pricing_mode text,price numeric,discount numeric default 0,active boolean default true,sort_order integer default 0);
    create table public.menu_combo_slots(id uuid primary key default gen_random_uuid(),combo_id uuid,business_unit_id uuid,label text,sort_order integer default 0);
    create table public.menu_combo_options(id uuid primary key default gen_random_uuid(),slot_id uuid,business_unit_id uuid,menu_item_id text,extra_price numeric default 0,is_free boolean default false,sort_order integer default 0);
  `);
  for(const f of ["20261009113035_session_cashier_closure","20261009123609_whatsapp_pwa_crm","20261009130729_harden_operational_function_paths","20261017170000_pwa_ready_combos","20261022010000_unit_modules_qr_pwa","20261022140000_pwa_public_options_contract"])
    await db.exec(readFileSync(`supabase/migrations/${f}.sql`,"utf8"));
},30000);
async function slot(combo:string,label:string,order:number,items:[string,number?,boolean?][]){
  const {rows}=await db.query<{id:string}>("insert into menu_combo_slots(combo_id,business_unit_id,label,sort_order) values($1,$2,$3,$4) returning id",[combo,UNIT,label,order]);
  for(const [item,extra=0,free=false] of items)await db.query("insert into menu_combo_options(slot_id,business_unit_id,menu_item_id,extra_price,is_free) values($1,$2,$3,$4,$5)",[rows[0].id,UNIT,item,extra,free]);
}
beforeEach(async()=>{
  await db.exec("truncate ops_private.order_access,public.whatsapp_events,public.whatsapp_contacts,public.order_items,public.orders,public.session_clients,public.sessions,public.operation_periods,public.menu_item_ingredients,public.menu_item_variants,public.menu_combo_options,public.menu_combo_slots,public.menu_combos,public.menu_items,public.menu_categories,public.integrations,public.business_units cascade;");
  await db.query("insert into business_units values($1,true,'Confit'),($2,true,'Outra')",[UNIT,OTHER]);
  await db.query("insert into integrations(business_unit_id,provider,status,config) values($1,'whatsapp','CONNECTING',$2),($1,'own-pwa','CONNECTED',$3)",[UNIT,JSON.stringify({phoneNumberId:"11111",botMode:"crm"}),JSON.stringify({enabled:true,publicOrigin:"https://example.com"})]);
  await db.query("insert into operation_periods(business_unit_id) values($1)",[UNIT]);
  await db.query("insert into menu_categories values('burger',$1,'kitchen'),('drink',$1,'bar')",[UNIT]);
  await db.query("insert into menu_items(id,business_unit_id,name,price,category) values('burger',$1,'Burger',25,'burger'),('fries',$1,'Fritas',12,'burger'),('coke',$1,'Coca',8,'drink'),('juice',$1,'Suco',9,'drink')",[UNIT]);
  await db.query("insert into menu_item_ingredients(id,menu_item_id,name,removable,extra_price,sort_order) values($1,'burger','Bacon',true,4,0),($2,'burger','Alface',false,0,1),($3,'burger','Cebola',true,0,2)",[BACON,LETTUCE,ONION]);
  await db.query("insert into menu_item_variants(id,menu_item_id,name,sort_order) values($1,'burger','Duplo',0)",[DUplo]);
  // Pronto, preço fixo R$ 39,90: Burger + Fritas + Coca (soma avulsa R$ 45,00).
  await db.query("insert into menu_combos values($1,$2,'Combo Clássico','Lanche, fritas e bebida','fixed',39.90,0,true,0)",[READY,UNIT]);
  await slot(READY,"Lanche",0,[["burger"]]);await slot(READY,"Acompanhamento",1,[["fries"]]);await slot(READY,"Bebida",2,[["coke"]]);
  // Com escolha (duas bebidas): não pode aparecer no PWA.
  await db.query("insert into menu_combos values($1,$2,'Monte o seu',null,'fixed',35,0,true,1)",[CHOICE,UNIT]);
  await slot(CHOICE,"Lanche",0,[["burger"]]);await slot(CHOICE,"Bebida",1,[["coke"],["juice"]]);
  // Pronto, 10% de desconto, bebida grátis: base = 25 + 12 = 37 → 33,30.
  await db.query("insert into menu_combos values($1,$2,'Combo 10%',null,'percent',null,10,true,2)",[PCT,UNIT]);
  await slot(PCT,"Lanche",0,[["burger"]]);await slot(PCT,"Acompanhamento",1,[["fries"]]);await slot(PCT,"Bebida",2,[["coke",0,true]]);
  await db.query("select public.ingest_whatsapp_message($1,$2,'5511999999999','João','PEDIR','text','token','https://example.com/pedir/link')",[UNIT,crypto.randomUUID()]);
});
afterAll(async()=>{await db.close();});
type Quote={id:string;name:string;price:number;list_price:number;components:{menu_item_id:string;price:number}[]};
const list=async(unit=UNIT)=>(await db.query<{v:Quote[]}>("select public.list_pwa_ready_combos($1) as v",[unit])).rows[0].v;
const submit=async(items:unknown)=>(await db.query<{v:{total:number;items:unknown[]}}>("select public.submit_pwa_order($1,'token',$2::jsonb,'') as v",[UNIT,JSON.stringify(items)])).rows[0].v;

describe("combos prontos no PWA",()=>{
  it("lista só combos prontos, com preço da regra e economia",async()=>{
    const combos=await list();
    expect(combos.map(c=>c.name)).toEqual(["Combo Clássico","Combo 10%"]);
    const classic=combos[0];expect(Number(classic.price)).toBe(39.9);expect(Number(classic.list_price)).toBe(45);
    expect(classic.components.reduce((s,p)=>s+Number(p.price)*100,0)).toBe(3990);
    expect(Number(combos[1].price)).toBe(33.3);
    expect(await list(OTHER)).toEqual([]);
  });
  it("esconde e recusa combo com item não elegível, inativo ou em rascunho",async()=>{
    for(const change of ["combo_eligible=false","active=false","status='draft'"]){
      await db.exec(`update menu_items set ${change} where id='fries'`);
      expect((await list()).map(c=>c.name)).toEqual([]);
      await expect(submit([{combo_id:READY,quantity:1}])).rejects.toThrow("Combo indisponível");
      await db.exec("update menu_items set combo_eligible=true,active=true,status='published' where id='fries'");
    }
  });
  it("lista só para o servidor (service_role)",async()=>{
    for(const role of ["anon","authenticated"]){
      await db.exec(`set role ${role}`);
      await expect(list()).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  });
  it("não deixa repetir o combo com um id extra",async()=>{
    await expect(submit([{combo_id:READY,quantity:20,id:"a"},{combo_id:READY,quantity:20,id:"b"}])).rejects.toThrow("Itens duplicados");
  });
  it("grava os componentes agrupados com o total rateado sem perder centavos",async()=>{
    const order=await submit([{combo_id:READY,quantity:2},{id:"juice",quantity:1}]);
    expect(Number(order.total)).toBe(88.8);
    const rows=(await db.query<{combo_group_id:string|null;combo_name:string|null;price:string}>("select combo_group_id,combo_name,price from order_items")).rows;
    const combo=rows.filter(r=>r.combo_group_id);expect(combo).toHaveLength(6);
    expect(new Set(combo.map(r=>r.combo_group_id)).size).toBe(2);
    expect(combo.reduce((s,r)=>s+Math.round(Number(r.price)*100),0)).toBe(7980);
    expect(combo.every(r=>r.combo_name==="Combo Clássico")).toBe(true);
    expect(rows.filter(r=>!r.combo_group_id)).toHaveLength(1);
  });
  it("recusa combo com escolha, de outra unidade ou com preço vindo do cliente",async()=>{
    await expect(submit([{combo_id:CHOICE,quantity:1}])).rejects.toThrow("Combo indisponível");
    await expect(submit([{combo_id:"x",quantity:1}])).rejects.toThrow("Combo indisponível");
    // Combo pronto válido, mas de outra unidade.
    const FOREIGN="00000000-0000-0000-0000-0000000000c9";
    await db.query("insert into menu_items(id,business_unit_id,name,price,category) values('other-burger',$1,'Burger B',20,'burger')",[OTHER]);
    await db.query("insert into menu_combos values($1,$2,'Combo B',null,'fixed',15,0,true,0)",[FOREIGN,OTHER]);
    const {rows}=await db.query<{id:string}>("insert into menu_combo_slots(combo_id,business_unit_id,label) values($1,$2,'Lanche') returning id",[FOREIGN,OTHER]);
    await db.query("insert into menu_combo_options(slot_id,business_unit_id,menu_item_id) values($1,$2,'other-burger')",[rows[0].id,OTHER]);
    expect((await list(OTHER)).map(c=>c.name)).toEqual(["Combo B"]);
    await expect(submit([{combo_id:FOREIGN,quantity:1}])).rejects.toThrow("Combo indisponível");
    const order=await submit([{combo_id:READY,quantity:1,price:0.01}]);expect(Number(order.total)).toBe(39.9);
  });
  it("mantém o pedido avulso como antes",async()=>{
    const order=await submit([{id:"burger",quantity:2}]);expect(Number(order.total)).toBe(50);
  });
  it("recalcula opções no servidor e persiste o snapshot escolhido",async()=>{
    const order=await submit([{id:"burger",quantity:1,variant_id:DUplo,additions:[BACON],removals:[ONION],observation:"Pouco molho",price:0.01}]);
    expect(Number(order.total)).toBe(29);
    const row=(await db.query<{price:string;variant_id:string;variant_name:string;ingredient_mods:unknown;observation:string}>("select price,variant_id,variant_name,ingredient_mods,observation from order_items")).rows[0];
    expect(Number(row.price)).toBe(29);expect(row.variant_id).toBe(DUplo);expect(row.variant_name).toBe("Duplo");expect(row.observation).toBe("Pouco molho");
    expect(row.ingredient_mods).toEqual(expect.arrayContaining([expect.objectContaining({id:BACON,action:"extra",extraPrice:4}),expect.objectContaining({id:ONION,action:"remove",extraPrice:0})]));
  });
  it("recusa variante ou adicional de outro item e ingrediente não removível",async()=>{
    await expect(submit([{id:"fries",quantity:1,variant_id:DUplo}])).rejects.toThrow("Variante não pertence ao item");
    await expect(submit([{id:"fries",quantity:1,additions:[BACON]}])).rejects.toThrow("Adicional não pertence ao item");
    await expect(submit([{id:"burger",quantity:1,removals:[LETTUCE]}])).rejects.toThrow("Ingrediente não pode ser removido");
  });
});
