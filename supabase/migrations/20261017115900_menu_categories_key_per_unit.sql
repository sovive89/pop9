-- Categorias passam a ser únicas POR UNIDADE (business_unit_id, key).
-- Achado (documentado antes de alterar, conforme CLAUDE.md): menu_categories.key era
-- UNIQUE global e menu_items.category tinha FK só para essa chave. Isso impede duas
-- unidades de terem a mesma categoria (ex.: "burgers"), o que o cardápio por unidade
-- e a exportação entre unidades exigem. Nenhuma coluna é removida; só a regra muda.
-- A FK composta nasce NOT VALID: vale para linhas novas/alteradas sem varrer o legado.
alter table public.menu_items drop constraint if exists menu_items_category_fkey;
alter table public.menu_categories drop constraint if exists menu_categories_key_key;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='menu_categories_unit_key_unique') then
    alter table public.menu_categories add constraint menu_categories_unit_key_unique unique (business_unit_id, key);
  end if;
  if not exists(select 1 from pg_constraint where conname='menu_items_category_unit_fkey') then
    alter table public.menu_items add constraint menu_items_category_unit_fkey
      foreign key (business_unit_id, category) references public.menu_categories(business_unit_id, key) not valid;
  end if;
end $$;
