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

-- Até aqui o SKU era digitado à mão; a sequência começa depois do maior
-- "P<número>" já existente pra não colidir com um P0001 cadastrado antes.
select setval(
  'public.menu_items_sku_seq',
  coalesce((select max(substring(sku from '^P(\d+)$')::bigint) from public.menu_items), 0) + 1,
  false
);

-- SKUs em branco viram null (o índice ignora null) e SKUs repetidos na mesma
-- unidade — possíveis no cadastro manual — ganham um SKU novo da sequência,
-- mantendo o original só no registro mais antigo. Sem isso o índice único
-- abaixo falharia e derrubaria a migration inteira.
update public.menu_items set sku = null where btrim(sku) = '';

with dup as (
  select ctid,
         row_number() over (partition by business_unit_id, sku order by created_at, id) as rn
    from public.menu_items
   where sku is not null
)
update public.menu_items m
   set sku = 'P' || lpad(nextval('public.menu_items_sku_seq')::text, 4, '0')
  from dup
 where m.ctid = dup.ctid
   and dup.rn > 1;

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

  -- Serializa inserções concorrentes na mesma unidade+categoria; sem o lock,
  -- duas inserções simultâneas leriam o mesmo max e ganhariam a mesma ordem.
  perform pg_advisory_xact_lock(
    hashtext('menu_items_sort:' || new.business_unit_id::text || ':' || new.category)
  );

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
