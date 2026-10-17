-- Unit-scoped operational integrations. Never store Meta/bot secrets in config.
create schema if not exists ops_private;
revoke all on schema ops_private from public;
grant usage on schema ops_private to authenticated,service_role;
create or replace function ops_private.staff(p_unit uuid,p_roles text[]) returns boolean
language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists(select 1 from user_roles where user_id=auth.uid()
    and (business_unit_id=p_unit or business_unit_id is null) and role::text=any(p_roles));
$$;
revoke all on function ops_private.staff(uuid,text[]) from public;
grant execute on function ops_private.staff(uuid,text[]) to authenticated,service_role;
do $$ begin
  if (select count(*) from public.business_units where active)=1 then
    update public.integrations set business_unit_id=(select id from public.business_units where active)
      where business_unit_id is null;
  end if;
end $$;
update public.integrations set status='NOT_CONNECTED',connected_at=null where provider='whatsapp';
alter table public.integrations drop constraint if exists integrations_provider_key;
create unique index integrations_unit_provider_key on public.integrations(business_unit_id,provider) nulls not distinct;
create unique index integrations_whatsapp_phone_key on public.integrations((config->>'phoneNumberId'))
  where provider='whatsapp' and coalesce(config->>'phoneNumberId','')<>'';
drop policy if exists "Admin manages integrations" on public.integrations;
drop policy if exists "Staff can read integrations" on public.integrations;
create policy "Unit admin reads integrations" on public.integrations for select to authenticated
  using(ops_private.staff(business_unit_id,array['admin']));
-- All writes go through the authenticated management endpoint to validate secrets/URLs/status.
revoke insert,update,delete on public.integrations from anon,authenticated;
grant select on public.integrations to authenticated;
grant all on public.integrations to service_role;

create table public.whatsapp_contacts(
  id uuid primary key default gen_random_uuid(), business_unit_id uuid not null references public.business_units(id),
  phone text not null check(phone ~ '^[0-9]{8,15}$'), name text not null, email text,bairro text,preferences text,
  profile_consent_at timestamptz, marketing_consent_at timestamptz, opted_out_at timestamptz,
  message_count integer not null default 0, first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), unique(business_unit_id,phone)
);
create table public.whatsapp_events(
  id text primary key, business_unit_id uuid not null references public.business_units(id),
  contact_id uuid not null references public.whatsapp_contacts(id), received_at timestamptz not null default now(),
  message_type text not null, reply text, bot_payload jsonb,
  delivery_state text not null default 'none' check(delivery_state in('none','pending','sending','sent','failed')),
  lease_until timestamptz, error_code text
);
create index whatsapp_contacts_unit_seen_idx on public.whatsapp_contacts(business_unit_id,last_seen_at desc);
create index whatsapp_events_unit_time_idx on public.whatsapp_events(business_unit_id,received_at desc);
create table ops_private.order_access(
  token_hash text primary key, business_unit_id uuid not null references public.business_units(id),
  contact_id uuid not null references public.whatsapp_contacts(id), expires_at timestamptz not null,
  order_id uuid references public.orders(id), order_summary jsonb
);
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_events enable row level security;
alter table ops_private.order_access enable row level security;
revoke all on ops_private.order_access from public,anon,authenticated;
revoke all on public.whatsapp_contacts,public.whatsapp_events from anon,authenticated;
grant select on public.whatsapp_contacts,public.whatsapp_events to authenticated;
grant all on public.whatsapp_contacts,public.whatsapp_events,ops_private.order_access to service_role;
create policy "Unit admin CRM contacts" on public.whatsapp_contacts for select to authenticated
  using(ops_private.staff(business_unit_id,array['admin']));
create policy "Unit admin WhatsApp events" on public.whatsapp_events for select to authenticated
  using(ops_private.staff(business_unit_id,array['admin']));

create or replace function public.ingest_whatsapp_message(p_unit uuid,p_id text,p_phone text,p_name text,p_text text,
  p_type text,p_token_hash text,p_order_url text) returns jsonb
