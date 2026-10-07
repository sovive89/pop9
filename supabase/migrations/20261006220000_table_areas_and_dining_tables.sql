-- Mesas como registros de verdade: áreas com cor, arquivar mesa, unir contas.
--
-- Contexto (confirmado lendo o código, não só types.ts): até aqui uma "mesa"
-- não existia no banco. business_units.table_count = 12 significava "mesas 1
-- a 12", sessions.table_number guarda só o número e o mapa
-- (src/components/TableMap.tsx) desenhava Array.from({ length: tableCount }).
-- O mapa não lia nenhuma tabela de mesas ou zonas com cor (as zonas de
-- useTableZones.ts vinham de um fallback hardcoded). Com só um número não dá para ter cor
-- por área, apagar a mesa 5 de 12, nem lembrar que uma mesa foi arquivada.
--
-- Esta migration é ADITIVA: nada existente é removido ou alterado em
-- comportamento. business_units.table_count continua existindo (o QrCodesTab
-- ainda lê dele) e o app o mantém sincronizado.
--
-- Decisões do usuário (06/10/2026):
--   * Deletar mesa = ARQUIVAR (archived_at). O histórico de vendas e os
--     relatórios que apontam para sessions.table_number continuam intactos.
--     O número de uma mesa arquivada NÃO é reaproveitado (índice único
--     considera arquivadas), para o histórico não se misturar.
--   * Unir mesas = juntar as contas: clientes, pedidos e pagamentos da
--     comanda de origem vão para a de destino, e a de origem é encerrada.

-- ---------------------------------------------------------------------------
-- 1. Áreas (nome + cor + legenda)
-- ---------------------------------------------------------------------------
create table if not exists public.table_areas (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id),
  name text not null,
  color text not null default '#f97316'
    check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_table_areas_unit_name
  on public.table_areas (business_unit_id, lower(name));

-- ---------------------------------------------------------------------------
-- 2. Mesas
-- ---------------------------------------------------------------------------
create table if not exists public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id),
  number integer not null check (number > 0),
  -- apagar uma área não apaga mesas: elas só voltam a ficar "sem área"
  area_id uuid references public.table_areas(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- único mesmo entre arquivadas: número arquivado não volta a ser usado
create unique index if not exists uq_dining_tables_unit_number
  on public.dining_tables (business_unit_id, number);

create index if not exists idx_dining_tables_area
  on public.dining_tables (area_id);

-- Backfill: cria as mesas 1..table_count de cada unidade ativa (3 quando a
-- unidade ainda não tem table_count, igual ao DEFAULT_TABLE_COUNT do app).
-- Pode ser rodado de novo sem duplicar.
insert into public.dining_tables (business_unit_id, number)
select bu.id, n
from public.business_units bu
cross join lateral generate_series(1, coalesce(bu.table_count, 3)) as n
where bu.active
on conflict (business_unit_id, number) do nothing;

-- ---------------------------------------------------------------------------
-- 2b. Regras de integridade (no banco, para valer mesmo com chamadas concorrentes)
-- ---------------------------------------------------------------------------
-- (a) a área precisa ser da mesma unidade da mesa;
-- (b) não arquiva mesa com comanda aberta;
-- (c) ao arquivar, desativa o QR Code da mesa (senão o QR antigo abriria
--     comanda numa mesa que saiu do mapa).
create or replace function public.dining_tables_guard()
returns trigger
language plpgsql
as $$
begin
  if new.area_id is not null and not exists (
    select 1 from public.table_areas a
    where a.id = new.area_id and a.business_unit_id = new.business_unit_id
  ) then
    raise exception 'A área precisa ser da mesma unidade da mesa';
  end if;

  if tg_op = 'UPDATE' and old.archived_at is null and new.archived_at is not null then
    -- espera quem estiver abrindo comanda nesta mesa (ver sessions_block_archived_table)
    perform 1 from public.dining_tables where id = new.id for update;
    if exists (
      select 1 from public.sessions s
      where s.business_unit_id = new.business_unit_id
        and s.table_number = new.number
        and s.status = 'active'
    ) then
      raise exception 'Mesa % tem conta aberta: feche a conta antes de arquivar', new.number;
    end if;
    update public.table_qr_codes
       set active = false
     where business_unit_id = new.business_unit_id
       and table_number = new.number
       and active;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dining_tables_guard on public.dining_tables;
create trigger trg_dining_tables_guard
  before insert or update on public.dining_tables
  for each row execute function public.dining_tables_guard();

-- Não deixa uma comanda ficar ATIVA em mesa arquivada — ao abrir (insert) nem ao
-- reativar/mover uma comanda existente (update de status, mesa ou unidade). O
-- "for share" serializa com o arquivamento: se a mesa está sendo arquivada agora,
-- espera o commit e então enxerga o arquivamento.
create or replace function public.sessions_block_archived_table()
returns trigger
language plpgsql
as $$
declare
  v_archived timestamptz;
begin
  if new.status is distinct from 'active'
     or new.business_unit_id is null
     or new.table_number is null then
    return new;
  end if;
  -- update que não mexe em status/mesa/unidade (ex.: merged_into) não precisa checar
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.business_unit_id is not distinct from new.business_unit_id
     and old.table_number is not distinct from new.table_number then
    return new;
  end if;
  select archived_at into v_archived
  from public.dining_tables
  where business_unit_id = new.business_unit_id and number = new.table_number
  for share;
  if v_archived is not null then
    raise exception 'Mesa % está arquivada', new.table_number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sessions_block_archived_table on public.sessions;
create trigger trg_sessions_block_archived_table
  before insert or update of status, table_number, business_unit_id on public.sessions
  for each row execute function public.sessions_block_archived_table();

-- ---------------------------------------------------------------------------
-- 3. RLS — mesmo padrão de business_units: admin gerencia, staff lê
-- ---------------------------------------------------------------------------
alter table public.table_areas enable row level security;
alter table public.dining_tables enable row level security;

create policy "Admin manages table_areas"
  on public.table_areas for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can read table_areas"
  on public.table_areas for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));

