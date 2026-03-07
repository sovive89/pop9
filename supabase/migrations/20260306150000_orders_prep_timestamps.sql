-- Campos para estatísticas de tempo de preparo (modelos estatísticos / previsão de demora)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.preparing_at IS 'Quando o pedido entrou em preparo (status preparing)';
COMMENT ON COLUMN public.orders.ready_at IS 'Quando o pedido ficou pronto (status ready)';
