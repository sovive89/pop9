create table public.operation_periods (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id),
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  check (closed_at is null or closed_at >= opened_at)
);
create unique index operation_periods_one_open on public.operation_periods(business_unit_id) where closed_at is null;
create index operation_periods_unit_history on public.operation_periods(business_unit_id,opened_at desc);
alter table public.operation_periods enable row level security;
revoke all on public.operation_periods from public,anon,authenticated;
grant select on public.operation_periods to authenticated;
grant all on public.operation_periods to service_role;
create policy operation_periods_read on public.operation_periods for select to authenticated
  using(app_private.has_unit_role(business_unit_id,array['admin','cashier','attendant','kitchen']));

-- Preserve the current ability to take orders during the coordinated frontend rollout.
insert into public.operation_periods(business_unit_id)
select id from public.business_units where active;

create function public.set_unit_operation(p_unit uuid,p_open boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_active integer;v_time timestamptz;
begin
  if p_open is null or not app_private.has_unit_role(p_unit,array['admin','cashier']) then
    raise exception 'Só Administrador ou Caixa desta unidade pode iniciar/fechar operação' using errcode='42501';
  end if;
  -- Session/order inserts take a shared lock on this same row.
  perform 1 from public.business_units where id=p_unit and active for update;
  if not found then raise exception 'Unidade indisponível';end if;
  select id into v_id from public.operation_periods where business_unit_id=p_unit and closed_at is null;
  if p_open then
    if v_id is null then
      insert into public.operation_periods(business_unit_id,opened_by) values(p_unit,auth.uid()) returning id into v_id;
    end if;
    return jsonb_build_object('open',true,'period_id',v_id);
  end if;
  select count(*) into v_active from public.sessions where business_unit_id=p_unit and status='active';
  if v_active>0 then raise exception 'Há % comanda(s) aberta(s). Finalize os pagamentos e encerre as sessões no Caixa antes de fechar a operação.',v_active;end if;
  if v_id is not null then
    v_time=clock_timestamp();
    update public.operation_periods set closed_at=v_time,closed_by=auth.uid() where id=v_id;
  end if;
  return jsonb_build_object('open',false,'period_id',v_id);
end;
$$;
revoke all on function public.set_unit_operation(uuid,boolean) from public,anon;
grant execute on function public.set_unit_operation(uuid,boolean) to authenticated;

create function app_private.require_open_operation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_unit uuid;
begin
  if tg_table_name='order_items' then
    select business_unit_id into v_unit from public.orders where id=new.order_id;
  else v_unit=new.business_unit_id;end if;
  -- Historical session imports do not create a live operation.
  if tg_table_name='sessions' then
    if new.status<>'active' then return new;end if;
  end if;
  perform 1 from public.business_units where id=v_unit and active for share;
  if not found or not exists(select 1 from public.operation_periods where business_unit_id=v_unit and closed_at is null) then
    raise exception 'Operação fechada. O Caixa ou Administrador deve iniciar a operação antes de receber novos pedidos.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.require_open_operation() from public,anon,authenticated;
create trigger require_open_operation before insert on public.sessions for each row execute function app_private.require_open_operation();
create trigger require_open_operation before insert on public.orders for each row execute function app_private.require_open_operation();
create trigger require_open_operation before insert on public.order_items for each row execute function app_private.require_open_operation();
