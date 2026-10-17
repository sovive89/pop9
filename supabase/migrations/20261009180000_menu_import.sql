-- Importação de cardápio + fichas técnicas a partir de arquivos (rascunho gerado por IA e
-- revisado pelo admin). Esta migration NÃO cria estoque real: não escreve em lotes nem em
-- stock_movements. Insumos novos nascem como cadastro teórico (current_stock = 0).
--
--  * transação única: ou grava tudo ou nada;
--  * idempotente por p_request (repetir o mesmo envio devolve o resultado salvo);
--  * só admin da unidade (ops_private.staff);
--  * itens já existentes (mesmo nome na mesma unidade) são PULADOS, nunca sobrescritos;
--  * unidade divergente de um insumo existente aborta a importação (evita 500 g virar 500 kg).

create table public.menu_import_requests (
  id uuid primary key,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.menu_import_requests enable row level security;
create policy menu_import_requests_admin_read on public.menu_import_requests
  for select to authenticated using (ops_private.staff(business_unit_id, array['admin']));
revoke all on public.menu_import_requests from public, anon, authenticated;
grant select on public.menu_import_requests to authenticated;
grant all on public.menu_import_requests to service_role;

create or replace function public.apply_menu_import(p_unit uuid, p_request uuid, p_payload jsonb, p_publish boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ops_private, pg_temp
as $$
declare
  v_cat jsonb; v_item jsonb; v_line jsonb; v_ing jsonb; v_base jsonb; v_prep jsonb;
  v_key text; v_name text; v_unit text; v_qty numeric; v_id uuid; v_item_id text; v_recipe uuid;
  v_existing record;
  v_categories_created int := 0; v_items_created int := 0; v_items_skipped jsonb := '[]'::jsonb;
  v_materials_created int := 0; v_recipes_created int := 0; v_lines int := 0;
  v_result jsonb; v_prior jsonb;
  v_sort int;
begin
  if auth.uid() is null or not ops_private.staff(p_unit, array['admin']) then
    raise exception 'Sem permissão para importar o cardápio desta unidade';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(p_payload->'items') is distinct from 'array'
     or jsonb_array_length(p_payload->'items') = 0
     or jsonb_array_length(p_payload->'items') > 150
     or coalesce(jsonb_array_length(p_payload->'categories'), 0) > 30 then
    raise exception 'Rascunho de cardápio inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('menu_import:' || p_unit::text, 7));
  select result into v_prior from public.menu_import_requests where id = p_request;
  if found then
    if (select business_unit_id from public.menu_import_requests where id = p_request) <> p_unit then
      raise exception 'Solicitação já utilizada';
    end if;
    return v_prior || jsonb_build_object('repeated', true);
  end if;

  -- Categorias: usa a existente (mesma chave na unidade) ou cria.
  for v_cat in select * from jsonb_array_elements(coalesce(p_payload->'categories', '[]'::jsonb)) loop
    v_key := nullif(btrim(v_cat->>'key'), '');
    if v_key is null or v_key !~ '^[a-z0-9-]{1,40}$' or nullif(btrim(v_cat->>'label'), '') is null then
      raise exception 'Categoria inválida no rascunho';
    end if;
    if not exists (select 1 from public.menu_categories where business_unit_id = p_unit and key = v_key) then
      select coalesce(max(sort_order), -1) + 1 into v_sort from public.menu_categories where business_unit_id = p_unit;
      insert into public.menu_categories (business_unit_id, key, label, destination, sort_order)
      values (p_unit, v_key, left(btrim(v_cat->>'label'), 60),
              case when v_cat->>'destination' = 'bar' then 'bar' else 'kitchen' end, v_sort);
      v_categories_created := v_categories_created + 1;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_name := left(btrim(coalesce(v_item->>'name', '')), 120);
    v_key := coalesce(v_item->>'category', '');
    if v_name = '' or v_key !~ '^[a-z0-9-]{1,40}$' then raise exception 'Item inválido no rascunho'; end if;
    if not exists (select 1 from public.menu_categories where business_unit_id = p_unit and key = v_key) then
      raise exception 'Categoria "%" não existe para o item "%"', v_key, v_name;
    end if;
    if coalesce((v_item->>'price')::numeric, 0) < 0 or coalesce((v_item->>'price')::numeric, 0) > 100000 then
      raise exception 'Preço inválido em "%"', v_name;
    end if;

    if exists (select 1 from public.menu_items where business_unit_id = p_unit and lower(name) = lower(v_name)) then
      v_items_skipped := v_items_skipped || to_jsonb(v_name);
      continue;
    end if;
    if p_publish and coalesce((v_item->>'price')::numeric, 0) <= 0 then
      raise exception 'Defina o preço de "%" antes de publicar', v_name;
    end if;

    insert into public.menu_items (business_unit_id, name, description, price, category, status, active)
    values (p_unit, v_name, nullif(left(btrim(coalesce(v_item->>'description', '')), 400), ''),
            coalesce((v_item->>'price')::numeric, 0), v_key,
            case when p_publish then 'published' else 'draft' end, true)
    returning id into v_item_id;
    v_items_created := v_items_created + 1;

    for v_ing in select * from jsonb_array_elements(coalesce(v_item->'ingredients', '[]'::jsonb)) loop
      if nullif(btrim(v_ing->>'name'), '') is null then continue; end if;
      insert into public.menu_item_ingredients (menu_item_id, name, removable, extra_price, sort_order)
      values (v_item_id, left(btrim(v_ing->>'name'), 80), coalesce((v_ing->>'removable')::boolean, true),
              greatest(coalesce((v_ing->>'extraPrice')::numeric, 0), 0),
              coalesce((select max(sort_order) + 1 from public.menu_item_ingredients where menu_item_id = v_item_id), 0));
    end loop;

    for v_line in select * from jsonb_array_elements(coalesce(v_item->'recipe', '[]'::jsonb)) loop
      v_name := left(btrim(coalesce(v_line->>'material', '')), 80);
      v_unit := lower(btrim(coalesce(v_line->>'unit', '')));
      v_qty := (v_line->>'quantity')::numeric;
      if v_name = '' or v_unit = '' or v_qty is null or v_qty <= 0 then raise exception 'Linha de ficha inválida em um item'; end if;

      select id, unit into v_existing from public.raw_materials where business_unit_id = p_unit and lower(name) = lower(v_name) limit 1;
      if found then
        if lower(v_existing.unit) <> v_unit then
          raise exception 'Unidade divergente para "%": cadastrado em "%", arquivo em "%"', v_name, v_existing.unit, v_unit;
        end if;
        v_id := v_existing.id;
      else
        v_prep := v_line->'preparation';
        insert into public.raw_materials (business_unit_id, name, unit, tipo, min_stock, current_stock)
        values (p_unit, v_name, v_unit,
                case when jsonb_typeof(v_prep) = 'object' then 'semiacabado'::public.item_tipo else 'insumo'::public.item_tipo end, 0, 0)
        returning id into v_id;
        v_materials_created := v_materials_created + 1;

        if jsonb_typeof(v_prep) = 'object' then
          if coalesce((v_prep->>'outputQuantity')::numeric, 0) <= 0 or jsonb_array_length(coalesce(v_prep->'inputs', '[]'::jsonb)) = 0 then
            raise exception 'Receita de "%" incompleta', v_name;
          end if;
          insert into public.production_recipes (business_unit_id, name, output_raw_material_id, output_quantity, tipo)
          values (p_unit, 'Receita — ' || v_name, v_id, (v_prep->>'outputQuantity')::numeric, 'producao')
          returning id into v_recipe;
          v_recipes_created := v_recipes_created + 1;
          for v_base in select * from jsonb_array_elements(v_prep->'inputs') loop
            declare
              v_bname text := left(btrim(coalesce(v_base->>'material', '')), 80);
              v_bunit text := lower(btrim(coalesce(v_base->>'unit', '')));
              v_bqty numeric := (v_base->>'quantity')::numeric;
              v_bid uuid; v_bex record;
            begin
              if v_bname = '' or v_bunit = '' or v_bqty is null or v_bqty <= 0 then raise exception 'Insumo-base inválido na receita de "%"', v_name; end if;
              select id, unit into v_bex from public.raw_materials where business_unit_id = p_unit and lower(name) = lower(v_bname) limit 1;
              if found then
                if lower(v_bex.unit) <> v_bunit then
                  raise exception 'Unidade divergente para "%": cadastrado em "%", arquivo em "%"', v_bname, v_bex.unit, v_bunit;
                end if;
                v_bid := v_bex.id;
              else
                insert into public.raw_materials (business_unit_id, name, unit, tipo, min_stock, current_stock)
                values (p_unit, v_bname, v_bunit, 'insumo', 0, 0) returning id into v_bid;
                v_materials_created := v_materials_created + 1;
              end if;
              insert into public.production_recipe_inputs (recipe_id, raw_material_id, quantity) values (v_recipe, v_bid, v_bqty);
            end;
          end loop;
        end if;
      end if;

      insert into public.recipe_items (menu_item_id, raw_material_id, quantity) values (v_item_id, v_id, v_qty);
      v_lines := v_lines + 1;
    end loop;
  end loop;

  v_result := jsonb_build_object(
    'categoriesCreated', v_categories_created, 'itemsCreated', v_items_created, 'itemsSkipped', v_items_skipped,
    'materialsCreated', v_materials_created, 'recipesCreated', v_recipes_created, 'recipeLines', v_lines,
    'published', p_publish, 'repeated', false);
  insert into public.menu_import_requests (id, business_unit_id, user_id, result) values (p_request, p_unit, auth.uid(), v_result);
  return v_result;
end;
$$;

revoke all on function public.apply_menu_import(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.apply_menu_import(uuid, uuid, jsonb, boolean) to authenticated;

-- Arquivos enviados para leitura da IA: bucket PRIVADO, por unidade (<unit_id>/arquivo).
do $storage$
begin
  if to_regnamespace('storage') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('menu-imports', 'menu-imports', false, 10485760,
          array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'text/plain',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "Unit admin can upload menu imports" on storage.objects
      for insert to authenticated with check (
        bucket_id = 'menu-imports'
        and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ops_private.staff(((storage.foldername(name))[1])::uuid, array['admin']) else false end)
  $p$;
  execute $p$
    create policy "Unit admin can delete menu imports" on storage.objects
      for delete to authenticated using (
        bucket_id = 'menu-imports'
        and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ops_private.staff(((storage.foldername(name))[1])::uuid, array['admin']) else false end)
  $p$;
end
$storage$;
