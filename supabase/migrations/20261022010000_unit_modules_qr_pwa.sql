-- Interruptores por unidade: autoatendimento_qr (porta da mesa) e pwa_publica (site público).
-- Aditiva: só amplia a lista aceita por set_unit_module (produção já aceita; isto versiona a mudança) e
-- trava no banco o PWA público: esconder botão não basta, o link continua existindo.
-- Lista vazia em disabled_modules = tudo ligado (comportamento atual).

create or replace function ops_private.module_enabled(p_unit uuid, p_module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not coalesce((select p_module = any(disabled_modules) from public.business_units where id = p_unit), false);
$$;
revoke all on function ops_private.module_enabled(uuid, text) from public, anon, authenticated;
grant execute on function ops_private.module_enabled(uuid, text) to service_role;

create or replace function public.set_unit_module(p_unit uuid, p_module text, p_enabled boolean)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v text[];
begin
  if p_module not in ('financeiro', 'combos', 'crm', 'documents', 'assistente', 'autoatendimento_qr', 'pwa_publica') then
    raise exception 'Módulo desconhecido: %', p_module using errcode = '22023';
  end if;
  if not app_private.has_unit_role(p_unit, array['admin']) then
    raise exception 'Só um administrador desta unidade altera os módulos' using errcode = '42501';
  end if;
  update public.business_units
     set disabled_modules = case when p_enabled then array_remove(disabled_modules, p_module)
                                 else (select array(select distinct m from unnest(disabled_modules || p_module) m)) end
   where id = p_unit
   returning disabled_modules into v;
  return v;
end;
$$;
revoke all on function public.set_unit_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_unit_module(uuid, text, boolean) to authenticated;

-- Pedido do PWA: mesma função de 20261017170000, mais a trava do módulo pwa_publica.
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
  if not ops_private.module_enabled(p_unit, 'pwa_publica') then raise exception 'Pedidos online indisponíveis'; end if;
  if not exists (select 1 from integrations where business_unit_id = p_unit and provider = 'own-pwa' and status = 'CONNECTED' and config->>'enabled' = 'true')
    then raise exception 'Pedidos online indisponíveis'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Carrinho inválido'; end if;
  -- Combo é identificado só pelo combo_id (um "id" extra não abre brecha para repetir o combo).
  if (select count(distinct case when value ? 'combo_id' then 'combo:' || (value->>'combo_id') else 'item:' || coalesce(value->>'id', '') end)
        from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items)
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
      -- Trava os itens do combo e recalcula: uma desativação concorrente não passa entre a cotação e a gravação.
      perform 1 from menu_items where business_unit_id = p_unit
        and id in (select value->>'menu_item_id' from jsonb_array_elements(v_quote->'components')) order by id for share;
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

-- Acesso por SMS: mesma função de 20261017180000, mais a trava do módulo pwa_publica.
create or replace function public.issue_pwa_sms_access(p_unit uuid, p_phone text, p_token_hash text, p_name text,
  p_email text default null, p_bairro text default null, p_marketing boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_contact public.whatsapp_contacts%rowtype; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_bairro text := nullif(btrim(coalesce(p_bairro, '')), '');
begin
  if p_phone is null or p_phone !~ '^55[0-9]{10,11}$' then raise exception 'Celular inválido'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Acesso inválido'; end if;
  if not ops_private.valid_full_name(v_name) then raise exception 'Informe nome e sobrenome'; end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'E-mail inválido'; end if;
  if v_bairro is not null and length(v_bairro) > 80 then raise exception 'Bairro muito longo'; end if;
  if not ops_private.module_enabled(p_unit, 'pwa_publica') then raise exception 'Pedidos online indisponíveis' using errcode = 'PT404'; end if;
  if not exists (select 1 from public.business_units where id = p_unit and active) then raise exception 'Pedidos online indisponíveis' using errcode = 'PT404'; end if;
  if not exists (select 1 from public.integrations where business_unit_id = p_unit and provider = 'own-pwa'
                 and status = 'CONNECTED' and config->>'enabled' = 'true') then
    raise exception 'Pedidos online indisponíveis' using errcode = 'PT404'; end if;
  insert into public.whatsapp_contacts (business_unit_id, phone, name, email, bairro, profile_consent_at, marketing_consent_at)
    values (p_unit, p_phone, v_name, v_email, v_bairro, now(), case when p_marketing then now() end)
    on conflict (business_unit_id, phone) do update set
      name = excluded.name,
      email = coalesce(excluded.email, public.whatsapp_contacts.email),
      bairro = coalesce(excluded.bairro, public.whatsapp_contacts.bairro),
      profile_consent_at = coalesce(public.whatsapp_contacts.profile_consent_at, now()),
      marketing_consent_at = case when p_marketing then coalesce(public.whatsapp_contacts.marketing_consent_at, now()) else null end,
      opted_out_at = case when p_marketing then null else public.whatsapp_contacts.opted_out_at end,
      last_seen_at = now()
    returning * into v_contact;
  insert into ops_private.order_access (token_hash, business_unit_id, contact_id, expires_at)
    values (p_token_hash, p_unit, v_contact.id, now() + interval '60 minutes');
  return jsonb_build_object('name', v_contact.name, 'email', v_contact.email, 'bairro', v_contact.bairro, 'marketing', v_contact.marketing_consent_at is not null);
end $$;
revoke all on function public.issue_pwa_sms_access(uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.issue_pwa_sms_access(uuid, text, text, text, text, text, boolean) to service_role;

-- Envio de SMS: com o módulo desligado nenhum código sai (sem custo de Twilio).
create or replace function public.register_pwa_sms_send(p_unit uuid, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_phone is null or p_phone !~ '^55[0-9]{10,11}$' then raise exception 'Celular inválido'; end if;
  if not exists (select 1 from public.business_units where id = p_unit and active) then raise exception 'Pedidos online indisponíveis' using errcode = 'PT404'; end if;
  if not ops_private.module_enabled(p_unit, 'pwa_publica') then raise exception 'Pedidos online indisponíveis' using errcode = 'PT404'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pwa-sms:' || p_unit::text, 0));
  -- Retenção: os limites olham só os últimos 15 min; não guardamos telefone por mais de 1 dia.
  -- A limpeza é global (qualquer envio de qualquer unidade apaga os antigos de todas).
  delete from ops_private.pwa_sms_sends where sent_at < now() - interval '1 day';
  if exists (select 1 from ops_private.pwa_sms_sends where business_unit_id = p_unit and phone = p_phone and sent_at > now() - interval '30 seconds') then
    raise exception 'Aguarde 30 segundos para pedir outro código.'; end if;
  if (select count(*) from ops_private.pwa_sms_sends where business_unit_id = p_unit and phone = p_phone and sent_at > now() - interval '15 minutes') >= 3 then
    raise exception 'Muitos códigos enviados para este número. Aguarde 15 minutos.'; end if;
  if (select count(*) from ops_private.pwa_sms_sends where business_unit_id = p_unit and sent_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Muitas verificações agora. Tente novamente em alguns minutos.'; end if;
  insert into ops_private.pwa_sms_sends (business_unit_id, phone) values (p_unit, p_phone);
end $$;
revoke all on function public.register_pwa_sms_send(uuid, text) from public, anon, authenticated;
grant execute on function public.register_pwa_sms_send(uuid, text) to service_role;