language plpgsql security definer set search_path=public,ops_private as $$
declare v_contact public.whatsapp_contacts%rowtype; v_event public.whatsapp_events%rowtype;
  v_config jsonb; v_reply text; v_command text:=upper(trim(coalesce(p_text,''))); v_new boolean;
begin
  select config into v_config from public.integrations where business_unit_id=p_unit and provider='whatsapp'
    and status in('CONNECTING','CONNECTED');
  if v_config is null then raise exception 'WhatsApp desativado'; end if;
  insert into public.whatsapp_contacts(business_unit_id,phone,name)
    values(p_unit,p_phone,left(coalesce(nullif(p_name,''),'Cliente WhatsApp'),120)) on conflict do nothing;
  select * into v_contact from public.whatsapp_contacts where business_unit_id=p_unit and phone=p_phone for update;
  select * into v_event from public.whatsapp_events where id=p_id;
  if found then
    if v_event.business_unit_id<>p_unit or v_event.contact_id<>v_contact.id then raise exception 'Evento conflitante'; end if;
    return to_jsonb(v_event);
  end if;
  v_new:=v_contact.message_count=0;
  if v_command='SAIR' then
    update public.whatsapp_contacts set marketing_consent_at=null,profile_consent_at=null,opted_out_at=now()
      where id=v_contact.id;
    v_reply:='Preferências revogadas. Você não receberá campanhas. Para voltar a preencher seu perfil, envie PERFIL SIM.';
  elsif coalesce(v_config->>'botMode','welcome')='crm' then
    if v_command='PERFIL SIM' then
      update public.whatsapp_contacts set profile_consent_at=now(),opted_out_at=null where id=v_contact.id;
      v_reply:='Obrigado! Se quiser, envie NOME: seu nome, EMAIL: seu email, BAIRRO: seu bairro ou PREFERENCIA: o que gosta. Para receber ofertas, envie MARKETING SIM. SAIR revoga as permissões.';
    elsif v_command='MARKETING SIM' then
      update public.whatsapp_contacts set marketing_consent_at=now(),opted_out_at=null where id=v_contact.id;
      v_reply:='Você autorizou receber ofertas por WhatsApp. Envie SAIR para cancelar a qualquer momento.';
    elsif v_contact.profile_consent_at is not null and p_text ~* '^(NOME|EMAIL|BAIRRO|PREFERENCIA):' then
      if p_text ~* '^NOME:' and length(trim(substr(p_text,6))) between 2 and 120 then
        update public.whatsapp_contacts set name=trim(substr(p_text,6)) where id=v_contact.id;
      elsif p_text ~* '^EMAIL:' and trim(substr(p_text,7)) ~ '^[^ @]+@[^ @]+\.[^ @]+$' and length(p_text)<260 then
        update public.whatsapp_contacts set email=lower(trim(substr(p_text,7))) where id=v_contact.id;
      elsif p_text ~* '^BAIRRO:' and length(trim(substr(p_text,8))) between 2 and 120 then
        update public.whatsapp_contacts set bairro=trim(substr(p_text,8)) where id=v_contact.id;
      elsif p_text ~* '^PREFERENCIA:' and length(trim(substr(p_text,13))) between 2 and 500 then
        update public.whatsapp_contacts set preferences=trim(substr(p_text,13)) where id=v_contact.id;
      else v_reply:='Não consegui validar esse campo. Confira o texto e tente novamente.'; end if;
      v_reply:=coalesce(v_reply,'Informação registrada no seu perfil. Obrigado!');
    end if;
  end if;
  if coalesce(v_config->>'botMode','welcome')<>'off' and v_command in('PEDIR','CARDAPIO','CARDÁPIO','MENU') then
    if p_token_hash is not null and p_order_url is not null and exists(select 1 from integrations where business_unit_id=p_unit
      and provider='own-pwa' and status='CONNECTED' and config->>'enabled'='true') then
      insert into ops_private.order_access(token_hash,business_unit_id,contact_id,expires_at)
        values(p_token_hash,p_unit,v_contact.id,now()+interval '60 minutes');
      v_reply:='Faça seu pedido para retirada: '||p_order_url||E'\nEste link pessoal vale por 60 minutos. Pagamento no estabelecimento.';
    else v_reply:='O pedido online ainda não está disponível. Nosso atendimento pode ajudar.'; end if;
  elsif v_reply is null and v_new and coalesce(v_config->>'botMode','welcome') in('welcome','crm') then
    v_reply:=coalesce(nullif(v_config->>'welcomeMessage',''),'Olá! Bem-vindo. Envie PEDIR para acessar o cardápio.');
    if v_config->>'botMode'='crm' then
      v_reply:=v_reply||E'\nPodemos guardar suas preferências para melhorar seu atendimento? Envie PERFIL SIM se concordar. Ofertas somente com MARKETING SIM; SAIR cancela.';
    end if;
  end if;
  update public.whatsapp_contacts set last_seen_at=now(),message_count=message_count+1 where id=v_contact.id;
  insert into public.whatsapp_events(id,business_unit_id,contact_id,message_type,reply,bot_payload,delivery_state)
    values(p_id,p_unit,v_contact.id,p_type,v_reply,
      case when v_config->>'botMode'='external' and v_command<>'SAIR' then
        jsonb_build_object('messageId',p_id,'unitId',p_unit,'contactId',v_contact.id,'phone',p_phone,'text',left(p_text,4096),'type',p_type)
      else null end,
      case when v_reply is not null or (v_config->>'botMode'='external' and v_command<>'SAIR') then 'pending' else 'none' end)
    returning * into v_event;
  update public.integrations set last_sync_at=now(),status='CONNECTED',connected_at=coalesce(connected_at,now()),error_message=null
    where business_unit_id=p_unit and provider='whatsapp';
  return to_jsonb(v_event);
