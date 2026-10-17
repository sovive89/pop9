-- Semiacabado e item acabado são tipos de saída, não transformações.
-- A transformação descreve apenas o processo aplicado ao ingrediente.
update public.recipe_items
set transformacao = 'producao'
where transformacao in ('semiacabado', 'item_acabado');

alter table public.recipe_items drop constraint if exists recipe_items_transformacao_check;
alter table public.recipe_items
  add constraint recipe_items_transformacao_check
  check (transformacao in ('desconto_direto', 'producao', 'porcionamento'));
