-- Habilita Realtime na tabela order_items (KDS recebe atualizações de itens ao vivo).
-- Já aplicada no banco remoto (versão 20260328000000); este arquivo sincroniza o repositório
-- para ambientes recriados do zero. Idempotente: não falha se a tabela já estiver na publicação.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;
