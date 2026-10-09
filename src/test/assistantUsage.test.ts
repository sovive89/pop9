// @vitest-environment node
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
let db:PGlite;
const UNIT='00000000-0000-0000-0000-000000000001',OTHER='00000000-0000-0000-0000-000000000002',ADMIN='00000000-0000-0000-0000-000000000011';
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;create table business_units(id uuid primary key);create table user_roles(user_id uuid,role text,business_unit_id uuid);create schema ops_private;grant usage on schema ops_private to authenticated;create function ops_private.staff(p_unit uuid,p_roles text[]) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.user_roles where user_id=auth.uid() and business_unit_id=p_unit and role=any(p_roles))$$;`);await db.exec(readFileSync('supabase/migrations/20261009163710_admin_assistant_usage.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261009164438_harden_assistant_table_grants.sql','utf8'));await db.query<Record<string,unknown>>('insert into business_units values($1),($2)',[UNIT,OTHER]);await db.query<Record<string,unknown>>('insert into auth.users values($1)',[ADMIN]);await db.query<Record<string,unknown>>("insert into user_roles values($1,'admin',$2)",[ADMIN,UNIT]);},30000);
afterAll(async()=>{await db.close();});
describe('assistant usage authorization and budget',()=>{
 it('allows only the service endpoint to reserve calls and limits each unit independently',async()=>{
  await db.query<Record<string,unknown>>('select set_config(\'test.user\',$1,false)',[ADMIN]);await db.exec('set role authenticated');await expect(db.query('select reserve_assistant_request($1,$2,$3,\'chat\',\'google/model\')',[crypto.randomUUID(),UNIT,ADMIN])).rejects.toThrow(/permission denied/);await db.exec('reset role;set role service_role');
  await expect(db.query('select reserve_assistant_request($1,$2,$3,\'chat\',\'google/model\')',[crypto.randomUUID(),OTHER,ADMIN])).rejects.toThrow('Não autorizado');
  for(let i=0;i<30;i++)await db.query('select reserve_assistant_request($1,$2,$3,\'chat\',\'google/model\')',[crypto.randomUUID(),UNIT,ADMIN]);
  await expect(db.query('select reserve_assistant_request($1,$2,$3,\'chat\',\'google/model\')',[crypto.randomUUID(),UNIT,ADMIN])).rejects.toThrow('Limite de IA');await db.exec('reset role');
 });
 it('keeps the usage audit private to admins of its unit and stores no conversation or secret fields',async()=>{
  await db.exec('set role anon');await expect(db.query('select * from ai_assistant_usage')).rejects.toThrow(/permission denied/);await db.exec('reset role');await db.query<Record<string,unknown>>('select set_config(\'test.user\',$1,false)',[ADMIN]);await db.exec('set role authenticated');expect((await db.query('select * from ai_assistant_usage')).rows).toHaveLength(30);await db.exec('reset role');await db.query<Record<string,unknown>>('update user_roles set business_unit_id=$1',[OTHER]);await db.exec('set role authenticated');expect((await db.query('select * from ai_assistant_usage')).rows).toHaveLength(0);await db.exec('reset role');const names=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name='ai_assistant_usage'")).rows.map(r=>r.column_name);expect(names).not.toContain('content');expect(names).not.toContain('encrypted_key');
 });
});
