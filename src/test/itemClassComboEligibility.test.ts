// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const ORDER = "00000000-0000-0000-0000-0000000000aa";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema app_private; create schema ops_private;
    create function app_private.has_unit_role(u uuid, r text[]) returns boolean language sql as $$ select true $$;
    create function ops_private.staff(u uuid, r text[]) returns boolean language sql as $$ select true $$;
    create table public.business_units (id uuid primary key);
    create table public.menu_items (
      id text primary key, business_unit_id uuid not null references public.business_units(id),
      name text not null, price numeric not null default 0, category text not null default 'test',
      active boolean not null default true, status text not null default 'published', sort_order integer not null default 0
    );
    create table public.menu_categories (business_unit_id uuid, key text, label text, destination text, sort_order integer, icon_name text, icon_color text);
    create table public.orders (id uuid primary key, business_unit_id uuid not null references public.business_units(id));
    create table public.order_items (
      id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
      menu_item_id text not null, name text not null default 'item', price numeric not null default 0, quantity integer not null default 1
    );
    insert into public.business_units values ('${A}'), ('${B}');
    insert into public.menu_items (id, business_unit_id, name, price) values
      ('burger','${A}','Burger',30), ('special','${A}','Prato especial',42), ('other-unit','${B}','Outro',10);
  `);
  await db.exec(readFileSync("supabase/migrations/20261013130000_menu_combos.sql", "utf8"));
  await db.exec(`
    create or replace function public.save_menu_item_with_recipe(p_unit uuid, p_item_id text, p_data jsonb)
    returns text language plpgsql as $$ begin
      insert into public.menu_items (id,business_unit_id,name,price,category)
      values (p_item_id,p_unit,coalesce(p_data->>'name','Item'),coalesce((p_data->>'price')::numeric,0),'test')
      on conflict(id) do update set name=excluded.name,price=excluded.price;
      return p_item_id;
    end $$;
    create or replace function public.export_menu_item_to_units(p_source_unit uuid, p_item_id text, p_target_units uuid[])
    returns jsonb language plpgsql as $$
    declare v_unit uuid; v_id text; v_source public.menu_items%rowtype; v_result jsonb := '[]'::jsonb;
    begin
      select * into v_source from public.menu_items where id=p_item_id and business_unit_id=p_source_unit;
      foreach v_unit in array p_target_units loop
        v_id := p_item_id || '-copy';
        insert into public.menu_items(id,business_unit_id,name,price,category) values(v_id,v_unit,v_source.name,v_source.price,v_source.category)
          on conflict(id) do update set business_unit_id=excluded.business_unit_id;
        v_result := v_result || jsonb_build_array(jsonb_build_object('unit_id',v_unit,'ok',true,'item_id',v_id));
      end loop;
      return v_result;
    end $$;
  `);
  await db.exec(readFileSync("supabase/migrations/20261017160000_menu_item_class_combo_eligibility.sql", "utf8"));
}, 30000);

afterAll(async () => { await db?.close(); });

describe("menu item class and combo eligibility migration", () => {
  it("preserves existing normal-item compatibility and defaults special items out of combos", async () => {
    const result = await db.query<{ item_kind: string; combo_eligible: boolean }>(
      "select item_kind, combo_eligible from public.menu_items where id in ('burger','special') order by id"
    );
    expect(result.rows).toEqual([
      { item_kind: "regular", combo_eligible: true },
      { item_kind: "regular", combo_eligible: true },
    ]);
    await db.query("update public.menu_items set item_kind='seasonal', combo_eligible=false where id='special'");
    const special = await db.query<{ item_kind: string; combo_eligible: boolean }>("select item_kind,combo_eligible from public.menu_items where id='special'");
    expect(special.rows[0]).toEqual({ item_kind: "seasonal", combo_eligible: false });
  });

  it("uses the normal default but blocks special/seasonal unless the admin explicitly enables them", async () => {
    await db.query(`select public.save_menu_item_with_recipe_and_class('${A}','new-normal', '{"name":"Normal","price":12}'::jsonb)`);
    await db.query(`select public.save_menu_item_with_recipe_and_class('${A}','new-seasonal', '{"name":"Sazonal","price":18,"item_kind":"seasonal"}'::jsonb)`);
    await db.query(`select public.save_menu_item_with_recipe_and_class('${A}','released-special', '{"name":"Especial liberado","price":22,"item_kind":"special","combo_eligible":true}'::jsonb)`);
    const result = await db.query<{ id: string; item_kind: string; combo_eligible: boolean }>(
      "select id,item_kind,combo_eligible from public.menu_items where id in ('new-normal','new-seasonal','released-special') order by id"
    );
    expect(result.rows).toEqual([
      { id: "new-normal", item_kind: "regular", combo_eligible: true },
      { id: "new-seasonal", item_kind: "seasonal", combo_eligible: false },
      { id: "released-special", item_kind: "special", combo_eligible: true },
    ]);
  });

  it("preserves classification when copying an item into another authorized unit", async () => {
    await db.query(`update public.menu_items set item_kind='seasonal', combo_eligible=false where id='special'`);
    await db.query(`select public.export_menu_item_to_units_with_classification('${A}','special',array['${B}'::uuid])`);
    const copy = await db.query<{ business_unit_id: string; item_kind: string; combo_eligible: boolean }>(
      "select business_unit_id,item_kind,combo_eligible from public.menu_items where id='special-copy'"
    );
    expect(copy.rows[0]).toEqual({ business_unit_id: B, item_kind: "seasonal", combo_eligible: false });
  });

  it("rejects ineligible combo options and grouped order lines, while allowing an explicit admin exception", async () => {
    await db.query(`update public.menu_items set item_kind='special', combo_eligible=false where id='special'`);
    const comboId = (await db.query<{ id: string }>(`insert into public.menu_combos(business_unit_id,name,pricing_mode,price) values('${A}','Teste','fixed',35) returning id`)).rows[0].id;
    const slotId = (await db.query<{ id: string }>(`insert into public.menu_combo_slots(combo_id,business_unit_id,label) values($1,'${A}','Prato') returning id`, [comboId])).rows[0].id;
    await expect(db.query(`insert into public.menu_combo_options(slot_id,business_unit_id,menu_item_id) values($1,'${A}','special')`, [slotId])).rejects.toThrow("não elegível");
    await expect(db.query(`insert into public.menu_combo_options(slot_id,business_unit_id,menu_item_id) values($1,'${A}','other-unit')`, [slotId])).rejects.toThrow();

    await db.query(`insert into public.orders(id,business_unit_id) values('${ORDER}','${A}')`);
    await expect(db.query(`insert into public.order_items(order_id,menu_item_id,combo_group_id) values('${ORDER}','special',gen_random_uuid())`)).rejects.toThrow("não elegível");
    await db.query(`insert into public.menu_items(id,business_unit_id,name,price,item_kind,combo_eligible) values('released','${A}','Liberado',20,'special',true)`);
    await db.query(`insert into public.menu_combo_options(slot_id,business_unit_id,menu_item_id) values($1,'${A}','released')`, [slotId]);
    await db.query(`insert into public.order_items(order_id,menu_item_id,combo_group_id) values('${ORDER}','released',gen_random_uuid())`);
  });

  it("saves all combo steps/options atomically when an option is invalid", async () => {
    const data = JSON.stringify({
      name: "Combo atômico", pricing_mode: "fixed", price: 39, discount: 0, active: true,
      slots: [{ label: "Lanche", options: [{ menu_item_id: "burger", extra_price: 0, is_free: false }] },
        { label: "Especial", options: [{ menu_item_id: "special", extra_price: 0, is_free: false }] }],
    });
    await expect(db.query("select public.save_menu_combo($1,null,$2::jsonb,0)", [A, data])).rejects.toThrow("não elegível");
    const count = await db.query<{ count: number }>("select count(*)::int as count from public.menu_combos where name='Combo atômico'");
    expect(count.rows[0].count).toBe(0);

    const valid = JSON.stringify({
      name: "Combo válido", pricing_mode: "fixed", price: 35, discount: 0, active: true,
      slots: [{ label: "Lanche", options: [{ menu_item_id: "burger", extra_price: 0, is_free: false }] }],
    });
    const saved = await db.query<{ id: string }>("select public.save_menu_combo($1,null,$2::jsonb,0) as id", [A, valid]);
    expect(saved.rows[0].id).toBeTruthy();
  });

  it.each([
    ["fixed", 35.9, 0], ["percent", null, 15], ["amount", null, 5],
  ])("persists and edits ready combos using %s pricing without creating menu items", async (mode, price, discount) => {
    const before = (await db.query<{ count: number }>("select count(*)::int as count from menu_items")).rows[0].count;
    const data = { name: `Pronto ${mode}`, pricing_mode: mode, price, discount, active: true,
      slots: [{ label: "Primeiro", options: [{ menu_item_id: "burger" }] }, { label: "Segundo", options: [{ menu_item_id: "burger" }] }] };
    const id = (await db.query<{ id: string }>("select public.save_menu_combo($1,null,$2::jsonb,0) as id", [A, JSON.stringify(data)])).rows[0].id;
    const saved = (await db.query<{ pricing_mode: string; price: string | null; discount: string }>(
      "select pricing_mode,price,discount from menu_combos where id=$1", [id],
    )).rows[0];
    expect(saved.pricing_mode).toBe(mode);
    expect(saved.price === null ? null : Number(saved.price)).toBe(price);
    expect(Number(saved.discount)).toBe(discount);
    await db.query("select public.save_menu_combo($1,$2,$3::jsonb,0)", [A, id, JSON.stringify({ ...data, name: "Editado", active: false })]);
    expect((await db.query<{ count: number }>("select count(*)::int as count from menu_combo_slots where combo_id=$1", [id])).rows[0].count).toBe(2);
    expect((await db.query<{ count: number }>("select count(*)::int as count from menu_items")).rows[0].count).toBe(before);
  });
});
