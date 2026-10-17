-- Remove policies globais que permitiam que qualquer papel admin/staff
-- consultasse metadados de outras unidades/empresas.

alter table public.businesses enable row level security;
alter table public.business_units enable row level security;

create or replace function app_private.can_create_unit_in_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business_id is not null and exists (
    select 1
      from public.business_units existing
     where existing.business_id = p_business_id
       and app_private.has_unit_role(existing.id, array['admin'])
  );
$$;
revoke all on function app_private.can_create_unit_in_business(uuid) from public, anon;
grant execute on function app_private.can_create_unit_in_business(uuid) to authenticated;
grant usage on schema app_private to authenticated;

create or replace function app_private.bind_unit_creator_as_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if auth.role() = 'authenticated' then
    v_user := auth.uid();
    if v_user is null then
      raise exception 'Não foi possível identificar o usuário criador' using errcode = '42501';
    end if;
    insert into public.user_roles (user_id, role, business_unit_id)
      values (v_user, 'admin'::public.app_role, new.id)
      on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.bind_unit_creator_as_admin() from public, anon, authenticated;

create or replace function app_private.prevent_business_unit_reparenting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'Uma unidade não pode ser movida para outro negócio' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.prevent_business_unit_reparenting() from public, anon, authenticated;

drop trigger if exists trg_business_unit_bind_creator on public.business_units;
create trigger trg_business_unit_bind_creator
after insert on public.business_units
for each row execute function app_private.bind_unit_creator_as_admin();

drop trigger if exists trg_business_unit_prevent_reparenting on public.business_units;
create trigger trg_business_unit_prevent_reparenting
before update of business_id on public.business_units
for each row execute function app_private.prevent_business_unit_reparenting();

-- A list de unidades mostra apenas unidades atribuídas ao usuário. A criação
-- só pode pendurar uma nova unidade no business de outra unidade que ele já
-- administra. A trigger associa automaticamente o criador como admin local.
drop policy if exists "Admin manages business_units" on public.business_units;
drop policy if exists "Staff can read business_units" on public.business_units;
drop policy if exists "Staff can read assigned business_units" on public.business_units;
drop policy if exists "Admins create units in assigned business" on public.business_units;
drop policy if exists "Admins update assigned business_units" on public.business_units;

create policy "Staff can read assigned business_units"
  on public.business_units for select to authenticated
  using (app_private.has_unit_role(id, array['admin','attendant','kitchen','cashier']));
create policy "Admins create units in assigned business"
  on public.business_units for insert to authenticated
  with check (app_private.can_create_unit_in_business(business_id));
create policy "Admins update assigned business_units"
  on public.business_units for update to authenticated
  using (app_private.has_unit_role(id, array['admin']))
  with check (app_private.has_unit_role(id, array['admin']));
-- No policy de DELETE: remover uma unidade e seus dados não faz parte do
-- fluxo administrativo do MVP e não deve ser permitido pela API.

-- Businesses são metadados de rede; leitura só é necessária para negócios
-- que tenham ao menos uma unidade atribuída. A aplicação não oferece CRUD de
-- businesses, então removemos a antiga escrita global de admins.
drop policy if exists "Admin manages businesses" on public.businesses;
drop policy if exists "Staff can read businesses" on public.businesses;
drop policy if exists "Staff can read assigned businesses" on public.businesses;
create policy "Staff can read assigned businesses"
  on public.businesses for select to authenticated
  using (exists (
    select 1
      from public.business_units bu
     where bu.business_id = businesses.id
       and app_private.has_unit_role(bu.id, array['admin','attendant','kitchen','cashier'])
  ));

-- table_areas e dining_tables também eram protegidas apenas por papel global.
-- Preservam os papéis operacionais anteriores, mas limitam cada linha à unidade.
alter table public.table_areas enable row level security;
alter table public.dining_tables enable row level security;
drop policy if exists "Admin manages table_areas" on public.table_areas;
drop policy if exists "Staff can read table_areas" on public.table_areas;
drop policy if exists "Staff read assigned table_areas" on public.table_areas;
drop policy if exists "Admins manage assigned table_areas" on public.table_areas;
create policy "Staff read assigned table_areas"
  on public.table_areas for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin','attendant','kitchen']));
create policy "Admins manage assigned table_areas"
  on public.table_areas for all to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin']))
  with check (app_private.has_unit_role(business_unit_id, array['admin']));

drop policy if exists "Admin manages dining_tables" on public.dining_tables;
drop policy if exists "Staff can read dining_tables" on public.dining_tables;
drop policy if exists "Staff read assigned dining_tables" on public.dining_tables;
drop policy if exists "Admins manage assigned dining_tables" on public.dining_tables;
drop policy if exists "Attendants insert unassigned tables" on public.dining_tables;
drop policy if exists "Attendants insert unassigned tables in assigned units" on public.dining_tables;
create policy "Staff read assigned dining_tables"
  on public.dining_tables for select to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin','attendant','kitchen']));
create policy "Admins manage assigned dining_tables"
  on public.dining_tables for all to authenticated
  using (app_private.has_unit_role(business_unit_id, array['admin']))
  with check (app_private.has_unit_role(business_unit_id, array['admin']));
create policy "Attendants insert unassigned tables in assigned units"
  on public.dining_tables for insert to authenticated
  with check (app_private.has_unit_role(business_unit_id, array['attendant']) and area_id is null);

-- The SECURITY DEFINER RPC also used to accept a global admin role or a
-- user_roles row with business_unit_id NULL; require a role in this unit.
create or replace function public.create_dining_table(p_business_unit_id uuid)
returns public.dining_tables
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
  v_table public.dining_tables%rowtype;
begin
  if not app_private.has_unit_role(p_business_unit_id, array['admin']) then
    raise exception 'Sem permissão para criar mesa nesta unidade' using errcode = '42501';
  end if;
  perform 1 from public.business_units
   where id = p_business_unit_id and active
   for update;
  if not found then
    raise exception 'Unidade inválida ou inativa';
  end if;
  select coalesce(max(number), 0) + 1 into v_number
    from public.dining_tables where business_unit_id = p_business_unit_id;
  insert into public.dining_tables (business_unit_id, number)
    values (p_business_unit_id, v_number) returning * into v_table;
  update public.business_units set table_count = v_number
   where id = p_business_unit_id;
  return v_table;
end;
$$;
revoke all on function public.create_dining_table(uuid) from public, anon;
grant execute on function public.create_dining_table(uuid) to authenticated;
