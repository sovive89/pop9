-- Cardápio ↔ estoque: a ficha técnica passa a ser a fonte única do item vendido.
--
-- Auditoria de 13/10/2026 (banco de produção):
--  * "Registrar compra" falhava: as colunas de lote de compra (20261008180000) nunca
--    foram aplicadas no remoto. Reaplicadas aqui de forma idempotente.
--  * "Registrar produção" falhava: os gatilhos de produção existiam só no banco e
--    gravavam o movimento sem business_unit_id (NOT NULL). Recriados corretamente.
--  * A baixa da venda ignorava "sem X" / "extra X" e não consumia lotes.
--  * Ingredientes exibidos ao cliente (menu_item_ingredients) não tinham ligação
--    com a ficha (recipe_items).
-- Tudo aditivo: nenhuma coluna ou dado existente é removido.

create schema if not exists app_private;

-- 1) Lotes de compra (mesmo conteúdo de 20261008180000, idempotente).
alter table public.lotes
  add column if not exists unidade_compra text,
  add column if not exists quantidade_compra numeric,
  add column if not exists fator_conversao numeric,
  add column if not exists custo_total numeric,
  add column if not exists caixas numeric,
  add column if not exists conteudo_por_caixa numeric,
  add column if not exists cancelado_em timestamptz;

-- 2) Cada linha da ficha diz como aparece para o cliente.
--    display_name nulo = não aparece (ex.: sal, óleo).
--    removable = cliente pode pedir "sem"; aí a linha não baixa.
--    extra_price não nulo = pode ser pedido como adicional; cada adicional baixa a
--    quantidade da linha de novo. only_as_extra = não faz parte do item padrão.
alter table public.recipe_items
  add column if not exists display_name text,
  add column if not exists removable boolean not null default false,
  add column if not exists extra_price numeric,
  add column if not exists only_as_extra boolean not null default false,
  add column if not exists sort_order integer not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recipe_items_customer_flags_check') then
    alter table public.recipe_items add constraint recipe_items_customer_flags_check check (
      (extra_price is null or extra_price >= 0)
      and (display_name is null or length(btrim(display_name)) between 1 and 80)
      and (not removable or display_name is not null)
      and (extra_price is null or display_name is not null)
      and (not only_as_extra or extra_price is not null)
      and not (only_as_extra and removable)
    );
  end if;
end $$;

-- Projeção para o cliente: adicionais que não fazem parte do item padrão.
alter table public.menu_item_ingredients
  add column if not exists extra_only boolean not null default false;

create index if not exists idx_recipe_items_menu_item on public.recipe_items (menu_item_id);
create index if not exists idx_stock_movements_lote on public.stock_movements (lote_id) where lote_id is not null;
create index if not exists idx_production_batch_inputs_lote on public.production_batch_inputs (lote_id) where lote_id is not null;

-- 3) Quanto já saiu de um lote. Mesma conta da tela de lotes:
--    saídas ligadas ao lote (menos correções de lote), menos estornos de cancelamento
--    que voltaram para ele, mais o consumo de produção (production_batch_inputs).
create or replace function app_private.lot_consumed(p_lote uuid)
returns numeric language sql stable set search_path = '' as $$
  select coalesce((
      select sum(case when sm.type = 'saida' then sm.quantity else -sm.quantity end)
      from public.stock_movements sm
      where sm.lote_id = p_lote
        and ((sm.type = 'saida' and sm.reference_type is distinct from 'lote_correcao')
          or (sm.type = 'entrada' and sm.reason = 'estorno_cancelamento'))
    ), 0)
    + coalesce((select sum(pi.quantity_used) from public.production_batch_inputs pi where pi.lote_id = p_lote), 0)
$$;
revoke all on function app_private.lot_consumed(uuid) from public;

