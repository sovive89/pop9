-- Combos prontos (regra predefinida) no PWA de pedidos do cliente.
-- Combo pronto = toda etapa tem exatamente uma opção. Combos com escolha continuam só no atendimento.
-- O preço é sempre calculado aqui, pela regra cadastrada (fixo, % ou R$), nunca pelo navegador.
-- A venda continua gerando linhas normais de order_items agrupadas por combo_group_id, com o
-- total rateado em centavos (ficha técnica, setor e estoque seguem o fluxo de sempre).

create or replace function ops_private.ready_combo_quote(p_unit uuid, p_combo uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.menu_combos%rowtype;
  v_parts jsonb := '[]'::jsonb;
  v_list bigint := 0; v_base bigint := 0; v_extras bigint := 0; v_total bigint; v_weight bigint := 0;
  v_cum bigint := 0; v_prev bigint := 0; v_share bigint; v_n integer; v_i integer := 0;
  r record; v_out jsonb := '[]'::jsonb;
begin
  select * into c from public.menu_combos where id = p_combo and business_unit_id = p_unit and active;
  if not found then return null; end if;
  -- Exatamente uma opção por etapa e ao menos uma etapa.
  if not exists (select 1 from public.menu_combo_slots where combo_id = c.id)
    or exists (select 1 from public.menu_combo_slots s where s.combo_id = c.id
               and (select count(*) from public.menu_combo_options o where o.slot_id = s.id) <> 1) then
    return null;
  end if;
  for r in
    select s.label, o.menu_item_id, o.extra_price, o.is_free, mi.name, mi.price
      from public.menu_combo_slots s
      join public.menu_combo_options o on o.slot_id = s.id
      left join public.menu_items mi on mi.id = o.menu_item_id and mi.business_unit_id = p_unit
           and mi.active and mi.status = 'published' and mi.combo_eligible
     where s.combo_id = c.id
     order by s.sort_order, s.id
  loop
    if r.name is null or r.price is null or r.price < 0 then return null; end if;
    v_list := v_list + round(r.price * 100) + round(r.extra_price * 100);
    v_extras := v_extras + round(r.extra_price * 100);
    if not r.is_free then v_base := v_base + round(r.price * 100); end if;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('menu_item_id', r.menu_item_id, 'name', r.name, 'label', r.label,
      'weight', (case when r.is_free then 0 else round(r.price * 100) end) + round(r.extra_price * 100)));
  end loop;
  v_total := case c.pricing_mode
    when 'fixed' then round(coalesce(c.price, 0) * 100) + v_extras
    when 'percent' then round(v_base * (1 - least(100, greatest(0, c.discount)) / 100.0)) + v_extras
    else greatest(0, v_base - round(c.discount * 100)) + v_extras end;
  -- Rateio sem perder centavos: cada parte recebe a diferença do acumulado proporcional.
  select coalesce(sum((p->>'weight')::bigint), 0), count(*) into v_weight, v_n from jsonb_array_elements(v_parts) p;
  for r in select value as p from jsonb_array_elements(v_parts) loop
    v_i := v_i + 1;
    v_cum := v_cum + case when v_weight > 0 then (r.p->>'weight')::bigint else 1 end;
    v_share := round(v_total::numeric * v_cum / (case when v_weight > 0 then v_weight else v_n end)) - v_prev;
    v_prev := v_prev + v_share;
    v_out := v_out || jsonb_build_array((r.p - 'weight') || jsonb_build_object('price', v_share / 100.0));
  end loop;
  return jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description,
    'price', v_total / 100.0, 'list_price', v_list / 100.0, 'components', v_out);
end $$;
revoke all on function ops_private.ready_combo_quote(uuid, uuid) from public, anon, authenticated;

-- Cardápio público: combos prontos ativos e válidos da unidade (usado pela função public-order).
create or replace function public.list_pwa_ready_combos(p_unit uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(q order by sort_order, name), '[]'::jsonb) from (
    select c.sort_order, c.name, ops_private.ready_combo_quote(p_unit, c.id) as q
      from public.menu_combos c where c.business_unit_id = p_unit and c.active
  ) t where q is not null;
$$;
revoke all on function public.list_pwa_ready_combos(uuid) from public, anon, authenticated;
grant execute on function public.list_pwa_ready_combos(uuid) to service_role;

