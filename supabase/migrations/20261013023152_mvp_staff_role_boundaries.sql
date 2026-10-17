-- Fecha a concessão global de papéis que anulava o isolamento das unidades.
create policy mvp_roles_read on public.user_roles as restrictive for select to authenticated
  using (user_id = auth.uid() or app_private.has_unit_role(business_unit_id,array['admin']));
create policy mvp_roles_insert on public.user_roles as restrictive for insert to authenticated
  with check (app_private.has_unit_role(business_unit_id,array['admin']));
create policy mvp_roles_update on public.user_roles as restrictive for update to authenticated
  using (app_private.has_unit_role(business_unit_id,array['admin']))
  with check (app_private.has_unit_role(business_unit_id,array['admin']));
create policy mvp_roles_delete on public.user_roles as restrictive for delete to authenticated
  using (app_private.has_unit_role(business_unit_id,array['admin']));

-- Perfis próprios continuam acessíveis. Outros funcionários só são lidos
-- por administradores de uma unidade em que o funcionário tenha vínculo.
create policy mvp_profiles_read on public.profiles as restrictive for select to authenticated
  using (user_id=auth.uid() or exists (
    select 1 from public.user_roles target_role
    where target_role.user_id=profiles.user_id
      and app_private.has_unit_role(target_role.business_unit_id,array['admin'])
  ));
