-- Unir mesas por arrastar-e-soltar: as mesas FICAM JUNTAS no mapa (interseção)
-- até a conta ser fechada.
--
-- Decisão do usuário (07/10/2026): ao arrastar a Mesa 02 sobre a Mesa 05, as
-- duas continuam ocupadas e aparecem como um grupo "02 + 05" com uma conta só.
-- Ao fechar a conta, todas as mesas do grupo ficam livres.
--
-- Modelo: a comanda que fica com a conta guarda em `joined_tables` os números
-- das outras mesas do grupo. Isso permite unir também uma mesa LIVRE (o grupo
-- de clientes cresceu e ocupou a mesa ao lado), que não tem comanda própria.
-- Se a mesa arrastada tinha comanda, ela é absorvida por merge_sessions (já
-- existente: clientes, pedidos e pagamentos vão para a comanda de destino).
--
-- ADITIVA: só adiciona coluna/funções/trigger; merge_sessions continua igual.

-- ---------------------------------------------------------------------------
-- 1. Coluna
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists joined_tables integer[] not null default '{}';

comment on column public.sessions.joined_tables is
  'Números das outras mesas unidas a esta comanda (grupo no mapa). Só vale '
  'enquanto a comanda está ativa; ao fechar, todas as mesas ficam livres.';

-- Trava por (unidade, número da mesa): usada por join_tables e pelo trigger
-- abaixo para que "unir a mesa 02" e "abrir comanda na mesa 02" não passem os
-- dois ao mesmo tempo.
create or replace function public.lock_table_number(p_unit uuid, p_number integer)
returns void
language sql
as $$
  select pg_advisory_xact_lock(hashtext('pop9_table:' || p_unit::text || ':' || p_number::text));
$$;

-- ---------------------------------------------------------------------------
-- 2. Não abre comanda numa mesa que está unida a outra comanda ativa
-- ---------------------------------------------------------------------------
create or replace function public.sessions_block_joined_table()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from 'active'
     or new.business_unit_id is null
     or new.table_number is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.business_unit_id is not distinct from new.business_unit_id
     and old.table_number is not distinct from new.table_number then
    return new;
  end if;

  perform public.lock_table_number(new.business_unit_id, new.table_number);
  if exists (
    select 1 from public.sessions s
    where s.business_unit_id = new.business_unit_id
      and s.status = 'active'
      and s.id <> new.id
      and new.table_number = any(s.joined_tables)
  ) then
    raise exception 'Mesa % está unida a outra mesa: use a conta do grupo', new.table_number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sessions_block_joined_table on public.sessions;
create trigger trg_sessions_block_joined_table
  before insert or update of status, table_number, business_unit_id on public.sessions
  for each row execute function public.sessions_block_joined_table();

-- ---------------------------------------------------------------------------
-- 3. Arquivar mesa: também bloqueia se ela faz parte de um grupo ativo
--    (mesma função de 20261006220000, só acrescenta o `joined_tables`)
-- ---------------------------------------------------------------------------
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
    perform 1 from public.dining_tables where id = new.id for update;
    perform public.lock_table_number(new.business_unit_id, new.number);
    if exists (
      select 1 from public.sessions s
      where s.business_unit_id = new.business_unit_id
        and s.status = 'active'
        and (s.table_number = new.number or new.number = any(s.joined_tables))
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

-- ---------------------------------------------------------------------------
-- 4. Unir uma mesa (livre ou ocupada) à comanda de destino — uma transação
-- ---------------------------------------------------------------------------
create or replace function public.join_tables(p_target uuid, p_table_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid;
  v_target_table integer;
  v_target_joined integer[];
  v_source uuid;
  v_source_joined integer[];
begin
  if auth.uid() is null
     or not (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role)) then
    raise exception 'Sem permissão para unir mesas' using errcode = '42501';
  end if;

  select business_unit_id, table_number, joined_tables
    into v_unit, v_target_table, v_target_joined
  from public.sessions
  where id = p_target and status = 'active'
  for update;
  if not found then
    raise exception 'A mesa de destino precisa ter conta aberta';
  end if;

  if p_table_number = v_target_table or p_table_number = any(v_target_joined) then
    raise exception 'A mesa % já faz parte desta conta', p_table_number;
  end if;

  perform public.lock_table_number(v_unit, p_table_number);

  if exists (
    select 1 from public.dining_tables
    where business_unit_id = v_unit and number = p_table_number and archived_at is not null
  ) then
    raise exception 'Mesa % está arquivada', p_table_number;
  end if;

  if exists (
    select 1 from public.sessions
    where business_unit_id = v_unit and status = 'active'
      and id <> p_target and p_table_number = any(joined_tables)
  ) then
    raise exception 'Mesa % já está unida a outra mesa', p_table_number;
  end if;

  -- Mesa arrastada com conta aberta: a conta dela é absorvida pela de destino,
  -- e as mesas que já estavam unidas a ela vêm junto para o grupo.
  select id, joined_tables into v_source, v_source_joined
  from public.sessions
  where business_unit_id = v_unit and status = 'active' and table_number = p_table_number
  order by started_at
  limit 1;

  if v_source is not null then
    perform public.merge_sessions(v_source, p_target);
  end if;

  update public.sessions
     set joined_tables = (
       select coalesce(array_agg(distinct n order by n), '{}')
       from unnest(joined_tables || p_table_number || coalesce(v_source_joined, '{}')) as n
       where n <> v_target_table
     )
   where id = p_target;
end;
$$;

revoke all on function public.join_tables(uuid, integer) from public;
grant execute on function public.join_tables(uuid, integer) to authenticated;
