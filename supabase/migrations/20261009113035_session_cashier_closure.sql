alter table public.sessions
  add column if not exists closure_requested_at timestamptz,
  add column if not exists closure_requested_by uuid references auth.users(id),
  add column if not exists service_charge_enabled boolean not null default false;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.has_unit_role(p_unit uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles ur join public.business_units bu on bu.id = ur.business_unit_id
    where ur.user_id = auth.uid() and ur.business_unit_id = p_unit
      and ur.role::text = any(p_roles) and bu.active
  );
$$;
revoke all on function app_private.has_unit_role(uuid,text[]) from public;
grant execute on function app_private.has_unit_role(uuid,text[]) to authenticated, service_role;

create table if not exists public.session_closures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id),
  business_unit_id uuid not null references public.business_units(id),
  table_number integer not null,
  requested_by uuid references auth.users(id),
  closed_by uuid not null references auth.users(id),
  closed_at timestamptz not null default now(),
  closed_by_name text not null,
  total_consumed numeric(12,2) not null,
  total_service numeric(12,2) not null,
  total_paid numeric(12,2) not null,
  unpaid_total numeric(12,2) not null check(unpaid_total >= 0),
  justification text,
  snapshot jsonb not null,
  check(unpaid_total = 0 or (justification is not null and length(trim(justification)) >= 10))
);
alter table public.session_closures enable row level security;
revoke all on public.session_closures from public, anon, authenticated;
grant select on public.session_closures to authenticated;
grant all on public.session_closures to service_role;
create policy "Cashier reads unit closure audit" on public.session_closures for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin','cashier']));
create index if not exists session_closures_unit_closed_idx on public.session_closures(business_unit_id, closed_at desc);
create index if not exists sessions_closure_queue_idx on public.sessions(business_unit_id, closure_requested_at) where status = 'active' and closure_requested_at is not null;

create policy "Cashier reads unit sessions" on public.sessions for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['cashier']));
create policy "Cashier reads unit clients" on public.session_clients for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['cashier']));
create policy "Cashier reads unit orders" on public.orders for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['cashier']));
create policy "Cashier reads unit order items" on public.order_items for select to authenticated
  using (exists(select 1 from public.orders o where o.id = order_id and app_private.has_unit_role(o.business_unit_id, array['cashier'])));
create policy "Cashier reads unit payments" on public.payments for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['cashier']));
create policy "Cashier inserts unit payments" on public.payments for insert to authenticated
  with check (created_by = auth.uid() and app_private.has_unit_role(business_unit_id, array['cashier']));

-- Restrict the balance lookup to the requested session instead of scanning history.
create index if not exists checkout_clients_session_idx on public.session_clients(session_id);
create index if not exists checkout_orders_session_client_idx on public.orders(session_id,client_id) where status <> 'cancelled';
create index if not exists checkout_items_order_idx on public.order_items(order_id);
create index if not exists checkout_payments_session_client_idx on public.payments(session_id,client_id) where status = 'confirmed';

-- Browser clients must use the request RPC. Closing is reserved for the server.
revoke update on public.sessions from public, anon, authenticated;
grant update(zone) on public.sessions to authenticated;
create or replace function app_private.guard_session_creation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and (auth.jwt()->>'role') is distinct from 'service_role'
    and (new.status <> 'active' or new.ended_at is not null or new.closure_requested_at is not null
      or new.closure_requested_by is not null or new.service_charge_enabled) then
    raise exception 'Sessões devem ser abertas sem encerramento prévio' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_session_creation() from public;
create trigger guard_session_creation before insert on public.sessions for each row execute function app_private.guard_session_creation();

