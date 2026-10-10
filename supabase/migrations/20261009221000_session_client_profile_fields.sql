-- Catalog metadata from pop9 confirmed these nullable text columns already exist.
-- Track them for reproducible fresh/staging databases. No backfill or ACL change.
alter table public.session_clients
  add column if not exists faixa_etaria text,
  add column if not exists origem_conhecimento text;
