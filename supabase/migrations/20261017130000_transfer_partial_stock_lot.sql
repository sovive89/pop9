-- Transferência parcial e auditável de saldo entre unidades.
-- Não altera o lote de origem; registra saída, lote derivado no destino e entrada.
create table if not exists public.stock_transfers (
  id uuid primary key,
  source_business_unit_id uuid not null references public.business_units(id),
  target_business_unit_id uuid not null references public.business_units(id),
  source_raw_material_id uuid not null references public.raw_materials(id),
  target_raw_material_id uuid not null references public.raw_materials(id),
  source_lote_id uuid not null references public.lotes(id),
  quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
  unit_cost numeric check (unit_cost is null or (unit_cost >= 0 and unit_cost < 'Infinity'::numeric)),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint stock_transfers_distinct_units check (source_business_unit_id <> target_business_unit_id)
);

alter table public.stock_transfers enable row level security;
create policy stock_transfers_admin_read on public.stock_transfers
  for select to authenticated using (
    exists (select 1 from public.user_roles ur where ur.user_id=auth.uid()
      and ur.role::text='admin'
      and ur.business_unit_id in (source_business_unit_id,target_business_unit_id))
  );
grant select on public.stock_transfers to authenticated;
revoke insert, update, delete on public.stock_transfers from public, anon, authenticated;

alter table public.lotes
  add column if not exists transfer_id uuid references public.stock_transfers(id),
  add column if not exists source_lote_id uuid references public.lotes(id);
create unique index if not exists lotes_transfer_id_unique on public.lotes(transfer_id) where transfer_id is not null;
alter table public.lotes drop constraint if exists lotes_origem_check;
alter table public.lotes add constraint lotes_origem_check
  check (origem in ('compra','producao','transferencia'));
alter table public.lotes drop constraint if exists lotes_transfer_fields_consistent;
alter table public.lotes add constraint lotes_transfer_fields_consistent check (
  (origem='transferencia' and transfer_id is not null and source_lote_id is not null)
  or (origem<>'transferencia' and transfer_id is null and source_lote_id is null)
);

create index if not exists stock_transfers_source_unit_created
  on public.stock_transfers(source_business_unit_id,created_at desc);
create index if not exists stock_transfers_target_unit_created
  on public.stock_transfers(target_business_unit_id,created_at desc);

