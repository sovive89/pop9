-- Insumos podem nascer na montagem do cardápio antes de existir compra ou produção.
-- O marcador evita confundir saldo zero teórico com estoque real zerado.
alter table public.raw_materials
  add column if not exists is_theoretical boolean not null default false;

comment on column public.raw_materials.is_theoretical is
  'true enquanto o insumo foi apenas cadastrado na ficha/cardápio e ainda não recebeu compra ou produção real.';

-- Registros existentes já participaram da operação ou foram criados antes deste
-- marcador; não os reclassificamos retroativamente.