create policy "Admin manages dining_tables"
  on public.dining_tables for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can read dining_tables"
  on public.dining_tables for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));

-- ---------------------------------------------------------------------------
-- 4. União de contas
-- ---------------------------------------------------------------------------
-- merged_into só registra "esta comanda foi absorvida por aquela" (auditoria).
alter table public.sessions
  add column if not exists merged_into uuid references public.sessions(id);

comment on column public.sessions.merged_into is
  'Preenchido quando a comanda foi encerrada por união de mesas: aponta para '
  'a comanda que absorveu clientes, pedidos e pagamentos desta.';

-- Função única (uma transação): ou move tudo, ou não move nada. Feita no
-- banco em vez de 4 updates soltos no front para (a) não deixar a conta
-- pela metade se a rede cair no meio e (b) não depender de o garçom ter
-- permissão de UPDATE em cada tabela — a checagem de papel é feita aqui.
create or replace function public.merge_sessions(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_units integer;
begin
  if auth.uid() is null
     or not (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role)) then
    raise exception 'Sem permissão para unir mesas' using errcode = '42501';
  end if;

  if p_source = p_target then
    raise exception 'Escolha duas mesas diferentes';
  end if;

  -- trava as duas comandas (ordem fixa por id, evita deadlock)
  perform 1 from public.sessions where id in (p_source, p_target) order by id for update;

  select count(*), count(distinct business_unit_id)
    into v_active, v_units
  from public.sessions
  where id in (p_source, p_target) and status = 'active';

  if v_active <> 2 or v_units <> 1 then
    raise exception 'As duas mesas precisam ter comanda aberta na mesma unidade';
  end if;

  update public.session_clients set session_id = p_target where session_id = p_source;
  update public.orders          set session_id = p_target where session_id = p_source;
  update public.payments        set session_id = p_target where session_id = p_source;

  update public.sessions
     set status = 'closed', ended_at = now(), merged_into = p_target
   where id = p_source;
end;
$$;

revoke all on function public.merge_sessions(uuid, uuid) from public;
grant execute on function public.merge_sessions(uuid, uuid) to authenticated;
