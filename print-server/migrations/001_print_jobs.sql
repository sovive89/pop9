-- Review before applying. No production database changes are made by committing this file.
create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id),
  printer_id uuid not null references public.printer_configs(id),
  payload text not null check (length(payload) between 1 and 16000),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  agent_id uuid,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists print_jobs_pending_idx on public.print_jobs(business_unit_id,status,created_at);
alter table public.print_jobs enable row level security;
-- Unit-level membership is required, not the global has_role() helper.
create policy "Unit staff can view print jobs" on public.print_jobs for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.business_unit_id=print_jobs.business_unit_id));
create policy "Unit staff can create print jobs" on public.print_jobs for insert to authenticated
with check (
 exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.business_unit_id=print_jobs.business_unit_id)
 and exists (select 1 from public.printer_configs pc where pc.id=printer_id and pc.business_unit_id=print_jobs.business_unit_id and pc.active)
 and status='pending' and attempts=0 and agent_id is null
);
-- No direct UPDATE or DELETE policy: only authenticated RPCs may mutate state.
create or replace function public.claim_print_jobs(p_unit_id uuid,p_agent_id uuid,p_limit integer default 5)
returns setof public.print_jobs language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists (
   select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.business_unit_id=p_unit_id and ur.role='admin'
 ) then raise exception 'not authorized'; end if;
 return query
 with candidates as (
  select j.id from public.print_jobs j where j.business_unit_id=p_unit_id and j.status='pending'
  order by j.created_at for update skip locked limit least(greatest(p_limit,1),10)
 )
 update public.print_jobs j set status='processing', agent_id=p_agent_id, locked_at=now(), attempts=attempts+1
 from candidates c where j.id=c.id returning j.*;
end; $$;
create or replace function public.complete_print_job(p_job_id uuid,p_agent_id uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.print_jobs j
 set status=case when p_success then 'completed' else 'failed' end,
 completed_at=case when p_success then now() else null end,
 last_error=case when p_success then null else left(coalesce(p_error,'Unknown error'),300) end
 where j.id=p_job_id and j.agent_id=p_agent_id and j.status='processing'
 and exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.business_unit_id=j.business_unit_id and ur.role='admin');
 if not found then raise exception 'job not found or not authorized'; end if;
end; $$;
revoke all on function public.claim_print_jobs(uuid,uuid,integer) from public;
revoke all on function public.complete_print_job(uuid,uuid,boolean,text) from public;
grant execute on function public.claim_print_jobs(uuid,uuid,integer) to authenticated;
grant execute on function public.complete_print_job(uuid,uuid,boolean,text) to authenticated;
