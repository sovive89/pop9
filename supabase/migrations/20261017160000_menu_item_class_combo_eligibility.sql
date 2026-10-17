-- Classificação manual de itens e elegibilidade explícita em combos.
-- O preço vigente permanece em menu_items.price; pedidos já guardam o preço vendido.
-- Requer as migrations anteriores de combos (20261013130000) e destino/cópia (20261017140000).

alter table public.menu_items
  add column if not exists item_kind text not null default 'regular',
  add column if not exists combo_eligible boolean not null default false;

-- Itens já cadastrados continuam elegíveis por compatibilidade; novos itens recebem
-- o padrão conservador e a RPC decide o default conforme classificação.
update public.menu_items set combo_eligible = true where item_kind = 'regular';
alter table public.menu_items alter column combo_eligible set default false;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.menu_items'::regclass and conname = 'menu_items_item_kind_check'
  ) then
    alter table public.menu_items add constraint menu_items_item_kind_check
      check (item_kind in ('regular', 'special', 'seasonal'));
  end if;
end $$;

comment on column public.menu_items.item_kind is 'Classificação manual do item: regular, special ou seasonal.';
comment on column public.menu_items.combo_eligible is 'Permite incluir explicitamente o item em combos; especial/sazonal iniciam desmarcados pela tela administrativa.';

