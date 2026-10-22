-- O PWA acompanha o mesmo pedido criado no fluxo interno, sem expor o ID
-- como credencial: a consulta exige o hash do link pessoal emitido para o cliente.
create or replace function public.get_pwa_order_status(p_unit uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access ops_private.order_access%rowtype;
  v_order public.orders%rowtype;
  v_number integer;
  v_items jsonb;
begin
  select * into v_access
    from ops_private.order_access
   where business_unit_id = p_unit
     and token_hash = p_token_hash
   for share;

  if not found or v_access.order_id is null then
    raise exception 'Pedido ainda não foi registrado';
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
    'items', v_items
  );
end
$function$;

revoke all on function public.get_pwa_order_status(uuid, text) from public, anon, authenticated;
grant execute on function public.get_pwa_order_status(uuid, text) to service_role;
