-- Unidade inexistente não pode contar como "módulo ligado": a função devolve false nesse caso.
-- Só muda o corpo de ops_private.module_enabled (mesma assinatura e permissões).
create or replace function ops_private.module_enabled(p_unit uuid, p_module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select not (p_module = any(disabled_modules)) from public.business_units where id = p_unit), false);
$$;
revoke all on function ops_private.module_enabled(uuid, text) from public, anon, authenticated;
grant execute on function ops_private.module_enabled(uuid, text) to service_role;
