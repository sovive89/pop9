// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
let db:PGlite;
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const actor='00000000-0000-0000-0000-000000000011';
const tables=['sessions','orders','payments','menu_items','menu_categories','raw_materials','lotes','stock_movements','production_recipes','production_batches','session_clients'];
const children:{[key:string]:string}={menu_item_ingredients:'menu_item_id',menu_item_variants:'menu_item_id',recipe_items:'menu_item_id',order_items:'order_id',production_recipe_inputs:'recipe_id',production_batch_inputs:'batch_id'};
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role authenticated;create schema auth;create schema app_private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table user_roles(user_id uuid,business_unit_id uuid,role text);
 create function app_private.has_unit_role(p_unit uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_roles where user_id=auth.uid() and business_unit_id=p_unit and role=any(p_roles)) $$;
 grant usage on schema auth,app_private to authenticated;`);
 for(const name of tables)await db.exec(`create table ${name}(id uuid primary key default gen_random_uuid(),business_unit_id uuid not null);`);
 await db.exec('create table customers(id uuid primary key default gen_random_uuid(),name text);alter table customers enable row level security;create policy legacy on customers to authenticated using(true) with check(true);grant all on customers to authenticated;');
 for(const [name,column] of Object.entries(children))await db.exec(`create table ${name}(id uuid primary key default gen_random_uuid(),${column} uuid);`);
 for(const name of [...tables,...Object.keys(children)])await db.exec(`alter table ${name} enable row level security;create policy legacy on ${name} to authenticated using(true) with check(true);grant all on ${name} to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/20261013020403_mvp_core_unit_boundaries.sql','utf8'));
 await db.exec('alter table user_roles enable row level security;create policy legacy_roles on user_roles to authenticated using(true) with check(true);grant all on user_roles to authenticated;create table profiles(user_id uuid primary key);alter table profiles enable row level security;create policy legacy_profiles on profiles to authenticated using(true);grant select on profiles to authenticated;');
 await db.exec(readFileSync('supabase/migrations/20261013023152_mvp_staff_role_boundaries.sql','utf8'));
 await db.query('insert into user_roles values($1,$2,\'admin\'),($1,$3,\'attendant\')',[actor,a,b]);
 for(const name of tables)await db.query(`insert into ${name}(id,business_unit_id) values($1,$1),($2,$2)`,[a,b]);
 for(const [name,column] of Object.entries(children))await db.query(`insert into ${name}(${column}) values($1),($2)`,[a,b]);
},30000);
beforeEach(async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');});
afterAll(async()=>{await db?.close();});
describe('core unit boundaries over permissive legacy policies',()=>{
 it('allows own roles but blocks self-promotion in another unit',async()=>{
  expect((await db.query('select * from user_roles where user_id=$1',[actor])).rows).toHaveLength(2);
  await expect(db.query("insert into user_roles values($1,$2,'admin')",[actor,b])).rejects.toThrow('row-level security');
  expect((await db.query("update user_roles set role='admin' where business_unit_id=$1 returning user_id",[b])).rows).toHaveLength(0);
 });
 it('lets a unit administrator assign roles in their own unit',async()=>{
  expect((await db.query("insert into user_roles values('00000000-0000-0000-0000-000000000022',$1,'cashier') returning user_id",[a])).rows).toHaveLength(1);
 });
 it('hides profiles of staff assigned only to another unit',async()=>{
  await db.exec('reset role');
  await db.query("insert into user_roles values('00000000-0000-0000-0000-000000000033',$1,'kitchen')",[b]);
  await db.query("insert into profiles values($1),('00000000-0000-0000-0000-000000000022'),('00000000-0000-0000-0000-000000000033')",[actor]);
  await db.exec('set role authenticated');expect((await db.query('select * from profiles')).rows).toHaveLength(2);
 });
 it('blocks direct access to the unscoped future customer table',async()=>{await expect(db.query("insert into customers(name) values('Cliente')")).rejects.toThrow('row-level security');expect((await db.query('select * from customers')).rows).toHaveLength(0);});
 it('limits stock/customer reads to units where the actor has the required role',async()=>{
  expect((await db.query('select * from raw_materials')).rows).toHaveLength(2);
  await db.exec('reset role');await db.query('delete from user_roles where business_unit_id=$1',[b]);await db.exec('set role authenticated');
  for(const name of [...tables,...Object.keys(children)])expect((await db.query(`select * from ${name}`)).rows).toHaveLength(1);
  await db.exec('reset role');await db.query('insert into user_roles values($1,$2,\'attendant\')',[actor,b]);
 });
 it('does not turn admin in A into a product writer in B',async()=>{
  await expect(db.query('insert into menu_items(business_unit_id) values($1)',[b])).rejects.toThrow('row-level security');
  expect((await db.query('update menu_items set business_unit_id=$1 where id=$1 returning id',[b])).rows).toHaveLength(0);
  expect((await db.query('insert into menu_items(business_unit_id) values($1) returning id',[a])).rows).toHaveLength(1);
 });
 it('preserves attendant writes in their unit while preventing tenant reassignment',async()=>{
  expect((await db.query('insert into orders(business_unit_id) values($1) returning id',[b])).rows).toHaveLength(1);
  expect((await db.query('insert into session_clients(business_unit_id) values($1) returning id',[b])).rows).toHaveLength(1);
  await expect(db.query('update raw_materials set business_unit_id=$1 where id=$2',[b,a])).rejects.toThrow('row-level security');
 });
 it('bounds child writes through the parent unit',async()=>{
  await expect(db.query('insert into recipe_items(menu_item_id) values($1)',[b])).rejects.toThrow('row-level security');
  expect((await db.query('insert into recipe_items(menu_item_id) values($1) returning id',[a])).rows).toHaveLength(1);
  expect((await db.query('insert into order_items(order_id) values($1) returning id',[b])).rows).toHaveLength(1);
 });
});
