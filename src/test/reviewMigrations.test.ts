// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261009104050_review_unit_and_inventory_fixes.sql", "utf8");
const historicalLotMigration = readFileSync("supabase/migrations/20261008181000_manage_purchase_lot.sql", "utf8");
const UNIT_A = "00000000-0000-0000-0000-000000000001";
const UNIT_B = "00000000-0000-0000-0000-000000000002";
const ADMIN_A = "00000000-0000-0000-0000-000000000011";
const ADMIN_B = "00000000-0000-0000-0000-000000000012";
const ATTENDANT = "00000000-0000-0000-0000-000000000013";
const LOT = "00000000-0000-0000-0000-000000000021";
const MATERIAL = "00000000-0000-0000-0000-000000000031";
let db: PGlite;

async function caller(id: string | null) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
}

async function edit(quantity: number) {
  await db.query("select public.manage_purchase_lot($1, 'edit', $2::jsonb)", [LOT, JSON.stringify({
    quantidade_compra: quantity, fator_conversao: 1, unidade_compra: "kg", custo_total: quantity * 2,
  })]);
}

async function lotBalance() {
  return (await db.query<{ balance: string }>(`
    select l.quantidade_entrada
      - coalesce((select sum(quantity) from public.stock_movements
          where lote_id = l.id and type = 'saida'
            and reference_type is distinct from 'lote_correcao'), 0)
      - coalesce((select sum(quantity_used) from public.production_batch_inputs where lote_id = l.id), 0) as balance
    from public.lotes l where id = $1
  `, [LOT])).rows[0].balance;
}

