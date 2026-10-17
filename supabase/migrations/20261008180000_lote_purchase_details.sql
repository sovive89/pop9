-- Preserve purchase details separately from normalized inventory quantities.
-- Existing lots retain their original inventory values; no implicit conversions.
alter table public.lotes
  add column if not exists unidade_compra text,
  add column if not exists quantidade_compra numeric,
  add column if not exists fator_conversao numeric,
  add column if not exists custo_total numeric,
  add column if not exists caixas numeric,
  add column if not exists conteudo_por_caixa numeric;

alter table public.lotes
  add column if not exists cancelado_em timestamptz;

comment on column public.lotes.quantidade_entrada is 'Quantity normalized to raw_materials.unit for inventory and FEFO.';
comment on column public.lotes.quantidade_compra is 'Original purchased quantity in unidade_compra, independently set for each lot.';
comment on column public.lotes.fator_conversao is 'Explicit multiplier: normalized quantity per one purchase unit. No inferred piece-to-weight conversion.';
comment on column public.lotes.preco_unitario is 'Unit cost in normalized raw_materials.unit, for stock valuation.';
comment on column public.lotes.custo_total is 'Total amount paid for the purchase lot.';
