-- RLS helpers are callable by staff: qualify relation names and exclude implicit temp search paths.
create or replace function ops_private.staff(p_unit uuid,p_roles text[]) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid()
    and (ur.business_unit_id=p_unit or ur.business_unit_id is null) and ur.role::text=any(p_roles));
$$;
alter function public.ingest_whatsapp_message(uuid,text,text,text,text,text,text,text)
  set search_path=pg_catalog,public,ops_private,pg_temp;
alter function public.claim_whatsapp_reply(text) set search_path=pg_catalog,public,pg_temp;
alter function public.submit_pwa_order(uuid,text,jsonb,text) set search_path=pg_catalog,public,ops_private,pg_temp;
