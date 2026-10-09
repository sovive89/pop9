// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,beforeEach,afterAll,describe,it,expect} from "vitest";
const UNIT="00000000-0000-0000-0000-000000000001",OTHER="00000000-0000-0000-0000-000000000002",ADMIN="00000000-0000-0000-0000-000000000011";
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
    create table public.integrations(id uuid primary key default gen_random_uuid(),business_unit_id uuid,provider text unique,status text default 'NOT_CONNECTED',config jsonb default '{}',connected_at timestamptz,last_sync_at timestamptz,error_message text,created_at timestamptz default now(),updated_at timestamptz default now());
    alter table public.integrations enable row level security;
    create table public.menu_categories(key text primary key,destination text);
    create table public.menu_items(id text primary key,business_unit_id uuid,name text,price numeric,active boolean default true,status text default 'published',category text);
    create table public.sessions(id uuid primary key default gen_random_uuid(),business_unit_id uuid,table_number integer,zone text,origin text,status text default 'active',ended_at timestamptz,created_by uuid);
    create table public.session_clients(id uuid primary key default gen_random_uuid(),session_id uuid,business_unit_id uuid,name text,phone text,email text,bairro text,left_at timestamptz);
    create table public.orders(id uuid primary key default gen_random_uuid(),business_unit_id uuid,session_id uuid,client_id uuid,origin text,source text,external_id text,subtotal numeric,total numeric,status text default 'pending');
    create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid,menu_item_id text,name text,price numeric,quantity integer,observation text,destination text,ingredient_mods jsonb default '[]');
    create table public.payments(id uuid primary key default gen_random_uuid(),session_id uuid,client_id uuid,business_unit_id uuid,amount numeric,service_charge numeric default 0,status text default 'confirmed',created_by uuid);
  `);await db.exec(readFileSync("supabase/migrations/20261009113035_session_cashier_closure.sql","utf8"));await db.exec(readFileSync("supabase/migrations/20261009123609_whatsapp_pwa_crm.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261009130729_harden_operational_function_paths.sql","utf8"));
},30000);
beforeEach(async()=>{
  await db.exec("reset role; select set_config('test.user','',false); truncate ops_private.order_access,public.whatsapp_events,public.whatsapp_contacts,public.order_items,public.orders,public.session_clients,public.sessions,public.menu_items,public.menu_categories,public.integrations,public.user_roles,public.business_units cascade;");
  await db.query<Record<string,unknown>>("insert into business_units values($1,true,'Confit'),($2,true,'Outra unidade')",[UNIT,OTHER]);
  await db.query<Record<string,unknown>>("insert into user_roles values($1,'admin',$2)",[ADMIN,UNIT]);
  await db.query<Record<string,unknown>>("insert into integrations(business_unit_id,provider,status,config) values($1,'whatsapp','CONNECTING',$2),($1,'own-pwa','CONNECTED',$3),($4,'whatsapp','CONNECTING',$5)",[UNIT,JSON.stringify({phoneNumberId:"11111",botMode:"crm"}),JSON.stringify({enabled:true,publicOrigin:"https://example.com"}),OTHER,JSON.stringify({phoneNumberId:"22222",botMode:"welcome"})]);
  await db.exec("insert into menu_categories values('burger','kitchen');");
  await db.query<Record<string,unknown>>("insert into menu_items values('burger',$1,'Burger',25,true,'published','burger'),('hidden',$1,'Oculto',30,false,'published','burger'),('other',$2,'Outra unidade',50,true,'published','burger')",[UNIT,OTHER]);
});
afterAll(async()=>{await db.close();});
async function ingest(text:string,id:string=crypto.randomUUID(),unit=UNIT,hash:string|null=null){return (await db.query<{value:{reply:string|null;delivery_state:string;id:string}}>("select public.ingest_whatsapp_message($1,$2,'5511999999999','João',$3,'text',$4,$5) as value",[unit,id,text,hash,hash ? "https://example.com/pedir/link" : null])).rows[0].value;}
async function submit(items:unknown=[{id:"burger",quantity:2}],hash="token",unit=UNIT){return (await db.query<{value:{orderId:string;total:number;pickupNumber:number}}>("select public.submit_pwa_order($1,$2,$3::jsonb,'Sem cebola') as value",[unit,hash,JSON.stringify(items)])).rows[0].value;}
describe("WhatsApp CRM and PWA authorization",()=>{
  it("deduplicates webhook events and only claims each response once",async()=>{const first=await ingest("Olá","same");const second=await ingest("Olá","same");expect(second.id).toBe(first.id);expect((await db.query<{message_count:number}>("select message_count from whatsapp_contacts")).rows[0].message_count).toBe(1);expect((await db.query<{reply:string}>("select claim_whatsapp_reply('same') as reply")).rows[0].reply).toBeTruthy();expect((await db.query<{reply:string}>("select claim_whatsapp_reply('same') as reply")).rows[0].reply).toBeNull();});
  it("captures optional profile fields only after consent and independently records and revokes marketing permission",async()=>{
    await ingest("BAIRRO: Centro");expect((await db.query<Record<string,unknown>>("select bairro from whatsapp_contacts")).rows[0].bairro).toBeNull();
    await ingest("PERFIL SIM");await ingest("BAIRRO: Centro");await ingest("PREFERENCIA: Sem pimenta");await ingest("EMAIL: joao@example.com");
    const row=(await db.query<Record<string,unknown>>("select * from whatsapp_contacts")).rows[0];expect(row.bairro).toBe("Centro");expect(row.preferences).toBe("Sem pimenta");expect(row.email).toBe("joao@example.com");expect(row.marketing_consent_at).toBeNull();
    await ingest("MARKETING SIM");expect((await db.query<Record<string,unknown>>("select marketing_consent_at from whatsapp_contacts")).rows[0].marketing_consent_at).not.toBeNull();
    await ingest("SAIR");await ingest("BAIRRO: Novo bairro");const revoked=(await db.query<Record<string,unknown>>("select * from whatsapp_contacts")).rows[0];expect(revoked.marketing_consent_at).toBeNull();expect(revoked.profile_consent_at).toBeNull();expect(revoked.bairro).toBe("Centro");
  });
  it("keeps the same phone isolated across units and enforces admin RLS",async()=>{
    await ingest("Olá");await ingest("Olá",crypto.randomUUID(),OTHER);
    await db.query<Record<string,unknown>>("select set_config('test.user',$1,false)",[ADMIN]);await db.exec("set role authenticated");expect((await db.query<Record<string,unknown>>("select * from whatsapp_contacts")).rows).toHaveLength(1);
    await expect(db.query<Record<string,unknown>>("select public.ingest_whatsapp_message($1,'forged','5511999999999','X','PEDIR','text','token','url')",[UNIT])).rejects.toThrow(/permission denied/);
    await expect(db.query<Record<string,unknown>>("select public.submit_pwa_order($1,'token','[]','')",[UNIT])).rejects.toThrow(/permission denied/);
    await expect(db.query<Record<string,unknown>>("update integrations set status='CONNECTED'")).rejects.toThrow(/permission denied/);
    await db.exec("create temp table user_roles(user_id uuid,role text,business_unit_id uuid)");
    await db.query<Record<string,unknown>>("insert into pg_temp.user_roles values($1,'admin',$2)",[ADMIN,OTHER]);
    expect((await db.query<Record<string,unknown>>("select * from whatsapp_contacts")).rows).toHaveLength(1);
  });
  it("creates a pickup order using server prices and returns the same order on retry",async()=>{
    await ingest("PEDIR",crypto.randomUUID(),UNIT,"token");const first=await submit([{id:"burger",quantity:2,price:0.01}]);const retry=await submit();expect(first.total).toBe(50);expect(first.orderId).toBe(retry.orderId);expect(first.pickupNumber).toBe(1);
    expect((await db.query<{value:{cashierWorkflow:boolean}}>("select operational_readiness() as value")).rows[0].value.cashierWorkflow).toBe(true);
    expect((await db.query<Record<string,unknown>>("select * from orders")).rows).toHaveLength(1);const session=(await db.query<Record<string,unknown>>("select * from sessions")).rows[0];expect(session.table_number).toBe(-1);expect(session.zone).toBe("retirada");expect((await db.query<Record<string,unknown>>("select observation from order_items")).rows[0].observation).toBe("Sem cebola");
  });
  it("rejects expired, forged, wrong-unit and invalid carts atomically",async()=>{
    await expect(submit()).rejects.toThrow("Link expirado");await ingest("PEDIR",crypto.randomUUID(),UNIT,"token");
    await expect(submit([{id:"hidden",quantity:1}])).rejects.toThrow("Item indisponível");await expect(submit([{id:"other",quantity:1}])).rejects.toThrow("Item indisponível");await expect(submit([{id:"burger",quantity:-1}])).rejects.toThrow("Quantidade inválida");await expect(submit([],"token",OTHER)).rejects.toThrow("Link expirado");
    expect((await db.query<Record<string,unknown>>("select * from sessions")).rows).toHaveLength(0);
    await db.exec("update ops_private.order_access set expires_at=now()-interval '1 minute'");await expect(submit()).rejects.toThrow("Link expirado");
  });
});
