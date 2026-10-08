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
    where lote_id = p_lote_id and type = 'saida';
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
end;
$$;
revoke all on function public.manage_purchase_lot(uuid,text,jsonb) from public;
grant execute on function public.manage_purchase_lot(uuid,text,jsonb) to authenticated;
