-- Adiciona campos de troco para pagamentos em dinheiro
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cash_received NUMERIC,
  ADD COLUMN IF NOT EXISTS change_given NUMERIC;

COMMENT ON COLUMN public.payments.cash_received IS 'Valor recebido em dinheiro pelo cliente';
COMMENT ON COLUMN public.payments.change_given IS 'Troco devolvido ao cliente';
