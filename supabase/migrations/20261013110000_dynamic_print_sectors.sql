create table if not exists public.print_sectors (
 id uuid primary key default gen_random_uuid(),
 business_unit_id uuid not null references public.business_units(id) on delete cascade,
 slug text not null check (slug ~ '^[a-z0-9_]{1,48}$'),
 name text not null check (char_length(trim(name)) between 1 and 80),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique (business_unit_id, slug)
);
insert into public.print_sectors (business_unit_id,slug,name)
select u.id, v.slug, v.name from public.business_units u
cross join (values ('kitchen','Cozinha'),('bar','Bar')) as v(slug,name)
on conflict (business_unit_id,slug) do nothing;
alter table public.print_sectors enable row level security;
create policy print_sectors_read on public.print_sectors for select to authenticated
 using (app_private.has_unit_role(business_unit_id, array['admin','attendant','kitchen','cashier']));
create policy print_sectors_insert on public.print_sectors for insert to authenticated
 with check (app_private.has_unit_role(business_unit_id, array['admin']));
create policy print_sectors_update on public.print_sectors for update to authenticated
 using (app_private.has_unit_role(business_unit_id, array['admin']))
 with check (app_private.has_unit_role(business_unit_id, array['admin']));
alter table public.printer_configs drop constraint if exists printer_configs_destinos_valid;
alter table public.printer_configs add constraint printer_configs_destinos_valid
 check (cardinality(destinos) between 1 and 30);
