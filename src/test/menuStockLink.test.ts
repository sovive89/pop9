// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Banco simulado com o mínimo das tabelas de estoque, para testar a migration real
 * 20261013180000_menu_stock_link.sql: baixa da venda (sem/extra/adicional), FEFO por lote,
 * estorno de cancelamento e os gatilhos de produção.
 */
let db: PGlite;
const unit = "00000000-0000-0000-0000-0000000000a1";
const other = "00000000-0000-0000-0000-0000000000a2";
const order = "00000000-0000-0000-0000-0000000000b1";
const ids = {
  pao: "00000000-0000-0000-0000-000000000101",
  bacon: "00000000-0000-0000-0000-000000000102",
  cebola: "00000000-0000-0000-0000-000000000103",
  ovo: "00000000-0000-0000-0000-000000000104",
  sal: "00000000-0000-0000-0000-000000000105",
  molho: "00000000-0000-0000-0000-000000000106",
  alheio: "00000000-0000-0000-0000-000000000107",
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema app_private;
    create function app_private.has_unit_role(u uuid, r text[]) returns boolean language sql as $$ select false $$;
    create table raw_materials(id uuid primary key, business_unit_id uuid not null, name text,
      unit text not null default 'un', current_stock numeric not null default 0, min_stock numeric not null default 0,
      average_cost numeric not null default 0, updated_at timestamptz);
    create view low_stock_alerts as select * from raw_materials where current_stock < min_stock;
    create table orders(id uuid primary key, business_unit_id uuid, status text);
    create table order_items(id uuid primary key default gen_random_uuid(), order_id uuid, menu_item_id text,
      quantity integer not null default 1, ingredient_mods jsonb default '[]');
    create table recipe_items(id uuid primary key default gen_random_uuid(), menu_item_id text not null,
      raw_material_id uuid not null, quantity numeric not null);
    create table menu_item_ingredients(id uuid primary key default gen_random_uuid(), menu_item_id text,
      name text, removable boolean, extra_price numeric, sort_order int);
    create table lotes(id uuid primary key default gen_random_uuid(), raw_material_id uuid not null,
      numero_lote text not null default 'L', origem text not null default 'compra',
      quantidade_entrada numeric not null, data_entrada timestamptz not null default now(), validade date,
      preco_unitario numeric, business_unit_id uuid not null);
    create table stock_movements(id uuid primary key default gen_random_uuid(), business_unit_id uuid not null,
      raw_material_id uuid not null, type text not null, quantity numeric not null, reason text not null,
      reference_type text, reference_id uuid, lote_id uuid, unit_cost numeric, batch_info jsonb, created_by uuid,
      supplier_id uuid, created_at timestamptz not null default clock_timestamp());
    create table production_recipes(id uuid primary key, output_raw_material_id uuid not null,
      output_quantity numeric not null, shelf_life_days int);
    create table production_recipe_inputs(id uuid primary key default gen_random_uuid(), recipe_id uuid,
      raw_material_id uuid, quantity numeric);
    create table production_batches(id uuid primary key default gen_random_uuid(), recipe_id uuid not null,
      quantity_produced numeric not null, produced_by uuid, batch_code text, notes text,
      produced_at timestamptz not null default now(), expires_at timestamptz, business_unit_id uuid not null);
    create table production_batch_inputs(id uuid primary key default gen_random_uuid(), batch_id uuid not null,
      raw_material_id uuid not null, quantity_used numeric not null, lote_id uuid);
    -- Igual ao apply_stock_movement de produção: saldo e custo médio derivados do livro-razão.
    create function apply_stock_movement() returns trigger language plpgsql set search_path = public as $$
    declare s numeric; c numeric; begin
      select current_stock, average_cost into s, c from raw_materials where id = new.raw_material_id;
      if new.type = 'entrada' then
        update raw_materials set current_stock = current_stock + new.quantity,
          average_cost = case when new.unit_cost is not null and s + new.quantity > 0
            then (s * c + new.quantity * new.unit_cost) / (s + new.quantity) else c end
        where id = new.raw_material_id;
      else
        update raw_materials set current_stock = current_stock - new.quantity where id = new.raw_material_id;
      end if;
      return new;
    end $$;
    create trigger trg_apply_stock_movement after insert on stock_movements for each row execute function apply_stock_movement();
  `);
  await db.exec(readFileSync("supabase/migrations/20261013020048_mvp_stock_cancellation_and_view.sql", "utf8"));
  await db.exec("create trigger trg_order_cancel_reverts_stock after update on orders for each row execute function order_cancel_reverts_stock();");
  const migration = readFileSync("supabase/migrations/20261013180000_menu_stock_link.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // idempotente: pode ser reaplicada sem erro nem gatilho duplicado
}, 60000);

beforeEach(async () => {
  await db.exec("truncate stock_movements, order_items, orders, recipe_items, lotes, raw_materials, production_batch_inputs, production_batches, production_recipe_inputs, production_recipes");
  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into raw_materials(id, business_unit_id, name, current_stock) values ($1, $2, $3, 0)", [id, name === "alheio" ? other : unit, name]);
  }
  await db.query("insert into orders values ($1, $2, 'pending')", [order, unit]);
});

afterAll(async () => { await db?.close(); });

type Line = { material: string; qty: number; display?: string; removable?: boolean; extra?: number; onlyExtra?: boolean };
async function recipe(lines: Line[], menuItem = "burger") {
  for (const [i, l] of lines.entries()) {
    await db.query(
      "insert into recipe_items(menu_item_id, raw_material_id, quantity, display_name, removable, extra_price, only_as_extra, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [menuItem, l.material, l.qty, l.display ?? null, l.removable ?? false, l.extra ?? null, l.onlyExtra ?? false, i],
    );
  }
}
async function sell(quantity = 1, mods: { name: string; action: string; extraPrice?: number }[] = [], menuItem = "burger") {
  const { rows } = await db.query<{ id: string }>(
    "insert into order_items(order_id, menu_item_id, quantity, ingredient_mods) values ($1,$2,$3,$4::jsonb) returning id",
    [order, menuItem, quantity, JSON.stringify(mods)],
  );
  return rows[0].id;
}
async function out(material: string) {
  const { rows } = await db.query<{ total: string | null }>(
    "select sum(quantity) total from stock_movements where raw_material_id = $1 and type = 'saida'", [material]);
  return Number(rows[0].total ?? 0);
}
async function stock(material: string) {
  const { rows } = await db.query<{ current_stock: string; average_cost: string }>(
    "select current_stock, average_cost from raw_materials where id = $1", [material]);
  return { current: Number(rows[0].current_stock), cost: Number(rows[0].average_cost) };
}
async function lot(material: string, quantity: number, validade: string | null, entrada = "2026-10-01") {
  const { rows } = await db.query<{ id: string }>(
    "insert into lotes(raw_material_id, quantidade_entrada, validade, data_entrada, business_unit_id) values ($1,$2,$3,$4,$5) returning id",
    [material, quantity, validade, entrada, unit]);
  await db.query("insert into stock_movements(business_unit_id, raw_material_id, type, quantity, reason, lote_id) values ($1,$2,'entrada',$3,'compra',$4)",
    [unit, material, quantity, rows[0].id]);
  return rows[0].id;
}
const consumed = async (lote: string) =>
  Number((await db.query<{ c: string }>("select app_private.lot_consumed($1) c", [lote])).rows[0].c);

describe("baixa da venda pela ficha técnica", () => {
  it("baixa cada linha da ficha × quantidade vendida, inclusive linhas que o cliente não vê", async () => {
    await recipe([{ material: ids.pao, qty: 1, display: "Pão" }, { material: ids.sal, qty: 0.002 }]);
    await sell(3);
    expect(await out(ids.pao)).toBe(3);
    expect(await out(ids.sal)).toBeCloseTo(0.006);
  });

  it('"sem X" não baixa a linha exibida; linha oculta (sal) nunca muda', async () => {
    await recipe([
      { material: ids.pao, qty: 1, display: "Pão" },
      { material: ids.cebola, qty: 0.02, display: "Cebola", removable: true },
      { material: ids.sal, qty: 0.001 },
    ]);
    await sell(2, [{ name: "  CEBOLA ", action: "remove" }, { name: "sal", action: "remove" }]);
    expect(await out(ids.cebola)).toBe(0);
    expect(await out(ids.pao)).toBe(2);
    expect(await out(ids.sal)).toBeCloseTo(0.002);
  });

  it('"extra X" baixa a porção de novo para cada adicional; "só adicional" só baixa quando pedido', async () => {
    await recipe([
      { material: ids.bacon, qty: 0.03, display: "Bacon", removable: true, extra: 4 },
      { material: ids.ovo, qty: 1, display: "Ovo", extra: 3, onlyExtra: true },
    ]);
    await sell(1);
    expect(await out(ids.bacon)).toBeCloseTo(0.03);
    expect(await out(ids.ovo)).toBe(0);
    await sell(2, [{ name: "Bacon", action: "extra", extraPrice: 4 }, { name: "Bacon", action: "extra", extraPrice: 4 }, { name: "ovo", action: "extra", extraPrice: 3 }]);
    expect(await out(ids.bacon)).toBeCloseTo(0.03 + 0.03 * 3 * 2);
    expect(await out(ids.ovo)).toBe(2);
  });

  it("o que a cozinha recebeu como extra baixa, e insumo de outra unidade é ignorado", async () => {
    await recipe([{ material: ids.pao, qty: 1, display: "Pão" }, { material: ids.alheio, qty: 5, display: "Alheio" }]);
    await sell(1, [{ name: "Pão", action: "extra", extraPrice: 0 }]);
    expect(await out(ids.pao)).toBe(2);
    expect(await out(ids.alheio)).toBe(0);
  });
});

describe("FEFO por lote", () => {
  it("consome primeiro o lote que vence antes e marca o lote em cada saída", async () => {
    const tarde = await lot(ids.bacon, 1, "2026-12-01", "2026-09-01");
    const cedo = await lot(ids.bacon, 0.05, "2026-10-20", "2026-10-05");
    const semValidade = await lot(ids.bacon, 1, null, "2026-08-01");
    await recipe([{ material: ids.bacon, qty: 0.03, display: "Bacon" }]);
    await sell(3); // 0,09
    expect(await consumed(cedo)).toBeCloseTo(0.05);
    expect(await consumed(tarde)).toBeCloseTo(0.04);
    expect(await consumed(semValidade)).toBe(0);
    expect((await stock(ids.bacon)).current).toBeCloseTo(2.05 - 0.09);
  });

  it("sem lote suficiente, o restante sai sem lote em vez de travar a venda", async () => {
    const unico = await lot(ids.pao, 2, "2026-10-30");
    await recipe([{ material: ids.pao, qty: 1, display: "Pão" }]);
    await sell(5);
    expect(await consumed(unico)).toBe(2);
    const { rows } = await db.query<{ q: string }>("select quantity q from stock_movements where raw_material_id=$1 and type='saida' and lote_id is null", [ids.pao]);
    expect(rows.map((r) => Number(r.q))).toEqual([3]);
    expect((await stock(ids.pao)).current).toBe(-3);
  });

  it("cancelamento devolve ao mesmo lote e ao saldo", async () => {
    const l = await lot(ids.pao, 10, "2026-10-30");
    await recipe([{ material: ids.pao, qty: 1, display: "Pão" }]);
    await sell(4);
    expect(await consumed(l)).toBe(4);
    await db.query("update orders set status='cancelled' where id=$1", [order]);
    expect(await consumed(l)).toBe(0);
    expect((await stock(ids.pao)).current).toBe(10);
  });
});

describe("produção", () => {
  it("dá entrada no produzido com unidade e custo teórico e baixa os insumos sem contar o lote duas vezes", async () => {
    await db.query("update raw_materials set average_cost = 20 where id = $1", [ids.bacon]);
    await db.query("update raw_materials set average_cost = 4 where id = $1", [ids.cebola]);
    const loteCebola = await lot(ids.cebola, 5, "2026-11-01");
    const recipeId = "00000000-0000-0000-0000-0000000000c1";
    await db.query("insert into production_recipes values ($1,$2,2,3)", [recipeId, ids.molho]);
    await db.query("insert into production_recipe_inputs(recipe_id, raw_material_id, quantity) values ($1,$2,0.5),($1,$3,1)", [recipeId, ids.bacon, ids.cebola]);
    const { rows } = await db.query<{ id: string; batch_code: string; expires_at: string | null }>(
      "insert into production_batches(recipe_id, quantity_produced, business_unit_id) values ($1, 2, $2) returning id, batch_code, expires_at",
      [recipeId, unit]);
    const batch = rows[0];
    expect(batch.batch_code).toMatch(/^\d{8}-/);
    expect(batch.expires_at).not.toBeNull();
    await db.query("insert into production_batch_inputs(batch_id, raw_material_id, quantity_used, lote_id) values ($1,$2,1,$3)", [batch.id, ids.cebola, loteCebola]);
    const molho = await stock(ids.molho);
    expect(molho.current).toBe(2);
    expect(molho.cost).toBeCloseTo((0.5 * 20 + 1 * 4) / 2);
    const mov = await db.query<{ business_unit_id: string; lote_id: string | null }>(
      "select business_unit_id, lote_id from stock_movements where reason in ('producao_output','producao_consumo')");
    expect(mov.rows.every((m) => m.business_unit_id === unit)).toBe(true);
    expect(await consumed(loteCebola)).toBe(1);
    expect((await stock(ids.cebola)).current).toBe(4);
  });
});

describe("regras da ficha", () => {
  it("recusa combinações sem sentido", async () => {
    const bad = (sql: string) => expect(db.query(sql, [ids.pao])).rejects.toThrow();
    await bad("insert into recipe_items(menu_item_id, raw_material_id, quantity, removable) values ('x', $1, 1, true)");
    await bad("insert into recipe_items(menu_item_id, raw_material_id, quantity, display_name, only_as_extra) values ('x', $1, 1, 'Pão', true)");
    await bad("insert into recipe_items(menu_item_id, raw_material_id, quantity, extra_price) values ('x', $1, 1, 2)");
    await bad("insert into recipe_items(menu_item_id, raw_material_id, quantity, display_name, extra_price) values ('x', $1, 1, 'Pão', -1)");
  });
});

describe("unidade do insumo", () => {
  const asAdmin = async (allowed: boolean) => {
    await db.exec(`create or replace function auth.uid() returns uuid language sql as $$ select ${allowed ? "'00000000-0000-0000-0000-0000000000ff'::uuid" : "null::uuid"} $$;
      create or replace function app_private.has_unit_role(u uuid, r text[]) returns boolean language sql as $$ select ${allowed} $$;`);
  };
  const unitOf = async (id: string) => (await db.query<{ unit: string }>("select unit from raw_materials where id = $1", [id])).rows[0].unit;

  it("troca a unidade de insumo ainda sem uso (ex.: blend criado em un)", async () => {
    await asAdmin(true);
    await recipe([{ material: ids.bacon, qty: 1, display: "Bacon" }], "x-bacon");
    await db.query("select public.set_raw_material_unit($1, 'kg', 'x-bacon')", [ids.bacon]);
    expect(await unitOf(ids.bacon)).toBe("kg");
  });

  it("recusa trocar a unidade com movimento, lote ou outra ficha, e sem permissão", async () => {
    await asAdmin(true);
    await lot(ids.pao, 10, null);
    await expect(db.query("select public.set_raw_material_unit($1, 'kg', null)", [ids.pao])).rejects.toThrow(/movimento/);
    await expect(db.query("update raw_materials set unit = 'kg' where id = $1", [ids.pao])).rejects.toThrow(/movimento/);
    await recipe([{ material: ids.cebola, qty: 1, display: "Cebola" }], "outro-item");
    await expect(db.query("select public.set_raw_material_unit($1, 'kg', 'x-bacon')", [ids.cebola])).rejects.toThrow(/outra ficha/);
    await asAdmin(false);
    await expect(db.query("select public.set_raw_material_unit($1, 'kg', null)", [ids.ovo])).rejects.toThrow(/permissão/);
    expect(await unitOf(ids.ovo)).toBe("un");
  });
});
