-- Combos do cardápio.
--
-- Um combo é formado por etapas (ex.: Lanche, Acompanhamento, Bebida). Cada etapa tem uma
-- ou mais opções, que são itens que JÁ existem no cardápio:
--   * combo pronto  → cada etapa com uma única opção;
--   * montar na hora → etapa com várias opções (com acréscimo opcional por opção);
--   * "Coca grátis"  → opção marcada como grátis (não entra na soma).
-- Preço: fixo (price), % de desconto ou R$ de desconto sobre a soma dos itens escolhidos.
--
-- No pedido, cada item escolhido vira uma linha normal de order_items (setor, estoque pela
-- ficha técnica, KDS e comandas continuam iguais), com o preço do combo repartido entre elas
-- e marcadas com combo_group_id/combo_name para a conta agrupar. Nada existente muda.

create table public.menu_combos (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 300),
  pricing_mode text not null default 'fixed' check (pricing_mode in ('fixed', 'percent', 'amount')),
  price numeric(10,2) check (price is null or price >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (pricing_mode <> 'fixed' or price is not null),
  check (pricing_mode <> 'percent' or discount <= 100)
);

create table public.menu_combo_slots (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.menu_combos(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 40),
  sort_order integer not null default 0
);

create table public.menu_combo_options (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.menu_combo_slots(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  menu_item_id text not null,
  extra_price numeric(10,2) not null default 0 check (extra_price >= 0),
  is_free boolean not null default false,
  sort_order integer not null default 0,
  unique (slot_id, menu_item_id)
);
create index menu_combo_slots_combo on public.menu_combo_slots (combo_id, sort_order);
create index menu_combo_options_slot on public.menu_combo_options (slot_id, sort_order);

do $$
declare t text;
begin
  foreach t in array array['menu_combos', 'menu_combo_slots', 'menu_combo_options'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app_private.has_unit_role(business_unit_id, array[''admin'',''attendant'',''kitchen'',''cashier'']))', t || '_staff_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app_private.has_unit_role(business_unit_id, array[''admin'']))', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app_private.has_unit_role(business_unit_id, array[''admin''])) with check (app_private.has_unit_role(business_unit_id, array[''admin'']))', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app_private.has_unit_role(business_unit_id, array[''admin'']))', t || '_admin_delete', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Etapa e opção sempre da mesma unidade do combo (evita misturar unidades).
create or replace function app_private.guard_combo_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_unit uuid;
begin
  if tg_table_name = 'menu_combo_slots' then
    select business_unit_id into v_unit from public.menu_combos where id = new.combo_id;
  else
    select business_unit_id into v_unit from public.menu_combo_slots where id = new.slot_id;
    if not exists (select 1 from public.menu_items where id = new.menu_item_id and business_unit_id = v_unit) then
      raise exception 'Item do cardápio não encontrado nesta unidade';
    end if;
  end if;
  if v_unit is null or v_unit <> new.business_unit_id then
    raise exception 'Combo de outra unidade' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_combo_unit() from public;
create trigger guard_combo_unit before insert or update on public.menu_combo_slots
  for each row execute function app_private.guard_combo_unit();
create trigger guard_combo_unit before insert or update on public.menu_combo_options
  for each row execute function app_private.guard_combo_unit();

-- Itens de pedido que vieram de um combo (agrupados na conta).
alter table public.order_items
  add column if not exists combo_group_id uuid,
  add column if not exists combo_name text check (combo_name is null or length(combo_name) <= 80);
create index if not exists order_items_combo_group on public.order_items (combo_group_id) where combo_group_id is not null;
