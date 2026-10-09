// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261009180000_menu_import.sql", "utf8");
const UNIT_A = "00000000-0000-0000-0000-000000000001";
const UNIT_B = "00000000-0000-0000-0000-000000000002";
const ADMIN_A = "00000000-0000-0000-0000-000000000011";
const ADMIN_B = "00000000-0000-0000-0000-000000000012";
const ATTENDANT = "00000000-0000-0000-0000-000000000013";
let db: PGlite;

const payload = {
  categories: [{ key: "burgers", label: "Hambúrgueres", destination: "kitchen" }],
  items: [{
    name: "X-Burger", description: "Pão, carne e molho", price: 29.9, category: "burgers",
    ingredients: [{ name: "Cebola", removable: true, extraPrice: 0 }],
    recipe: [
      { material: "Pão brioche", unit: "un", quantity: 1, preparation: null },
      { material: "Molho da casa", unit: "kg", quantity: 0.05, preparation: { outputQuantity: 1, inputs: [{ material: "Tomate", unit: "kg", quantity: 0.8 }] } },
    ],
  }],
};

async function as(id: string | null) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
}
async function apply(request: string, body: unknown = payload, unit = UNIT_A, publish = false) {
  return (await db.query<{ r: Record<string, unknown> }>("select public.apply_menu_import($1, $2, $3::jsonb, $4) as r", [unit, request, JSON.stringify(body), publish])).rows[0].r;
}
async function count(table: string) {
  return Number((await db.query<{ n: string }>(`select count(*) as n from public.${table}`)).rows[0].n);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema ops_private;
    create table public.business_units (id uuid primary key, active boolean default true);
    create table public.user_roles (user_id uuid, role text, business_unit_id uuid);
    create function ops_private.staff(p_unit uuid, p_roles text[]) returns boolean language sql stable as $$
      select auth.uid() is not null and exists(select 1 from public.user_roles ur where ur.user_id = auth.uid()
        and (ur.business_unit_id = p_unit or ur.business_unit_id is null) and ur.role = any(p_roles)) $$;
    create type public.item_tipo as enum ('insumo', 'semiacabado', 'produto_acabado', 'revenda');
    create table public.menu_categories (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null,
      key text not null, label text not null, destination text not null default 'kitchen', sort_order int not null default 0);
    create table public.menu_items (id text primary key default gen_random_uuid()::text, business_unit_id uuid not null,
      name text not null, description text, price numeric not null, category text not null,
      status text not null default 'draft', active boolean not null default true, source text not null default 'mesa',
      sort_order int not null default 0);
    create table public.menu_item_ingredients (id uuid primary key default gen_random_uuid(), menu_item_id text not null,
      name text not null, removable boolean not null default true, extra_price numeric, sort_order int not null default 0);
    create table public.raw_materials (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null,
      name text not null, unit text not null, tipo public.item_tipo not null default 'insumo',
      min_stock numeric not null default 0, current_stock numeric not null default 0);
    create table public.recipe_items (id uuid primary key default gen_random_uuid(), menu_item_id text not null,
      raw_material_id uuid not null, quantity numeric not null);
    create table public.production_recipes (id uuid primary key default gen_random_uuid(), business_unit_id uuid,
      name text not null, output_raw_material_id uuid not null, output_quantity numeric not null, tipo text default 'producao');
    create table public.production_recipe_inputs (id uuid primary key default gen_random_uuid(), recipe_id uuid not null,
      raw_material_id uuid not null, quantity numeric not null);
    create table public.lotes (id uuid primary key default gen_random_uuid());
    create table public.stock_movements (id uuid primary key default gen_random_uuid());
  `);
  await db.exec(migration);
}, 30000);

beforeEach(async () => {
  await db.exec(`truncate public.menu_import_requests, public.production_recipe_inputs, public.production_recipes,
    public.recipe_items, public.raw_materials, public.menu_item_ingredients, public.menu_items, public.menu_categories,
    public.user_roles, public.business_units cascade`);
  await db.query("insert into public.business_units (id) values ($1), ($2)", [UNIT_A, UNIT_B]);
  await db.query("insert into public.user_roles values ($1, 'admin', $2), ($3, 'admin', $4), ($5, 'attendant', $2)",
    [ADMIN_A, UNIT_A, ADMIN_B, UNIT_B, ATTENDANT]);
  await as(ADMIN_A);
});

afterAll(async () => { await db?.close(); });

describe("apply_menu_import", () => {
  it("creates the menu, technical sheet and theoretical materials without any real stock", async () => {
    const result = await apply("10000000-0000-0000-0000-000000000001");
    expect(result).toMatchObject({ itemsCreated: 1, categoriesCreated: 1, materialsCreated: 3, recipesCreated: 1, recipeLines: 2, published: false });
    const item = (await db.query<{ status: string; price: string }>("select status, price from public.menu_items")).rows[0];
    expect(item.status).toBe("draft");
    expect(Number(item.price)).toBe(29.9);
    const stock = await db.query<{ total: string }>("select coalesce(sum(current_stock), 0) as total from public.raw_materials");
    expect(Number(stock.rows[0].total)).toBe(0);
    expect(await count("lotes")).toBe(0);
    expect(await count("stock_movements")).toBe(0);
    const sauce = (await db.query<{ tipo: string }>("select tipo from public.raw_materials where name = 'Molho da casa'")).rows[0];
    expect(sauce.tipo).toBe("semiacabado");
    expect(await count("production_recipe_inputs")).toBe(1);
    expect(await count("menu_item_ingredients")).toBe(1);
  });

  it("is idempotent: repeating the same request does not duplicate anything", async () => {
    const request = "10000000-0000-0000-0000-000000000002";
    await apply(request);
    const again = await apply(request);
    expect(again.repeated).toBe(true);
    expect(await count("menu_items")).toBe(1);
    expect(await count("raw_materials")).toBe(3);
    expect(await count("recipe_items")).toBe(2);
  });

  it("skips items that already exist instead of overwriting them, and reuses materials", async () => {
    await apply("10000000-0000-0000-0000-000000000003");
    const second = await apply("10000000-0000-0000-0000-000000000004", {
      ...payload,
      items: [payload.items[0], { name: "Batata", description: "", price: 12, category: "burgers", ingredients: [], recipe: [{ material: "Tomate", unit: "kg", quantity: 0.1, preparation: null }] }],
    });
    expect(second.itemsCreated).toBe(1);
    expect(second.itemsSkipped).toEqual(["X-Burger"]);
    expect(second.materialsCreated).toBe(0);
    expect(await count("raw_materials")).toBe(3);
  });

  it("aborts everything when a material exists with a different unit", async () => {
    await apply("10000000-0000-0000-0000-000000000005");
    const conflicting = { categories: payload.categories, items: [{ name: "Salada", description: "", price: 18, category: "burgers", ingredients: [], recipe: [{ material: "Tomate", unit: "g", quantity: 80, preparation: null }] }] };
    await expect(apply("10000000-0000-0000-0000-000000000006", conflicting)).rejects.toThrow("Unidade divergente");
    expect(await count("menu_items")).toBe(1);
  });

  it("refuses non-admins and admins from another unit", async () => {
    await as(ATTENDANT);
    await expect(apply("10000000-0000-0000-0000-000000000007")).rejects.toThrow("Sem permissão");
    await as(ADMIN_B);
    await expect(apply("10000000-0000-0000-0000-000000000008")).rejects.toThrow("Sem permissão");
    await as(null);
    await expect(apply("10000000-0000-0000-0000-000000000009")).rejects.toThrow("Sem permissão");
    expect(await count("menu_items")).toBe(0);
  });

  it("does not let a request id from one unit be replayed in another", async () => {
    const request = "10000000-0000-0000-0000-000000000010";
    await apply(request);
    await as(ADMIN_B);
    await expect(apply(request, payload, UNIT_B)).rejects.toThrow("Solicitação já utilizada");
  });

  it("requires a price before publishing", async () => {
    const noPrice = { ...payload, items: [{ ...payload.items[0], price: 0 }] };
    await expect(apply("10000000-0000-0000-0000-000000000011", noPrice, UNIT_A, true)).rejects.toThrow("Defina o preço");
    const published = await apply("10000000-0000-0000-0000-000000000012", payload, UNIT_A, true);
    expect(published.published).toBe(true);
    expect((await db.query<{ status: string }>("select status from public.menu_items")).rows[0].status).toBe("published");
  });

  it("rejects malformed drafts", async () => {
    await expect(apply("10000000-0000-0000-0000-000000000013", { items: [] })).rejects.toThrow("Rascunho de cardápio inválido");
    await expect(apply("10000000-0000-0000-0000-000000000014", { categories: [{ key: "Bad Key!", label: "x" }], items: payload.items })).rejects.toThrow("Categoria inválida");
  });
});
