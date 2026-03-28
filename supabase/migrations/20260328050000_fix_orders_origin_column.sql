-- Re-apply origin column in case it was missing after remote_schema migration
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'mesa' CHECK (origin IN ('mesa', 'pwa'));

COMMENT ON COLUMN public.orders.origin IS 'mesa = atendimento na mesa; pwa = delivery/pedido via link (WhatsApp, app)';