-- 4) Saída de estoque por FEFO: o lote que vence primeiro sai primeiro (sem validade
--    por último; empate pela data de entrada). O que não couber em lote rastreado sai
--    sem lote, para nunca travar uma venda.
create or replace function app_private.post_stock_out(
  p_unit uuid, p_material uuid, p_qty numeric, p_reason text, p_ref_type text, p_ref_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_left numeric := p_qty;
  v_take numeric;
  v_lot record;
begin
  if p_qty is null or p_qty <= 0 then return; end if;
  -- Duas vendas simultâneas do mesmo insumo não podem consumir o mesmo saldo de lote.
  perform pg_advisory_xact_lock(hashtextextended('stock_out:' || p_material::text, 0));
  for v_lot in
    select l.id, l.quantidade_entrada - app_private.lot_consumed(l.id) as restante
    from public.lotes l
    where l.raw_material_id = p_material and l.business_unit_id = p_unit and l.cancelado_em is null
    order by l.validade asc nulls last, l.data_entrada asc, l.id
  loop
    exit when v_left <= 0;
    if v_lot.restante > 0 then
      v_take := least(v_lot.restante, v_left);
      insert into public.stock_movements
        (business_unit_id, raw_material_id, type, quantity, reason, reference_type, reference_id, lote_id)
      values (p_unit, p_material, 'saida', v_take, p_reason, p_ref_type, p_ref_id, v_lot.id);
      v_left := v_left - v_take;
    end if;
  end loop;
  if v_left > 0 then
    insert into public.stock_movements
      (business_unit_id, raw_material_id, type, quantity, reason, reference_type, reference_id)
    values (p_unit, p_material, 'saida', v_left, p_reason, p_ref_type, p_ref_id);
  end if;
end;
$$;
revoke all on function app_private.post_stock_out(uuid, uuid, numeric, text, text, uuid) from public;

-- 5) Baixa da venda: respeita "sem X" e "extra X" pelo nome exibido ao cliente.
--    O nome vem de ingredient_mods ([{name, action: 'remove'|'extra'}]), o mesmo que a
--    cozinha e a comanda já mostram. O que foi para a cozinha manda: se a comanda saiu
--    "sem tomate", o tomate não baixa (removable/extra_price controlam o que a tela oferece
--    e quanto custa, não o que a cozinha de fato fez). Linha oculta (sal, óleo) nunca muda.
create or replace function public.order_item_deducts_stock()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  ri record;
  v_unit_id uuid;
  v_mods jsonb;
  v_factor numeric;
  v_name text;
begin
  select o.business_unit_id into v_unit_id from public.orders o where o.id = new.order_id;
  if v_unit_id is null then
    raise exception 'Order % has no business unit', new.order_id;
  end if;
  v_mods := case when jsonb_typeof(new.ingredient_mods) = 'array' then new.ingredient_mods else '[]'::jsonb end;
  for ri in
    select r.raw_material_id, r.quantity, r.display_name, r.removable, r.extra_price, r.only_as_extra
    from public.recipe_items r
    join public.raw_materials rm on rm.id = r.raw_material_id
    where r.menu_item_id = new.menu_item_id and rm.business_unit_id = v_unit_id
    order by r.sort_order, r.id
  loop
    v_factor := case when ri.only_as_extra then 0 else 1 end;
    v_name := lower(btrim(coalesce(ri.display_name, '')));
    if v_name <> '' then
      if exists (
        select 1 from jsonb_array_elements(v_mods) as m(v)
        where m.v->>'action' = 'remove' and lower(btrim(m.v->>'name')) = v_name
      ) then
        v_factor := 0;
      end if;
      v_factor := v_factor + (
        select count(*) from jsonb_array_elements(v_mods) as m(v)
        where m.v->>'action' = 'extra' and lower(btrim(m.v->>'name')) = v_name
      );
    end if;
    if v_factor > 0 then
      perform app_private.post_stock_out(
        v_unit_id, ri.raw_material_id, ri.quantity * v_factor * new.quantity, 'venda', 'order_item', new.id);
    end if;
  end loop;
  return new;
