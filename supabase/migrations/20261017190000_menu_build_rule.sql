-- Regra do "Monte o seu combo" (cliente escolhe itens elegíveis do cardápio).
-- Uma regra por unidade. Só define a regra; o pedido do cliente ainda não a usa.
create table if not exists public.menu_build_rules (
  business_unit_id uuid primary key references public.business_units(id) on delete cascade,
  enabled boolean not null default false,
  min_items int not null default 2 check (min_items between 2 and 20),
  max_items int not null default 6 check (max_items between 2 and 20),
  discount_mode text not null default 'percent' check (discount_mode in ('percent','amount')),
  discount_value numeric(10,2) not null default 0 check (discount_value >= 0),
  updated_at timestamptz not null default now(),
  check (max_items >= min_items),
  check (discount_mode <> 'percent' or discount_value <= 100)
);
alter table public.menu_build_rules enable row level security;
create policy menu_build_rules_staff_read on public.menu_build_rules for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin','attendant','kitchen','cashier']));
create policy menu_build_rules_admin_insert on public.menu_build_rules for insert to authenticated
  with check (app_private.has_unit_role(business_unit_id, array['admin']));
create policy menu_build_rules_admin_update on public.menu_build_rules for update to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin']))
  with check (app_private.has_unit_role(business_unit_id, array['admin']));
grant select, insert, update on public.menu_build_rules to authenticated;
grant all on public.menu_build_rules to service_role;
