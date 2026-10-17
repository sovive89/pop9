-- KDS / Cozinha: garante colunas usadas por Kitchen.tsx em projetos onde migrations antigas não rodaram.
-- Seguro para reexecutar (IF NOT EXISTS).
-- Conteúdo idêntico ao aplicado no histórico remoto do Supabase (versão 20260327231000).

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS ready_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz DEFAULT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preparing_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

COMMENT ON COLUMN public.order_items.ready_quantity IS 'Quantidade já pronta deste item (cozinha)';
COMMENT ON COLUMN public.order_items.claimed_by IS 'Usuário que reservou o item para preparo';
COMMENT ON COLUMN public.order_items.claimed_at IS 'Quando o item foi reservado';
