alter table public.printer_configs add column setor text not null default 'geral'
  check (setor in ('cozinha','bar','caixa','expedicao','producao','geral'));
-- Intersect legacy global-role policies with the actual unit of the equipment.
alter table public.printer_configs enable row level security;
create policy printer_unit_read on public.printer_configs as restrictive for select to authenticated
  using(app_private.has_unit_role(business_unit_id,array['admin','cashier','attendant','kitchen']));
create policy printer_cashier_read on public.printer_configs for select to authenticated
  using(app_private.has_unit_role(business_unit_id,array['cashier']));
create policy printer_unit_insert on public.printer_configs as restrictive for insert to authenticated
  with check(app_private.has_unit_role(business_unit_id,array['admin']));
create policy printer_unit_update on public.printer_configs as restrictive for update to authenticated
  using(app_private.has_unit_role(business_unit_id,array['admin']))
  with check(app_private.has_unit_role(business_unit_id,array['admin']));
create policy printer_unit_delete on public.printer_configs as restrictive for delete to authenticated
  using(app_private.has_unit_role(business_unit_id,array['admin']));
