import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
export async function stockDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create schema ops_private;create table business_units(id uuid primary key,active boolean not null default true);
    insert into business_units values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');create table user_roles(user_id uuid,role text,business_unit_id uuid);
    create function ops_private.staff(p_unit uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.user_roles where user_id=auth.uid() and business_unit_id=p_unit and role=any(p_roles))$$;
    create type item_tipo as enum('insumo','semiacabado','produto_acabado','revenda');
    create table menu_categories(id uuid primary key default gen_random_uuid(),business_unit_id uuid,key text,label text);
    create table menu_items(id text primary key default gen_random_uuid()::text,business_unit_id uuid,name text,price numeric,category text,
      description text,image_url text,active boolean default true,status text default 'draft',sort_order integer default 0,updated_at timestamptz default now());
    create table menu_item_ingredients(id uuid primary key default gen_random_uuid(),menu_item_id text references menu_items(id),name text,removable boolean,extra_price numeric,sort_order integer);
    create table menu_item_variants(id uuid primary key default gen_random_uuid(),menu_item_id text references menu_items(id),name text,sort_order integer);
    create table orders(id uuid primary key,business_unit_id uuid,status text);
    create table order_items(id uuid primary key,order_id uuid references orders(id),menu_item_id text references menu_items(id),quantity integer);
  `);
  await db.exec(readFileSync('supabase/migrations/20260828040000_baseline_estoque.sql','utf8'));
  await db.exec(`alter table raw_materials add business_unit_id uuid,add tipo item_tipo default 'insumo',add categoria text;
    alter table suppliers add business_unit_id uuid;
    alter table production_recipes add business_unit_id uuid,add tipo text default 'producao',add perda_esperada numeric,add tempo_producao integer;
    alter table production_batches add business_unit_id uuid;
    alter table stock_movements add business_unit_id uuid,add constraint stock_quantity_positive check(quantity>0),
      add constraint stock_movements_reason_check check(reason in('compra','producao_consumo','producao_output','venda','estorno_cancelamento','ajuste','perda'));
    create table lotes(id uuid primary key default gen_random_uuid(),business_unit_id uuid,raw_material_id uuid references raw_materials(id),numero_lote text,origem text,
      quantidade_entrada numeric check(quantidade_entrada>0),validade date,data_entrada timestamptz default now(),created_at timestamptz default now(),fornecedor_id uuid references suppliers(id),
      preco_unitario numeric,receita_id uuid references production_recipes(id),batch_id uuid references production_batches(id),unidade_compra text,quantidade_compra numeric,
      fator_conversao numeric,custo_total numeric,caixas numeric,conteudo_por_caixa numeric,cancelado_em timestamptz);
    alter table stock_movements add lote_id uuid references lotes(id);
    alter table production_batch_inputs add lote_id uuid references lotes(id);
    create function sync_tipo() returns trigger language plpgsql as $$begin new.is_produced:=new.tipo in('semiacabado','produto_acabado');return new;end$$;
    create trigger sync_tipo before insert or update on raw_materials for each row execute function sync_tipo();
    create view low_stock_alerts as select * from raw_materials where current_stock<min_stock;
    create view production_labels as select pb.id batch_id,pb.batch_code,rm.name product_name,rm.unit,pb.quantity_produced,pb.produced_at,pb.expires_at,
      'valido'::text status_validade from production_batches pb join production_recipes pr on pr.id=pb.recipe_id join raw_materials rm on rm.id=pr.output_raw_material_id;
  `);
  await db.exec(readFileSync('supabase/migrations/20261013020048_mvp_stock_cancellation_and_view.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261013145327_menu_recipe_stock_lot_consistency.sql','utf8'));
  // main contains this older implementation with a future filename timestamp.
  // Replaying it must preserve the new tracked production behavior.
  await db.exec(readFileSync('supabase/migrations/20261013180000_fix_production_stock_movements_business_unit.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261013230958_produced_yield_and_material_units.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261017130000_transfer_partial_stock_lot.sql','utf8'));
  // Reproduz o grant padrão encontrado no projeto antes do ajuste de privilégios.
  await db.exec('grant select on public.stock_transfers to anon');
  await db.exec(readFileSync('supabase/migrations/20261017170000_stock_transfer_movement_reason.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261017171000_stock_transfer_api_privileges.sql','utf8'));
  await db.exec('create trigger cancel_stock after update on orders for each row execute function order_cancel_reverts_stock()');
  return db;
}
