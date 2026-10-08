-- FEFO de verdade: liga o consumo de insumo na produção ao lote específico
-- de onde ele saiu, em vez de só debitar a quantidade total do insumo.
--
-- Contexto (ver estrutura-estoque-pop9.md, pilar "Lotes → Validade"): a
-- migration 20260828041000 criou a tabela `lotes` e o índice
-- idx_lotes_fefo, mas até agora ninguém no código realmente ESCOLHE os
-- lotes em ordem de validade ao consumir — só existia rastreio de entrada
-- (compra e produção), não de qual lote foi consumido em qual produção.
--
-- Por que não usar stock_movements.lote_id (que já existe) para isso: não
-- sabemos se algum trigger já existente reage a um INSERT em
-- stock_movements para decrementar raw_materials.current_stock/average_cost
-- (a baseline já registra essa incerteza). Inserir manualmente uma
-- movimentação 'saida' de produção aqui arriscaria descontar o estoque
-- duas vezes, se esse trigger (desconhecido) também reagir à inserção de
-- production_batch_inputs. Por isso o FEFO de produção liga o consumo
-- direto em production_batch_inputs (tabela que a aplicação já controla
-- 100% do início ao fim), sem tocar em stock_movements — aditivo e sem
-- risco de dupla contagem.
alter table public.production_batch_inputs
  add column if not exists lote_id uuid references public.lotes(id);

create index if not exists idx_production_batch_inputs_lote
  on public.production_batch_inputs (lote_id);
