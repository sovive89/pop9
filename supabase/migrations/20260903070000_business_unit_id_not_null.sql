-- Multi-tenant real, passo 1: business_unit_id passa a ser obrigatório
-- nas tabelas "raiz" (não-filhas) do schema.
--
-- Hoje business_unit_id é nullable em quase toda tabela e só
-- table_qr_codes de fato o preenche (confirmado por auditoria de todo
-- src/) — na prática o app roda como se fosse single-tenant. Esta
-- migration NÃO isola acesso por RLS ainda (isso é uma decisão futura,
-- maior) — só backfilla as poucas linhas existentes pra única
-- business_unit ativa hoje e trava a coluna com NOT NULL, forçando
-- todo insert futuro (já ajustado no frontend nesta mesma leva de
-- mudanças) a declarar a unidade.
--
-- payments e session_clients ainda não tinham a coluna (diferente do
-- resto — confirmado antes de escrever esta migration).
alter table public.payments
  add column if not exists business_unit_id uuid references public.business_units(id);

alter table public.session_clients
  add column if not exists business_unit_id uuid references public.business_units(id);

do $$
declare
  active_bu uuid;
begin
  select id into active_bu from public.business_units where active limit 1;

  if active_bu is null then
    raise exception 'Nenhuma business_unit ativa encontrada — não é seguro fazer o backfill sem uma unidade de destino.';
  end if;

  update public.sessions set business_unit_id = active_bu where business_unit_id is null;
  update public.orders set business_unit_id = active_bu where business_unit_id is null;
  update public.payments set business_unit_id = active_bu where business_unit_id is null;
  update public.session_clients set business_unit_id = active_bu where business_unit_id is null;
  update public.menu_items set business_unit_id = active_bu where business_unit_id is null;
  update public.menu_categories set business_unit_id = active_bu where business_unit_id is null;
  update public.raw_materials set business_unit_id = active_bu where business_unit_id is null;
  update public.suppliers set business_unit_id = active_bu where business_unit_id is null;
  update public.lotes set business_unit_id = active_bu where business_unit_id is null;
  update public.stock_movements set business_unit_id = active_bu where business_unit_id is null;
  update public.production_recipes set business_unit_id = active_bu where business_unit_id is null;
  update public.production_batches set business_unit_id = active_bu where business_unit_id is null;
end $$;

alter table public.sessions alter column business_unit_id set not null;
alter table public.orders alter column business_unit_id set not null;
alter table public.payments alter column business_unit_id set not null;
alter table public.session_clients alter column business_unit_id set not null;
alter table public.menu_items alter column business_unit_id set not null;
alter table public.menu_categories alter column business_unit_id set not null;
alter table public.raw_materials alter column business_unit_id set not null;
alter table public.suppliers alter column business_unit_id set not null;
alter table public.lotes alter column business_unit_id set not null;
alter table public.stock_movements alter column business_unit_id set not null;
alter table public.production_recipes alter column business_unit_id set not null;
alter table public.production_batches alter column business_unit_id set not null;
