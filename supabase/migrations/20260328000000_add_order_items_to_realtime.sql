-- Adiciona order_items à publicação do Realtime para que o KDS receba
-- atualizações em tempo real de itens individuais.
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
