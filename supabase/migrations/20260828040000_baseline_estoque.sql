-- FASE 0 — CONGELAR A REALIDADE (baseline do módulo de estoque)
--
-- Contexto (ver 1-PLANO.md): as tabelas de estoque abaixo existem e funcionam
-- em produção, mas nunca foram versionadas em supabase/migrations/. Isso é
-- schema drift: um banco novo (preview branch, ambiente local, disaster
-- recovery) não reconstrói o Pop9 de verdade.
--
-- Esta migration não muda comportamento nenhum. Ela só faz o repositório
-- dizer a verdade sobre o que já está rodando.
--
-- Fonte: reconstruído a partir de src/integrations/supabase/types.ts (saída
-- real de `supabase gen types`, portanto reflete o schema de produção nos
-- nomes/tipos de coluna e nullability) cruzado com o uso real em
-- src/hooks/useStockData.ts. CREATE TABLE IF NOT EXISTS em tudo: se a coluna
-- já existir com outro detalhe (default, RLS, trigger), esta migration não
-- sobrescreve nada — ela só preenche o que estiver faltando no repo local.
--
-- O QUE NÃO ESTÁ AQUI (não dá pra saber sem consultar o banco ao vivo):
--   - RLS policies de cada tabela — rode a QUERY 2 de 3-FASE0-queries.sql
--     no SQL Editor do Supabase e cole o resultado antes de confiar 100%
--     nesta baseline em produção.
--   - As views `low_stock_alerts`, `production_labels` e
--     `daily_production_closing` — são VIEWs, não tabelas. Recriá-las aqui
--     com a lógica "adivinhada" é arriscado (uma migration com
--     CREATE OR REPLACE VIEW substitui a view real pela nossa versão
--     chutada). Para essas, rode no SQL Editor:
--       SELECT pg_get_viewdef('public.low_stock_alerts', true);
--       SELECT pg_get_viewdef('public.production_labels', true);
--       SELECT pg_get_viewdef('public.daily_production_closing', true);
--     e cole o DDL exato numa migration separada.
--   - A lógica de qualquer trigger (ex.: o que atualiza raw_materials.
--     current_stock e average_cost quando um stock_movement é inserido, o
--     que gera batch_code em production_batches). O comportamento existe
--     e funciona — só não sabemos o código exato do trigger.
--   - `recipe_items`: tabela real, aparece em types.ts, mas ZERO referências
--     no código da aplicação (grep confirmou). É a ponte item-vendido→insumo
--     que a Fase 2 precisa e que o 1-PLANO.md achava que não existia — ela
--     existe, mas está órfã. Ver nota no final do arquivo.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  is_produced boolean not null default false,
  current_stock numeric not null default 0,
  min_stock numeric not null default 0,
  average_cost numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  output_raw_material_id uuid not null references public.raw_materials(id),
  output_quantity numeric not null,
  shelf_life_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.production_recipe_inputs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.production_recipes(id),
  raw_material_id uuid not null references public.raw_materials(id),
  quantity numeric not null
);

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.production_recipes(id),
  quantity_produced numeric not null,
  notes text,
  produced_by uuid,
  batch_code text,
  produced_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.production_batch_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id),
  raw_material_id uuid not null references public.raw_materials(id),
  quantity_used numeric not null
);

-- reason/type validados na aplicação hoje; ver estrutura-estoque-pop9.md
-- para o vocabulário completo. Constraint não incluída aqui de propósito —
-- ver a migration seguinte (schema upgrade) para o motivo.
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references public.raw_materials(id),
  type text not null, -- 'entrada' | 'saida'
  reason text not null, -- compra | producao_consumo | producao_output | venda | ajuste | perda | estorno_cancelamento
  quantity numeric not null,
  unit_cost numeric,
  supplier_id uuid references public.suppliers(id),
  batch_info jsonb,
  reference_id uuid,
  reference_type text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- [ÓRFÃ] Existe em produção (confirmado via types.ts) e é exatamente a ponte
-- menu_item → raw_material que a Fase 2 (venda→estoque) precisa, mas nenhum
-- arquivo em src/ ou supabase/ a referencia. Congelada aqui como está;
-- decisão de reaproveitar ou substituir fica para a Fase 2, não para esta
-- migration de baseline.
-- menu_item_id é `text`, não uuid — confirmado em
-- supabase/migrations/20260225015013_..._.sql, onde menu_items.id é
-- `text PRIMARY KEY`. O mesmo cuidado que o 1-PLANO.md já registrou sobre
-- order_items.menu_item_id vale aqui.
create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null references public.menu_items(id),
  raw_material_id uuid not null references public.raw_materials(id),
  quantity numeric not null
);
