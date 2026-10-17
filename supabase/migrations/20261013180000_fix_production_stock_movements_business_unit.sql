-- This older fix has a future timestamp in main. Preserve the later atomic
-- implementation when replaying migrations in filename order.
do $stock_guard$ begin
  if to_regprocedure('public.produce_stock_batch(uuid,uuid,jsonb)') is null then
    execute $legacy_stock_ddl$
-- Corrige o crédito e o consumo de produção preservando o escopo por unidade.
create or replace function public.production_batch_credits_stock()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare output_material uuid;
begin
  select output_raw_material_id into output_material
  from public.production_recipes where id = new.recipe_id and business_unit_id = new.business_unit_id;
  if output_material is null then
    raise exception 'Receita de produção sem insumo de saída na unidade operacional';
  end if;
  insert into public.stock_movements
    (raw_material_id, type, quantity, reason, reference_type, reference_id, business_unit_id)
  values (output_material, 'entrada', new.quantity_produced, 'producao_output', 'production_batch', new.id, new.business_unit_id);
  return new;
end;
$$;
create or replace function public.production_batch_input_deducts_stock()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare batch_unit uuid;
begin
  select business_unit_id into batch_unit from public.production_batches where id = new.batch_id;
  if batch_unit is null then
    raise exception 'Lote de produção sem unidade operacional';
  end if;
  if not exists (select 1 from public.raw_materials where id = new.raw_material_id and business_unit_id = batch_unit) then
    raise exception 'Insumo de produção não pertence à unidade operacional';
  end if;
  insert into public.stock_movements
    (raw_material_id, type, quantity, reason, reference_type, reference_id, business_unit_id)
  values (new.raw_material_id, 'saida', new.quantity_used, 'producao_consumo', 'production_batch', new.batch_id, batch_unit);
  return new;
end;
$$;
$legacy_stock_ddl$;
  end if;
end $stock_guard$;
