// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;let seeded = 0;
const a = "00000000-0000-0000-0000-000000000001", b = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000011", cashier = "00000000-0000-0000-0000-000000000012", attendant = "00000000-0000-0000-0000-000000000013";
beforeAll(async () => {
  db = new PGlite();await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;create schema app_private;
    create table auth.users(id uuid primary key);insert into auth.users values('${admin}'),('${cashier}'),('${attendant}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table business_units(id uuid primary key,active boolean default true);insert into business_units values('${a}',true),('${b}',true);
    create table user_roles(user_id uuid,business_unit_id uuid,role text);insert into user_roles values('${admin}','${a}','admin'),('${cashier}','${a}','cashier'),('${attendant}','${a}','attendant');
    create function app_private.has_unit_role(u uuid,r text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.user_roles ur join public.business_units bu on bu.id=ur.business_unit_id where ur.user_id=auth.uid() and ur.business_unit_id=u and ur.role=any(r) and bu.active)$$;
    create table sessions(id uuid primary key default gen_random_uuid(),business_unit_id uuid,status text default 'active');
    create table orders(id uuid primary key default gen_random_uuid(),business_unit_id uuid,session_id uuid);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid);
    grant usage on schema auth,app_private to authenticated;grant select,insert,update,delete on sessions,orders,order_items to authenticated;`);
  await db.exec(readFileSync("supabase/migrations/20261013062918_unit_operation_controls.sql", "utf8"));
  seeded = (await db.query("select * from operation_periods where closed_at is null")).rows.length;
}, 30000);
beforeEach(async () => { await db.exec("reset role;delete from order_items;delete from orders;delete from sessions;delete from operation_periods;");await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);await db.exec("set role authenticated"); });
afterAll(async () => { await db?.close(); });
const change = (open: boolean, unit = a) => db.query<{ value: { open: boolean; period_id: string } }>("select public.set_unit_operation($1,$2) as value", [unit, open]);
describe("start and close unit operations", () => {
  it("preserves existing active units during rollout and makes start idempotent", async () => {
    expect(seeded).toBe(2);const first = await change(true);const repeat = await change(true);
    expect(first.rows[0].value.period_id).toBe(repeat.rows[0].value.period_id);expect((await db.query("select * from operation_periods")).rows).toHaveLength(1);
  });
  it("authorizes only an own-unit Administrator or Caixa, never another unit or attendant", async () => {
    await expect(change(true, b)).rejects.toThrow("Só Administrador");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [attendant]);await expect(change(true)).rejects.toThrow("Só Administrador");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [cashier]);expect((await change(true)).rows[0].value.open).toBe(true);
    await expect(db.query("update operation_periods set closed_at=now()")).rejects.toThrow("permission denied");
  });
  it("blocks closing an active comanda and records closing after it is finalized", async () => {
    await change(true);await db.query("insert into sessions(business_unit_id) values($1)", [a]);
    await expect(change(false)).rejects.toThrow("comanda(s) aberta(s)");expect((await db.query("select * from operation_periods where closed_at is null")).rows).toHaveLength(1);
    await db.exec("update sessions set status='closed'");await change(false);
    const row = (await db.query<{ opened_by: string; closed_by: string; closed_at: unknown }>("select opened_by,closed_by,closed_at from operation_periods")).rows[0];
    expect(row.opened_by).toBe(admin);expect(row.closed_by).toBe(admin);expect(row.closed_at).not.toBeNull();
  });
  it("blocks new sessions, orders and items in a closed operation, including privileged PWA writes", async () => {
    await expect(db.query("insert into sessions(business_unit_id) values($1)", [a])).rejects.toThrow("Operação fechada");
    await expect(db.query("insert into orders(business_unit_id) values($1)", [a])).rejects.toThrow("Operação fechada");
    await change(true);const order = (await db.query<{ id: string }>("insert into orders(business_unit_id) values($1) returning id", [a])).rows[0];
    await change(false);await expect(db.query("insert into order_items(order_id) values($1)", [order.id])).rejects.toThrow("Operação fechada");
    await db.exec("reset role");await expect(db.query("insert into sessions(business_unit_id) values($1)", [a])).rejects.toThrow("Operação fechada");
  });
  it("reopens with a new audited period and does not treat another unit's sessions as pendencies", async () => {
    await change(true);await db.exec("reset role");await db.query("insert into operation_periods(business_unit_id) values($1)", [b]);await db.query("insert into sessions(business_unit_id) values($1)", [b]);await db.exec("set role authenticated");
    await change(false);await change(true);expect((await db.query("select * from operation_periods")).rows).toHaveLength(2);
    expect((await db.query("select * from operation_periods where closed_at is null")).rows).toHaveLength(1);
  });
});
