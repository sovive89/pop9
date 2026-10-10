-- Catalog metadata from pop9 confirmed these nullable text columns already exist.
-- Track them for reproducible fresh/staging databases. No backfill or ACL change.
alter table public.session_clients
  add column if not exists faixa_etaria text,
  add column if not exists origem_conhecimento text;

-- Add documentation only when the database has no existing column comment.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.session_clients'::regclass
      and attname = 'faixa_etaria' and not attisdropped
      and pg_catalog.col_description(attrelid, attnum) is null
  ) then
    comment on column public.session_clients.faixa_etaria is 'Faixa etária do cliente (CRM)';
  end if;
  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.session_clients'::regclass
      and attname = 'origem_conhecimento' and not attisdropped
      and pg_catalog.col_description(attrelid, attnum) is null
  ) then
    comment on column public.session_clients.origem_conhecimento is 'Origem de conhecimento do estabelecimento pelo cliente (CRM)';
  end if;
end;
$$;
