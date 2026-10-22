-- Pix na PWA pública, etapa 1 (banco). Aditiva: nada em uso é removido.
-- Princípio: o pedido SÓ é criado quando o servidor confirma o pagamento. Até lá o checkout vive em
-- ops_private.payment_intents, então cozinha, impressão e baixa de estoque (gatilhos de orders/order_items)
-- não mudam. O valor vem sempre do servidor (resolve_pwa_order_lines), nunca do cliente.
-- Tudo aqui é exclusivo da service_role (Edge Functions); anon/authenticated não alcançam nada.

-- 1) Lançamento vindo de provedor é idempotente: o mesmo pagamento do PSP nunca vira duas linhas.
create unique index if not exists payments_source_external_uidx
  on public.payments (source, external_id) where external_id is not null;

-- 2) Cobranças em andamento (checkout retido até o pagamento).
create table if not exists ops_private.payment_intents (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id),
  token_hash text not null,
  provider text,
  provider_payment_id text,
  amount numeric(12,2) not null check (amount > 0),
  lines jsonb not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','expired','failed','cancelled','needs_review')),
  review_reason text,
  pix_payload text check (pix_payload is null or length(pix_payload) <= 2048),
  pix_expires_at timestamptz,
  order_id uuid,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index if not exists payment_intents_provider_payment_uidx
  on ops_private.payment_intents (provider, provider_payment_id) where provider_payment_id is not null;
-- No máximo uma cobrança ativa por cliente (token).
create unique index if not exists payment_intents_active_token_uidx
  on ops_private.payment_intents (token_hash) where status = 'pending';
create index if not exists payment_intents_token_idx on ops_private.payment_intents (token_hash, created_at desc);
alter table ops_private.payment_intents enable row level security;
revoke all on ops_private.payment_intents from public, anon, authenticated;
grant all on ops_private.payment_intents to service_role;

-- 3) Eventos de webhook já vistos. processed_at nulo = recebido mas ainda não concluído (permite reprocessar
-- se o PSP reenviar depois de uma falha nossa, sem perder a confirmação).
create table if not exists ops_private.payment_events (
  provider text not null,
  event_id text not null,
  business_unit_id uuid,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);
alter table ops_private.payment_events enable row level security;
revoke all on ops_private.payment_events from public, anon, authenticated;
grant all on ops_private.payment_events to service_role;

-- 4) Tentativas de criar cobrança (rate limit).
create table if not exists ops_private.payment_attempts (
  id bigint generated always as identity primary key,
  business_unit_id uuid not null,
  token_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_attempts_created_idx on ops_private.payment_attempts (created_at);
alter table ops_private.payment_attempts enable row level security;
revoke all on ops_private.payment_attempts from public, anon, authenticated;
grant all on ops_private.payment_attempts to service_role;

-- 5) A loja pode receber pedido online agora? (mesmas regras do submit_pwa_order, sem lançar exceção)
create or replace function ops_private.pwa_ordering_open(p_unit uuid)
returns boolean language sql stable security definer set search_path = 'pg_catalog,public,ops_private,pg_temp' as $$
  select ops_private.module_enabled(p_unit, 'pwa_publica')
     and exists (select 1 from public.integrations
                  where business_unit_id = p_unit and provider = 'own-pwa'
                    and status = 'CONNECTED' and config->>'enabled' = 'true')
     and exists (select 1 from public.business_units where id = p_unit and active)
     and exists (select 1 from public.operation_periods where business_unit_id = p_unit and closed_at is null);
$$;
revoke all on function ops_private.pwa_ordering_open(uuid) from public, anon, authenticated;
grant execute on function ops_private.pwa_ordering_open(uuid) to service_role;

-- 6) Criação do pedido extraída de submit_pwa_order (mesma lógica; agora compartilhada com o pagamento).
create or replace function ops_private.create_pwa_order(
  p_unit uuid, p_token_hash text, p_contact uuid, p_lines jsonb, p_total numeric, p_note text, p_payment_status text default 'pending')
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog,public,ops_private,pg_temp'
as $function$
declare
  v_contact public.whatsapp_contacts%rowtype;
  v_line jsonb;
  v_summary jsonb;
  v_session uuid;
  v_client uuid;
  v_order uuid;
  v_number integer;
  v_group uuid;
  v_part jsonb;
  v_k integer;
