// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,beforeEach,afterAll,describe,it,expect} from "vitest";
const UNIT="00000000-0000-0000-0000-000000000001",TABLE_3="00000000-0000-0000-0000-0000000000a3",TABLE_5="00000000-0000-0000-0000-0000000000a5";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`
    create role anon;create role authenticated;
    create schema app_private;
    -- Papel de admin simulado por uma variável de sessão: 'on' = admin da unidade.
    create function app_private.has_unit_role(p_unit uuid,p_roles text[]) returns boolean language sql stable as $$select coalesce(current_setting('test.admin',true),'')='on'$$;
    create table public.business_units(id uuid primary key,table_count integer default 0);
    create table public.dining_tables(id uuid primary key,business_unit_id uuid,number integer,archived_at timestamptz);
    create table public.sessions(id uuid primary key default gen_random_uuid(),business_unit_id uuid,table_number integer,status text default 'active');
    create table public.table_qr_codes(token uuid primary key default gen_random_uuid(),business_unit_id uuid,table_number integer,active boolean default true);
  `);
  for(const f of ["20261022030000_table_qr_and_delete_fix","20261022160000_delete_dining_table_grants"])
    await db.exec(readFileSync(`supabase/migrations/${f}.sql`,"utf8"));
},30000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
  await db.exec("reset role;set test.admin='';truncate public.sessions,public.table_qr_codes,public.dining_tables,public.business_units;");
  await db.query("insert into business_units values($1,5)",[UNIT]);
  await db.query("insert into dining_tables(id,business_unit_id,number) values($1,$2,3),($3,$2,5)",[TABLE_3,UNIT,TABLE_5]);
  await db.query("insert into table_qr_codes(business_unit_id,table_number) values($1,3)",[UNIT]);
});
const del=async(id:string)=>db.query("select public.delete_dining_table($1)",[id]);

describe("delete_dining_table: quem pode executar",()=>{
  it("visitante anônimo não consegue executar a função",async()=>{
    await db.exec("set role anon");
    await expect(del(TABLE_3)).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    expect((await db.query("select 1 from dining_tables where id=$1",[TABLE_3])).rows).toHaveLength(1);
  });
  it("usuário autenticado que não é admin da unidade é recusado pela própria função",async()=>{
    await db.exec("set role authenticated");
    await expect(del(TABLE_3)).rejects.toThrow("Sem permissão para apagar mesa nesta unidade");
    await db.exec("reset role");
    expect((await db.query("select 1 from dining_tables where id=$1",[TABLE_3])).rows).toHaveLength(1);
  });
  it("admin da unidade apaga a mesa, desativa o QR e recalcula table_count",async()=>{
    await db.exec("set test.admin='on';set role authenticated");
    await del(TABLE_3);
    await db.exec("reset role");
    expect((await db.query("select 1 from dining_tables where id=$1",[TABLE_3])).rows).toHaveLength(0);
    expect((await db.query<{active:boolean}>("select active from table_qr_codes where table_number=3")).rows).toEqual([{active:false}]);
    expect((await db.query<{table_count:number}>("select table_count from business_units")).rows[0].table_count).toBe(5);
  });
  it("mesa com conta aberta não é apagada nem mesmo pelo admin",async()=>{
    await db.query("insert into sessions(business_unit_id,table_number) values($1,3)",[UNIT]);
    await db.exec("set test.admin='on';set role authenticated");
    await expect(del(TABLE_3)).rejects.toThrow(/tem conta aberta/);
    await db.exec("reset role");
    expect((await db.query("select 1 from dining_tables where id=$1",[TABLE_3])).rows).toHaveLength(1);
  });
});
