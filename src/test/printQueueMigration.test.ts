// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261013030000_print_queue.sql", "utf8");
const kdsMigration = readFileSync("supabase/migrations/20261013020000_unit_kds_toggle.sql", "utf8");
const guard = readFileSync("supabase/migrations/20261013040000_unit_module_guard.sql", "utf8");
const UNIT_A = "00000000-0000-0000-0000-000000000001";
const UNIT_B = "00000000-0000-0000-0000-000000000002";
const KITCHEN_A = "00000000-0000-0000-0000-000000000011";
const KITCHEN_A2 = "00000000-0000-0000-0000-000000000012";
const ADMIN_B = "00000000-0000-0000-0000-000000000013";
const ADMIN_A = "00000000-0000-0000-0000-000000000014";
let db: PGlite;

async function as(id: string | null) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
}
async function order(unit = UNIT_A, items = 2) {
  const id = (await db.query<{ id: string }>("insert into public.orders (business_unit_id) values ($1) returning id", [unit])).rows[0].id;
  // Um insert com vários itens (tela da mesa) e inserts separados (RPC) devem gerar uma única tarefa.
  for (let i = 0; i < items; i++) await db.query("insert into public.order_items (order_id, name) values ($1, 'X')", [id]);
  return id;
}
async function jobs(unit = UNIT_A) {
  return (await db.query<{ id: string; status: string; order_id: string }>("select id, status, order_id from public.print_jobs where business_unit_id = $1", [unit])).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.business_units (id uuid primary key, active boolean not null default true);
    create table public.user_roles (user_id uuid, role text, business_unit_id uuid);
    create function app_private.has_unit_role(p_unit uuid, p_roles text[]) returns boolean language sql stable as $$
      select auth.uid() is not null and exists (select 1 from public.user_roles ur join public.business_units bu on bu.id = ur.business_unit_id
        where ur.user_id = auth.uid() and ur.business_unit_id = p_unit and ur.role = any(p_roles) and bu.active) $$;
    create table public.orders (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null);
    create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), name text);
  `);
  await db.exec(kdsMigration);
  await db.exec(migration);
  await db.exec(guard);
}, 30000);

beforeEach(async () => {
  await db.exec("truncate public.print_jobs, public.order_items, public.orders, public.user_roles, public.business_units cascade");
  await db.query("insert into public.business_units (id) values ($1), ($2)", [UNIT_A, UNIT_B]);
  await db.query("insert into public.user_roles values ($1,'kitchen',$2), ($3,'kitchen',$2), ($4,'admin',$5), ($6,'admin',$2)", [KITCHEN_A, UNIT_A, KITCHEN_A2, ADMIN_B, UNIT_B, ADMIN_A]);
  await as(null);
  await db.query("update public.business_units set print_mode = 'station' where id = $1", [UNIT_A]);
  await as(KITCHEN_A);
});

afterAll(async () => { await db?.close(); });

describe("unit modules guard", () => {
  it("blocks direct updates of module columns by a logged user but allows the unit-admin functions", async () => {
    await as(ADMIN_A);
    await expect(db.query("update public.business_units set kds_enabled = false where id = $1", [UNIT_A])).rejects.toThrow("Configurações");
    await expect(db.query("update public.business_units set print_mode = 'device' where id = $1", [UNIT_A])).rejects.toThrow("Configurações");
    await db.query("select public.set_unit_kds($1, false)", [UNIT_A]);
    const row = (await db.query<{ kds_enabled: boolean }>("select kds_enabled from public.business_units where id = $1", [UNIT_A])).rows[0];
    expect(row.kds_enabled).toBe(false);
    // Outras colunas continuam editáveis pela policy existente.
    await db.query("update public.business_units set active = true where id = $1", [UNIT_A]);
  });
});

describe("print queue", () => {
  it("creates exactly one job per order in station mode, whatever the number of item inserts", async () => {
    await order(UNIT_A, 3);
    const rows = await jobs();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("does nothing for units still printing on the device (default)", async () => {
    await order(UNIT_B, 2);
    expect(await jobs(UNIT_B)).toHaveLength(0);
  });

  it("lets only one station claim a job and records the result", async () => {
    await order();
    const [job] = await jobs();
    expect((await db.query<{ ok: boolean }>("select public.claim_print_job($1) as ok", [job.id])).rows[0].ok).toBe(true);
    await as(KITCHEN_A2);
    expect((await db.query<{ ok: boolean }>("select public.claim_print_job($1) as ok", [job.id])).rows[0].ok).toBe(false);
    await expect(db.query("select public.finish_print_job($1, true)", [job.id])).rejects.toThrow("não está com esta estação");
    await as(KITCHEN_A);
    await db.query("select public.finish_print_job($1, true)", [job.id]);
    expect((await jobs())[0].status).toBe("printed");
  });

  it("allows a reprint and retries a failed job", async () => {
    await order();
    const [job] = await jobs();
    await db.query("select public.claim_print_job($1)", [job.id]);
    await db.query("select public.finish_print_job($1, false, 'Sem papel')", [job.id]);
    expect((await jobs())[0].status).toBe("failed");
    expect((await db.query<{ ok: boolean }>("select public.claim_print_job($1) as ok", [job.id])).rows[0].ok).toBe(true);
    await db.query("select public.finish_print_job($1, true)", [job.id]);
    await db.query("select public.requeue_print_job($1)", [job.id]);
    expect((await jobs())[0].status).toBe("pending");
  });

  it("refuses staff from another unit and anonymous callers", async () => {
    await order();
    const [job] = await jobs();
    await as(ADMIN_B);
    await expect(db.query("select public.claim_print_job($1)", [job.id])).rejects.toThrow("Sem permissão");
    await expect(db.query("select public.requeue_print_job($1)", [job.id])).rejects.toThrow("Sem permissão");
    await as(null);
    await expect(db.query("select public.claim_print_job($1)", [job.id])).rejects.toThrow("Sem permissão");
  });

  it("only a unit admin switches the print mode", async () => {
    await expect(db.query("select public.set_unit_print_mode($1, 'device')", [UNIT_A])).rejects.toThrow("Sem permissão");
    await as(ADMIN_B);
    await expect(db.query("select public.set_unit_print_mode($1, 'device')", [UNIT_A])).rejects.toThrow("Sem permissão");
    await as(ADMIN_A);
    await expect(db.query("select public.set_unit_print_mode($1, 'printer')", [UNIT_A])).rejects.toThrow("inválido");
    await db.query("select public.set_unit_print_mode($1, 'device')", [UNIT_A]);
    await order();
    expect(await jobs()).toHaveLength(0);
  });
});
