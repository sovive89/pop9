// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stockDatabase } from './helpers/stockDatabase';

const U = '00000000-0000-0000-0000-000000000001', V = '00000000-0000-0000-0000-000000000002';
const ADMIN = '00000000-0000-0000-0000-000000000011', ONLY_U = '00000000-0000-0000-0000-000000000012';
const CARNE = '00000000-0000-0000-0000-000000000021', SAL = '00000000-0000-0000-0000-000000000022';
let db: PGlite;

const n = async (sql: string) => Number(Object.values((await db.query<Record<string, string>>(sql)).rows[0])[0]);
const as = (id: string) => db.query("select set_config('test.user',$1,false)", [id]);
const exportItem = async (targets: string[], unit = U) =>
  (await db.query<{ r: { unit_id: string; ok: boolean; item_id?: string; error?: string }[] }>(
    'select public.export_menu_item_to_units($1,$2,$3::uuid[]) as r', [unit, 'burger', `{${targets.join(',')}}`])).rows[0].r;

beforeAll(async () => {
  db = await stockDatabase();
  // Replica o schema real de categorias (chave global + FK) e aplica as migrations novas.
  await db.exec(`alter table menu_categories add column destination text default 'kitchen', add column sort_order integer default 0,
    add column icon_name text, add column icon_color text;
    alter table menu_categories add unique(key);
    alter table menu_items add constraint menu_items_category_fkey foreign key (category) references menu_categories(key)`);
  await db.exec(readFileSync('supabase/migrations/20261017115900_menu_categories_key_per_unit.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261017120000_export_menu_item_to_units.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec('truncate technical_documents, stock_movements, lotes, production_batch_inputs, production_batches, production_recipe_inputs, production_recipes, recipe_items, menu_item_ingredients, menu_item_variants, menu_items, menu_categories, raw_materials, user_roles cascade');
  await as(ADMIN);
  await db.query("insert into user_roles values($1,'admin',$2),($1,'admin',$3),($4,'admin',$2)", [ADMIN, U, V, ONLY_U]);
  await db.query("insert into menu_categories(business_unit_id,key,label,destination,icon_name) values($1,'burgers','Hambúrgueres','kitchen','Beef')", [U]);
  await db.query("insert into raw_materials(id,business_unit_id,name,unit,tipo) values($1,$2,'Carne','g','insumo'),($3,$2,'Sal','g','insumo')", [CARNE, U, SAL]);
  // Estoque real na origem: lote e saldo que NÃO podem ser copiados.
  await db.query("insert into lotes(business_unit_id,raw_material_id,quantidade_entrada) values($1,$2,500)", [U, CARNE]);
  await db.query('update raw_materials set current_stock=500 where id=$1', [CARNE]);
  const item = { name: 'Burger', price: 29, category: 'burgers', description: 'x', image_url: null, status: 'published', active: true,
    ingredients: [{ name: 'Cebola', removable: true, extra_price: 0 }], variants: [{ name: 'Duplo' }],
    recipe: [
      { rawMaterialId: CARNE, newName: '', newUnit: '', quantity: 200, preparation: null },
      { rawMaterialId: '', newName: 'Molho', newUnit: 'g', quantity: 30, preparation: { outputQuantity: 1000, inputs: [{ rawMaterialId: SAL, newName: '', newUnit: '', quantity: 20 }] } },
    ] };
  await db.query('select public.save_menu_item_with_recipe($1,$2,$3::jsonb)', [U, 'burger', JSON.stringify(item)]);
});

describe('export_menu_item_to_units', () => {
  it('copia categoria, item e ficha com id próprio, e insumos teóricos sem lotes', async () => {
    const [res] = await exportItem([V]);
    expect(res.ok).toBe(true);
    expect(res.item_id).not.toBe('burger');
    expect(await n(`select count(*) from menu_categories where business_unit_id='${V}' and key='burgers' and icon_name='Beef'`)).toBe(1);
    expect(await n(`select count(*) from menu_items where id='${res.item_id}' and business_unit_id='${V}' and category='burgers'`)).toBe(1);
    expect(await n(`select count(*) from recipe_items where menu_item_id='${res.item_id}'`)).toBe(2);
    expect(await n(`select count(*) from menu_item_ingredients where menu_item_id='${res.item_id}'`)).toBe(1);
    expect(await n(`select count(*) from menu_item_variants where menu_item_id='${res.item_id}'`)).toBe(1);
    // Insumos da unidade V: todos teóricos, saldo zero, sem lotes nem movimentações.
    expect(await n(`select count(*) from raw_materials where business_unit_id='${V}' and name in ('Carne','Sal','Molho')`)).toBe(3);
    expect(await n(`select count(*) from raw_materials where business_unit_id='${V}' and name in ('Carne','Sal','Molho') and not is_theoretical`)).toBe(0);
    expect(await n(`select coalesce(sum(current_stock),0) from raw_materials where business_unit_id='${V}'`)).toBe(0);
    expect(await n(`select count(*) from lotes where business_unit_id='${V}'`)).toBe(0);
    expect(await n(`select count(*) from stock_movements where business_unit_id='${V}'`)).toBe(0);
    expect(await n(`select count(*) from production_batches where business_unit_id='${V}'`)).toBe(0);
    // Receita de produção foi copiada (para a unidade produzir pelo próprio estoque).
    expect(await n(`select count(*) from production_recipes where business_unit_id='${V}'`)).toBe(1);
    // Origem intacta.
    expect(await n(`select current_stock from raw_materials where id='${CARNE}'`)).toBe(500);
    expect(await n(`select count(*) from lotes where business_unit_id='${U}'`)).toBe(1);
  });

  it('reexportar atualiza a cópia em vez de duplicar', async () => {
    await exportItem([V]);
    await exportItem([V]);
    expect(await n(`select count(*) from menu_items where business_unit_id='${V}'`)).toBe(1);
    expect(await n(`select count(*) from menu_categories where business_unit_id='${V}'`)).toBe(1);
    expect(await n(`select count(*) from raw_materials where business_unit_id='${V}' and name='Carne'`)).toBe(1);
  });

  it('recusa unidade de destino em que o usuário não é admin, sem criar nada', async () => {
    await as(ONLY_U);
    const [res] = await exportItem([V]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Sem permissão na unidade de destino');
    expect(await n(`select count(*) from menu_items where business_unit_id='${V}'`)).toBe(0);
    expect(await n(`select count(*) from menu_categories where business_unit_id='${V}'`)).toBe(0);
  });

  it('exige admin na unidade de origem', async () => {
    await as('00000000-0000-0000-0000-000000000099');
    await expect(exportItem([V])).rejects.toThrow('Sem permissão na unidade de origem');
  });
});
