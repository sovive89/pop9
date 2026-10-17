-- A RPC de transferência usa reason='transferencia'. Preserva os motivos
-- operacionais existentes e permite o novo motivo sem reescrever movimentos.
alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements
  add constraint stock_movements_reason_check check (reason in (
    'compra', 'producao_consumo', 'producao_output', 'venda',
    'estorno_cancelamento', 'ajuste', 'perda', 'transferencia'
  ));