-- Serialize financial writes and closure using the same session row lock.
create or replace function app_private.lock_open_checkout_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_row public.sessions%rowtype; v_client_session uuid; v_unit uuid;
begin
  if tg_table_name = 'order_items' then
    select session_id, business_unit_id into v_session, v_unit from public.orders where id = case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    if tg_op = 'UPDATE' and new.order_id <> old.order_id then raise exception 'Não é permitido transferir itens entre pedidos'; end if;
  elsif tg_table_name = 'session_clients' then
    v_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
    v_unit := case when tg_op = 'DELETE' then old.business_unit_id else new.business_unit_id end;
  else
    v_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
    v_unit := case when tg_op = 'DELETE' then old.business_unit_id else new.business_unit_id end;
    if tg_op = 'UPDATE' and (new.session_id <> old.session_id or new.business_unit_id <> old.business_unit_id or new.client_id <> old.client_id) then
      raise exception 'Não é permitido transferir pedidos ou pagamentos entre comandas';
    end if;
    if tg_op <> 'DELETE' then
      select session_id into v_client_session from public.session_clients where id = new.client_id;
      if v_client_session is distinct from v_session then raise exception 'Cliente não pertence à sessão'; end if;
    end if;
  end if;
  select * into v_row from public.sessions where id = v_session for update;
  if not found or v_row.business_unit_id is distinct from v_unit then raise exception 'Sessão ou unidade inválida'; end if;
  if v_row.status <> 'active' then raise exception 'A sessão já foi encerrada'; end if;
  if auth.uid() is not null and (auth.jwt()->>'role') is distinct from 'service_role'
    and not app_private.has_unit_role(v_unit, array['admin','attendant','cashier','kitchen']) then
    raise exception 'Sem permissão para alterar a comanda desta unidade' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.lock_open_checkout_session() from public;
create trigger lock_order_checkout before insert or update or delete on public.orders for each row execute function app_private.lock_open_checkout_session();
create trigger lock_item_checkout before insert or update or delete on public.order_items for each row execute function app_private.lock_open_checkout_session();
create trigger lock_client_checkout before insert or delete on public.session_clients for each row execute function app_private.lock_open_checkout_session();
create trigger lock_payment_checkout before insert or update or delete on public.payments for each row execute function app_private.lock_open_checkout_session();

create or replace function app_private.checkout_snapshot(p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with client_totals as (
    select sc.id, sc.name, sc.phone,
      coalesce((select round(sum((oi.price + coalesce((select sum(greatest(0,(m->>'extraPrice')::numeric))
        from jsonb_array_elements(case when jsonb_typeof(oi.ingredient_mods) = 'array' then oi.ingredient_mods else '[]'::jsonb end) m
        where m->>'action' = 'extra' and jsonb_typeof(m->'extraPrice') = 'number'),0)) * oi.quantity),2)
        from public.orders o join public.order_items oi on oi.order_id = o.id
        where o.session_id = p_session and o.client_id = sc.id and o.status <> 'cancelled'),0) as consumed,
      coalesce((select sum(p.amount) from public.payments p where p.session_id = p_session and p.client_id = sc.id and p.status = 'confirmed'),0) as paid,
      coalesce((select sum(p.service_charge) from public.payments p where p.session_id = p_session and p.client_id = sc.id and p.status = 'confirmed'),0) as paid_service,
      s.service_charge_enabled
    from public.session_clients sc join public.sessions s on s.id = sc.session_id where s.id = p_session
  ), balances as (
    select *, case when service_charge_enabled then round(consumed * 0.1,2) else 0 end as service,
      greatest(0,consumed-paid) as remaining_consumption,
      greatest(0,case when service_charge_enabled then round(consumed * 0.1,2) else 0 end-paid_service) as remaining_service
    from client_totals
  ) select jsonb_build_object(
    'totalConsumed',coalesce(sum(consumed),0),'totalService',coalesce(sum(service),0),
    'totalPaid',coalesce(sum(paid+paid_service),0),'remaining',coalesce(sum(remaining_consumption+remaining_service),0),
    'openOrders',(select count(*) from public.orders where session_id = p_session and status not in ('delivered','cancelled')),
    'clients',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'consumed',consumed,
      'service',service,'paid',paid,'paidService',paid_service,'remaining',remaining_consumption+remaining_service)), '[]'::jsonb)
  ) from balances;
