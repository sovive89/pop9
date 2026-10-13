-- Fila central de impressão.
--
-- Hoje a comanda só imprime no navegador de quem enviou o pedido (o garçom). Pedido
-- feito pelo cliente no celular (PWA/WhatsApp) ou vindo de integração (iFood e afins,
-- no futuro) não imprime em lugar nenhum.
--
-- Com print_mode = 'station', cada pedido gravado gera um print_job no banco, não
-- importa a origem: o gatilho está em order_items, então qualquer caminho que grave
-- itens (tela da mesa, submit_pwa_order, conector futuro) entra na fila. Uma "Estação
-- de impressão" (/impressao) aberta no aparelho ligado à impressora consome a fila.
--
-- print_mode = 'device' (padrão) mantém o comportamento atual: nada muda até o admin
-- da unidade escolher a estação.

alter table public.business_units
  add column if not exists print_mode text not null default 'device'
  check (print_mode in ('device', 'station'));
comment on column public.business_units.print_mode is
  'device = imprime no navegador de quem envia o pedido (atual); station = fila central consumida pela Estação de impressão.';

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  gatilho text not null default 'comanda_cozinha' check (gatilho in ('comanda_cozinha')),
  status text not null default 'pending' check (status in ('pending', 'printing', 'printed', 'failed')),
  attempts integer not null default 0,
  claimed_by uuid,
  claimed_at timestamptz,
  printed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  -- Um pedido gera uma tarefa por gatilho: vários inserts de itens no mesmo pedido não duplicam.
  unique (order_id, gatilho)
);
create index print_jobs_unit_status on public.print_jobs (business_unit_id, status, created_at);

alter table public.print_jobs enable row level security;
create policy print_jobs_staff_read on public.print_jobs for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin', 'attendant', 'kitchen', 'cashier']));
-- Sem insert/update/delete direto: só o gatilho e as funções abaixo escrevem.
revoke all on public.print_jobs from public, anon, authenticated;
grant select on public.print_jobs to authenticated;
grant all on public.print_jobs to service_role;

create or replace function app_private.enqueue_print_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_mode text;
begin
  select o.business_unit_id, bu.print_mode into v_unit, v_mode
    from public.orders o join public.business_units bu on bu.id = o.business_unit_id
   where o.id = new.order_id;
  if v_unit is not null and v_mode = 'station' then
    insert into public.print_jobs (business_unit_id, order_id) values (v_unit, new.order_id)
    on conflict (order_id, gatilho) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enqueue_print_job() from public;
create trigger enqueue_print_job after insert on public.order_items
  for each row execute function app_private.enqueue_print_job();

-- A estação "pega" a tarefa antes de imprimir; só uma estação imprime cada pedido.
-- Uma tarefa presa em 'printing' por mais de 2 minutos (aparelho caiu) volta a poder ser pega.
create or replace function public.claim_print_job(p_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_unit uuid;
begin
  select business_unit_id into v_unit from public.print_jobs where id = p_job;
  if v_unit is null or not app_private.has_unit_role(v_unit, array['admin', 'attendant', 'kitchen', 'cashier']) then
    raise exception 'Sem permissão para imprimir nesta unidade' using errcode = '42501';
  end if;
  update public.print_jobs
     set status = 'printing', claimed_by = auth.uid(), claimed_at = now(), attempts = attempts + 1
   where id = p_job
     and (status = 'pending' or status = 'failed' or (status = 'printing' and claimed_at < now() - interval '2 minutes'));
  return found;
end;
$$;

create or replace function public.finish_print_job(p_job uuid, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.print_jobs
     set status = case when p_ok then 'printed' else 'failed' end,
         printed_at = case when p_ok then now() else printed_at end,
         error_message = case when p_ok then null else left(coalesce(p_error, 'Falha na impressão'), 300) end
   where id = p_job and claimed_by = auth.uid() and status = 'printing';
  if not found then raise exception 'Tarefa de impressão não está com esta estação'; end if;
end;
$$;

-- Reimpressão manual de um pedido já impresso.
create or replace function public.requeue_print_job(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_unit uuid;
begin
  select business_unit_id into v_unit from public.print_jobs where id = p_job;
  if v_unit is null or not app_private.has_unit_role(v_unit, array['admin', 'attendant', 'kitchen', 'cashier']) then
    raise exception 'Sem permissão para imprimir nesta unidade' using errcode = '42501';
  end if;
  update public.print_jobs set status = 'pending', claimed_by = null, claimed_at = null, error_message = null where id = p_job;
end;
$$;

create or replace function public.set_unit_print_mode(p_unit uuid, p_mode text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_unit_role(p_unit, array['admin']) then
    raise exception 'Sem permissão para alterar a impressão desta unidade' using errcode = '42501';
  end if;
  if p_mode not in ('device', 'station') then raise exception 'Modo de impressão inválido'; end if;
  perform pg_catalog.set_config('pop9.unit_settings', 'on', true);
  update public.business_units set print_mode = p_mode where id = p_unit;
  if not found then raise exception 'Unidade não encontrada'; end if;
  return p_mode;
end;
$$;

revoke all on function public.claim_print_job(uuid) from public, anon;
revoke all on function public.finish_print_job(uuid, boolean, text) from public, anon;
revoke all on function public.requeue_print_job(uuid) from public, anon;
revoke all on function public.set_unit_print_mode(uuid, text) from public, anon;
grant execute on function public.claim_print_job(uuid) to authenticated;
grant execute on function public.finish_print_job(uuid, boolean, text) to authenticated;
grant execute on function public.requeue_print_job(uuid) to authenticated;
grant execute on function public.set_unit_print_mode(uuid, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.print_jobs;
  end if;
end $$;
