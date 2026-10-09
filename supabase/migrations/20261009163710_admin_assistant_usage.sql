create table public.ai_assistant_usage (
 id uuid primary key,
 business_unit_id uuid not null references public.business_units(id),
 user_id uuid not null references auth.users(id),
 action text not null check(action in ('chat','document')),
 model text not null,
 status text not null default 'pending' check(status in ('pending','completed','failed')),
 input_tokens integer check(input_tokens>=0),output_tokens integer check(output_tokens>=0),
 created_at timestamptz not null default now(),completed_at timestamptz
);
create index ai_assistant_usage_unit_time on public.ai_assistant_usage(business_unit_id,created_at);
create index ai_assistant_usage_user on public.ai_assistant_usage(user_id);
alter table public.ai_assistant_usage enable row level security;
create policy ai_usage_admin_read on public.ai_assistant_usage for select to authenticated using(ops_private.staff(business_unit_id,array['admin']));
grant select on public.ai_assistant_usage to authenticated;
grant all on public.ai_assistant_usage to service_role;
create function public.reserve_assistant_request(p_id uuid,p_unit uuid,p_user uuid,p_action text,p_model text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_unit::text,19));
 if not exists(select 1 from public.user_roles where user_id=p_user and role='admin' and (business_unit_id=p_unit or business_unit_id is null)) then raise exception 'Não autorizado'; end if;
 if exists(select 1 from public.ai_assistant_usage where id=p_id) then raise exception 'Solicitação já utilizada'; end if;
 if (select count(*) from public.ai_assistant_usage where business_unit_id=p_unit and created_at>now()-interval '15 minutes')>=30 or
 (select count(*) from public.ai_assistant_usage where business_unit_id=p_unit and created_at>now()-interval '24 hours')>=200 then raise exception 'Limite de IA da unidade atingido. Tente novamente mais tarde.'; end if;
 insert into public.ai_assistant_usage(id,business_unit_id,user_id,action,model) values(p_id,p_unit,p_user,p_action,p_model);
end;$$;
revoke all on function public.reserve_assistant_request(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_assistant_request(uuid,uuid,uuid,text,text) to service_role;
