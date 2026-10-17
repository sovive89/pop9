-- Módulo de cardápio, primeiro passo do design (docs/pop9-documentacao-estrategica.md
-- seção 5): SKU + status (rascunho/publicado) em menu_items.
--
-- Hoje todo item criado já fica visível/vendável na hora (só existe
-- `active` como liga/desliga). `status` separa "ainda montando" de
-- "pronto pra vender" — default 'published' pra não mudar o
-- comportamento dos itens já existentes.
alter table public.menu_items
  add column if not exists sku text,
  add column if not exists status text not null default 'published';

alter table public.menu_items
  drop constraint if exists menu_items_status_check;
alter table public.menu_items
  add constraint menu_items_status_check
  check (status in ('draft', 'published'));

comment on column public.menu_items.sku is 'Código interno opcional do produto, para referência/integração futura com PDVs externos.';
comment on column public.menu_items.status is 'draft = ainda sendo montado (não deve aparecer pro cliente mesmo se active=true); published = pronto.';
