-- Itens criados antes da sincronização automática também precisam aparecer
-- no Estoque para alimentar os dropdowns de ficha e produção.
insert into public.raw_materials (
  business_unit_id,
  name,
  unit,
  tipo,
  min_stock,
  current_stock,
  categoria,
  is_theoretical
)
select distinct
  mi.business_unit_id,
  btrim(i.name),
  'un',
  'insumo'::public.item_tipo,
  0,
  0,
  'Cardápio',
  true
from public.menu_item_ingredients i
join public.menu_items mi on mi.id = i.menu_item_id
where mi.business_unit_id is not null
  and btrim(i.name) <> ''
  and not exists (
    select 1
    from public.raw_materials rm
    where rm.business_unit_id = mi.business_unit_id
      and lower(btrim(rm.name)) = lower(btrim(i.name))
  );
