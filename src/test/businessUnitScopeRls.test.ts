// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const BUSINESS_A = "00000000-0000-0000-0000-000000000001";
const BUSINESS_B = "00000000-0000-0000-0000-000000000002";
const UNIT_A = "10000000-0000-0000-0000-000000000001";
const UNIT_B = "10000000-0000-0000-0000-000000000002";
const NEW_UNIT = "10000000-0000-0000-0000-000000000003";
const ADMIN_A = "20000000-0000-0000-0000-000000000001";
const ADMIN_B = "20000000-0000-0000-0000-000000000002";
const ATTENDANT_A = "20000000-0000-0000-0000-000000000003";
const CASHIER_A = "20000000-0000-0000-0000-000000000004";

const asUser = async (userId: string) => {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
};
const asOwner = async () => db.exec("reset role");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema app_private;
    create type public.app_role as enum ('admin','attendant','kitchen','cashier');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create table public.businesses (id uuid primary key, name text not null);
    create table public.business_units (
      id uuid primary key, business_id uuid not null references public.businesses(id),
      name text not null, active boolean not null default true
    );
    create table public.user_roles (
      id uuid primary key default gen_random_uuid(), user_id uuid not null,
      role public.app_role not null, business_unit_id uuid references public.business_units(id),
      unique (user_id, role, business_unit_id)
    );
    create table public.table_areas (id uuid primary key, business_unit_id uuid not null references public.business_units(id), name text not null);
    create table public.dining_tables (
      id uuid primary key default gen_random_uuid(), business_unit_id uuid not null references public.business_units(id),
      number integer not null, area_id uuid
    );
    create function app_private.has_unit_role(p_unit uuid, p_roles text[]) returns boolean
      language sql stable security definer set search_path = '' as $$
        select auth.uid() is not null and exists (
          select 1 from public.user_roles ur
          join public.business_units bu on bu.id = ur.business_unit_id
          where ur.user_id = auth.uid() and ur.business_unit_id = p_unit
            and ur.role::text = any(p_roles) and bu.active
        )
      $$;
    grant usage on schema public, auth, app_private to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant execute on function auth.role() to authenticated;
    grant execute on function app_private.has_unit_role(uuid,text[]) to authenticated;
    grant select, insert, update, delete on public.businesses, public.business_units, public.table_areas, public.dining_tables to authenticated;

    alter table public.businesses enable row level security;
    alter table public.business_units enable row level security;
    alter table public.table_areas enable row level security;
    alter table public.dining_tables enable row level security;

    -- Reproduce the legacy global-role policies that allowed cross-unit reads.
    create policy "Admin manages businesses" on public.businesses for all to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
    create policy "Staff can read businesses" on public.businesses for select to authenticated
      using (auth.uid() is not null);
    create policy "Admin manages business_units" on public.business_units for all to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
    create policy "Staff can read business_units" on public.business_units for select to authenticated
      using (auth.uid() is not null);
    create policy "Admin manages table_areas" on public.table_areas for all to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
    create policy "Staff can read table_areas" on public.table_areas for select to authenticated
      using (auth.uid() is not null);
    create policy "Admin manages dining_tables" on public.dining_tables for all to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
    create policy "Staff can read dining_tables" on public.dining_tables for select to authenticated
      using (auth.uid() is not null);
    create policy "Attendants insert unassigned tables" on public.dining_tables for insert to authenticated
      with check (exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='attendant') and area_id is null);
    create function public.create_dining_table(p_business_unit_id uuid) returns public.dining_tables
      language plpgsql security definer set search_path=public as $$
      declare v_table public.dining_tables%rowtype;
      begin
        if not exists (select 1 from public.user_roles ur where ur.user_id=auth.uid()
          and ur.role::text='admin' and (ur.business_unit_id=p_business_unit_id or ur.business_unit_id is null)) then
          raise exception 'Sem permissão para criar mesa nesta unidade' using errcode='42501';
        end if;
        insert into public.dining_tables (business_unit_id,number) values(p_business_unit_id,1) returning * into v_table;
        return v_table;
      end $$;
    grant execute on function public.create_dining_table(uuid) to authenticated;

    insert into public.businesses (id,name) values ('${BUSINESS_A}','Empresa A'),('${BUSINESS_B}','Empresa B');
    insert into public.business_units (id,business_id,name) values
      ('${UNIT_A}','${BUSINESS_A}','Unidade A'),('${UNIT_B}','${BUSINESS_B}','Unidade B');
    insert into public.user_roles (user_id,role,business_unit_id) values
      ('${ADMIN_A}','admin','${UNIT_A}'),('${ADMIN_B}','admin','${UNIT_B}'),
      ('${ATTENDANT_A}','attendant','${UNIT_A}'),('${CASHIER_A}','cashier','${UNIT_A}');
    insert into public.table_areas (id,business_unit_id,name) values
      ('30000000-0000-0000-0000-000000000001','${UNIT_A}','Salão A'),
      ('30000000-0000-0000-0000-000000000002','${UNIT_B}','Salão B');
    insert into public.dining_tables (id,business_unit_id,number) values
      ('40000000-0000-0000-0000-000000000001','${UNIT_A}',1),
      ('40000000-0000-0000-0000-000000000002','${UNIT_B}',2);
  `);
  await db.exec(readFileSync("supabase/migrations/20261017150000_scope_unit_metadata_rls.sql", "utf8"));
  // A correção de isolamento de business_units/businesses (issue #103) entra por cima: os testes abaixo
  // passam a provar o estado FINAL das policies, não só o da migration anterior.
  await db.exec(readFileSync("supabase/migrations/20261022040000_fix_business_unit_rls_isolation.sql", "utf8"));
  // ...e a 040000 reabriu a escrita em businesses (contra a decisão da 017150000); esta a fecha de novo.
  await db.exec(readFileSync("supabase/migrations/20261022170000_businesses_read_only_via_client.sql", "utf8"));
}, 30000);

afterAll(async () => { await db?.close(); });

describe("business/unit metadata RLS", () => {
  it("limits business_units, businesses, table_areas and dining_tables to assigned units", async () => {
    await asUser(ADMIN_A);
    const units = await db.query<{ id: string }>("select id from public.business_units order by id");
    const businesses = await db.query<{ id: string }>("select id from public.businesses order by id");
    const areas = await db.query<{ business_unit_id: string }>("select business_unit_id from public.table_areas order by business_unit_id");
    const tables = await db.query<{ business_unit_id: string }>("select business_unit_id from public.dining_tables order by business_unit_id");
    expect(units.rows.map(row => row.id)).toEqual([UNIT_A]);
    expect(businesses.rows.map(row => row.id)).toEqual([BUSINESS_A]);
    expect(areas.rows.map(row => row.business_unit_id)).toEqual([UNIT_A]);
    expect(tables.rows.map(row => row.business_unit_id)).toEqual([UNIT_A]);
    await asOwner();
  });

  it("preserves assigned attendant/cashier reads while denying cross-unit access and non-admin creation", async () => {
    await asUser(ATTENDANT_A);
    const attendantTables = await db.query<{ business_unit_id: string }>("select business_unit_id from public.dining_tables");
    const attendantUnits = await db.query<{ id: string }>("select id from public.business_units order by id");
    expect(attendantTables.rows.map(row => row.business_unit_id)).toEqual([UNIT_A]);
    expect(attendantUnits.rows.map(row => row.id)).toEqual([UNIT_A]);
    await db.query("insert into public.dining_tables (business_unit_id,number,area_id) values ($1,3,null)", [UNIT_A]);
    await expect(db.query("insert into public.dining_tables (business_unit_id,number,area_id) values ($1,4,null)", [UNIT_B])).rejects.toThrow();

    await asUser(CASHIER_A);
    const cashierUnits = await db.query<{ id: string }>("select id from public.business_units order by id");
    const cashierBusinesses = await db.query<{ id: string }>("select id from public.businesses order by id");
    expect(cashierUnits.rows.map(row => row.id)).toEqual([UNIT_A]);
    expect(cashierBusinesses.rows.map(row => row.id)).toEqual([BUSINESS_A]);
    await expect(db.query(
      "insert into public.business_units (id,business_id,name) values ('10000000-0000-0000-0000-000000000005',$1,'Unidade indevida')",
      [BUSINESS_A],
    )).rejects.toThrow();
    await expect(db.query("select * from public.create_dining_table($1)", [UNIT_B])).rejects.toThrow();
    await asOwner();
  });

  it("allows an admin to create only within their existing business and binds them to the new unit", async () => {
    await asUser(ADMIN_A);
    const canCreate = await db.query<{ allowed: boolean }>(
      "select app_private.can_create_unit_in_business($1) as allowed", [BUSINESS_A],
    );
    expect(canCreate.rows[0].allowed).toBe(true);
    await db.query(
      "insert into public.business_units (id,business_id,name) values ($1,$2,'Unidade A2')",
      [NEW_UNIT, BUSINESS_A],
    );
    const inserted = await db.query<{ id: string }>("select id from public.business_units where id=$1", [NEW_UNIT]);
    expect(inserted.rows).toEqual([{ id: NEW_UNIT }]);
    const canAccessNew = await db.query<{ allowed: boolean }>(
      "select app_private.has_unit_role($1, array['admin']) as allowed", [NEW_UNIT],
    );
    expect(canAccessNew.rows[0].allowed).toBe(true);
    await expect(db.query(
      "insert into public.business_units (id,business_id,name) values ('10000000-0000-0000-0000-000000000004',$1,'Unidade B indevida')",
      [BUSINESS_B],
    )).rejects.toThrow();
    await expect(db.query("update public.business_units set business_id=$1 where id=$2", [BUSINESS_B, UNIT_A])).rejects.toThrow();
    await asOwner();
  });

  it("does not allow an admin of A to update or delete unit B", async () => {
    await asUser(ADMIN_A);
    const updated = await db.query(
      "update public.business_units set name='Alterada indevidamente' where id=$1 returning id", [UNIT_B],
    );
    expect(updated.rowCount).toBe(0);
    const deleted = await db.query("delete from public.business_units where id=$1", [UNIT_B]);
    expect(deleted.rowCount).toBe(0);
    await asOwner();
  });

  it("keeps businesses read-only through the client API", async () => {
    await asUser(ADMIN_A);
    await expect(db.query("insert into public.businesses (id,name) values ('50000000-0000-0000-0000-000000000003','Empresa C')")).rejects.toThrow();
    const updated = await db.query("update public.businesses set name='Alterada' where id=$1 returning id", [BUSINESS_A]);
    expect(updated.rowCount).toBe(0);
    await asOwner();
  });
});
