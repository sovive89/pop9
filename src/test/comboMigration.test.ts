// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema app_private;
    create function app_private.has_unit_role(u uuid, r text[]) returns boolean language sql as $$ select true $$;
    create table public.business_units (id uuid primary key);
    create table public.menu_items (id text primary key, business_unit_id uuid);
    create table public.order_items (id uuid primary key default gen_random_uuid(), name text);
    insert into public.business_units values ('${A}'), ('${B}');
    insert into public.menu_items values ('burger','${A}'), ('coke','${A}'), ('other','${B}');
  `);
  await db.exec(readFileSync("supabase/migrations/20261013130000_menu_combos.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("menu combos migration", () => {
  it("stores a combo with steps and a free option", async () => {
    const c = (await db.query<{ id: string }>(`insert into public.menu_combos (business_unit_id, name, pricing_mode, price) values ('${A}','Combo',  'fixed', 39.9) returning id`)).rows[0].id;
    const s = (await db.query<{ id: string }>(`insert into public.menu_combo_slots (combo_id, business_unit_id, label) values ($1,'${A}','Bebida') returning id`, [c])).rows[0].id;
    await db.query(`insert into public.menu_combo_options (slot_id, business_unit_id, menu_item_id, is_free) values ($1,'${A}','coke',true)`, [s]);
    expect((await db.query("select * from public.menu_combo_options")).rows).toHaveLength(1);
    await expect(db.query(`insert into public.menu_combo_options (slot_id, business_unit_id, menu_item_id) values ($1,'${A}','other')`, [s])).rejects.toThrow("não encontrado");
    await expect(db.query(`insert into public.menu_combo_slots (combo_id, business_unit_id, label) values ($1,'${B}','X')`, [c])).rejects.toThrow("outra unidade");
  });

  it("rejects invalid pricing and accepts combo columns on order items", async () => {
    await expect(db.query(`insert into public.menu_combos (business_unit_id, name, pricing_mode) values ('${A}','X','fixed')`)).rejects.toThrow();
    await expect(db.query(`insert into public.menu_combos (business_unit_id, name, pricing_mode, discount) values ('${A}','X','percent',150)`)).rejects.toThrow();
    await db.query(`insert into public.order_items (name, combo_group_id, combo_name) values ('Burger', gen_random_uuid(), 'Combo')`);
  });
});
