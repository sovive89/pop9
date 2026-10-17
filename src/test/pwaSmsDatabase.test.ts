// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,beforeEach,afterAll,describe,it,expect} from "vitest";
const UNIT="00000000-0000-0000-0000-000000000001",OTHER="00000000-0000-0000-0000-000000000002";
const HASH="a".repeat(64),PHONE="5561987654321";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;grant usage on schema auth to authenticated,service_role;
    create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select '{"role":"service_role"}'::jsonb$$;
    create table public.profiles(user_id uuid,full_name text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.business_units(id uuid primary key,active boolean default true,name text);
    create table public.user_roles(user_id uuid,role text,business_unit_id uuid);
    create table public.integrations(id uuid primary key default gen_random_uuid(),business_unit_id uuid,provider text,status text default 'NOT_CONNECTED',config jsonb default '{}',connected_at timestamptz,last_sync_at timestamptz,error_message text,created_at timestamptz default now(),updated_at timestamptz default now());
    alter table public.integrations enable row level security;
    create table public.menu_categories(key text primary key,destination text);
    create table public.menu_items(id text primary key,business_unit_id uuid,name text,price numeric,active boolean default true,status text default 'published',category text);
    create table public.sessions(id uuid primary key default gen_random_uuid(),business_unit_id uuid,table_number integer,zone text,origin text,status text default 'active',ended_at timestamptz,created_by uuid);
    create table public.session_clients(id uuid primary key default gen_random_uuid(),session_id uuid,business_unit_id uuid,name text,phone text,email text,bairro text,left_at timestamptz);
    create table public.orders(id uuid primary key default gen_random_uuid(),business_unit_id uuid,session_id uuid,client_id uuid,origin text,source text,external_id text,subtotal numeric,total numeric,status text default 'pending');
    create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid,menu_item_id text,name text,price numeric,quantity integer,observation text,destination text,ingredient_mods jsonb default '[]');
    create table public.payments(id uuid primary key default gen_random_uuid(),session_id uuid,client_id uuid,business_unit_id uuid,amount numeric,service_charge numeric default 0,status text default 'confirmed',created_by uuid);
  `);
  for(const f of ["20261009113035_session_cashier_closure","20261009123609_whatsapp_pwa_crm","20261009130729_harden_operational_function_paths","20261017180000_pwa_sms_verification"])
    await db.exec(readFileSync(`supabase/migrations/${f}.sql`,"utf8"));
},30000);
beforeEach(async()=>{
  await db.exec("truncate ops_private.pwa_sms_sends,ops_private.order_access,public.whatsapp_events,public.whatsapp_contacts,public.order_items,public.orders,public.session_clients,public.sessions,public.menu_items,public.menu_categories,public.integrations,public.business_units cascade;");
  await db.query("insert into business_units values($1,true,'Confit'),($2,true,'Outra')",[UNIT,OTHER]);
  await db.query("insert into integrations(business_unit_id,provider,status,config) values($1,'own-pwa','CONNECTED',$2),($3,'own-pwa','CONNECTED',$4)",[UNIT,JSON.stringify({enabled:true}),OTHER,JSON.stringify({enabled:false})]);
  await db.exec("insert into menu_categories values('burger','kitchen');");
  await db.query("insert into menu_items values('burger',$1,'Burger',25,true,'published','burger')",[UNIT]);
});
afterAll(async()=>{await db.close();});
const send=(phone=PHONE,unit=UNIT)=>db.query("select public.register_pwa_sms_send($1,$2)",[unit,phone]);
const issue=async(hash=HASH,unit=UNIT,phone=PHONE)=>(await db.query<{v:Record<string,unknown>}>("select public.issue_pwa_sms_access($1,$2,$3) as v",[unit,phone,hash])).rows[0].v;
const profile=(name:string,email="",marketing=false,hash=HASH)=>db.query<{v:Record<string,unknown>}>("select public.save_pwa_profile($1,$2,$3,$4,'Águas Claras',$5) as v",[UNIT,hash,name,email,marketing]);
describe("verificação por SMS do PWA",()=>{
  it("limita reenvio em 30 s e 3 envios por número em 15 min",async()=>{
    await send();await expect(send()).rejects.toThrow("30 segundos");
    await db.exec("update ops_private.pwa_sms_sends set sent_at=now()-interval '1 minute'");await send();
    await db.exec("update ops_private.pwa_sms_sends set sent_at=now()-interval '1 minute'");await send();
    await db.exec("update ops_private.pwa_sms_sends set sent_at=now()-interval '1 minute'");await expect(send()).rejects.toThrow("15 minutos");
    await expect(send("123")).rejects.toThrow("Celular inválido");
  });
  it("emite acesso para o celular e o pedido sai pelo fluxo de sempre",async()=>{
    const first=await issue();expect(first.name).toBeNull();
    await expect(profile("A")).rejects.toThrow("Informe seu nome");
    await expect(profile("Ana","nao-e-email")).rejects.toThrow("E-mail inválido");
    await profile("Ana","ana@exemplo.com",true);
    const contact=(await db.query<{name:string;email:string;bairro:string;marketing_consent_at:string|null;profile_consent_at:string|null}>("select * from whatsapp_contacts where phone=$1",[PHONE])).rows[0];
    expect(contact.name).toBe("Ana");expect(contact.bairro).toBe("Águas Claras");expect(contact.marketing_consent_at).not.toBeNull();expect(contact.profile_consent_at).not.toBeNull();
    const order=(await db.query<{v:{total:number}}>("select public.submit_pwa_order($1,$2,'[{\"id\":\"burger\",\"quantity\":1}]','') as v",[UNIT,HASH])).rows[0].v;expect(Number(order.total)).toBe(25);
    expect((await db.query<{name:string;phone:string}>("select name,phone from session_clients")).rows[0]).toEqual({name:"Ana",phone:PHONE});
    await expect(profile("Ana")).rejects.toThrow("Acesso expirado");
  });
  it("cliente que volta é reconhecido e pode retirar o consentimento",async()=>{
    await issue();await profile("Ana","",true);
    const again=await issue("b".repeat(64));expect(again.name).toBe("Ana");expect(again.marketing).toBe(true);
    await profile("Ana","",false,"b".repeat(64));
    expect((await db.query<{m:string|null}>("select marketing_consent_at as m from whatsapp_contacts")).rows[0].m).toBeNull();
  });
  it("recusa loja com pedidos online desligados e hash malformado",async()=>{
    await expect(issue(HASH,OTHER)).rejects.toThrow("Pedidos online indisponíveis");
    await expect(issue("curto")).rejects.toThrow("Acesso inválido");
  });
  it("não é executável pelo navegador",async()=>{
    await db.exec("set role authenticated");
    await expect(send()).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
