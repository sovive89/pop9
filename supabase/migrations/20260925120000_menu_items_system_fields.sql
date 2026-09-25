-- Campos de menu_items que passam a ser definidos pelo SISTEMA, não pelo usuário:
--   id         → gerado pelo banco (UUID em texto; itens antigos como 'B1' continuam válidos)
--   sku        → gerado por sequência quando vier vazio (P0001, P0002…)
--   sort_order → item novo entra no fim da sua categoria (maior ordem + 1)
--   status     → todo item novo nasce como rascunho
-- Tudo aditivo: nenhuma coluna removida, tipo de `id` mantido (text) pra não
-- quebrar as FKs de menu_item_ingredients / menu_item_variants / recipe_items.

-- 1. ID automático
alter table public.menu_items
  alter column id set default gen_random_uuid()::text;

-- 2. Status: item novo nasce rascunho
alter table public.menu_items
  alter column status set default 'draft';

-- 3. SKU: sequência + unicidade por unidade
create sequence if not exists public.menu_items_sku_seq;

create unique index if not exists menu_items_business_unit_sku_key
  on public.menu_items (business_unit_id, sku)
  where sku is not null;

-- 4. Trigger que preenche SKU e ordem na inserção
create or replace function public.menu_items_fill_system_fields()
returns trigger
language plpgsql
as $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'P' || lpad(nextval('public.menu_items_sku_seq')::text, 4, '0');
  end if;

  select coalesce(max(sort_order), 0) + 1
    into new.sort_order
    from public.menu_items
   where business_unit_id = new.business_unit_id
     and category = new.category;

  return new;
end;
$$;

drop trigger if exists menu_items_fill_system_fields on public.menu_items;
create trigger menu_items_fill_system_fields
  before insert on public.menu_items
  for each row execute function public.menu_items_fill_system_fields();

comment on column public.menu_items.id is 'Gerado pelo banco. Nunca informado pelo usuário.';
comment on column public.menu_items.sku is 'Gerado automaticamente (P0001…) se não informado. Único por unidade.';
comment on column public.menu_items.sort_order is 'Na inserção, o trigger coloca o item no fim da categoria. Pode ser reordenado depois.';