end;
$$;

-- 6) Produção. Antes estes gatilhos existiam só no banco e falhavam por gravar o
--    movimento sem business_unit_id. A entrada do produzido leva o custo teórico da
--    receita (insumos × custo médio ÷ rendimento), para o custo do prato não ficar zerado.
create or replace function public.production_batch_before_insert()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  shelf_days integer;
begin
  if new.batch_code is null then
    new.batch_code := to_char(new.produced_at, 'YYYYMMDD') || '-' || upper(substr(new.id::text, 1, 6));
  end if;
  if new.expires_at is null then
    select shelf_life_days into shelf_days from public.production_recipes where id = new.recipe_id;
    if shelf_days is not null then
      new.expires_at := new.produced_at + (shelf_days || ' days')::interval;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.production_batch_credits_stock()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_output uuid;
  v_yield numeric;
  v_cost numeric;
begin
  select pr.output_raw_material_id, pr.output_quantity into v_output, v_yield
  from public.production_recipes pr where pr.id = new.recipe_id;
  if v_output is null then
    raise exception 'Receita de produção % não encontrada', new.recipe_id;
  end if;
  select case when v_yield > 0 then sum(pi.quantity * rm.average_cost) / v_yield end into v_cost
  from public.production_recipe_inputs pi
  join public.raw_materials rm on rm.id = pi.raw_material_id
  where pi.recipe_id = new.recipe_id;
  insert into public.stock_movements
    (business_unit_id, raw_material_id, type, quantity, reason, reference_type, reference_id, unit_cost, created_by)
  values (new.business_unit_id, v_output, 'entrada', new.quantity_produced, 'producao_output',
          'production_batch', new.id, nullif(v_cost, 0), new.produced_by);
  return new;
end;
$$;

-- O lote consumido fica em production_batch_inputs.lote_id (contrato da tela de lotes
-- e de lot_consumed); por isso o movimento de consumo não repete o lote_id.
create or replace function public.production_batch_input_deducts_stock()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_unit uuid;
  v_by uuid;
begin
  select b.business_unit_id, b.produced_by into v_unit, v_by
  from public.production_batches b where b.id = new.batch_id;
  insert into public.stock_movements
    (business_unit_id, raw_material_id, type, quantity, reason, reference_type, reference_id, created_by)
  values (v_unit, new.raw_material_id, 'saida', new.quantity_used, 'producao_consumo',
          'production_batch', new.batch_id, v_by);
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_production_batch_before_insert'
                 and tgrelid = 'public.production_batches'::regclass) then
    create trigger trg_production_batch_before_insert before insert on public.production_batches
      for each row execute function public.production_batch_before_insert();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_production_batch_credits_stock'
                 and tgrelid = 'public.production_batches'::regclass) then
    create trigger trg_production_batch_credits_stock after insert on public.production_batches
      for each row execute function public.production_batch_credits_stock();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_production_batch_input_deducts_stock'
                 and tgrelid = 'public.production_batch_inputs'::regclass) then
    create trigger trg_production_batch_input_deducts_stock after insert on public.production_batch_inputs
      for each row execute function public.production_batch_input_deducts_stock();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_order_item_deducts_stock'
                 and tgrelid = 'public.order_items'::regclass) then
    create trigger trg_order_item_deducts_stock after insert on public.order_items
      for each row execute function public.order_item_deducts_stock();
  end if;
end $$;

