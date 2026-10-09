-- Fix order item stock deduction: carry the order's business unit into stock_movements.
create or replace function public.order_item_deducts_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  ri record;
  v_unit_id uuid;
begin
  select o.business_unit_id into v_unit_id
  from public.orders o where o.id = new.order_id;
  if v_unit_id is null then
    raise exception 'Order % has no business unit', new.order_id;
  end if;
  for ri in
    select r.raw_material_id, r.quantity
    from public.recipe_items r
    join public.raw_materials rm on rm.id = r.raw_material_id
    where r.menu_item_id = new.menu_item_id
      and rm.business_unit_id = v_unit_id
  loop
    insert into public.stock_movements
      (business_unit_id, raw_material_id, type, quantity, reason, reference_type, reference_id)
    values
      (v_unit_id, ri.raw_material_id, 'saida', ri.quantity * new.quantity, 'venda', 'order_item', new.id);
  end loop;
  return new;
end;
$function$;
