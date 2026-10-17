-- Verificação do celular por SMS (Twilio Verify) para o PWA de pedidos do cliente.
-- Fluxo: 1) nome completo + celular (com a marca da unidade) 2) código por SMS 3) cardápio; o cliente entra no CRM.
-- Alternativa ao "PEDIR" no WhatsApp: os dois caminhos geram o MESMO acesso de uso único
-- (ops_private.order_access, 60 min) e o pedido segue por submit_pwa_order sem mudança.
-- O código é gerado e conferido pelo Twilio; aqui guardamos só o limite de envios.

create table if not exists ops_private.pwa_sms_sends (
  id bigint generated always as identity primary key,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  phone text not null,
  sent_at timestamptz not null default now()
);
create index if not exists pwa_sms_sends_phone_idx on ops_private.pwa_sms_sends (business_unit_id, phone, sent_at desc);
create index if not exists pwa_sms_sends_unit_idx on ops_private.pwa_sms_sends (business_unit_id, sent_at desc);
create index if not exists pwa_sms_sends_sent_idx on ops_private.pwa_sms_sends (sent_at);
alter table ops_private.pwa_sms_sends enable row level security;
revoke all on ops_private.pwa_sms_sends from public, anon, authenticated;
grant all on ops_private.pwa_sms_sends to service_role;

-- Limita custo e abuso de SMS: 1 envio a cada 30 s e 3 a cada 15 min por número; 60 a cada 10 min por unidade.
create or replace function public.register_pwa_sms_send(p_unit uuid, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_phone is null or p_phone !~ '^55[0-9]{10,11}$' then raise exception 'Celular inválido'; end if;
  if not exists (select 1 from public.business_units where id = p_unit and active) then raise exception 'Pedidos online indisponíveis'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pwa-sms:' || p_unit::text, 0));
  -- Retenção: os limites olham só os últimos 15 min; não guardamos telefone por mais de 1 dia.
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

-- Se o Twilio falhar, devolve a vaga reservada: envio que não saiu não pode bloquear o número nem a unidade.
create or replace function public.release_pwa_sms_send(p_unit uuid, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('pwa-sms:' || p_unit::text, 0));
  delete from ops_private.pwa_sms_sends where id = (select id from ops_private.pwa_sms_sends
    where business_unit_id = p_unit and phone = p_phone order by sent_at desc, id desc limit 1);
end $$;
revoke all on function public.release_pwa_sms_send(uuid, text) from public, anon, authenticated;
grant execute on function public.release_pwa_sms_send(uuid, text) to service_role;

-- Nome completo: pelo menos duas palavras (nome e sobrenome) com 2+ letras, sem números.
create or replace function ops_private.valid_full_name(p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select length(btrim(coalesce(p_name, ''))) between 5 and 80
     and btrim(p_name) !~ '[0-9@]'
     and (select count(*) from unnest(regexp_split_to_array(btrim(p_name), '\s+')) w where length(w) >= 2) >= 2;
$$;

-- Depois do código aprovado pelo Twilio: cria/atualiza o cliente no CRM (nome completo e opcionais)
-- e emite o acesso de uso único. Consentimentos com data; desmarcar novidades retira o consentimento.
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
  if not exists (select 1 from public.business_units where id = p_unit and active) then raise exception 'Pedidos online indisponíveis'; end if;
  if not exists (select 1 from public.integrations where business_unit_id = p_unit and provider = 'own-pwa'
                 and status = 'CONNECTED' and config->>'enabled' = 'true') then
    raise exception 'Pedidos online indisponíveis'; end if;
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
