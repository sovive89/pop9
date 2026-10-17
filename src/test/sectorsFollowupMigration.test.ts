// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const U = "00000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema app_private;
    create schema ops_private;
    create function ops_private.staff(uuid,text[]) returns boolean language sql as $$ select true $$;
    create function ops_private.write_recipe_document(uuid,text,text,jsonb,text) returns void language plpgsql as $$ begin return; end $$;
    create table public.business_units (id uuid primary key);
    create table public.print_sectors (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null references public.business_units(id),
      slug text not null, name text not null, active boolean not null default true, unique (business_unit_id, slug));
    create table public.orders (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null);
    create table public.menu_categories (key text, business_unit_id uuid, destination text default 'kitchen', primary key(business_unit_id,key));
    create table public.menu_items (id text primary key, business_unit_id uuid, category text, name text, price numeric,
      description text, image_url text, active boolean default true, status text default 'draft', sort_order integer default 0, updated_at timestamptz default now());
    create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid, menu_item_id text, destination text default 'kitchen');
    create table public.menu_item_ingredients (id uuid primary key default gen_random_uuid(), menu_item_id text, name text, removable boolean, extra_price numeric, sort_order integer);
    create table public.menu_item_variants (id uuid primary key default gen_random_uuid(), menu_item_id text, name text, sort_order integer);
    create table public.recipe_items (menu_item_id text, raw_material_id uuid, quantity numeric, display_quantity numeric, display_unit text, transformacao text);
    create table public.raw_materials (id uuid primary key default gen_random_uuid(), business_unit_id uuid, name text, unit text,
      tipo text, min_stock numeric, current_stock numeric, is_theoretical boolean, categoria text);
    insert into public.business_units values ('${U}');
    insert into public.print_sectors (business_unit_id, slug, name) values ('${U}','kitchen','Cozinha'),('${U}','bar','Bar');
    insert into public.menu_categories values ('drinks','${U}','bar');
  `);
  await db.exec(readFileSync("supabase/migrations/20261013120000_sectors_cashier_order_destination.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261017140000_menu_item_destination_override.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

const slugs = async (unit: string) => (await db.query<{ slug: string }>("select slug from public.print_sectors where business_unit_id=$1 order by slug", [unit])).rows.map((r) => r.slug);

describe("sectors follow-up", () => {
  it("adds Caixa to existing units and all three sectors to new units", async () => {
    expect(await slugs(U)).toEqual(["bar", "cashier", "kitchen"]);
    await db.query("insert into public.business_units values ('00000000-0000-0000-0000-000000000002')");
    expect(await slugs("00000000-0000-0000-0000-000000000002")).toEqual(["bar", "cashier", "kitchen"]);
  });

  it("uses the item override first, otherwise inherits the category sector", async () => {
    await db.exec(`
      insert into public.menu_categories values ('sweets','${U}','cashier');
      insert into public.menu_items (id,business_unit_id,category,destination) values
        ('m1','${U}','drinks',null),('m2','${U}','sweets','kitchen'),('m3','${U}','unknown',null);
    `);
    const order = (await db.query<{ id: string }>("insert into public.orders (business_unit_id) values ($1) returning id", [U])).rows[0].id;
    const dest = async (item: string | null, sent: string | null) =>
      (await db.query<{ destination: string }>("insert into public.order_items (order_id, menu_item_id, destination) values ($1,$2,$3) returning destination", [order, item, sent])).rows[0].destination;
    expect(await dest("m1", "kitchen")).toBe("bar");
    expect(await dest("m2", "bar")).toBe("kitchen");
    expect(await dest("m3", "bar")).toBe("bar");
    expect(await dest(null, null)).toBe("kitchen");
  });

  it("saves or clears the override atomically and preserves it when an older client omits the field", async () => {
    const payload = { name: "Suco da casa", price: 12, category: "drinks", status: "draft", ingredients: [], variants: [], recipe: [] };
    const save = (id: string, data: Record<string, unknown>) => db.query(
      "select public.save_menu_item_with_recipe($1,$2,$3::jsonb)", [U, id, JSON.stringify(data)],
    );
    await save("m-override", { ...payload, destination: "kitchen" });
    expect((await db.query<{ destination: string | null }>("select destination from public.menu_items where id='m-override'")).rows[0].destination).toBe("kitchen");
    await save("m-override", { ...payload, destination: null });
    expect((await db.query<{ destination: string | null }>("select destination from public.menu_items where id='m-override'")).rows[0].destination).toBeNull();

    await save("m-legacy", { ...payload, destination: "kitchen" });
    await save("m-legacy", payload);
    expect((await db.query<{ destination: string | null }>("select destination from public.menu_items where id='m-legacy'")).rows[0].destination).toBe("kitchen");
  });
});
