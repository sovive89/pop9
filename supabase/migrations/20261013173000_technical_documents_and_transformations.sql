-- Ficha técnica versionada como documento JSON, mantendo as tabelas
-- relacionais para os cálculos e movimentos operacionais.
create table if not exists public.technical_documents (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id),
  document_type text not null check (document_type = 'ficha_tecnica'),
  entity_type text not null check (entity_type in ('menu_item', 'raw_material')),
  entity_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, document_type, entity_type, entity_id, revision)
);
create index if not exists technical_documents_entity_idx
  on public.technical_documents (business_unit_id, entity_type, entity_id, revision desc);

alter table public.technical_documents enable row level security;
create policy technical_documents_select on public.technical_documents
  for select to authenticated using (app_private.has_unit_role(business_unit_id, array['admin','kitchen']::text[]));
create policy technical_documents_insert on public.technical_documents
  for insert to authenticated with check (app_private.has_unit_role(business_unit_id, array['admin','kitchen']::text[]));
create policy technical_documents_update on public.technical_documents
  for update to authenticated using (app_private.has_unit_role(business_unit_id, array['admin','kitchen']::text[]))
  with check (app_private.has_unit_role(business_unit_id, array['admin','kitchen']::text[]));

alter table public.recipe_items
  add column if not exists transformacao text not null default 'desconto_direto'
  check (transformacao in ('desconto_direto', 'producao', 'porcionamento', 'item_acabado', 'semiacabado'));