$$;
revoke all on function app_private.checkout_snapshot(uuid) from public;

create or replace function public.get_session_checkout(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_unit uuid;
begin
  select business_unit_id into v_unit from public.sessions where id = p_session_id;
  if not app_private.has_unit_role(v_unit, array['admin','attendant','cashier']) then
    raise exception 'Sem acesso à comanda desta unidade' using errcode = '42501';
  end if;
  return app_private.checkout_snapshot(p_session_id);
end;
$$;
revoke all on function public.get_session_checkout(uuid) from public;
grant execute on function public.get_session_checkout(uuid) to authenticated;

create or replace function public.request_session_closure(p_session_id uuid, p_service_charge boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.sessions%rowtype;
begin
  select * into v_row from public.sessions where id = p_session_id for update;
  if not found or not app_private.has_unit_role(v_row.business_unit_id, array['admin','attendant','cashier']) then
    raise exception 'Sem acesso à comanda desta unidade' using errcode = '42501';
  end if;
  if v_row.status <> 'active' then raise exception 'A sessão já foi encerrada'; end if;
  update public.sessions set closure_requested_at = coalesce(closure_requested_at,now()),
    closure_requested_by = coalesce(closure_requested_by,auth.uid()), service_charge_enabled = p_service_charge
  where id = p_session_id;
  return app_private.checkout_snapshot(p_session_id);
end;
$$;
revoke all on function public.request_session_closure(uuid,boolean) from public;
grant execute on function public.request_session_closure(uuid,boolean) to authenticated;

-- Service role only: called after password verification in the Edge Function.
create or replace function public.approve_session_closure(p_session_id uuid, p_actor_id uuid, p_justification text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.sessions%rowtype; v_snapshot jsonb; v_remaining numeric; v_reason text;
begin
  select * into v_row from public.sessions where id = p_session_id for update;
  if not found or not exists(select 1 from public.user_roles ur join public.business_units bu on bu.id = ur.business_unit_id
    where ur.user_id = p_actor_id and ur.business_unit_id = v_row.business_unit_id and ur.role::text in ('admin','cashier') and bu.active) then
    raise exception 'Apenas Caixa ou Administrador da unidade pode encerrar' using errcode = '42501';
  end if;
  if v_row.status <> 'active' then raise exception 'A sessão já foi encerrada'; end if;
  if v_row.closure_requested_at is null then raise exception 'Solicite o encerramento antes de confirmar'; end if;
  v_snapshot := app_private.checkout_snapshot(p_session_id);
  v_remaining := (v_snapshot->>'remaining')::numeric;
  v_reason := nullif(trim(p_justification),'');
  if (v_snapshot->>'openOrders')::integer > 0 then raise exception 'Há pedidos aguardando entrega ou cancelamento'; end if;
  if v_remaining > 0 and (v_reason is null or length(v_reason) < 10) then
    raise exception 'Informe uma justificativa de ao menos 10 caracteres para a inadimplência';
  end if;
  if length(v_reason) > 1000 then raise exception 'Justificativa muito longa'; end if;
  insert into public.session_closures(session_id,business_unit_id,table_number,requested_by,closed_by,closed_by_name,total_consumed,total_service,total_paid,unpaid_total,justification,snapshot)
  values(p_session_id,v_row.business_unit_id,v_row.table_number,v_row.closure_requested_by,p_actor_id,coalesce((select full_name from public.profiles where user_id=p_actor_id),'Caixa'),
    (v_snapshot->>'totalConsumed')::numeric,(v_snapshot->>'totalService')::numeric,(v_snapshot->>'totalPaid')::numeric,v_remaining,v_reason,v_snapshot);
  update public.sessions set status = 'closed', ended_at = now() where id = p_session_id;
  return jsonb_build_object('closed',true,'unpaidTotal',v_remaining,'snapshot',v_snapshot);
end;
$$;
revoke all on function public.approve_session_closure(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.approve_session_closure(uuid,uuid,text) to service_role;
