-- A role is assigned within a unit; the same user may administer multiple units.
alter table public.user_roles drop constraint if exists user_roles_user_id_role_key;
alter table public.user_roles add constraint user_roles_user_id_role_unit_key
  unique nulls not distinct (user_id, role, business_unit_id);