begin
  select * into v_contact from public.whatsapp_contacts where id = p_contact and business_unit_id = p_unit;
  if not found then
    raise exception 'Contato inválido';
  end if;

  select least(coalesce(min(table_number), 0), 0) - 1 into v_number
    from public.sessions where business_unit_id = p_unit;
  insert into public.sessions(business_unit_id, table_number, zone, origin)
    values (p_unit, v_number, 'retirada', 'customer') returning id into v_session;
  insert into public.session_clients(session_id, business_unit_id, name, phone, email, bairro)
    values (v_session, p_unit, v_contact.name, v_contact.phone, v_contact.email, v_contact.bairro)
    returning id into v_client;
  insert into public.orders(business_unit_id, session_id, client_id, origin, source, external_id, subtotal, total, payment_status)
    values (p_unit, v_session, v_client, 'pwa', 'own-pwa', left(p_token_hash, 32), p_total, p_total, p_payment_status)
    returning id into v_order;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if v_line ? 'combo_id' then
      for v_k in 1 .. (v_line->>'quantity')::integer loop
        v_group := gen_random_uuid();
        for v_part in select value from jsonb_array_elements(v_line->'components') loop
          insert into public.order_items(order_id, menu_item_id, name, price, quantity, observation, combo_group_id, combo_name)
            values (v_order, v_part->>'menu_item_id', v_part->>'name', (v_part->>'price')::numeric,
              1, nullif(trim(p_note), ''), v_group, v_line->>'name');
        end loop;
      end loop;
    else
      insert into public.order_items(order_id, menu_item_id, name, price, quantity, observation,
        ingredient_mods, variant_id, variant_name, destination)
        values (
          v_order,
          v_line->>'id',
          v_line->>'name',
          (v_line->>'price')::numeric,
          (v_line->>'quantity')::integer,
          coalesce(nullif(trim(v_line->>'observation'), ''), nullif(trim(p_note), '')),
          coalesce(v_line->'ingredientMods', '[]'::jsonb),
          nullif(v_line->>'variantId', '')::uuid,
          nullif(v_line->>'variantName', ''),
          coalesce((select mc.destination
                      from public.menu_categories mc
                     where mc.key = (select mi.category from public.menu_items mi where mi.id = v_line->>'id' and mi.business_unit_id = p_unit)
                       and mc.business_unit_id = p_unit), 'kitchen')
        );
    end if;
  end loop;

  v_summary := jsonb_build_object(
    'orderId', v_order,
    'pickupNumber', abs(v_number),
    'total', p_total,
    'items', (select coalesce(jsonb_agg(line - 'components'), '[]'::jsonb) from jsonb_array_elements(p_lines) line)
  );
  update ops_private.order_access set order_id = v_order, order_summary = v_summary where token_hash = p_token_hash;
  return v_summary;
end;
$function$;
revoke all on function ops_private.create_pwa_order(uuid, text, uuid, jsonb, numeric, text, text) from public, anon, authenticated;
grant execute on function ops_private.create_pwa_order(uuid, text, uuid, jsonb, numeric, text, text) to service_role;