beforeAll(async () => {
  db = new PGlite();
  // Schema mínimo das dependências já existentes. As funções testadas são
  // carregadas diretamente das migrations de produção, sem reimplementação.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.business_units (id uuid primary key, active boolean default true, table_count integer);
    create table public.user_roles (id uuid default gen_random_uuid(), user_id uuid, role text, business_unit_id uuid);
    create table public.dining_tables (
      id uuid default gen_random_uuid() primary key,
      business_unit_id uuid not null references public.business_units(id),
      number integer not null check (number > 0),
      area_id uuid, seats integer default 4, group_id uuid, archived_at timestamptz,
      created_at timestamptz default now(), unique(business_unit_id, number)
    );
    create table public.raw_materials (id uuid primary key, business_unit_id uuid, average_cost numeric, updated_at timestamptz);
    create table public.lotes (
      id uuid primary key, raw_material_id uuid, business_unit_id uuid,
      origem text, numero_lote text, quantidade_entrada numeric check (quantidade_entrada > 0),
      unidade_compra text, quantidade_compra numeric, fator_conversao numeric,
      custo_total numeric, preco_unitario numeric, fornecedor_id uuid, validade date,
      caixas numeric, conteudo_por_caixa numeric, cancelado_em timestamptz
    );
    create table public.stock_movements (
      id uuid primary key default gen_random_uuid(), raw_material_id uuid, business_unit_id uuid,
      lote_id uuid, type text, quantity numeric, reason text, created_by uuid,
      created_at timestamptz default now(), reference_id uuid, reference_type text
    );
    create table public.production_batch_inputs (lote_id uuid, quantity_used numeric);
  `);
  await db.exec(historicalLotMigration);
  await db.exec(migration);
}, 30000);

beforeEach(async () => {
  await db.exec("reset role; truncate public.production_batch_inputs, public.stock_movements, public.lotes, public.raw_materials, public.dining_tables, public.user_roles, public.business_units cascade;");
  await db.query("insert into public.business_units (id) values ($1), ($2)", [UNIT_A, UNIT_B]);
  await db.query("insert into public.user_roles (user_id, role, business_unit_id) values ($1, 'admin', $2), ($3, 'admin', $4), ($5, 'attendant', $2)", [ADMIN_A, UNIT_A, ADMIN_B, UNIT_B, ATTENDANT]);
  await db.query("insert into public.raw_materials values ($1, $2, 2, now())", [MATERIAL, UNIT_A]);
  await db.query("insert into public.lotes (id, raw_material_id, business_unit_id, origem, numero_lote, quantidade_entrada, preco_unitario) values ($1, $2, $3, 'compra', 'L-1', 10, 2)", [LOT, MATERIAL, UNIT_A]);
  await db.query("insert into public.stock_movements (raw_material_id, business_unit_id, lote_id, type, quantity, reason) values ($1, $2, $3, 'entrada', 10, 'compra')", [MATERIAL, UNIT_A, LOT]);
  await caller(ADMIN_A);
});

afterAll(async () => { await db?.close(); });

describe("purchase lot migration", () => {
  it("reduces 10 to 8 without counting the correction as consumption", async () => {
    await edit(8);
    expect(Number(await lotBalance())).toBe(8);
    const movements = await db.query<{ quantity: string; reference_type: string }>("select quantity, reference_type from public.stock_movements where type = 'saida'");
    expect(Number(movements.rows[0].quantity)).toBe(2);
    expect(movements.rows[0].reference_type).toBe("lote_correcao");
    // Uma nova correção continua permitida, pois não houve consumo real.
    await edit(7);
    expect(Number(await lotBalance())).toBe(7);
    await db.query("select public.manage_purchase_lot($1, 'cancel')", [LOT]);
    expect((await db.query<{ cancelado_em: Date | null }>("select cancelado_em from public.lotes where id = $1", [LOT])).rows[0].cancelado_em).not.toBeNull();
  });

  it("counts ordinary stock output including a null reference_type", async () => {
    await db.query("insert into public.stock_movements (lote_id, type, quantity, reason) values ($1, 'saida', 3, 'consumo')", [LOT]);
    expect(Number(await lotBalance())).toBe(7);
    await expect(edit(8)).rejects.toThrow("quantidade não pode ser alterada");
    await expect(db.query("select public.manage_purchase_lot($1, 'cancel')", [LOT])).rejects.toThrow("Lote consumido");
  });

  it("protects lots consumed in production", async () => {
    await db.query("insert into public.production_batch_inputs values ($1, 3)", [LOT]);
    await expect(edit(8)).rejects.toThrow("quantidade não pode ser alterada");
    await expect(db.query("select public.manage_purchase_lot($1, 'cancel')", [LOT])).rejects.toThrow("Lote consumido");
  });

  it("rejects mutations by an admin from another unit", async () => {
    await caller(ADMIN_B);
    await expect(edit(8)).rejects.toThrow("Sem permissão");
    expect(Number(await lotBalance())).toBe(10);
  });
});

describe("create_dining_table migration", () => {
  it("allocates numbers without reusing archived tables and updates table_count", async () => {
    await db.query("insert into public.dining_tables (business_unit_id, number, archived_at) values ($1, 1, now())", [UNIT_A]);
    await db.query("select public.create_dining_table($1)", [UNIT_A]);
    await db.query("select public.create_dining_table($1)", [UNIT_A]);
    const tables = await db.query<{ number: number }>("select number from public.dining_tables where business_unit_id = $1 order by number", [UNIT_A]);
    expect(tables.rows.map(row => row.number)).toEqual([1, 2, 3]);
    expect((await db.query<{ table_count: number }>("select table_count from public.business_units where id = $1", [UNIT_A])).rows[0].table_count).toBe(3);
    await caller(ADMIN_B);
    await db.query("select public.create_dining_table($1)", [UNIT_B]);
    expect((await db.query<{ number: number }>("select number from public.dining_tables where business_unit_id = $1", [UNIT_B])).rows[0].number).toBe(1);
  });

  it("rejects an attendant, another unit's admin and an unauthenticated caller", async () => {
    for (const id of [ATTENDANT, ADMIN_B, null]) {
      await caller(id);
      await expect(db.query("select public.create_dining_table($1)", [UNIT_A])).rejects.toThrow("Sem permissão");
    }
  });

  it("rejects inactive units", async () => {
    await db.query("update public.business_units set active = false where id = $1", [UNIT_A]);
    await expect(db.query("select public.create_dining_table($1)", [UNIT_A])).rejects.toThrow("Unidade inválida ou inativa");
  });

  it("does not grant anonymous API access", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select public.create_dining_table($1)", [UNIT_A])).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("legacy user unit assignments", () => {
  it("backfills null roles only when there is one active unit", async () => {
    await db.query("update public.user_roles set business_unit_id = null where user_id = $1", [ATTENDANT]);
    await db.query("update public.business_units set active = false where id = $1", [UNIT_B]);
    await db.exec(migration);
    expect((await db.query<{ business_unit_id: string | null }>("select business_unit_id from public.user_roles where user_id = $1", [ATTENDANT])).rows[0].business_unit_id).toBe(UNIT_A);
  });

  it("does not guess a unit when several units are active", async () => {
    await db.query("update public.user_roles set business_unit_id = null where user_id = $1", [ATTENDANT]);
    await db.exec(migration);
    expect((await db.query<{ business_unit_id: string | null }>("select business_unit_id from public.user_roles where user_id = $1", [ATTENDANT])).rows[0].business_unit_id).toBeNull();
  });
});
