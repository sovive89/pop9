-- Lugares por mesa + união de mesas (só visual).
--
-- Depende de 20261006220000_table_areas_and_dining_tables.sql (dining_tables).
--
-- Decisões do usuário (07/10/2026), que substituem a "união = juntar contas"
-- da versão anterior:
--   * Unir mesas é SÓ VISUAL: as mesas aparecem coladas no mapa, com uma leve
--     sobreposição translúcida na divisão, e a soma de lugares do grupo
--     aparece no mapa.
--   * Comandas NUNCA se juntam: cada comanda continua presa à sua mesa (e ao
--     QR Code dela, table_qr_codes.table_number). Unir ou separar não mexe em
--     sessions, orders nem payments.
--   * O número de lugares (cadeiras) de cada mesa é definido na edição.
--
-- Modelo: mesas com o mesmo dining_tables.group_id estão unidas. Não há
-- tabela de grupos — o grupo não tem dado próprio além de "quem está junto".
-- Uma mesa só entra num grupo novo se não estiver em outro; para aumentar um
-- grupo, separa e une de novo.

-- ---------------------------------------------------------------------------
-- 0. Remove a união por "juntar contas" da versão anterior (se foi aplicada)
-- ---------------------------------------------------------------------------
-- e também a variante "arrastar = juntar contas" (sessions.joined_tables),
-- caso a migration 20261007090000_joined_tables tenha sido aplicada.
drop trigger if exists trg_sessions_block_joined_table on public.sessions;
drop function if exists public.sessions_block_joined_table();
drop function if exists public.join_tables(uuid, integer);
drop function if exists public.lock_table_number(uuid, integer);
drop function if exists public.merge_sessions(uuid, uuid);
alter table public.sessions drop column if exists joined_tables;
alter table public.sessions drop column if exists merged_into;

-- ---------------------------------------------------------------------------
-- 1. Lugares e grupo
-- ---------------------------------------------------------------------------
alter table public.dining_tables
  add column if not exists seats integer not null default 4
    check (seats between 1 and 99);

alter table public.dining_tables
  add column if not exists group_id uuid;

comment on column public.dining_tables.group_id is
  'Mesas com o mesmo group_id estão unidas no mapa (só visual). Comandas '
  'continuam separadas, uma por mesa.';

create index if not exists idx_dining_tables_group
  on public.dining_tables (group_id) where group_id is not null;

-- Trava de integridade de dining_tables (mesma de 20261006220000), restaurada
-- aqui porque a variante joined_tables a substituía por uma que lia
-- sessions.joined_tables (coluna removida acima). Única mudança: ao arquivar,
-- a mesa também sai do grupo de mesas unidas.
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
    -- mesa arquivada sai do grupo de mesas unidas
    new.group_id := null;
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
-- 2. Unir / separar
-- ---------------------------------------------------------------------------
-- Funções (e não updates soltos no front) porque o garçom precisa unir mesas
-- no dia a dia, mas não deve poder editar dining_tables à vontade (a RLS
-- dessa tabela só deixa admin gravar). A checagem de papel fica aqui dentro.
create or replace function public.join_tables(p_table_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_found integer;
  v_units integer;
  v_unavailable integer;
  v_group uuid := gen_random_uuid();
begin
  if auth.uid() is null
     or not (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role)) then
    raise exception 'Sem permissão para unir mesas' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_table_ids) as x;
  if coalesce(cardinality(v_ids), 0) < 2 then
    raise exception 'Escolha pelo menos duas mesas';
  end if;

  -- trava as mesas (ordem fixa por id, evita deadlock)
  perform 1 from public.dining_tables where id = any(v_ids) order by id for update;

  select count(*),
         count(distinct business_unit_id),
         count(*) filter (where group_id is not null or archived_at is not null)
    into v_found, v_units, v_unavailable
  from public.dining_tables
  where id = any(v_ids);

  if v_found <> cardinality(v_ids) or v_units <> 1 then
    raise exception 'Mesas inválidas para unir';
  end if;
  if v_unavailable > 0 then
    raise exception 'Alguma mesa já está unida a outras (ou arquivada): separe antes de unir de novo';
  end if;

  update public.dining_tables set group_id = v_group where id = any(v_ids);
  return v_group;
end;
$$;

create or replace function public.split_table_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role)) then
    raise exception 'Sem permissão para separar mesas' using errcode = '42501';
  end if;

  update public.dining_tables set group_id = null where group_id = p_group_id;
end;
$$;

revoke all on function public.join_tables(uuid[]) from public;
revoke all on function public.split_table_group(uuid) from public;
grant execute on function public.join_tables(uuid[]) to authenticated;
grant execute on function public.split_table_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tempo real: quando um garçom une/separa, os outros aparelhos atualizam
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.dining_tables;
exception when duplicate_object or undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.table_areas;
exception when duplicate_object or undefined_object then null;
end $$;