-- submit_pwa_order (pagar no balcão) mantém TODAS as validações; só delega a criação ao helper acima.
create or replace function public.submit_pwa_order(p_unit uuid, p_token_hash text, p_items jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog,public,ops_private,pg_temp'
as $function$
declare
  v_access ops_private.order_access%rowtype;
  v_lines jsonb;
  v_total numeric;
begin
  select * into v_access
    from ops_private.order_access
   where token_hash = p_token_hash
     and business_unit_id = p_unit
   for update;
  if not found or v_access.expires_at < now() then
    raise exception 'Link expirado. Envie PEDIR no WhatsApp para gerar outro';
  end if;
  if v_access.order_id is not null then
    return v_access.order_summary;
  end if;
  if not ops_private.module_enabled(p_unit, 'pwa_publica') then
    raise exception 'Pedidos online indisponíveis';
  end if;
  if not exists (
    select 1 from public.integrations
     where business_unit_id = p_unit
       and provider = 'own-pwa'
       and status = 'CONNECTED'
       and config->>'enabled' = 'true'
  ) then
    raise exception 'Pedidos online indisponíveis';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Observação muito longa';
  end if;

  perform 1 from public.business_units where id = p_unit and active for update;
  if not found then
    raise exception 'Unidade indisponível';
  end if;
  if not exists (select 1 from public.operation_periods where business_unit_id = p_unit and closed_at is null) then
    raise exception 'Operação fechada. Tente novamente quando a loja abrir.';
  end if;

  v_lines := ops_private.resolve_pwa_order_lines(p_unit, p_items);
  select coalesce(sum((line->>'price')::numeric * (line->>'quantity')::integer), 0)
    into v_total
    from jsonb_array_elements(v_lines) line;
  if v_total > 5000 then
    raise exception 'Valor máximo por pedido excedido';
  end if;

  return ops_private.create_pwa_order(p_unit, p_token_hash, v_access.contact_id, v_lines, v_total, p_note, 'pending');
end;
$function$;
revoke all on function public.submit_pwa_order(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_pwa_order(uuid, text, jsonb, text) to service_role;

-- 7) Abre (ou reaproveita) a cobrança Pix do cliente. Preço e total vêm do servidor.
-- Mesmo carrinho = mesma cobrança (idempotente). Carrinho diferente = cancela a anterior e abre outra.
create or replace function public.create_pix_intent(p_unit uuid, p_token_hash text, p_items jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog,public,ops_private,pg_temp'
as $function$
declare
  v_access ops_private.order_access%rowtype;
  v_intent ops_private.payment_intents%rowtype;
  v_lines jsonb;
  v_total numeric;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_access
    from ops_private.order_access
   where token_hash = p_token_hash and business_unit_id = p_unit
   for update;
  if not found or v_access.expires_at < now() then
    raise exception 'Link expirado. Envie PEDIR no WhatsApp para gerar outro';
  end if;
  if v_access.order_id is not null then
    return jsonb_build_object('status', 'confirmed', 'order', v_access.order_summary);
  end if;
  if not ops_private.pwa_ordering_open(p_unit) then
    raise exception 'Pedidos online indisponíveis';
  end if;
  if length(coalesce(v_note, '')) > 500 then
    raise exception 'Observação muito longa';
  end if;

  v_lines := ops_private.resolve_pwa_order_lines(p_unit, p_items);
  select round(coalesce(sum((line->>'price')::numeric * (line->>'quantity')::integer), 0), 2)
    into v_total from jsonb_array_elements(v_lines) line;
  if v_total <= 0 then
    raise exception 'Pedido sem valor a pagar';
  end if;
  if v_total > 5000 then
    raise exception 'Valor máximo por pedido excedido';
  end if;

  update ops_private.payment_intents set status = 'expired'
   where token_hash = p_token_hash and status = 'pending'
     and pix_expires_at is not null and pix_expires_at < now();

  select * into v_intent from ops_private.payment_intents where token_hash = p_token_hash and status = 'pending';
  if found then
    if v_intent.lines = v_lines and v_intent.note is not distinct from v_note then
      return jsonb_build_object('status', 'pending', 'intentId', v_intent.id, 'amount', v_intent.amount,
        'pixPayload', v_intent.pix_payload, 'expiresAt', v_intent.pix_expires_at, 'reused', true);
    end if;
    -- Carrinho mudou: a cobrança antiga deixa de valer. Se ela ainda for paga no PSP, cai em needs_review.
    update ops_private.payment_intents set status = 'cancelled' where id = v_intent.id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pwa-pix:' || p_unit::text, 0));
  delete from ops_private.payment_attempts where created_at < now() - interval '1 day';
  if (select count(*) from ops_private.payment_attempts
       where business_unit_id = p_unit and token_hash = p_token_hash and created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'Muitas tentativas de pagamento. Aguarde alguns minutos.';
  end if;
  if (select count(*) from ops_private.payment_attempts
       where business_unit_id = p_unit and created_at > now() - interval '10 minutes') >= 120 then
    raise exception 'Muitos pagamentos agora. Tente novamente em alguns minutos.';
  end if;
  insert into ops_private.payment_attempts (business_unit_id, token_hash) values (p_unit, p_token_hash);

  insert into ops_private.payment_intents (business_unit_id, token_hash, amount, lines, note)
    values (p_unit, p_token_hash, v_total, v_lines, v_note)
    returning * into v_intent;
  return jsonb_build_object('status', 'pending', 'intentId', v_intent.id, 'amount', v_intent.amount, 'reused', false);
end;
$function$;
revoke all on function public.create_pix_intent(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_pix_intent(uuid, text, jsonb, text) to service_role;

-- 8) Depois que o PSP cria a cobrança, grava o identificador e o "copia e cola". Só uma vez por cobrança.
create or replace function public.attach_pix_charge(
  p_unit uuid, p_intent uuid, p_provider text, p_provider_payment_id text, p_pix_payload text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = 'pg_catalog,public,ops_private,pg_temp' as $function$
begin
  if coalesce(btrim(p_provider), '') = '' or coalesce(btrim(p_provider_payment_id), '') = ''
     or coalesce(btrim(p_pix_payload), '') = '' or p_expires_at is null then
    raise exception 'Dados da cobrança inválidos';
  end if;
  update ops_private.payment_intents
     set provider = p_provider, provider_payment_id = p_provider_payment_id,
         pix_payload = p_pix_payload, pix_expires_at = p_expires_at
   where id = p_intent and business_unit_id = p_unit and status = 'pending' and provider_payment_id is null;
  if not found then
    raise exception 'Cobrança inválida';
  end if;
end;
$function$;
revoke all on function public.attach_pix_charge(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.attach_pix_charge(uuid, uuid, text, text, text, timestamptz) to service_role;

-- Se o PSP recusou a criação, libera o cliente para tentar de novo (só antes de existir cobrança no PSP).
create or replace function public.fail_pix_intent(p_unit uuid, p_intent uuid)
returns void language sql security definer set search_path = 'pg_catalog,public,ops_private,pg_temp' as $$
  update ops_private.payment_intents set status = 'failed'
   where id = p_intent and business_unit_id = p_unit and status = 'pending' and provider_payment_id is null;
$$;
revoke all on function public.fail_pix_intent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fail_pix_intent(uuid, uuid) to service_role;

-- 9) Webhook: reivindica o evento. true = processar; false = já concluído antes (duplicado).
create or replace function public.claim_payment_event(p_provider text, p_event_id text, p_unit uuid)
returns boolean language plpgsql security definer set search_path = 'pg_catalog,public,ops_private,pg_temp' as $function$
declare v_inserted integer;
begin
  if coalesce(btrim(p_provider), '') = '' or coalesce(btrim(p_event_id), '') = '' then
    raise exception 'Evento inválido';
  end if;
  insert into ops_private.payment_events (provider, event_id, business_unit_id)
    values (p_provider, p_event_id, p_unit) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then return true; end if;
  return exists (select 1 from ops_private.payment_events
                  where provider = p_provider and event_id = p_event_id and processed_at is null);
end;
$function$;
revoke all on function public.claim_payment_event(text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_payment_event(text, text, uuid) to service_role;

create or replace function public.finish_payment_event(p_provider text, p_event_id text)
returns void language sql security definer set search_path = 'pg_catalog,public,ops_private,pg_temp' as $$
  update ops_private.payment_events set processed_at = now()
   where provider = p_provider and event_id = p_event_id and processed_at is null;
$$;
revoke all on function public.finish_payment_event(text, text) from public, anon, authenticated;
grant execute on function public.finish_payment_event(text, text) to service_role;

-- 10) Confirma o pagamento (chamada só pelo webhook, DEPOIS de consultar o PSP). Idempotente.
-- Qualquer coisa fora do esperado (valor, cobrança vencida/cancelada, loja fechada) NÃO cria pedido:
-- fica em needs_review para a loja decidir e estornar no painel do PSP.
create or replace function public.confirm_pix_payment(p_unit uuid, p_provider text, p_provider_payment_id text, p_paid_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog,public,ops_private,pg_temp'
as $function$
declare
  v_intent ops_private.payment_intents%rowtype;
  v_access ops_private.order_access%rowtype;
  v_summary jsonb;
  v_order public.orders%rowtype;
  v_reason text;
begin
  select * into v_intent from ops_private.payment_intents
   where business_unit_id = p_unit and provider = p_provider and provider_payment_id = p_provider_payment_id
   for update;
  if not found then
    raise exception 'Pagamento desconhecido';
  end if;

  if v_intent.status = 'confirmed' then
    select order_summary into v_summary from ops_private.order_access where token_hash = v_intent.token_hash;
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'order', v_summary);
  end if;
  if v_intent.status = 'needs_review' then
    return jsonb_build_object('ok', false, 'status', 'needs_review', 'reason', v_intent.review_reason);
  end if;

  select * into v_access from ops_private.order_access
   where token_hash = v_intent.token_hash and business_unit_id = p_unit for update;

  if v_intent.status <> 'pending' then v_reason := 'intent_' || v_intent.status;
  elsif p_paid_amount is null or round(p_paid_amount, 2) <> v_intent.amount then v_reason := 'amount_mismatch';
  elsif not found or v_access.order_id is not null then v_reason := 'order_already_exists';
  elsif not ops_private.pwa_ordering_open(p_unit) then v_reason := 'ordering_closed';
  end if;

  if v_reason is not null then
    update ops_private.payment_intents set status = 'needs_review', review_reason = v_reason where id = v_intent.id;
    return jsonb_build_object('ok', false, 'status', 'needs_review', 'reason', v_reason);
  end if;

  v_summary := ops_private.create_pwa_order(p_unit, v_intent.token_hash, v_access.contact_id, v_intent.lines, v_intent.amount, v_intent.note, 'paid');
  select * into v_order from public.orders where id = (v_summary->>'orderId')::uuid;
  insert into public.payments (session_id, client_id, business_unit_id, amount, service_charge, method, status, order_id, source, external_id)
    values (v_order.session_id, v_order.client_id, p_unit, v_intent.amount, 0, 'pix', 'confirmed', v_order.id, p_provider, p_provider_payment_id);
  update ops_private.payment_intents set status = 'confirmed', order_id = v_order.id, confirmed_at = now() where id = v_intent.id;
  return jsonb_build_object('ok', true, 'status', 'confirmed', 'order', v_summary);
end;
$function$;
revoke all on function public.confirm_pix_payment(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.confirm_pix_payment(uuid, text, text, numeric) to service_role;

-- 11) Status para o cliente: antes do pedido existir mostra a cobrança; depois inclui o estado do pagamento.
create or replace function public.get_pwa_order_status(p_unit uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access ops_private.order_access%rowtype;
  v_order public.orders%rowtype;
  v_intent ops_private.payment_intents%rowtype;
  v_number integer;
  v_items jsonb;
begin
  select * into v_access
    from ops_private.order_access
   where business_unit_id = p_unit
     and token_hash = p_token_hash
   for share;

  if not found then
    raise exception 'Pedido ainda não foi registrado';
  end if;

  if v_access.order_id is null then
    update ops_private.payment_intents set status = 'expired'
     where token_hash = p_token_hash and business_unit_id = p_unit and status = 'pending'
       and pix_expires_at is not null and pix_expires_at < now();
    select * into v_intent from ops_private.payment_intents
     where token_hash = p_token_hash and business_unit_id = p_unit
     order by created_at desc limit 1;
    if not found then
      raise exception 'Pedido ainda não foi registrado';
    end if;
    return jsonb_build_object(
      'status', 'awaiting_payment',
      'payment', jsonb_build_object(
        'method', 'pix',
        'status', v_intent.status,
        'amount', v_intent.amount,
        'pixPayload', case when v_intent.status = 'pending' then v_intent.pix_payload end,
        'expiresAt', v_intent.pix_expires_at));
  end if;

  -- Depois que o pedido existe, o cliente continua podendo acompanhar até a
  -- retirada mesmo que o link original tenha passado do prazo de emissão.
  select * into v_order
    from public.orders
   where id = v_access.order_id
     and business_unit_id = p_unit;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  select abs(table_number) into v_number
    from public.sessions
   where id = v_order.session_id
     and business_unit_id = p_unit;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', name,
    'quantity', quantity,
    'price', price,
    'observation', observation
  ) order by id), '[]'::jsonb)
    into v_items
    from public.order_items
   where order_id = v_order.id;

  return jsonb_build_object(
    'orderId', v_order.id,
    'pickupNumber', v_number,
    'status', v_order.status,
    'total', v_order.total,
    'placedAt', v_order.placed_at,
    'preparingAt', v_order.preparing_at,
    'readyAt', v_order.ready_at,
    'items', v_items,
    'payment', jsonb_build_object(
      'method', coalesce((select p.method from public.payments p
                           where p.order_id = v_order.id and p.status = 'confirmed' order by p.paid_at limit 1), 'balcao'),
      'status', v_order.payment_status)
  );
end
$function$;
revoke all on function public.get_pwa_order_status(uuid, text) from public, anon, authenticated;
grant execute on function public.get_pwa_order_status(uuid, text) to service_role;
