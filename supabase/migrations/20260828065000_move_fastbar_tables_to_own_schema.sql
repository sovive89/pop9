-- As tabelas bar_products, bar_sessions, bar_tab_items, fastbar_customers,
-- fastbar_products, fastbar_sessions, fastbar_stock_movements e
-- fastbar_tab_items nunca deveriam ter existido neste banco (pop9) —
-- pertencem ao fast_bar, um app completamente diferente que por engano
-- teve suas migrations aplicadas neste mesmo projeto Supabase em algum
-- momento (descoberto ao inspecionar o banco real via MCP, comparando com
-- a lista de tabelas esperadas do pop9).
--
-- fastbar_products tinha 12 linhas de dado real; as outras 7 estavam
-- vazias (confirmado antes de mexer). Decisão: mover pro schema `fastbar`
-- em vez de apagar — preserva o dado, resolve a mistura de namespace.
-- Todas as FKs entre essas 8 tabelas ficam contidas dentro do próprio
-- grupo (confirmado via information_schema antes de mover), então mover
-- o grupo inteiro junto não quebra nenhuma referência.
create schema if not exists fastbar;

alter table public.bar_products set schema fastbar;
alter table public.bar_sessions set schema fastbar;
alter table public.bar_tab_items set schema fastbar;
alter table public.fastbar_customers set schema fastbar;
alter table public.fastbar_products set schema fastbar;
alter table public.fastbar_sessions set schema fastbar;
alter table public.fastbar_stock_movements set schema fastbar;
alter table public.fastbar_tab_items set schema fastbar;
