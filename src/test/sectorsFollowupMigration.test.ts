// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const U = "00000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema app_private;
    create table public.business_units (id uuid primary key);
    create table public.print_sectors (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null references public.business_units(id),
      slug text not null, name text not null, active boolean not null default true, unique (business_unit_id, slug));
    create table public.orders (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null);
    create table public.menu_categories (key text, business_unit_id uuid, destination text default 'kitchen');
    create table public.menu_items (id text primary key, business_unit_id uuid, category text);
    create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid, menu_item_id text, destination text default 'kitchen');
    insert into public.business_units values ('${U}');
    insert into public.print_sectors (business_unit_id, slug, name) values ('${U}','kitchen','Cozinha'),('${U}','bar','Bar');
  `);
  await db.exec(readFileSync("supabase/migrations/20261013120000_sectors_cashier_order_destination.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

const slugs = async (unit: string) => (await db.query<{ slug: string }>("select slug from public.print_sectors where business_unit_id=$1 order by slug", [unit])).rows.map((r) => r.slug);

describe("sectors follow-up", () => {
  it("adds Caixa to existing units and all three sectors to new units", async () => {
    expect(await slugs(U)).toEqual(["bar", "cashier", "kitchen"]);
    await db.query("insert into public.business_units values ('00000000-0000-0000-0000-000000000002')");
    expect(await slugs("00000000-0000-0000-0000-000000000002")).toEqual(["bar", "cashier", "kitchen"]);
  });

  it("takes the item's sector from its menu category, ignoring what the app sent", async () => {
    await db.exec(`
      insert into public.menu_categories values ('drinks','${U}','bar'),('sweets','${U}','cashier');
      insert into public.menu_items values ('m1','${U}','drinks'),('m2','${U}','sweets'),('m3','${U}','unknown');
    `);
    const order = (await db.query<{ id: string }>("insert into public.orders (business_unit_id) values ($1) returning id", [U])).rows[0].id;
    const dest = async (item: string | null, sent: string | null) =>
      (await db.query<{ destination: string }>("insert into public.order_items (order_id, menu_item_id, destination) values ($1,$2,$3) returning destination", [order, item, sent])).rows[0].destination;
    expect(await dest("m1", "kitchen")).toBe("bar");
    expect(await dest("m2", "kitchen")).toBe("cashier");
    expect(await dest("m3", "bar")).toBe("bar");
    expect(await dest(null, null)).toBe("kitchen");
  });
});
