-- Passo 3.5 do Modelo Canônico: FK real de menu_items.category para
-- menu_categories.
--
-- Hoje category é só texto com CHECK fixo em 4 valores
-- ('burgers','sides','drinks','desserts'), apesar de menu_categories já
-- existir como tabela própria (key/label/destination). Troca o CHECK
-- pela FK de verdade. Seguro hoje: menu_items e menu_categories estão
-- ambas vazias em produção (confirmado antes de aplicar), então não há
-- linha existente que possa violar a nova constraint.
alter table public.menu_items
  drop constraint if exists menu_items_category_check;

alter table public.menu_items
  add constraint menu_items_category_fkey
  foreign key (category) references public.menu_categories(key);

comment on column public.menu_items.category is 'FK para menu_categories.key (era CHECK fixo em 4 valores antes desta migration).';
