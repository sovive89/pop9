-- Complementa print_sectors (20261013110000_dynamic_print_sectors.sql):
--  1) "Caixa" como setor padrão, ao lado de Cozinha e Bar;
--  2) unidades novas já nascem com os três setores;
--  3) o setor de cada item do pedido passa a vir da categoria do cardápio no banco.
--
-- Achado documentado: o app de mesa decidia o setor por um cardápio fixo no código
-- (src/data/menu.ts → isKitchenItem). Para itens do cardápio real (ids do banco) ele
-- devolvia sempre "kitchen", então bebidas iam para a cozinha. O gatilho abaixo corrige
-- isso para qualquer origem (mesa, PWA, integrações), sem mudar o formato das colunas.

insert into public.print_sectors (business_unit_id, slug, name)
select id, 'cashier', 'Caixa' from public.business_units
on conflict (business_unit_id, slug) do nothing;

create or replace function app_private.seed_print_sectors_for_new_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.print_sectors (business_unit_id, slug, name)
  values (new.id, 'kitchen', 'Cozinha'), (new.id, 'bar', 'Bar'), (new.id, 'cashier', 'Caixa')
  on conflict (business_unit_id, slug) do nothing;
  return new;
end;
$$;
revoke all on function app_private.seed_print_sectors_for_new_unit() from public;
create trigger seed_print_sectors_for_new_unit after insert on public.business_units
  for each row execute function app_private.seed_print_sectors_for_new_unit();

create or replace function app_private.set_order_item_destination()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dest text;
begin
  if new.menu_item_id is not null then
    select mc.destination into v_dest
      from public.orders o
      join public.menu_items mi on mi.id = new.menu_item_id and mi.business_unit_id = o.business_unit_id
      join public.menu_categories mc on mc.key = mi.category and mc.business_unit_id = o.business_unit_id
     where o.id = new.order_id;
    if nullif(v_dest, '') is not null then new.destination := v_dest; end if;
  end if;
  new.destination := coalesce(nullif(new.destination, ''), 'kitchen');
  return new;
end;
$$;
revoke all on function app_private.set_order_item_destination() from public;
create trigger set_order_item_destination before insert on public.order_items
  for each row execute function app_private.set_order_item_destination();
