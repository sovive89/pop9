-- order_items precisa estar na publicação realtime para que o KDS
-- receba atualizações de ready_quantity, claimed_by etc. em tempo real.
-- Sem isso, .on("postgres_changes", { table: "order_items" }) nunca dispara.
-- Conteúdo idêntico ao aplicado no histórico remoto do Supabase (versão 20260328000000).
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
