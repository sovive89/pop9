// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,beforeEach,afterAll,describe,it,expect} from "vitest";
const UNIT="00000000-0000-0000-0000-000000000001",OTHER="00000000-0000-0000-0000-000000000002";
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
    create table public.orders(id uuid primary key default gen_random_uuid(),business_unit_id uuid,session_id uuid,client_id uuid,origin text,source text,external_id text,subtotal numeric,total numeric,status text default 'pending',payment_status text not null default 'pending',placed_at timestamptz default now(),preparing_at timestamptz,ready_at timestamptz);
    create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid,menu_item_id text,name text,price numeric,quantity integer,observation text,destination text,ingredient_mods jsonb default '[]',combo_group_id uuid,combo_name text);
    create table public.payments(id uuid primary key default gen_random_uuid(),session_id uuid,client_id uuid,business_unit_id uuid,order_id uuid,amount numeric,service_charge numeric default 0,method text default 'dinheiro',status text default 'confirmed',source text not null default 'mesa',external_id text,paid_at timestamptz default now(),created_by uuid);
    create table public.menu_combos(id uuid primary key,business_unit_id uuid,name text,description text,pricing_mode text,price numeric,discount numeric default 0,active boolean default true,sort_order integer default 0);
    create table public.menu_combo_slots(id uuid primary key default gen_random_uuid(),combo_id uuid,business_unit_id uuid,label text,sort_order integer default 0);
    create table public.menu_combo_options(id uuid primary key default gen_random_uuid(),slot_id uuid,business_unit_id uuid,menu_item_id text,extra_price numeric default 0,is_free boolean default false,sort_order integer default 0);
  `);
  for(const f of ["20261009113035_session_cashier_closure","20261009123609_whatsapp_pwa_crm","20261009130729_harden_operational_function_paths","20261017170000_pwa_ready_combos","20261022010000_unit_modules_qr_pwa","20261022140000_pwa_public_options_contract","20261022150000_pwa_pix_payments"])
    await db.exec(readFileSync(`supabase/migrations/${f}.sql`,"utf8"));
},30000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
  await db.exec("truncate ops_private.payment_events,ops_private.payment_attempts,ops_private.payment_intents,ops_private.order_access,public.payments,public.whatsapp_events,public.whatsapp_contacts,public.order_items,public.orders,public.session_clients,public.sessions,public.operation_periods,public.menu_item_ingredients,public.menu_item_variants,public.menu_combo_options,public.menu_combo_slots,public.menu_combos,public.menu_items,public.menu_categories,public.integrations,public.business_units cascade;");
  await db.query("insert into business_units values($1,true,'Confit'),($2,true,'Outra')",[UNIT,OTHER]);
  await db.query("insert into integrations(business_unit_id,provider,status,config) values($1,'whatsapp','CONNECTING',$2),($1,'own-pwa','CONNECTED',$3)",[UNIT,JSON.stringify({phoneNumberId:"11111",botMode:"crm"}),JSON.stringify({enabled:true,publicOrigin:"https://example.com"})]);
  await db.query("insert into operation_periods(business_unit_id) values($1)",[UNIT]);
  await db.query("insert into menu_categories values('burger',$1,'kitchen'),('drink',$1,'bar')",[UNIT]);
  await db.query("insert into menu_items(id,business_unit_id,name,price,category) values('burger',$1,'Burger',25,'burger'),('coke',$1,'Coca',8,'drink')",[UNIT]);
  await db.query("select public.ingest_whatsapp_message($1,$2,'5511999999999','João','PEDIR','text','token','https://example.com/pedir/link')",[UNIT,crypto.randomUUID()]);
});

type Intent={status:string;intentId?:string;amount?:number;reused?:boolean;pixPayload?:string|null;order?:{orderId:string;total:number}};
type Confirm={ok:boolean;status:string;reason?:string;order?:{orderId:string;pickupNumber:number;total:number}};
const intent=async(items:unknown,note="",unit=UNIT)=>(await db.query<{v:Intent}>("select public.create_pix_intent($1,'token',$2::jsonb,$3) as v",[unit,JSON.stringify(items),note])).rows[0].v;
const attach=async(id:string,payId="mp-1")=>db.query("select public.attach_pix_charge($1,$2,'mercadopago',$3,'00020126...copiaecola',now()+interval '15 minutes')",[UNIT,id,payId]);
const confirm=async(amount:number,payId="mp-1",unit=UNIT)=>(await db.query<{v:Confirm}>("select public.confirm_pix_payment($1,'mercadopago',$2,$3) as v",[unit,payId,amount])).rows[0].v;
const count=async(table:string)=>Number((await db.query<{n:string}>(`select count(*) n from ${table}`)).rows[0].n);
const status=async()=>(await db.query<{v:Record<string,unknown>}>("select public.get_pwa_order_status($1,'token') as v",[UNIT])).rows[0].v;
const BURGER=[{id:"burger",quantity:1}];

describe("Pix no PWA: cobrança retida até o pagamento",()=>{
  it("calcula o valor no servidor e NÃO cria pedido antes de pagar",async()=>{
    const created=await intent([{id:"burger",quantity:2,price:0.01},{id:"coke",quantity:1}]);
    expect(Number(created.amount)).toBe(58);
    expect(created.reused).toBe(false);
    expect(await count("orders")).toBe(0);expect(await count("order_items")).toBe(0);expect(await count("payments")).toBe(0);
  });
  it("mesmo carrinho reaproveita a cobrança; carrinho diferente cancela a anterior",async()=>{
    const first=await intent(BURGER);await attach(first.intentId!);
    const again=await intent(BURGER);
    expect(again.intentId).toBe(first.intentId);expect(again.reused).toBe(true);expect(again.pixPayload).toBe("00020126...copiaecola");
    const changed=await intent([{id:"burger",quantity:1},{id:"coke",quantity:1}]);
    expect(changed.intentId).not.toBe(first.intentId);expect(Number(changed.amount)).toBe(33);
    const rows=(await db.query<{id:string;status:string}>("select id,status from ops_private.payment_intents")).rows;
    expect(rows.find(r=>r.id===first.intentId)?.status).toBe("cancelled");
    expect(rows.filter(r=>r.status==="pending")).toHaveLength(1);
  });
  it("recusa item de outra unidade, quantidade inválida e loja fechada",async()=>{
    await db.query("insert into menu_items(id,business_unit_id,name,price,category) values('foreign',$1,'Outro',9,'burger')",[OTHER]);
    await expect(intent([{id:"foreign",quantity:1}])).rejects.toThrow();
    await expect(intent([{id:"burger",quantity:0}])).rejects.toThrow();
    await db.exec("update operation_periods set closed_at=now()");
    await expect(intent(BURGER)).rejects.toThrow("Pedidos online indisponíveis");
    expect(await count("ops_private.payment_intents")).toBe(0);
  });
  it("limita tentativas de criar cobrança por cliente",async()=>{
    for(let i=1;i<=5;i++)await intent([{id:"burger",quantity:i}]);
    await expect(intent([{id:"burger",quantity:6}])).rejects.toThrow("Muitas tentativas de pagamento");
  });
});

describe("Pix no PWA: confirmação",()=>{
  it("cria 1 pedido pago e 1 pagamento confirmado ligados ao pedido",async()=>{
    const created=await intent(BURGER,"sem cebola");await attach(created.intentId!);
    const result=await confirm(25);
    expect(result.ok).toBe(true);expect(Number(result.order?.total)).toBe(25);
    const order=(await db.query<{payment_status:string;source:string;status:string}>("select payment_status,source,status from orders")).rows;
    expect(order).toEqual([{payment_status:"paid",source:"own-pwa",status:"pending"}]);
    const pay=(await db.query<{method:string;status:string;source:string;external_id:string;amount:string;order_id:string}>("select method,status,source,external_id,amount,order_id from payments")).rows;
    expect(pay).toHaveLength(1);expect(pay[0]).toMatchObject({method:"pix",status:"confirmed",source:"mercadopago",external_id:"mp-1"});
    expect(Number(pay[0].amount)).toBe(25);expect(pay[0].order_id).toBe(result.order?.orderId);
    expect((await db.query("select 1 from order_items where observation='sem cebola'")).rows).toHaveLength(1);
  });
  it("é idempotente: confirmar de novo não duplica pedido nem pagamento",async()=>{
    const created=await intent(BURGER);await attach(created.intentId!);
    const first=await confirm(25),second=await confirm(25);
    expect(second.ok).toBe(true);expect(second.order?.orderId).toBe(first.order?.orderId);
    expect(await count("orders")).toBe(1);expect(await count("payments")).toBe(1);
  });
  it("valor divergente não cria pedido e vai para revisão",async()=>{
    const created=await intent(BURGER);await attach(created.intentId!);
    const result=await confirm(1);
    expect(result).toMatchObject({ok:false,status:"needs_review",reason:"amount_mismatch"});
    expect(await count("orders")).toBe(0);expect(await count("payments")).toBe(0);
    expect((await confirm(25)).ok).toBe(false);
  });
  it("cobrança vencida, cancelada ou com a loja fechada não vira pedido sozinha",async()=>{
    const expired=await intent(BURGER);await attach(expired.intentId!,"mp-exp");
    await db.exec("update ops_private.payment_intents set pix_expires_at=now()-interval '1 minute'");
    expect(((await status()).payment as {status:string}).status).toBe("expired");
    expect(await confirm(25,"mp-exp")).toMatchObject({ok:false,reason:"intent_expired"});

    const next=await intent(BURGER);await attach(next.intentId!,"mp-closed");
    await db.exec("update operation_periods set closed_at=now()");
    expect(await confirm(25,"mp-closed")).toMatchObject({ok:false,reason:"ordering_closed"});
    expect(await count("orders")).toBe(0);expect(await count("payments")).toBe(0);
  });
  it("pagamento desconhecido ou de outra unidade é recusado",async()=>{
    const created=await intent(BURGER);await attach(created.intentId!);
    await expect(confirm(25,"nao-existe")).rejects.toThrow("Pagamento desconhecido");
    await expect(confirm(25,"mp-1",OTHER)).rejects.toThrow("Pagamento desconhecido");
    expect(await count("orders")).toBe(0);
  });
  it("não aceita anexar duas cobranças à mesma intenção nem reutilizar o id do PSP",async()=>{
    const created=await intent(BURGER);await attach(created.intentId!);
    await expect(attach(created.intentId!,"mp-2")).rejects.toThrow("Cobrança inválida");
  });
});

describe("Pix no PWA: status, eventos e permissões",()=>{
  it("status mostra a cobrança antes do pedido e o pagamento depois",async()=>{
    const created=await intent(BURGER);await attach(created.intentId!);
    const waiting=await status();
    expect(waiting.status).toBe("awaiting_payment");
    expect(waiting.payment).toMatchObject({method:"pix",status:"pending",pixPayload:"00020126...copiaecola"});
    await confirm(25);
    const paid=await status();
    expect(paid.status).toBe("pending");expect(paid.payment).toEqual({method:"pix",status:"paid"});
  });
  it("pagar no balcão continua igual (submit_pwa_order intacto)",async()=>{
    const order=(await db.query<{v:{total:number}}>("select public.submit_pwa_order($1,'token',$2::jsonb,'') as v",[UNIT,JSON.stringify(BURGER)])).rows[0].v;
    expect(Number(order.total)).toBe(25);
    expect((await status()).payment).toEqual({method:"balcao",status:"pending"});
    expect(await count("payments")).toBe(0);
    await expect(intent(BURGER)).resolves.toMatchObject({status:"confirmed"});
  });
  it("evento de webhook só é duplicado depois de concluído",async()=>{
    const claim=async()=>(await db.query<{v:boolean}>("select public.claim_payment_event('mercadopago','evt-1',$1) as v",[UNIT])).rows[0].v;
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(true);
    await db.query("select public.finish_payment_event('mercadopago','evt-1')");
    expect(await claim()).toBe(false);
  });
  it("anon e authenticated não alcançam nenhuma função nem tabela de pagamento",async()=>{
    const created=await intent(BURGER);
    for(const role of ["anon","authenticated"]){
      await db.exec(`set role ${role}`);
      await expect(intent(BURGER)).rejects.toThrow(/permission denied/);
      await expect(attach(created.intentId!)).rejects.toThrow(/permission denied/);
      await expect(confirm(25)).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from ops_private.payment_intents")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from ops_private.payment_events")).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  });
});
