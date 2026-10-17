-- ESTOQUE — lotes/validade, tipo de item e metadados de ficha técnica
--
-- Implementa as melhorias descritas em estrutura-estoque-pop9.md (pilares
-- "Lotes → Validade" e parte de "Produção → Rendimento" do diagrama Stock
-- Core), cruzadas com o mecanismo confirmado do TOTVS Hospitalidade e o
-- controle de lote/validade do Colibri Back Office (ver claude/resumo-pop9.md
-- e claude/spec-estoque-pop9.md no projeto).
--
-- Tudo aditivo. Nada aqui remove ou renomeia coluna existente.
--
-- CORREÇÃO IMPORTANTE (descoberta ao inspecionar o banco real via MCP antes
-- de aplicar): raw_materials JÁ TEM uma coluna `tipo` (enum `item_tipo`,
-- criada pela migration externa `add_item_type_enum` em 07/08, não
-- versionada neste repo até agora) com exatamente os 4 valores que esta
-- migration ia recriar sob o nome `item_type` (text). Criar `item_type` do
-- lado de `tipo` seria duplicar o mesmo conceito com dois nomes — o mesmo
-- tipo de dado redundante que já causou um bug real (a Cerveja Amstel
-- aparecendo como "produzida": o frontend lia `item_type`, que nunca
-- existiu, caindo sempre no fallback via `is_produced`, que estava errado
-- pra esse item). Por isso esta migration usa `tipo` diretamente, não cria
-- `item_type`.
--
-- `is_produced` não é removido nem ignorado: a view `daily_production_closing`
-- filtra por `is_produced = true` de verdade, em produção. Um trigger novo
-- mantém `is_produced` sempre derivado de `tipo` (fonte única da verdade).

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

-- 3) `tipo` (enum item_tipo) já existe — só adiciona `categoria` e a
-- sincronia com `is_produced` (fonte única da verdade passa a ser `tipo`).
alter table public.raw_materials
  add column if not exists categoria text;

create or replace function public.sync_raw_material_is_produced()
returns trigger
language plpgsql
as $$
begin
  -- tipo é not null com default, então sempre há um valor pra derivar —
  -- não precisa da lógica "qual mudou primeiro" que item_type/is_produced
  -- exigiria se fossem dois campos igualmente opcionais.
  new.is_produced := new.tipo in ('semiacabado', 'produto_acabado');
  return new;
end;
$$;

drop trigger if exists trg_sync_raw_material_is_produced on public.raw_materials;
create trigger trg_sync_raw_material_is_produced
  before insert or update on public.raw_materials
  for each row execute function public.sync_raw_material_is_produced();

-- aplica a sincronia imediatamente nas linhas existentes, pra corrigir
-- qualquer divergência acumulada antes deste trigger existir.
update public.raw_materials
  set is_produced = (tipo in ('semiacabado', 'produto_acabado'));

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
