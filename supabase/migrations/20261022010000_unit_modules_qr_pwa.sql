-- Interruptores por unidade: autoatendimento_qr (porta da mesa) e pwa_publica (site público).
-- Aditiva: só amplia a lista aceita por set_unit_module (produção já aceita; isto versiona a mudança) e
-- trava no banco o PWA público: esconder botão não basta, o link continua existindo.
-- submit_pwa_order abaixo é a versão que está em produção (usa ops_private.resolve_pwa_order_lines) + 1 linha de trava.
-- Pendente: guardar issue_pwa_sms_access e register_pwa_sms_send quando 20261017180000 for aplicada em produção.
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

create or replace function public.submit_pwa_order(p_unit uuid, p_token_hash text, p_items jsonb, p_note text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_access ops_private.order_access%rowtype; v_contact public.whatsapp_contacts%rowtype;
  v_line jsonb; v_lines jsonb; v_summary jsonb; v_session uuid; v_client uuid; v_order uuid;
  v_number integer; v_total numeric;
begin
  select * into v_access from ops_private.order_access where token_hash=p_token_hash
    and business_unit_id=p_unit for update;
  if not found or v_access.expires_at<now() then raise exception 'Link expirado. Envie PEDIR no WhatsApp para gerar outro'; end if;
  if v_access.order_id is not null then return v_access.order_summary; end if;
  if not ops_private.module_enabled(p_unit,'pwa_publica') then raise exception 'Pedidos online indisponíveis'; end if;
  if not exists(select 1 from public.integrations where business_unit_id=p_unit and provider='own-pwa'
    and status='CONNECTED' and config->>'enabled'='true') then raise exception 'Pedidos online indisponíveis'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'Observação muito longa'; end if;
  -- A mesma trava usada pelo fechamento de operação impede corrida entre os fluxos.
  perform 1 from public.business_units where id=p_unit and active for update;
  if not found then raise exception 'Unidade indisponível'; end if;
  if not exists(select 1 from public.operation_periods where business_unit_id=p_unit and closed_at is null) then
    raise exception 'Operação fechada. Tente novamente quando a loja abrir.';
  end if;
  v_lines:=ops_private.resolve_pwa_order_lines(p_unit,p_items);
  select sum((l->>'price')::numeric*(l->>'quantity')::integer) into v_total from jsonb_array_elements(v_lines) l;
  if v_total>5000 then raise exception 'Valor máximo por pedido excedido'; end if;
  select * into v_contact from public.whatsapp_contacts where id=v_access.contact_id and business_unit_id=p_unit;
  if not found then raise exception 'Contato inválido'; end if;
  select least(coalesce(min(table_number),0),0)-1 into v_number from public.sessions where business_unit_id=p_unit;
  insert into public.sessions(business_unit_id,table_number,zone,origin)
    values(p_unit,v_number,'retirada','customer') returning id into v_session;
  insert into public.session_clients(session_id,business_unit_id,name,phone,email,bairro)
    values(v_session,p_unit,v_contact.name,v_contact.phone,v_contact.email,v_contact.bairro) returning id into v_client;
  insert into public.orders(business_unit_id,session_id,client_id,origin,source,external_id,subtotal,total)
    values(p_unit,v_session,v_client,'pwa','own-pwa',left(p_token_hash,32),v_total,v_total) returning id into v_order;
  for v_line in select value from jsonb_array_elements(v_lines) loop
    -- O trigger canônico resolve setor por item/categoria e baixa a ficha/lotes.
    insert into public.order_items(order_id,menu_item_id,name,price,quantity,observation,combo_group_id,combo_name)
      values(v_order,v_line->>'id',v_line->>'name',(v_line->>'price')::numeric,(v_line->>'quantity')::integer,
        nullif(trim(p_note),''),(v_line->>'comboGroupId')::uuid,v_line->>'comboName');
  end loop;
  v_summary:=jsonb_build_object('orderId',v_order,'pickupNumber',abs(v_number),'total',v_total,'items',v_lines);
  update ops_private.order_access set order_id=v_order,order_summary=v_summary where token_hash=p_token_hash;
  return v_summary;
end $function$;
revoke all on function public.submit_pwa_order(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_pwa_order(uuid, text, jsonb, text) to service_role;
