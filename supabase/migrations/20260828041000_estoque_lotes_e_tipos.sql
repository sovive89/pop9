-- ESTOQUE — lotes/validade, tipo de item e metadados de ficha técnica
--
-- Implementa as melhorias descritas em estrutura-estoque-pop9.md (pilares
-- "Lotes → Validade" e parte de "Produção → Rendimento" do diagrama Stock
-- Core), cruzadas com o mecanismo confirmado do TOTVS Hospitalidade e o
-- controle de lote/validade do Colibri Back Office (ver claude/resumo-pop9.md
-- e claude/spec-estoque-pop9.md no projeto).
--
-- Tudo aditivo. Nada aqui remove ou renomeia coluna existente, e nenhum
-- código atual (StockTab.tsx, useStockData.ts) quebra se esta migration for
-- aplicada sem o resto das mudanças de frontend — as colunas novas são
-- nulas/têm default, e a coluna antiga (`is_produced`) continua existindo
-- e sendo mantida em sincronia por trigger, não substituída.

-- 1) LOTES — unifica compra + produção (hoje meio no `batch_info` jsonb,
-- meio em `production_batches`). Ver seção "LOTE" de estrutura-estoque-pop9.md.
create table if not exists public.lotes (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references public.raw_materials(id),
  numero_lote text not null,
  origem text not null check (origem in ('compra', 'producao')),
  quantidade_entrada numeric not null check (quantidade_entrada > 0), -- congelado: o que entrou, nunca muda
  data_entrada timestamptz not null default now(),
  validade date,
  fornecedor_id uuid references public.suppliers(id), -- só quando origem = 'compra'
  preco_unitario numeric,                              -- só quando origem = 'compra'
  receita_id uuid references public.production_recipes(id), -- só quando origem = 'producao'
  batch_id uuid references public.production_batches(id),   -- liga ao batch_code/etiqueta já existente
  created_at timestamptz not null default now()
);

-- índice que torna FEFO (first-expired-first-out) uma query simples: pega
-- os lotes de um insumo ordenados por validade (nulos por último) e vai
-- debitando em ordem.
create index if not exists idx_lotes_fefo
  on public.lotes (raw_material_id, validade nulls last, data_entrada);

-- 2) Liga cada movimentação ao lote de onde saiu / que ela criou. Nulável:
-- nem toda movimentação precisa de lote no dia 1 (compatibilidade com o
-- histórico existente, que não tem essa coluna).
alter table public.stock_movements
  add column if not exists lote_id uuid references public.lotes(id);

-- 3) TIPO DE ITEM — substitui o booleano `is_produced`, que colide dois a
-- dois: insumo e revenda são `false`; semiacabado e produto_acabado são
-- `true`. Ver seção "ITEM" de estrutura-estoque-pop9.md.
--
-- `is_produced` NÃO é removido: fica como está, e um trigger mantém os dois
-- em sincronia, para não quebrar nenhum código (StockTab.tsx,
-- useStockData.ts) que ainda lê/grava `is_produced` diretamente. Migrar o
-- frontend para `item_type` é incremental, não um corte único.
alter table public.raw_materials
  add column if not exists item_type text
    check (item_type in ('insumo', 'semiacabado', 'produto_acabado', 'revenda'));

alter table public.raw_materials
  add column if not exists categoria text;

-- backfill: reclassifica o que já existe. Todo `is_produced = true` vira
-- 'semiacabado' por padrão — é a suposição mais segura (pode ser refinado
-- item a item depois; nenhum dado é perdido, só uma classificação inicial).
update public.raw_materials
  set item_type = case when is_produced then 'semiacabado' else 'insumo' end
  where item_type is null;

create or replace function public.sync_raw_material_item_type()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.item_type is null then
      new.item_type := case when new.is_produced then 'semiacabado' else 'insumo' end;
    else
      new.is_produced := new.item_type in ('semiacabado', 'produto_acabado');
    end if;
    return new;
  end if;

  -- UPDATE: qual coluna a chamada mudou de verdade manda na outra. Sem essa
  -- checagem, um UPDATE que só toca `is_produced` (código antigo, ainda não
  -- migrado para item_type) seria silenciosamente revertido pelo item_type
  -- antigo da linha.
  if new.item_type is distinct from old.item_type then
    new.is_produced := new.item_type in ('semiacabado', 'produto_acabado');
  elsif new.is_produced is distinct from old.is_produced then
    new.item_type := case when new.is_produced then 'semiacabado' else 'insumo' end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_raw_material_item_type on public.raw_materials;
create trigger trg_sync_raw_material_item_type
  before insert or update on public.raw_materials
  for each row execute function public.sync_raw_material_item_type();

-- 4) FICHA TÉCNICA — três campos novos discutidos no diagrama Stock Core do
-- usuário e no mecanismo do TOTVS (tipo de ficha, perda esperada como meta
-- de planejamento, tempo de produção para alimentar "gargalos" depois).
alter table public.production_recipes
  add column if not exists tipo text
    check (tipo in ('producao', 'mise_en_place', 'porcionamento'))
    default 'producao';

alter table public.production_recipes
  add column if not exists perda_esperada numeric; -- percentual, ex.: 5 = 5%

alter table public.production_recipes
  add column if not exists tempo_producao integer; -- minutos

-- 5) MOTIVO 'transferencia' em stock_movements.reason.
--
-- ⚠️ NÃO EXECUTADO AQUI DE PROPÓSITO. Nenhuma migration do repo cria um
-- CHECK constraint em `stock_movements.reason` — mas isso pode ser só o
-- mesmo schema drift do resto do módulo (constraint criada direto no SQL
-- Editor, sem versionar). Antes de confiar que não existe, rode:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.stock_movements'::regclass AND contype = 'c';
-- Se existir e não incluir 'transferencia', ajuste-a manualmente com o nome
-- real retornado por essa query (não adivinhado aqui). Se não existir,
-- ainda assim vale esperar a Fase de Transferências (item 8 da ordem de
-- construção do estrutura-estoque-pop9.md) para introduzir o valor — criar
-- um motivo antes de existir a tela que o usa só convida dado inconsistente.
