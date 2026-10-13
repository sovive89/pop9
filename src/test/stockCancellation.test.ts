// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
let db: PGlite;
const unit='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const order='00000000-0000-0000-0000-000000000011',item='00000000-0000-0000-0000-000000000021';
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;
 create table raw_materials(id uuid primary key,current_stock numeric not null,min_stock numeric not null);
 create table orders(id uuid primary key,status text,business_unit_id uuid);
 create table order_items(id uuid primary key,order_id uuid);
 create table recipe_items(quantity numeric);
 create table stock_movements(id uuid primary key default gen_random_uuid(),business_unit_id uuid not null,raw_material_id uuid,type text,quantity numeric,reason text,reference_type text,reference_id uuid,lote_id uuid,batch_info jsonb,unit_cost numeric);
 create function apply_stock() returns trigger language plpgsql set search_path = public as $$ begin update raw_materials set current_stock=current_stock+case when new.type='entrada' then new.quantity else -new.quantity end where id=new.raw_material_id;return new;end;$$;
 create trigger apply_stock after insert on stock_movements for each row execute function apply_stock();
 create view low_stock_alerts as select * from raw_materials where current_stock<min_stock;
 `);await db.exec(readFileSync('supabase/migrations/20261013020048_mvp_stock_cancellation_and_view.sql','utf8'));
 await db.exec('create trigger cancel_stock after update on orders for each row execute function order_cancel_reverts_stock();');
},30000);
beforeEach(async()=>{
 await db.exec('truncate stock_movements,order_items,orders,raw_materials,recipe_items');
 await db.query('insert into raw_materials values($1,100,10)',[item]);
 await db.query("insert into orders values($1,'pending',$2)",[order,unit]);
 await db.query('insert into order_items values($1,$2)',[item,order]);
 await db.exec('insert into recipe_items values(999)');
});
afterAll(async()=>{await db?.close();});
async function debit(quantity=25,tenant=unit,reason='venda'){
 await db.query("insert into stock_movements(business_unit_id,raw_material_id,type,quantity,reason,reference_type,reference_id) values($1,$2,'saida',$3,$4,'order_item',$2)",[tenant,item,quantity,reason]);
}
async function cancel(){await db.query("update orders set status='cancelled' where id=$1",[order]);}
describe('cancellation stock refund',()=>{
 it('restores the actual sale deduction with its unit, not the changed recipe',async()=>{
  await debit();await cancel();const rows=(await db.query<{business_unit_id:string;quantity:string;reason:string}>("select * from stock_movements where type='entrada'")).rows;
  expect(rows).toHaveLength(1);expect(rows[0].business_unit_id).toBe(unit);expect(Number(rows[0].quantity)).toBe(25);
  expect(Number((await db.query<{current_stock:string}>('select current_stock from raw_materials')).rows[0].current_stock)).toBe(100);
 });
 it('does not credit the same debit twice on repeated updates or cancellation',async()=>{
  await debit();await cancel();await cancel();await db.query("update orders set status='pending' where id=$1",[order]);await cancel();
  expect((await db.query("select * from stock_movements where type='entrada'")).rows).toHaveLength(1);
 });
 it('ignores another unit and manual outputs linked to the same item',async()=>{
  await debit(10,other);await debit(5,unit,'consumo');await cancel();
  expect((await db.query("select * from stock_movements where type='entrada'")).rows).toHaveLength(0);
 });
 it('does not invent a refund when there was no stock deduction',async()=>{await cancel();expect((await db.query('select * from stock_movements')).rows).toHaveLength(0);});
});
