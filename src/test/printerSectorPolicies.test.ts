// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite;
const a = "00000000-0000-0000-0000-000000000001", b = "00000000-0000-0000-0000-000000000002", actor = "00000000-0000-0000-0000-000000000011";
beforeAll(async () => {
  db = new PGlite();await db.exec(`create role authenticated;create schema app_private;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
    create table user_roles(user_id uuid,business_unit_id uuid,role text);insert into user_roles values('${actor}','${a}','admin');
    create function app_private.has_unit_role(u uuid,r text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.user_roles where user_id=auth.uid() and business_unit_id=u and role=any(r))$$;
    create table printer_configs(id uuid primary key default gen_random_uuid(),business_unit_id uuid,name text);
    alter table printer_configs enable row level security;create policy legacy_global on printer_configs to authenticated using(true) with check(true);
    grant usage on schema auth,app_private to authenticated;grant all on printer_configs to authenticated;
    insert into printer_configs(id,business_unit_id,name) values('${a}','${a}','Cozinha A'),('${b}','${b}','Cozinha B');`);
  await db.exec(readFileSync("supabase/migrations/20261013071511_printer_sector_presets.sql", "utf8"));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);await db.exec("set role authenticated");
}, 30000);
afterAll(async () => { await db?.close(); });
describe("printer sector tenant policies", () => {
  it("preserves existing configuration with Geral and hides other units", async () => { const { rows } = await db.query<{ setor: string }>("select setor from printer_configs");expect(rows).toEqual([{ setor: "geral" }]); });
  it("does not let a unit administrator edit, remove or create printers in another unit", async () => {
    expect((await db.query("update printer_configs set name='Changed' where id=$1 returning id", [b])).rows).toEqual([]);
    expect((await db.query("delete from printer_configs where id=$1 returning id", [b])).rows).toEqual([]);
    await expect(db.query("insert into printer_configs(business_unit_id,name) values($1,'Bad')", [b])).rejects.toThrow("row-level security");
    await expect(db.query("update printer_configs set business_unit_id=$1 where id=$2", [b, a])).rejects.toThrow("row-level security");
  });
  it("accepts known sectors in the own unit and rejects invented sectors", async () => {
    expect((await db.query("update printer_configs set setor='cozinha' where id=$1 returning setor", [a])).rows).toEqual([{ setor: "cozinha" }]);
    await expect(db.query("update printer_configs set setor='foo' where id=$1", [a])).rejects.toThrow("check constraint");
  });
});
