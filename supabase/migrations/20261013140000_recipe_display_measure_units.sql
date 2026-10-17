-- Mantém quantidade/unidade apresentadas na ficha técnica independentes da unidade-base
-- utilizada pelas movimentações de estoque. A coluna quantity segue normalizada.
alter table public.recipe_items
  add column if not exists display_quantity numeric,
  add column if not exists display_unit text;
comment on column public.recipe_items.display_quantity is 'Quantidade informada pelo operador na ficha técnica, antes da conversão à unidade-base do estoque.';
comment on column public.recipe_items.display_unit is 'Unidade selecionada na ficha técnica. Não altera raw_materials.unit ou a unidade dos lotes.';
