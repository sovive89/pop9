-- Contrato server-side do PWA público.
-- O navegador recebe apenas opções pertencentes ao item; o banco recalcula o preço
-- e persiste o snapshot escolhido no order_items.
begin;

alter table public.order_items
  add column if not exists variant_id uuid,
  add column if not exists variant_name text;

create index if not exists order_items_variant_idx
  on public.order_items (variant_id)
  where variant_id is not null;

create or replace function ops_private.resolve_pwa_order_lines(p_unit uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_output jsonb := '[]'::jsonb;
  v_mods jsonb;
  v_additions jsonb;
  v_removals jsonb;
  v_option text;
  v_key text;
  v_seen text[] := '{}';
  v_qty integer;
  v_variant_id uuid;
  v_variant_name text;
  v_add_id uuid;
  v_add_name text;
  v_add_price numeric;
  v_removable boolean;
  v_menu public.menu_items%rowtype;
  v_quote jsonb;
  v_total_price numeric;
begin
  if p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Carrinho inválido';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Item de carrinho inválido';
    end if;

    if coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Quantidade inválida';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty not between 1 and 20 then
      raise exception 'Quantidade inválida';
    end if;

    if v_item ? 'combo_id' then
      if coalesce(v_item->>'combo_id', '') !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'Combo indisponível';
      end if;
      if v_item ? 'variant_id'
         or v_item ? 'additions'
         or v_item ? 'removals' then
        raise exception 'Opções indisponíveis para combo';
      end if;

      v_key := 'combo:' || (v_item->>'combo_id');
      if v_key = any(v_seen) then
        raise exception 'Itens duplicados no carrinho';
      end if;
      v_seen := array_append(v_seen, v_key);

      v_quote := ops_private.ready_combo_quote(p_unit, (v_item->>'combo_id')::uuid);
      if v_quote is null then
        raise exception 'Combo indisponível';
      end if;
      v_output := v_output || jsonb_build_array(jsonb_build_object(
        'combo_id', v_quote->>'id',
        'name', v_quote->>'name',
        'quantity', v_qty,
        'price', (v_quote->>'price')::numeric,
        'components', v_quote->'components'
      ));
      continue;
    end if;

    if coalesce(v_item->>'id', '') = '' then
      raise exception 'Item indisponível';
    end if;

    select * into v_menu
      from public.menu_items
     where id = v_item->>'id'
       and business_unit_id = p_unit
       and active
       and status = 'published'
     for share;
    if not found or v_menu.price is null or v_menu.price < 0 then
      raise exception 'Item indisponível';
    end if;

    v_variant_id := null;
    v_variant_name := null;
    if v_item ? 'variant_id' and coalesce(v_item->>'variant_id', '') <> '' then
      if (v_item->>'variant_id') !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'Variante inválida';
      end if;
      v_variant_id := (v_item->>'variant_id')::uuid;
      select name into v_variant_name
        from public.menu_item_variants
       where id = v_variant_id
         and menu_item_id = v_menu.id;
      if not found then
        raise exception 'Variante não pertence ao item';
      end if;
    end if;

    v_additions := coalesce(v_item->'additions', '[]'::jsonb);
    v_removals := coalesce(v_item->'removals', '[]'::jsonb);
    if jsonb_typeof(v_additions) is distinct from 'array'
       or jsonb_typeof(v_removals) is distinct from 'array' then
      raise exception 'Opções de ingrediente inválidas';
    end if;
    if jsonb_array_length(v_additions) > 30 or jsonb_array_length(v_removals) > 30 then
      raise exception 'Muitas opções no item';
    end if;

    v_key := 'item:' || v_menu.id || '|variant:' || coalesce(v_variant_id::text, '')
      || '|add:' || v_additions::text || '|remove:' || v_removals::text;
    if v_key = any(v_seen) then
      raise exception 'Itens duplicados no carrinho';
    end if;
    v_seen := array_append(v_seen, v_key);

    v_mods := '[]'::jsonb;
    v_total_price := v_menu.price;

    for v_option in select value from jsonb_array_elements_text(v_additions) loop
      if v_option !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'Adicional inválido';
      end if;
      v_add_id := v_option::uuid;
      select name, coalesce(extra_price, 0) into v_add_name, v_add_price
        from public.menu_item_ingredients
       where id = v_add_id
         and menu_item_id = v_menu.id;
      if not found then
        raise exception 'Adicional não pertence ao item';
      end if;
      if v_add_price < 0 or v_add_price >= 'Infinity'::numeric then
        raise exception 'Preço de adicional inválido';
      end if;
      v_total_price := v_total_price + v_add_price;
      v_mods := v_mods || jsonb_build_array(jsonb_build_object(
        'id', v_add_id,
        'name', v_add_name,
        'action', 'extra',
        'extraPrice', v_add_price
      ));
    end loop;

    for v_option in select value from jsonb_array_elements_text(v_removals) loop
      if v_option !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'Remoção inválida';
      end if;
      v_add_id := v_option::uuid;
      select name, removable into v_add_name, v_removable
        from public.menu_item_ingredients
       where id = v_add_id
         and menu_item_id = v_menu.id;
      if not found or not coalesce(v_removable, false) then
        raise exception 'Ingrediente não pode ser removido';
      end if;
      v_mods := v_mods || jsonb_build_array(jsonb_build_object(
        'id', v_add_id,
        'name', v_add_name,
        'action', 'remove',
        'extraPrice', 0
      ));
    end loop;

    if length(coalesce(v_item->>'observation', '')) > 500 then
      raise exception 'Observação do item muito longa';
    end if;

    v_output := v_output || jsonb_build_array(jsonb_build_object(
      'id', v_menu.id,
      'name', v_menu.name,
      'quantity', v_qty,
      'price', round(v_total_price, 2),
      'observation', nullif(trim(v_item->>'observation'), ''),
      'ingredientMods', v_mods,
      'variantId', v_variant_id,
      'variantName', v_variant_name
    ));
  end loop;

  return v_output;
end;
$function$;

revoke all on function ops_private.resolve_pwa_order_lines(uuid, jsonb) from public, anon, authenticated;
grant execute on function ops_private.resolve_pwa_order_lines(uuid, jsonb) to service_role;

create or replace function public.submit_pwa_order(p_unit uuid, p_token_hash text, p_items jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog,public,ops_private,pg_temp'
as $function$
declare
  v_access ops_private.order_access%rowtype;
  v_contact public.whatsapp_contacts%rowtype;
  v_line jsonb;
  v_lines jsonb;
  v_summary jsonb;
  v_session uuid;
  v_client uuid;
  v_order uuid;
  v_number integer;
  v_total numeric;
  v_group uuid;
  v_part jsonb;
  v_k integer;
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

  select * into v_contact from public.whatsapp_contacts where id = v_access.contact_id and business_unit_id = p_unit;
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
  insert into public.orders(business_unit_id, session_id, client_id, origin, source, external_id, subtotal, total)
    values (p_unit, v_session, v_client, 'pwa', 'own-pwa', left(p_token_hash, 32), v_total, v_total)
    returning id into v_order;

  for v_line in select value from jsonb_array_elements(v_lines) loop
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
    'total', v_total,
    'items', (select coalesce(jsonb_agg(line - 'components'), '[]'::jsonb) from jsonb_array_elements(v_lines) line)
  );
  update ops_private.order_access set order_id = v_order, order_summary = v_summary where token_hash = p_token_hash;
  return v_summary;
end;
$function$;

revoke all on function public.submit_pwa_order(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_pwa_order(uuid, text, jsonb, text) to service_role;

commit;
