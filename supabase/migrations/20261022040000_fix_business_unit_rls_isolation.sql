-- Corrige o isolamento de unidade em business_units/businesses.
-- Antes, o RLS usava has_role(auth.uid(), 'admin') e permitia o admin de A
-- consultar/alterar qualquer linha de business_units. Agora a checagem sempre
-- considera a unidade específica da linha em questão.

-- Remove policies antigas que não filtravam por unidade.
drop policy if exists "Admin manages businesses" on public.businesses;
drop policy if exists "Staff can read businesses" on public.businesses;
drop policy if exists "Admin manages business_units" on public.business_units;
drop policy if exists "Staff can read business_units" on public.business_units;

-- business_units: cada admin só consegue mexer na sua unidade; cada papel
-- funcional só lê as unidades em que está atribuído.
create policy "Admin manages business_units"
  on public.business_units for all
  to authenticated
  using (app_private.has_unit_role(id, array['admin']))
  with check (app_private.has_unit_role(id, array['admin']));

create policy "Staff can read business_units"
  on public.business_units for select
  to authenticated
  using (app_private.has_unit_role(id, array['admin', 'attendant', 'kitchen', 'cashier']));

-- businesses: a leitura/alteração fica restrita àquele(s) negócio(s) em que o
-- usuário tenha alguma unidade atribuída. Em ambientes com uma única unidade,
-- o comportamento continua simples; em multi-unidade, não há leitura cruzada.
create policy "Admin manages businesses"
  on public.businesses for all
  to authenticated
  using (
    exists (
      select 1
      from public.business_units bu
      where bu.business_id = businesses.id
        and app_private.has_unit_role(bu.id, array['admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.business_units bu
      where bu.business_id = businesses.id
        and app_private.has_unit_role(bu.id, array['admin'])
    )
  );

create policy "Staff can read businesses"
  on public.businesses for select
  to authenticated
  using (
    exists (
      select 1
      from public.business_units bu
      where bu.business_id = businesses.id
        and app_private.has_unit_role(bu.id, array['admin', 'attendant', 'kitchen', 'cashier'])
    )
  );