end $$;
revoke all on function public.ingest_whatsapp_message(uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ingest_whatsapp_message(uuid,text,text,text,text,text,text,text) to service_role;

-- Claims prevent simultaneous webhook retries from sending the same response twice.
create or replace function public.claim_whatsapp_reply(p_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_event public.whatsapp_events%rowtype;
begin
  update public.whatsapp_events set delivery_state='sending',lease_until=now()+interval '2 minutes'
    where id=p_id and delivery_state='pending' returning * into v_event;
  if not found then return null; end if;
  return to_jsonb(v_event);
end $$;
revoke all on function public.claim_whatsapp_reply(text) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_reply(text) to service_role;

-- Only a signed WhatsApp sender can obtain an order token. One token = one order.
create or replace function public.submit_pwa_order(p_unit uuid,p_token_hash text,p_items jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path=public,ops_private as $$
declare v_access ops_private.order_access%rowtype; v_contact public.whatsapp_contacts%rowtype;
  v_item jsonb; v_menu public.menu_items%rowtype; v_session uuid; v_client uuid; v_order uuid;
  v_number integer; v_total numeric:=0; v_qty integer; v_line numeric; v_summary jsonb:='[]';
begin
  select * into v_access from ops_private.order_access where token_hash=p_token_hash and business_unit_id=p_unit for update;
  if not found or v_access.expires_at<now() then raise exception 'Link expirado. Envie PEDIR no WhatsApp para gerar outro'; end if;
  if v_access.order_id is not null then return v_access.order_summary; end if;
  if not exists(select 1 from integrations where business_unit_id=p_unit and provider='own-pwa' and status='CONNECTED' and config->>'enabled'='true')
    then raise exception 'Pedidos online indisponíveis'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Carrinho inválido'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Itens duplicados no carrinho'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'Observação muito longa'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty is null or v_qty not between 1 and 20 then raise exception 'Quantidade inválida'; end if;
    select * into v_menu from menu_items where id=(v_item->>'id')::text and business_unit_id=p_unit and active and status='published' for share;
    if not found or v_menu.price is null or v_menu.price<0 then raise exception 'Item indisponível'; end if;
    v_line:=round(v_menu.price*v_qty,2); v_total:=v_total+v_line;
    v_summary:=v_summary||jsonb_build_array(jsonb_build_object('id',v_menu.id,'name',v_menu.name,'quantity',v_qty,'price',v_menu.price));
  end loop;
  if v_total>5000 then raise exception 'Valor máximo por pedido excedido'; end if;
  select * into v_contact from whatsapp_contacts where id=v_access.contact_id;
  -- Negative numbers are reserved for online pickup; they never occupy dining tables.
  perform 1 from business_units where id=p_unit and active for update;
  if not found then raise exception 'Unidade indisponível'; end if;
  select least(coalesce(min(table_number),0),0)-1 into v_number from sessions where business_unit_id=p_unit;
  insert into sessions(business_unit_id,table_number,zone,origin) values(p_unit,v_number,'retirada','customer') returning id into v_session;
  insert into session_clients(session_id,business_unit_id,name,phone,email,bairro)
    values(v_session,p_unit,v_contact.name,v_contact.phone,v_contact.email,v_contact.bairro) returning id into v_client;
  insert into orders(business_unit_id,session_id,client_id,origin,source,external_id,subtotal,total)
    values(p_unit,v_session,v_client,'pwa','own-pwa',left(p_token_hash,32),v_total,v_total) returning id into v_order;
  for v_item in select value from jsonb_array_elements(v_summary) loop
    insert into order_items(order_id,menu_item_id,name,price,quantity,observation,destination)
      values(v_order,v_item->>'id',v_item->>'name',(v_item->>'price')::numeric,(v_item->>'quantity')::integer,nullif(trim(p_note),''),
        coalesce((select mc.destination from menu_categories mc join menu_items mi on mi.category=mc.key
          where mi.id=v_item->>'id' and mi.business_unit_id=p_unit),'kitchen'));
  end loop;
  v_summary:=jsonb_build_object('orderId',v_order,'pickupNumber',abs(v_number),'total',v_total,'items',v_summary);
  update ops_private.order_access set order_id=v_order,order_summary=v_summary where token_hash=p_token_hash;
  return v_summary;
end $$;
revoke all on function public.submit_pwa_order(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_pwa_order(uuid,text,jsonb,text) to service_role;

-- Prevent online activation before the password-gated checkout rollout is installed.
create or replace function public.operational_readiness() returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('cashierWorkflow',to_regprocedure('public.request_session_closure(uuid,boolean)') is not null
    and to_regprocedure('public.approve_session_closure(uuid,uuid,text)') is not null);
$$;
revoke all on function public.operational_readiness() from public,anon,authenticated;
grant execute on function public.operational_readiness() to service_role;

-- Safe onboarding defaults: no credentials, no assumed public domain, no live ordering.
insert into public.integrations(business_unit_id,provider,status,config)
select bu.id,defaults.provider,'NOT_CONNECTED',defaults.config
from public.business_units bu cross join (values
  ('whatsapp','{"botMode":"crm","welcomeMessage":"Olá! Bem-vindo. Envie PEDIR para acessar nosso cardápio.","phoneNumberId":"","businessPhone":"","graphVersion":"","botWebhookUrl":""}'::jsonb),
  ('own-pwa','{"enabled":false,"publicOrigin":"","pickupOnly":true}'::jsonb)
) defaults(provider,config) where bu.active
on conflict(business_unit_id,provider) do nothing;
create index whatsapp_events_contact_idx on public.whatsapp_events(contact_id);
create index order_access_contact_idx on ops_private.order_access(contact_id);
create index order_access_order_idx on ops_private.order_access(order_id);
create index order_access_expiry_idx on ops_private.order_access(expires_at);