-- 7) Editar/cancelar lote de compra (versão de 20261009104050, nunca aplicada no remoto),
--    agora com a mesma conta de consumo de lot_consumed e permissão por unidade.
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
  if auth.uid() is null or not app_private.has_unit_role(v_lote.business_unit_id, array['admin']) then
    raise exception 'Sem permissão para alterar lote';
  end if;
  select * into v_entry from public.stock_movements
    where lote_id = p_lote_id and type = 'entrada' and reason = 'compra'
    order by created_at limit 1 for update;
  if not found then raise exception 'Entrada original não localizada'; end if;
  v_consumed := app_private.lot_consumed(p_lote_id);
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
  -- Reavalia só o saldo rastreável dos lotes de compra; nunca reescreve custos antigos.
  select sum(greatest(0, l.quantidade_entrada - app_private.lot_consumed(l.id)) * l.preco_unitario)
       / nullif(sum(case when l.preco_unitario is not null
              then greatest(0, l.quantidade_entrada - app_private.lot_consumed(l.id)) else 0 end), 0)
    into v_average
  from public.lotes l
  where l.raw_material_id = v_lote.raw_material_id
    and l.business_unit_id = v_lote.business_unit_id
    and l.cancelado_em is null and l.origem = 'compra';
  if v_average is not null then
    update public.raw_materials set average_cost = v_average, updated_at = now()
    where id = v_lote.raw_material_id and business_unit_id = v_lote.business_unit_id;
  end if;
end;
$$;
revoke all on function public.manage_purchase_lot(uuid, text, jsonb) from public;
grant execute on function public.manage_purchase_lot(uuid, text, jsonb) to authenticated;

-- 8) Unidade do insumo. Itens criados pelo cardápio nasceram em "un"; enquanto o insumo
--    não tem movimento, lote, receita de produção nem outra ficha, a unidade pode ser
--    corrigida pela ficha técnica. Com histórico, trocar a unidade corromperia os saldos.
create or replace function public.set_raw_material_unit(p_material uuid, p_unit text, p_menu_item text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_rm public.raw_materials%rowtype;
  v_unit text := btrim(coalesce(p_unit, ''));
begin
  select * into v_rm from public.raw_materials where id = p_material for update;
  if not found then raise exception 'Insumo não encontrado'; end if;
  if auth.uid() is null or not app_private.has_unit_role(v_rm.business_unit_id, array['admin']) then
    raise exception 'Sem permissão para alterar o insumo';
  end if;
  if v_unit = '' or length(v_unit) > 12 then raise exception 'Unidade inválida'; end if;
  if v_rm.unit = v_unit then return; end if;
  if exists (select 1 from public.stock_movements where raw_material_id = p_material)
     or exists (select 1 from public.lotes where raw_material_id = p_material) then
    raise exception '"%" já tem movimento no estoque em %; a unidade não pode mudar', v_rm.name, v_rm.unit;
  end if;
  if exists (select 1 from public.production_recipe_inputs where raw_material_id = p_material)
     or exists (select 1 from public.production_recipes where output_raw_material_id = p_material)
     or exists (select 1 from public.recipe_items where raw_material_id = p_material
                and menu_item_id is distinct from p_menu_item) then
    raise exception '"%" já é usado em outra ficha em %; ajuste lá antes de trocar a unidade', v_rm.name, v_rm.unit;
  end if;
  update public.raw_materials set unit = v_unit, updated_at = now() where id = p_material;
end;
$$;
revoke all on function public.set_raw_material_unit(uuid, text, text) from public;
grant execute on function public.set_raw_material_unit(uuid, text, text) to authenticated;

-- Defesa no banco: nenhuma tela troca a unidade de um insumo que já movimentou estoque.
create or replace function app_private.guard_raw_material_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.unit is distinct from old.unit and (
       exists (select 1 from public.stock_movements where raw_material_id = old.id)
    or exists (select 1 from public.lotes where raw_material_id = old.id)) then
    raise exception '"%" já tem movimento no estoque em %; a unidade não pode mudar', old.name, old.unit;
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_raw_material_unit'
                 and tgrelid = 'public.raw_materials'::regclass) then
    create trigger trg_guard_raw_material_unit before update of unit on public.raw_materials
      for each row execute function app_private.guard_raw_material_unit();
  end if;
end $$;
