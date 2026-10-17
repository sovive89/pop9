-- Novos usuários recebem a unidade explicitamente no manage-user.
-- Recupera permissões legadas somente quando há uma única unidade ativa:
-- com várias unidades não é seguro escolher um vínculo automaticamente.
do $$
declare
  v_unit uuid;
begin
  if (select count(*) from public.business_units where active) = 1 then
    select id into v_unit from public.business_units where active;
    update public.user_roles set business_unit_id = v_unit
    where business_unit_id is null;
  end if;
end;
$$;

-- Numeração atômica por unidade. A linha da unidade serializa criações
-- concorrentes; mesas arquivadas continuam reservando seus números.
create or replace function public.create_dining_table(p_business_unit_id uuid)
returns public.dining_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
  v_table public.dining_tables%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text = 'admin'
      and (ur.business_unit_id = p_business_unit_id or ur.business_unit_id is null)
  ) then
    raise exception 'Sem permissão para criar mesa nesta unidade' using errcode = '42501';
  end if;

  perform 1 from public.business_units
  where id = p_business_unit_id and active for update;
  if not found then
    raise exception 'Unidade inválida ou inativa';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
  from public.dining_tables where business_unit_id = p_business_unit_id;

  insert into public.dining_tables (business_unit_id, number)
  values (p_business_unit_id, v_number) returning * into v_table;

  update public.business_units set table_count = v_number
  where id = p_business_unit_id;
  return v_table;
end;
$$;
revoke all on function public.create_dining_table(uuid) from public, anon;
grant execute on function public.create_dining_table(uuid) to authenticated;

-- Reaplica a versão corrigida também em bancos com a função já instalada.
-- Transactional lot edits and cancellations. History is never physically deleted.
-- Only unit-scoped admins can mutate purchase lots.
create or replace function public.manage_purchase_lot(
  p_lote_id uuid, p_action text, p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_lote public.lotes%rowtype;
  v_entry public.stock_movements%rowtype;
  v_qty numeric;
  v_purchased numeric;
  v_factor numeric;
  v_total numeric;
  v_consumed numeric;
  v_delta numeric;
  v_cost numeric;
  v_average numeric;
begin
  select * into v_lote from public.lotes where id = p_lote_id for update;
  if not found or v_lote.origem <> 'compra' or v_lote.cancelado_em is not null then
    raise exception 'Lote de compra não encontrado ou cancelado';
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text = 'admin'
      and (ur.business_unit_id = v_lote.business_unit_id or ur.business_unit_id is null)
  ) then
    raise exception 'Sem permissão para alterar lote';
  end if;
  select * into v_entry from public.stock_movements
    where lote_id = p_lote_id and type = 'entrada' and reason = 'compra'
    order by created_at limit 1 for update;
  if not found then raise exception 'Entrada original não localizada'; end if;
  select coalesce(sum(quantity),0) into v_consumed from public.stock_movements
    where lote_id = p_lote_id and type = 'saida'
      and reference_type is distinct from 'lote_correcao';
  v_consumed := v_consumed + (
    select coalesce(sum(quantity_used),0) from public.production_batch_inputs where lote_id = p_lote_id
  );
  if p_action = 'cancel' then
    if v_consumed > 0 then raise exception 'Lote consumido: cancelamento indisponível; faça ajuste supervisionado'; end if;
    v_delta := -v_lote.quantidade_entrada;
    update public.lotes set cancelado_em = now() where id = p_lote_id;
  elsif p_action = 'edit' then
    v_purchased := (p_data->>'quantidade_compra')::numeric;
    v_factor := (p_data->>'fator_conversao')::numeric;
    v_qty := v_purchased * v_factor;
    v_total := nullif(p_data->>'custo_total','')::numeric;
    if v_purchased is null or v_purchased <= 0 or v_factor is null or v_factor <= 0 or
       v_qty <= 0 or v_total < 0 or nullif(trim(p_data->>'unidade_compra'),'') is null then
      raise exception 'Quantidade, conversão, unidade ou custo inválidos';
    end if;
    if v_consumed > 0 and v_qty <> v_lote.quantidade_entrada then
      raise exception 'Lote consumido: quantidade não pode ser alterada';
    end if;
    v_delta := v_qty - v_lote.quantidade_entrada;
    v_cost := case when v_total is null then null else v_total / v_qty end;
    update public.lotes set
      numero_lote = coalesce(nullif(trim(p_data->>'numero_lote'),''), numero_lote),
      quantidade_entrada = v_qty,
      unidade_compra = p_data->>'unidade_compra',
      quantidade_compra = v_purchased,
      fator_conversao = v_factor,
      custo_total = v_total,
      preco_unitario = v_cost,
      fornecedor_id = nullif(p_data->>'fornecedor_id','')::uuid,
      validade = nullif(p_data->>'validade','')::date,
      caixas = nullif(p_data->>'caixas','')::numeric,
      conteudo_por_caixa = nullif(p_data->>'conteudo_por_caixa','')::numeric
    where id = p_lote_id;
  else
    raise exception 'Ação desconhecida';
  end if;
  if v_delta <> 0 then
    insert into public.stock_movements
      (raw_material_id,type,quantity,reason,lote_id,created_by,business_unit_id,reference_id,reference_type)
    values
      (v_lote.raw_material_id,case when v_delta > 0 then 'entrada' else 'saida' end,
       abs(v_delta),'ajuste',p_lote_id,auth.uid(),v_lote.business_unit_id,v_entry.id,'lote_correcao');
  end if;
  -- Revalue only the remaining, traceable purchase inventory; never rewrite
  -- historical movement costs. Keep previous average if none can be valued.
  select sum(greatest(0, l.quantidade_entrada - coalesce(c.consumed,0)) * l.preco_unitario)
       / nullif(sum(case when l.preco_unitario is not null
              then greatest(0,l.quantidade_entrada - coalesce(c.consumed,0)) else 0 end),0)
    into v_average
  from public.lotes l
  left join lateral (
    select
      (select coalesce(sum(sm.quantity),0) from public.stock_movements sm
       where sm.lote_id=l.id and sm.type='saida' and sm.reference_type is distinct from 'lote_correcao')
      + (select coalesce(sum(pi.quantity_used),0) from public.production_batch_inputs pi
         where pi.lote_id=l.id) as consumed
  ) c on true
  where l.raw_material_id=v_lote.raw_material_id
    and l.business_unit_id=v_lote.business_unit_id
    and l.cancelado_em is null and l.origem='compra';
  if v_average is not null then
    update public.raw_materials set average_cost=v_average, updated_at=now()
    where id=v_lote.raw_material_id and business_unit_id=v_lote.business_unit_id;
  end if;
end;
$$;
revoke all on function public.manage_purchase_lot(uuid,text,jsonb) from public;
grant execute on function public.manage_purchase_lot(uuid,text,jsonb) to authenticated;
