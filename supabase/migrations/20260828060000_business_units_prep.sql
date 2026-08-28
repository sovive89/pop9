-- Prepara o schema de estoque para expansão multi-unidade (multi-tenant) futura.
--
-- Contexto: o Pop9 hoje não tem NENHUM conceito de unidade/estabelecimento em
-- lugar nenhum do banco (confirmado por grep em todas as migrations e em
-- types.ts — zero ocorrências de business_unit/tenant_id/loja_id/unit_id).
-- Isso é intencional pra uma casa só, mas o usuário confirmou que quer
-- preparar o terreno pra multi-unidade mais pra frente.
--
-- Por que agora: as migrations de estoque (20260828040000/041000/050000)
-- ainda NÃO foram aplicadas no banco de produção real. É muito mais barato
-- nascer com a coluna do que fazer um backfill depois com linhas de
-- raw_materials/lotes/stock_movements já acumuladas sem dono.
--
-- Escopo deliberadamente mínimo: só abre espaço no schema (tabela +
-- colunas nullable). NÃO implementa stock_locations/stock_balances por
-- unidade nem qualquer lógica de isolamento — isso é o redesenho maior do
-- Stock Core que ficou pausado por decisão do usuário. Uma casa só continua
-- funcionando exatamente igual, só que agora com a coluna business_unit_id
-- disponível (e nula) em vez de inexistente.
create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.business_units is
  'Preparação para multi-unidade. Hoje o Pop9 roda com uma casa só '
  '(Confit Burguer, inserida por esta mesma migration); esta tabela existe '
  'pra não exigir uma migration de backfill dolorosa quando uma segunda '
  'unidade for aberta. As colunas business_unit_id nas tabelas de estoque '
  'ficam nullable e não-preenchidas por enquanto — popular/tornar '
  'obrigatório é trabalho de uma migration futura, não desta.';

alter table public.raw_materials
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.suppliers
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.lotes
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.stock_movements
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.production_recipes
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.production_batches
  add column if not exists business_unit_id uuid references public.business_units(id);

-- Primeira (e por enquanto única) unidade: a casa que já está rodando hoje.
-- Guard por nome pra essa migration continuar podendo ser rodada mais de
-- uma vez sem duplicar a linha.
insert into public.business_units (name)
select 'Confit Burguer'
where not exists (
  select 1 from public.business_units where name = 'Confit Burguer'
);