-- Pedido do PWA: itens avulsos {id, quantity} e combos prontos {combo_id, quantity}.
create or replace function public.submit_pwa_order(p_unit uuid, p_token_hash text, p_items jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, ops_private, pg_temp as $$
declare v_access ops_private.order_access%rowtype; v_contact public.whatsapp_contacts%rowtype;
  v_item jsonb; v_menu public.menu_items%rowtype; v_session uuid; v_client uuid; v_order uuid;
  v_number integer; v_total numeric := 0; v_qty integer; v_line numeric; v_summary jsonb := '[]';
  v_quote jsonb; v_part jsonb; v_group uuid; v_k integer;
begin
  select * into v_access from ops_private.order_access where token_hash = p_token_hash and business_unit_id = p_unit for update;
  if not found or v_access.expires_at < now() then raise exception 'Link expirado. Envie PEDIR no WhatsApp para gerar outro'; end if;
  if v_access.order_id is not null then return v_access.order_summary; end if;
  if not exists (select 1 from integrations where business_unit_id = p_unit and provider = 'own-pwa' and status = 'CONNECTED' and config->>'enabled' = 'true')
    then raise exception 'Pedidos online indisponíveis'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Carrinho inválido'; end if;
  if (select count(distinct coalesce(value->>'id', 'combo:' || (value->>'combo_id'))) from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items)
    then raise exception 'Itens duplicados no carrinho'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'Observação muito longa'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty not between 1 and 20 then raise exception 'Quantidade inválida'; end if;
    if v_item ? 'combo_id' then
      if (v_item->>'combo_id') !~ '^[0-9a-f-]{36}$' then raise exception 'Combo indisponível'; end if;
      perform 1 from menu_combos where id = (v_item->>'combo_id')::uuid and business_unit_id = p_unit for share;
      v_quote := ops_private.ready_combo_quote(p_unit, (v_item->>'combo_id')::uuid);
      if v_quote is null then raise exception 'Combo indisponível'; end if;
      v_line := round((v_quote->>'price')::numeric * v_qty, 2); v_total := v_total + v_line;
      v_summary := v_summary || jsonb_build_array(jsonb_build_object('combo_id', v_quote->>'id', 'name', v_quote->>'name',
        'quantity', v_qty, 'price', (v_quote->>'price')::numeric, 'components', v_quote->'components'));
    else
      select * into v_menu from menu_items where id = (v_item->>'id')::text and business_unit_id = p_unit and active and status = 'published' for share;
      if not found or v_menu.price is null or v_menu.price < 0 then raise exception 'Item indisponível'; end if;
      v_line := round(v_menu.price * v_qty, 2); v_total := v_total + v_line;
      v_summary := v_summary || jsonb_build_array(jsonb_build_object('id', v_menu.id, 'name', v_menu.name, 'quantity', v_qty, 'price', v_menu.price));
    end if;
  end loop;
  if v_total > 5000 then raise exception 'Valor máximo por pedido excedido'; end if;
  select * into v_contact from whatsapp_contacts where id = v_access.contact_id;
  -- Negative numbers are reserved for online pickup; they never occupy dining tables.
  perform 1 from business_units where id = p_unit and active for update;
  if not found then raise exception 'Unidade indisponível'; end if;
  select least(coalesce(min(table_number), 0), 0) - 1 into v_number from sessions where business_unit_id = p_unit;
  insert into sessions(business_unit_id, table_number, zone, origin) values (p_unit, v_number, 'retirada', 'customer') returning id into v_session;
  insert into session_clients(session_id, business_unit_id, name, phone, email, bairro)
    values (v_session, p_unit, v_contact.name, v_contact.phone, v_contact.email, v_contact.bairro) returning id into v_client;
  insert into orders(business_unit_id, session_id, client_id, origin, source, external_id, subtotal, total)
    values (p_unit, v_session, v_client, 'pwa', 'own-pwa', left(p_token_hash, 32), v_total, v_total) returning id into v_order;
  for v_item in select value from jsonb_array_elements(v_summary) loop
    if v_item ? 'combo_id' then
      -- Uma unidade do combo = um grupo na conta; o setor vem do item (gatilho de destino).
      for v_k in 1 .. (v_item->>'quantity')::integer loop
        v_group := gen_random_uuid();
        for v_part in select value from jsonb_array_elements(v_item->'components') loop
          insert into order_items(order_id, menu_item_id, name, price, quantity, observation, combo_group_id, combo_name)
            values (v_order, v_part->>'menu_item_id', v_part->>'name', (v_part->>'price')::numeric, 1, nullif(trim(p_note), ''),
              v_group, v_item->>'name');
        end loop;
      end loop;
    else
      insert into order_items(order_id, menu_item_id, name, price, quantity, observation, destination)
        values (v_order, v_item->>'id', v_item->>'name', (v_item->>'price')::numeric, (v_item->>'quantity')::integer, nullif(trim(p_note), ''),
          coalesce((select mc.destination from menu_categories mc join menu_items mi on mi.category = mc.key and mc.business_unit_id = mi.business_unit_id
            where mi.id = v_item->>'id' and mi.business_unit_id = p_unit), 'kitchen'));
    end if;
  end loop;
  v_summary := jsonb_build_object('orderId', v_order, 'pickupNumber', abs(v_number), 'total', v_total,
    'items', (select coalesce(jsonb_agg(e - 'components'), '[]'::jsonb) from jsonb_array_elements(v_summary) e));
  update ops_private.order_access set order_id = v_order, order_summary = v_summary where token_hash = p_token_hash;
  return v_summary;
end $$;
revoke all on function public.submit_pwa_order(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_pwa_order(uuid, text, jsonb, text) to service_role;
