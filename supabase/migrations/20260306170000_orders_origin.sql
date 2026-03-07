-- Origem do pedido: mesa (padrão) ou pwa/delivery (link WhatsApp, app cliente)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'mesa' CHECK (origin IN ('mesa', 'pwa'));

COMMENT ON COLUMN public.orders.origin IS 'mesa = atendimento na mesa; pwa = delivery/pedido via link (WhatsApp, app)';