-- A entrada inicial do lote transferido já está representada por quantidade_entrada.
-- Ela atualiza current_stock, mas não deve dobrar o saldo calculado do lote.
create or replace function ops_private.lot_remaining(p_lote uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select l.quantidade_entrada - coalesce(sum(
    case when sm.reason='transferencia' and sm.type='entrada' then 0
         when sm.type='saida' then sm.quantity else -sm.quantity end),0)
  from public.lotes l left join public.stock_movements sm on sm.lote_id=l.id
    and sm.reference_type is distinct from 'lote_correcao'
    and sm.reason not in ('compra','producao_output')
  where l.id=p_lote group by l.id;
$$;
revoke all on function ops_private.lot_remaining(uuid) from public,anon,authenticated;

-- drop + create (não create or replace): a ordem das colunas da view diverge entre o
-- histórico do repositório (business_unit_id 2ª coluna) e produção/QA (13ª coluna), e
-- create or replace view não aceita reordenar colunas. Nenhuma view depende desta.
drop view if exists public.stock_lot_balances;
create view public.stock_lot_balances with (security_invoker=true) as
select l.id,l.business_unit_id,l.raw_material_id,l.numero_lote,l.origem,l.quantidade_entrada,
  l.validade,l.data_entrada,l.created_at,l.fornecedor_id,l.preco_unitario,l.receita_id,l.batch_id,
  l.unidade_compra,l.quantidade_compra,l.fator_conversao,l.custo_total,l.caixas,l.conteudo_por_caixa,
  l.cancelado_em,l.quantidade_entrada - coalesce(m.consumed,0) as quantidade_restante
from public.lotes l left join lateral (
  select sum(case when sm.reason='transferencia' and sm.type='entrada' then 0
                  when sm.type='saida' then sm.quantity else -sm.quantity end) consumed
  from public.stock_movements sm where sm.lote_id=l.id
    and sm.business_unit_id=l.business_unit_id
    and sm.reference_type is distinct from 'lote_correcao'
    and sm.reason not in ('compra','producao_output')
) m on true;
grant select on public.stock_lot_balances to authenticated;
revoke all on public.stock_lot_balances from anon;

create or replace function public.transfer_stock_lot(
  p_transfer_id uuid,
  p_source_lote_id uuid,
  p_target_unit_id uuid,
  p_target_raw_material_id uuid,
  p_quantity numeric
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_source_lot public.lotes%rowtype;
  v_source_raw public.raw_materials%rowtype;
  v_target_raw public.raw_materials%rowtype;
  v_transfer public.stock_transfers%rowtype;
  v_target_lot uuid;
  v_remaining numeric;
  v_role_count integer;
  v_source_unit uuid;
  v_created_by uuid:=auth.uid();
  v_lot_number text;
begin
  if v_created_by is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if p_transfer_id is null or p_source_lote_id is null or p_target_unit_id is null
    or p_target_raw_material_id is null or p_quantity is null or p_quantity<=0
    or p_quantity>='Infinity'::numeric then raise exception 'Dados de transferência inválidos'; end if;

  select business_unit_id into v_source_unit from public.lotes where id=p_source_lote_id;
  if v_source_unit is null then raise exception 'Lote de origem não encontrado'; end if;
  if v_source_unit=p_target_unit_id then raise exception 'Origem e destino devem ser unidades diferentes'; end if;
  -- Exige vínculo de admin explícito em ambas as unidades; papel global/null não autoriza transferência.
  select count(distinct business_unit_id) into v_role_count from public.user_roles
    where user_id=v_created_by and role::text='admin'
      and business_unit_id in (v_source_unit,p_target_unit_id);
  if v_role_count<2 then raise exception 'É necessário ser admin nas unidades de origem e destino' using errcode='42501'; end if;
  if not exists(select 1 from public.business_units where id=v_source_unit and active)
    or not exists(select 1 from public.business_units where id=p_target_unit_id and active) then
    raise exception 'Unidade de origem ou destino inativa'; end if;

  -- Só depois de confirmar a autorização é permitido responder a retries.
  perform pg_advisory_xact_lock(hashtextextended(p_transfer_id::text,0));
  select * into v_transfer from public.stock_transfers where id=p_transfer_id;
  if found then
    if v_transfer.source_business_unit_id<>v_source_unit or v_transfer.source_lote_id<>p_source_lote_id
      or v_transfer.target_business_unit_id<>p_target_unit_id
      or v_transfer.target_raw_material_id<>p_target_raw_material_id or v_transfer.quantity<>p_quantity
      or v_transfer.created_by<>v_created_by then raise exception 'ID de transferência reutilizado com dados diferentes'; end if;
    select id into v_target_lot from public.lotes where transfer_id=p_transfer_id;
    if v_target_lot is null then raise exception 'Transferência registrada sem lote de destino'; end if;
    return v_target_lot;
  end if;

  -- Ordem estável para evitar deadlock em transferências simultâneas A->B e B->A.
  perform 1 from public.raw_materials
    where id in (select raw_material_id from public.lotes where id=p_source_lote_id union select p_target_raw_material_id)
    order by id for update;

  select * into v_source_lot from public.lotes where id=p_source_lote_id for update;
  if not found or v_source_lot.business_unit_id<>v_source_unit or v_source_lot.cancelado_em is not null then
    raise exception 'Lote de origem inexistente ou cancelado'; end if;
  select * into v_source_raw from public.raw_materials
    where id=v_source_lot.raw_material_id and business_unit_id=v_source_unit and active;
  if not found then raise exception 'Insumo de origem inativo ou inválido'; end if;
  select * into v_target_raw from public.raw_materials
    where id=p_target_raw_material_id and business_unit_id=p_target_unit_id and active;
  if not found then raise exception 'Insumo de destino inativo ou inválido'; end if;
  if lower(trim(v_source_raw.name))<>lower(trim(v_target_raw.name))
    or lower(trim(v_source_raw.unit))<>lower(trim(v_target_raw.unit))
    or v_source_raw.tipo<>v_target_raw.tipo then
    raise exception 'O destino precisa ser o insumo correspondente, com mesmo nome, tipo e unidade-base'; end if;
  if v_source_lot.validade is not null and v_source_lot.validade<current_date then
    raise exception 'Não é permitido transferir lote vencido'; end if;

  v_remaining:=ops_private.lot_remaining(p_source_lote_id);
  if v_remaining is null or v_remaining<=0 or p_quantity>v_remaining then
    raise exception 'Quantidade excede o saldo disponível do lote'; end if;
  if v_source_raw.current_stock<p_quantity then raise exception 'Saldo agregado insuficiente na unidade de origem'; end if;

  v_target_lot:=gen_random_uuid();
  insert into public.stock_transfers(id,source_business_unit_id,target_business_unit_id,
    source_raw_material_id,target_raw_material_id,source_lote_id,quantity,unit_cost,created_by)
  values(p_transfer_id,v_source_unit,p_target_unit_id,v_source_raw.id,v_target_raw.id,
    p_source_lote_id,p_quantity,v_source_lot.preco_unitario,v_created_by);

  v_lot_number:='TRF-'||left(replace(p_transfer_id::text,'-',''),12)||'-'||left(v_source_lot.numero_lote,60);
  insert into public.lotes(id,business_unit_id,raw_material_id,numero_lote,origem,quantidade_entrada,
    validade,preco_unitario,custo_total,data_entrada,transfer_id,source_lote_id)
  values(v_target_lot,p_target_unit_id,v_target_raw.id,v_lot_number,'transferencia',p_quantity,
    v_source_lot.validade,v_source_lot.preco_unitario,
    case when v_source_lot.preco_unitario is null then null else p_quantity*v_source_lot.preco_unitario end,
    now(),p_transfer_id,v_source_lot.id);

  insert into public.stock_movements(raw_material_id,business_unit_id,type,quantity,reason,
    lote_id,reference_type,reference_id,unit_cost,created_by)
  values(v_source_raw.id,v_source_unit,'saida',p_quantity,'transferencia',p_source_lote_id,
    'stock_transfer',p_transfer_id,v_source_lot.preco_unitario,v_created_by);
  insert into public.stock_movements(raw_material_id,business_unit_id,type,quantity,reason,
    lote_id,reference_type,reference_id,unit_cost,created_by)
  values(v_target_raw.id,p_target_unit_id,'entrada',p_quantity,'transferencia',v_target_lot,
    'stock_transfer',p_transfer_id,v_source_lot.preco_unitario,v_created_by);

  return v_target_lot;
end $$;
revoke all on function public.transfer_stock_lot(uuid,uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.transfer_stock_lot(uuid,uuid,uuid,uuid,numeric) to authenticated;
