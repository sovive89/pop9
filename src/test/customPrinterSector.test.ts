// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
it("accepts registered printer sectors only within the same unit", async () => {
  const db=new PGlite();
  try {
    await db.exec(`create table public.print_sectors(business_unit_id uuid,slug text);create table public.printer_configs(business_unit_id uuid,setor text check(setor in ('cozinha','bar')));
      insert into public.print_sectors values ('00000000-0000-0000-0000-000000000001','confeitaria');`);
    await db.exec(readFileSync("supabase/migrations/20261017020237_custom_printer_sector.sql","utf8"));
    await db.exec("insert into public.printer_configs values ('00000000-0000-0000-0000-000000000001','confeitaria')");
    await expect(db.exec("insert into public.printer_configs values ('00000000-0000-0000-0000-000000000002','confeitaria')")).rejects.toThrow(/Cadastre o setor/);
    await db.exec("insert into public.printer_configs values ('00000000-0000-0000-0000-000000000002','cozinha')");
  } finally {await db.close();}
},30000);
