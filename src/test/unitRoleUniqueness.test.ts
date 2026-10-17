// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("supports the same role in two units without duplicating a unit assignment", async () => {
  const db=new PGlite();try {
    await db.exec("create table public.user_roles(user_id text,role text,business_unit_id text,constraint user_roles_user_id_role_key unique(user_id,role));insert into user_roles values('ricardo','admin','a');");
    await db.exec(readFileSync("supabase/migrations/20261017021917_unit_role_uniqueness.sql","utf8"));
    await db.exec("insert into user_roles values('ricardo','admin','b')");
    expect((await db.query("select * from user_roles where user_id='ricardo'")).rows).toHaveLength(2);
    await expect(db.exec("insert into user_roles values('ricardo','admin','b')")).rejects.toThrow(/unique/);
  }finally{await db.close();}
},30000);
