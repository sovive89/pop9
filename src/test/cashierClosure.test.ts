// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import type { CheckoutSnapshot } from "@/utils/checkout";
const UNIT="00000000-0000-0000-0000-000000000001", OTHER_UNIT="00000000-0000-0000-0000-000000000002";
const ATTENDANT="00000000-0000-0000-0000-000000000011", CASHIER="00000000-0000-0000-0000-000000000012", OTHER_CASHIER="00000000-0000-0000-0000-000000000013";
const SESSION="00000000-0000-0000-0000-000000000021", CLIENT="00000000-0000-0000-0000-000000000031", ORDER="00000000-0000-0000-0000-000000000041";
let db:PGlite;
async function caller(id:string,role="authenticated"){
  await db.exec("reset role");
  await db.query("select set_config('test.user',$1,false),set_config('test.role',$2,false)",[id,role]);
  await db.exec(`set role ${role}`);
}
async function request(charge=false){return db.query("select public.request_session_closure($1,$2)",[SESSION,charge]);}
async function approve(actor=CASHIER,reason:string|null=null){return db.query("select public.approve_session_closure($1,$2,$3)",[SESSION,actor,reason]);}
async function snapshot(){return (await db.query<{value:CheckoutSnapshot}>("select public.get_session_checkout($1) as value",[SESSION])).rows[0].value;}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to authenticated,service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role',current_setting('test.role',true))$$;
    create type public.app_role as enum('admin','attendant','kitchen');
    create table public.business_units(id uuid primary key,active boolean default true);
    create table public.user_roles(user_id uuid,role public.app_role,business_unit_id uuid);
    create table public.profiles(user_id uuid primary key,full_name text);
    create table public.sessions(id uuid primary key default gen_random_uuid(),business_unit_id uuid,table_number integer,status text default 'active',ended_at timestamptz,zone text,created_by uuid);
    create table public.session_clients(id uuid primary key,session_id uuid references public.sessions(id),business_unit_id uuid,name text,phone text,left_at timestamptz);
    create table public.orders(id uuid primary key,session_id uuid references public.sessions(id),client_id uuid references public.session_clients(id),business_unit_id uuid,status text);
    create table public.order_items(id uuid default gen_random_uuid(),order_id uuid references public.orders(id),price numeric,quantity integer,ingredient_mods jsonb);
    create table public.payments(id uuid default gen_random_uuid(),session_id uuid references public.sessions(id),client_id uuid references public.session_clients(id),business_unit_id uuid,amount numeric,service_charge numeric default 0,status text default 'confirmed',created_by uuid);
    grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
    alter table public.sessions enable row level security;
    create policy staff_read on public.sessions for select to authenticated using(exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.business_unit_id=sessions.business_unit_id and ur.role::text in('admin','attendant','kitchen')));
    create policy staff_insert on public.sessions for insert to authenticated with check(created_by=auth.uid());
    create function public.close_session_sets_client_exit() returns trigger language plpgsql as $$begin
      if new.status='closed' and old.status is distinct from 'closed' then update public.session_clients set left_at=coalesce(new.ended_at,now()) where session_id=new.id and left_at is null; end if;
      return new;
    end;$$;
    create trigger trg_close_session_sets_client_exit after update on public.sessions for each row execute function public.close_session_sets_client_exit();
    create policy staff_update on public.sessions for update to authenticated using(true);
  `);
  await db.exec(readFileSync("supabase/migrations/20261009113004_cashier_role.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261009113035_session_cashier_closure.sql","utf8"));
},30000);
beforeEach(async()=>{
  await db.exec("reset role; select set_config('test.user','',false); truncate public.session_closures,public.payments,public.order_items,public.orders,public.session_clients,public.sessions,public.profiles,public.user_roles,public.business_units,auth.users cascade;");
  await db.query("insert into auth.users values($1),($2),($3)",[ATTENDANT,CASHIER,OTHER_CASHIER]);
  await db.query("insert into public.business_units values($1,true),($2,true)",[UNIT,OTHER_UNIT]);
  await db.query("insert into public.user_roles values($1,'attendant',$2),($3,'cashier',$2),($4,'cashier',$5)",[ATTENDANT,UNIT,CASHIER,OTHER_CASHIER,OTHER_UNIT]);
  await db.query("insert into public.profiles values($1,'Maria Caixa')",[CASHIER]);
  await db.query("insert into public.sessions(id,business_unit_id,table_number) values($1,$2,1)",[SESSION,UNIT]);
  await db.query("insert into public.session_clients(id,session_id,business_unit_id,name,phone) values($1,$2,$3,'João Cliente','11999999999')",[CLIENT,SESSION,UNIT]);
  await db.query("insert into public.orders values($1,$2,$3,$4,'delivered')",[ORDER,SESSION,CLIENT,UNIT]);
  await db.query("insert into public.order_items(order_id,price,quantity) values($1,20,1)",[ORDER]);
  await caller(ATTENDANT);
});
afterAll(async()=>{await db?.close();});
describe("cashier closure database authorization and balances",()=>{
  it("keeps the table occupied when an attendant requests closure",async()=>{
    await request();
    const row=(await db.query<{status:string;closure_requested_by:string}>("select status,closure_requested_by from public.sessions")).rows[0];
    expect(row.status).toBe("active");expect(row.closure_requested_by).toBe(ATTENDANT);
    await expect(db.query("update public.sessions set status='closed' where id=$1",[SESSION])).rejects.toThrow(/permission denied/);
    await expect(approve()).rejects.toThrow(/permission denied/);
  });
  it("rejects requests and balance reads from another unit",async()=>{
    await caller(OTHER_CASHIER);await expect(request()).rejects.toThrow("Sem acesso");await expect(snapshot()).rejects.toThrow("Sem acesso");
    expect((await db.query("select * from public.sessions")).rows).toHaveLength(0);
  });
  it("closes paid tabs and audits the cashier without requiring a debt justification",async()=>{
    await db.query("insert into public.payments(session_id,client_id,business_unit_id,amount) values($1,$2,$3,20)",[SESSION,CLIENT,UNIT]);
    await request();await caller("","service_role");await approve();
    expect((await db.query<{status:string}>("select status from public.sessions")).rows[0].status).toBe("closed");
    expect((await db.query<{left_at:string|null}>("select left_at from public.session_clients")).rows[0].left_at).not.toBeNull();
    const audit=(await db.query<{unpaid_total:string;closed_by:string;closed_by_name:string}>("select * from public.session_closures")).rows[0];
    expect(Number(audit.unpaid_total)).toBe(0);expect(audit.closed_by).toBe(CASHIER);expect(audit.closed_by_name).toBe("Maria Caixa");
  });
  it("requires a justification and records unpaid customers atomically",async()=>{
    await request();await caller("","service_role");await expect(approve()).rejects.toThrow("justificativa");
    expect((await db.query("select * from public.session_closures")).rows).toHaveLength(0);
    expect((await db.query<{status:string}>("select status from public.sessions")).rows[0].status).toBe("active");
    await approve(CASHIER,"Cliente saiu sem pagar a comanda");
    const audit=(await db.query<{unpaid_total:string;justification:string;snapshot:CheckoutSnapshot}>("select * from public.session_closures")).rows[0];
    expect(Number(audit.unpaid_total)).toBe(20);expect(audit.snapshot.clients[0].name).toBe("João Cliente");expect(audit.snapshot.clients[0].remaining).toBe(20);
    await caller(CASHIER);expect((await db.query("select * from public.session_closures")).rows).toHaveLength(1);
    await caller(OTHER_CASHIER);expect((await db.query("select * from public.session_closures")).rows).toHaveLength(0);
  });
  it("includes extras and service, ignores cancelled orders and unconfirmed/refunded payments",async()=>{
    await db.query("update public.order_items set quantity=2,ingredient_mods=$1::jsonb",[JSON.stringify([{name:"Bacon",action:"extra",extraPrice:3}])]);
    await db.query("insert into public.payments(session_id,client_id,business_unit_id,amount,service_charge,status) values($1,$2,$3,40,4,'confirmed'),($1,$2,$3,40,4,'refunded'),($1,$2,$3,40,4,'pending')",[SESSION,CLIENT,UNIT]);
    await request(true);const value=await snapshot();
    expect(value.totalConsumed).toBe(46);expect(value.totalService).toBe(4.6);expect(value.totalPaid).toBe(44);expect(value.remaining).toBe(6.6);
    await db.query("update public.orders set status='cancelled'");expect((await snapshot()).totalConsumed).toBe(0);
  });
  it("does not let one customer's overpayment cancel another customer's debt",async()=>{
    const otherClient="00000000-0000-0000-0000-000000000032";
    await db.query("insert into public.session_clients(id,session_id,business_unit_id,name,phone) values($1,$2,$3,'Segundo Cliente',null)",[otherClient,SESSION,UNIT]);
    await db.query("insert into public.orders values('00000000-0000-0000-0000-000000000042',$1,$2,$3,'delivered')",[SESSION,otherClient,UNIT]);
    await db.exec("insert into public.order_items(order_id,price,quantity) values('00000000-0000-0000-0000-000000000042',20,1)");
    await db.query("insert into public.payments(session_id,client_id,business_unit_id,amount) values($1,$2,$3,40)",[SESSION,CLIENT,UNIT]);
    expect((await snapshot()).remaining).toBe(20);
  });
  it("blocks undelivered orders and rechecks current balances during approval",async()=>{
    await request();await db.query("update public.orders set status='ready'");await caller("","service_role");
    await expect(approve(CASHIER,"Cliente deixou saldo pendente")).rejects.toThrow("aguardando entrega");
    await db.query("update public.orders set status='delivered'");await db.query("insert into public.payments(session_id,client_id,business_unit_id,amount) values($1,$2,$3,20)",[SESSION,CLIENT,UNIT]);
    await approve();expect(Number((await db.query<{unpaid_total:string}>("select unpaid_total from public.session_closures")).rows[0].unpaid_total)).toBe(0);
  });
  it("rejects wrong-unit or attendant approvals even through the server RPC",async()=>{
    await request();await caller("","service_role");await expect(approve(OTHER_CASHIER)).rejects.toThrow("Apenas Caixa");await expect(approve(ATTENDANT)).rejects.toThrow("Apenas Caixa");
  });
  it("blocks consumption and payment writes after closure and duplicate approvals",async()=>{
    await request();await caller("","service_role");await approve(CASHIER,"Cliente saiu sem quitar a conta");
    await expect(db.query("insert into public.payments(session_id,client_id,business_unit_id,amount) values($1,$2,$3,20)",[SESSION,CLIENT,UNIT])).rejects.toThrow("já foi encerrada");
    await expect(db.query("update public.order_items set price=50")).rejects.toThrow("já foi encerrada");
    await expect(approve(CASHIER,"Cliente saiu sem quitar a conta")).rejects.toThrow("já foi encerrada");
  });
  it("rejects financial writes to another unit even when legacy table policies are broad",async()=>{
    await caller(OTHER_CASHIER);
    await expect(db.query("insert into public.payments(session_id,client_id,business_unit_id,amount) values($1,$2,$3,20)",[SESSION,CLIENT,UNIT])).rejects.toThrow("Sem permissão");
  });
  it("requires a request and prevents preclosed sessions from the browser",async()=>{
    await caller("","service_role");await expect(approve()).rejects.toThrow("Solicite o encerramento");
    await caller(ATTENDANT);await expect(db.query("insert into public.sessions(business_unit_id,table_number,status,created_by) values($1,2,'closed',$2)",[UNIT,ATTENDANT])).rejects.toThrow("abertas sem encerramento");
  });
});
