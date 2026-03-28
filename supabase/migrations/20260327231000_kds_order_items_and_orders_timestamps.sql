-- KDS: adiciona campos de rastreamento de tempo e reserva de itens
-- order_items: claimed_by, claimed_at (quem reservou o item para preparo), ready_quantity
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_quantity INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_items.claimed_by IS 'Usuário que reservou o item para preparo';
COMMENT ON COLUMN public.order_items.claimed_at IS 'Quando o item foi reservado';
COMMENT ON COLUMN public.order_items.ready_quantity IS 'Quantidade já pronta deste item (cozinha)';