-- A UI usa este wrapper quando detecta a migration. Ausência de combo_eligible significa
-- false para special/seasonal e true para regular; exceções explícitas do admin são preservadas.
create or replace function public.save_menu_item_with_recipe_and_class(p_unit uuid, p_item_id text, p_data jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := coalesce(nullif(trim(p_data->>'item_kind'), ''), 'regular');
  v_eligible boolean;
  v_saved_id text;
begin
  if not ops_private.staff(p_unit, array['admin']) then
    raise exception 'Sem permissão para alterar cardápio' using errcode = '42501';
  end if;
  if v_kind not in ('regular', 'special', 'seasonal') then
    raise exception 'Tipo de item inválido';
  end if;
  if jsonb_typeof(p_data->'combo_eligible') = 'boolean' then
    v_eligible := (p_data->>'combo_eligible')::boolean;
  else
    v_eligible := v_kind = 'regular';
  end if;

  v_saved_id := public.save_menu_item_with_recipe(p_unit, p_item_id, p_data);
  update public.menu_items
     set item_kind = v_kind, combo_eligible = v_eligible
   where id = v_saved_id and business_unit_id = p_unit;
  if not found then raise exception 'Item não encontrado na unidade após salvar'; end if;
  return v_saved_id;
end;
$$;
revoke all on function public.save_menu_item_with_recipe_and_class(uuid, text, jsonb) from public, anon;
grant execute on function public.save_menu_item_with_recipe_and_class(uuid, text, jsonb) to authenticated;

-- A cópia entre unidades preserva classificação e exceção de combo sem copiar preço-base alternativo.
create or replace function public.export_menu_item_to_units_with_classification(
  p_source_unit uuid, p_item_id text, p_target_units uuid[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_eligible boolean;
  v_results jsonb;
  v_row jsonb;
  v_unit uuid;
  v_id text;
  v_output jsonb := '[]'::jsonb;
begin
  if not ops_private.staff(p_source_unit, array['admin']) then
    raise exception 'Sem permissão na unidade de origem' using errcode = '42501';
  end if;
  select item_kind, combo_eligible into v_kind, v_eligible
    from public.menu_items where id = p_item_id and business_unit_id = p_source_unit;
  if not found then raise exception 'Item não encontrado na unidade de origem'; end if;

  v_results := public.export_menu_item_to_units(p_source_unit, p_item_id, p_target_units);
  for v_row in select value from jsonb_array_elements(coalesce(v_results, '[]'::jsonb)) loop
    if coalesce((v_row->>'ok')::boolean, false) then
      v_unit := (v_row->>'unit_id')::uuid;
      v_id := v_row->>'item_id';
      begin
        update public.menu_items set item_kind = v_kind, combo_eligible = v_eligible
          where id = v_id and business_unit_id = v_unit;
        if not found then raise exception 'Item copiado não encontrado para aplicar classificação'; end if;
        v_output := v_output || jsonb_build_array(v_row);
      exception when others then
        v_output := v_output || jsonb_build_array(jsonb_build_object(
          'unit_id', v_unit, 'ok', false, 'error', sqlerrm
        ));
      end;
    else
      v_output := v_output || jsonb_build_array(v_row);
    end if;
  end loop;
  return v_output;
end;
$$;
revoke all on function public.export_menu_item_to_units_with_classification(uuid, text, uuid[]) from public, anon;
grant execute on function public.export_menu_item_to_units_with_classification(uuid, text, uuid[]) to authenticated;

-- Protege também gravações diretas: uma opção de combo deve apontar para item elegível e da mesma unidade.
create or replace function app_private.guard_combo_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_unit uuid;
begin
  if tg_table_name = 'menu_combo_slots' then
    select business_unit_id into v_unit from public.menu_combos where id = new.combo_id;
  else
    select business_unit_id into v_unit from public.menu_combo_slots where id = new.slot_id;
    if not exists (
      select 1 from public.menu_items
       where id = new.menu_item_id and business_unit_id = v_unit and combo_eligible
    ) then
      raise exception 'Item não elegível para combo ou não encontrado nesta unidade';
    end if;
  end if;
  if v_unit is null or v_unit <> new.business_unit_id then
    raise exception 'Combo de outra unidade' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_combo_unit() from public;

-- O pedido instantâneo e os combos fixos só podem agrupar itens liberados para combos.
create or replace function app_private.guard_order_item_combo_eligibility()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_unit uuid;
begin
  if new.combo_group_id is null then return new; end if;
  select business_unit_id into v_unit from public.orders where id = new.order_id;
  if v_unit is null or not exists (
    select 1 from public.menu_items
     where id = new.menu_item_id and business_unit_id = v_unit and combo_eligible
  ) then
    raise exception 'Item não elegível para combo ou fora da unidade do pedido' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_order_item_combo_eligibility() from public;
drop trigger if exists guard_order_item_combo_eligibility on public.order_items;
create trigger guard_order_item_combo_eligibility
  before insert or update of order_id, menu_item_id, combo_group_id on public.order_items
  for each row execute function app_private.guard_order_item_combo_eligibility();

-- Cadastro completo de combo em uma transação: falha em etapa/opção reverte o combo inteiro.
create or replace function public.save_menu_combo(
  p_unit uuid, p_combo_id uuid, p_data jsonb, p_sort_order integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_mode text := p_data->>'pricing_mode';
  v_name text := trim(coalesce(p_data->>'name', ''));
  v_description text := nullif(trim(p_data->>'description'), '');
  v_price numeric := nullif(p_data->>'price', '')::numeric;
  v_discount numeric := coalesce(nullif(p_data->>'discount', '')::numeric, 0);
  v_active boolean := coalesce((p_data->>'active')::boolean, true);
  v_slots jsonb := p_data->'slots';
  v_slot jsonb;
  v_option jsonb;
  v_slot_id uuid;
  v_slot_label text;
  v_item_id text;
  v_extra numeric;
  v_is_free boolean;
  v_index integer := 0;
  v_option_index integer;
begin
  if not ops_private.staff(p_unit, array['admin']) then
    raise exception 'Sem permissão para salvar combos nesta unidade' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 80 then raise exception 'Nome do combo inválido'; end if;
  if v_description is not null and length(v_description) > 300 then raise exception 'Descrição do combo muito longa'; end if;
  if v_mode not in ('fixed', 'percent', 'amount') then raise exception 'Modo de preço inválido'; end if;
  if v_discount < 0 or v_discount >= 'Infinity'::numeric then raise exception 'Desconto inválido'; end if;
  if v_mode = 'fixed' and (v_price is null or v_price < 0 or v_price >= 'Infinity'::numeric) then raise exception 'Preço fixo inválido'; end if;
  if v_mode = 'percent' and v_discount > 100 then raise exception 'Desconto percentual não pode exceder 100%%'; end if;
  if jsonb_typeof(v_slots) is distinct from 'array' or jsonb_array_length(v_slots) = 0 then raise exception 'Adicione ao menos uma etapa'; end if;

  if p_combo_id is not null then
    select id into v_id from public.menu_combos where id = p_combo_id and business_unit_id = p_unit for update;
    if not found then raise exception 'Combo não encontrado nesta unidade'; end if;
    update public.menu_combos set name = v_name, description = v_description, pricing_mode = v_mode,
      price = case when v_mode = 'fixed' then v_price else null end,
      discount = case when v_mode = 'fixed' then 0 else v_discount end,
      active = v_active, sort_order = coalesce(p_sort_order, 0)
      where id = v_id;
    delete from public.menu_combo_slots where combo_id = v_id;
  else
    insert into public.menu_combos (business_unit_id, name, description, pricing_mode, price, discount, active, sort_order)
      values (p_unit, v_name, v_description, v_mode,
        case when v_mode = 'fixed' then v_price else null end,
        case when v_mode = 'fixed' then 0 else v_discount end,
        v_active, coalesce(p_sort_order, 0)) returning id into v_id;
  end if;

  for v_slot in select value from jsonb_array_elements(v_slots) loop
    v_slot_label := trim(coalesce(v_slot->>'label', ''));
    if v_slot_label = '' or length(v_slot_label) > 40 then raise exception 'Nome de etapa inválido'; end if;
    if jsonb_typeof(v_slot->'options') is distinct from 'array' or jsonb_array_length(v_slot->'options') = 0 then
      raise exception 'Cada etapa deve ter ao menos um item';
    end if;
    insert into public.menu_combo_slots (business_unit_id, combo_id, label, sort_order)
      values (p_unit, v_id, v_slot_label, v_index) returning id into v_slot_id;
    v_option_index := 0;
    for v_option in select value from jsonb_array_elements(v_slot->'options') loop
      v_item_id := nullif(trim(v_option->>'menu_item_id'), '');
      v_extra := coalesce(nullif(v_option->>'extra_price', '')::numeric, 0);
      v_is_free := coalesce((v_option->>'is_free')::boolean, false);
      if v_item_id is null or v_extra < 0 or v_extra >= 'Infinity'::numeric then raise exception 'Opção de combo inválida'; end if;
      insert into public.menu_combo_options (business_unit_id, slot_id, menu_item_id, extra_price, is_free, sort_order)
        values (p_unit, v_slot_id, v_item_id, v_extra, v_is_free, v_option_index);
      v_option_index := v_option_index + 1;
    end loop;
    v_index := v_index + 1;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.save_menu_combo(uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.save_menu_combo(uuid, uuid, jsonb, integer) to authenticated;
