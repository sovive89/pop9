-- Prepara TODO o schema do Pop9 para expansão multi-unidade (multi-tenant)
-- futura — não só estoque. "Tudo deriva da unidade" foi a decisão explícita.
--
-- Contexto: o Pop9 hoje não tem NENHUM conceito de negócio/unidade em lugar
-- nenhum do banco (confirmado por grep em todas as migrations e em
-- types.ts — zero ocorrências de business/tenant_id/loja_id/unit_id). Isso é
-- intencional pra uma casa só, mas o usuário confirmou que quer preparar o
-- terreno pra multi-unidade mais pra frente, cobrindo o app inteiro.
--
-- Hierarquia (decisão explícita do usuário): dois níveis, não um só.
--   businesses      — a marca/rede (ex: "Confit Burguer"). Pode ter uma ou
--                      várias unidades.
--   business_units  — cada casa física daquela marca (ex: "Unidade 1",
--                      "Unidade Centro"). Tudo mais no app deriva daqui, não
--                      de `businesses` diretamente — uma comanda, um insumo,
--                      um pedido pertencem a uma unidade específica, não à
--                      marca como um todo.
-- Convenção de nomes (decisão explícita do usuário):
--   Rede com filiais homônimas (mesmo nome da marca em toda unidade):
--   business.name é o nome do negócio; cada business_units.name recebe uma
--   distinção (ex: "Confit Burguer - Filial 01", "Confit Burguer - Filial 02").
--   Rede com filiais de nomes independentes: business.name é o nome da
--   empresa/holding; cada business_units.name é a identidade própria daquela
--   filial, sem precisar repetir o nome do negócio — inclusive porque
--   filiais da mesma holding podem nem ser do mesmo ramo (ver
--   establishment_type abaixo: uma pode ser hamburgueria, outra pizzaria).
--   Localização/características (endereço, bairro, cidade, estado) NÃO vão
--   no `name` — são colunas próprias em business_units, pra não virar texto
--   livre inconsistente ("Filial 01 - Centro" vs "Filial 01 (Centro)").
--
-- Por que agora: as migrations de estoque (20260828040000/041000/050000)
-- ainda NÃO foram aplicadas no banco de produção real. É muito mais barato
-- nascer com a coluna do que fazer um backfill depois com linhas
-- acumuladas sem dono.
--
-- Critério de quais tabelas recebem business_unit_id direto ("raiz") vs
-- herdam via join ("filha"): uma tabela filha tem uma FK que já a liga
-- deterministicamente a uma tabela raiz (ex: order_items -> orders) — dar a
-- ela sua própria business_unit_id seria dado redundante que pode divergir
-- do pai, o mesmo problema de normalização já visto nesta sessão com
-- is_produced/item_type em raw_materials. Por isso a coluna só vai nas
-- raízes: raw_materials, suppliers, lotes, stock_movements,
-- production_recipes, production_batches, menu_categories, menu_items,
-- orders, sessions, threads, user_roles.
--
-- Ficam de fora nesta migration: profiles e push_subscriptions são sobre o
-- usuário/dispositivo, não sobre uma transação de uma unidade específica —
-- um funcionário pode vir a trabalhar em mais de uma unidade. Isso pede uma
-- tabela de vínculo (ex: user_business_units) numa migration futura, não
-- uma coluna direta aqui.
--
-- Escopo deliberadamente mínimo: só abre espaço no schema (tabelas + colunas
-- nullable). NÃO implementa stock_locations/stock_balances por unidade nem
-- qualquer lógica de isolamento (RLS por unidade, etc.) — isso é o
-- redesenho maior do Stock Core que ficou pausado por decisão do usuário.
-- Uma casa só continua funcionando exatamente igual, só que agora com as
-- colunas disponíveis (e nulas) em vez de inexistentes.
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.businesses is
  'A marca/rede (ex: "Confit Burguer"). Nível acima de business_units — '
  'existe pra suportar uma rede com várias unidades no futuro. Hoje tem '
  'uma linha só.';

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null, -- ex: "Confit Burguer - Filial 01" — só o identificador, sem localização embutida
  establishment_type text, -- ex: "hamburgueria", "pizzaria" — filiais da mesma holding podem ser ramos diferentes
  address text,
  neighborhood text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.business_units is
  'Cada casa física de um business. Tudo no app deriva daqui (não de '
  'businesses diretamente): uma comanda, um insumo, um pedido pertencem a '
  'uma unidade específica. Hoje tem uma linha só (a casa já rodando), sem '
  'nenhuma outra tabela do app ainda preenchendo business_unit_id — '
  'popular/tornar obrigatório é trabalho de uma migration futura, não '
  'desta.';

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

alter table public.menu_categories
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.menu_items
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.orders
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.sessions
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.threads
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.user_roles
  add column if not exists business_unit_id uuid references public.business_units(id);

-- Primeiro (e por enquanto único) negócio + sua primeira unidade.
-- Guard por nome pra essa migration continuar podendo ser rodada mais de
-- uma vez sem duplicar as linhas.
insert into public.businesses (name)
select 'Confit Burguer'
where not exists (
  select 1 from public.businesses where name = 'Confit Burguer'
);

insert into public.business_units (business_id, name, establishment_type)
select b.id, 'Confit Burguer - Filial 01', 'hamburgueria'
from public.businesses b
where b.name = 'Confit Burguer'
  and not exists (
    select 1 from public.business_units u
    where u.business_id = b.id and u.name = 'Confit Burguer - Filial 01'
  );
