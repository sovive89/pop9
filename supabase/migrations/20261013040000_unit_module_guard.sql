-- Os módulos da unidade (kds_enabled, print_mode) só mudam pelas funções set_unit_kds e
-- set_unit_print_mode, que conferem se quem chama é admin DAQUELA unidade. A policy antiga
-- "Admin manages business_units" deixa qualquer admin global atualizar a tabela inteira;
-- (inclusive criar unidade); este gatilho fecha esse atalho para as duas colunas sem mudar
-- o resto da policy.
-- Chamadas sem usuário (service_role, migrations) continuam liberadas.
create or replace function app_private.guard_unit_modules()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Na criação da unidade só valem os padrões; na edição, nada muda sem passar pelas funções.
  if (case when tg_op = 'INSERT'
        then new.kds_enabled is distinct from true or new.print_mode is distinct from 'device'
        else new.kds_enabled is distinct from old.kds_enabled or new.print_mode is distinct from old.print_mode end)
     and auth.uid() is not null
     and coalesce(pg_catalog.current_setting('pop9.unit_settings', true), '') <> 'on' then
    raise exception 'Use Configurações → Módulos para alterar os módulos da unidade' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_unit_modules() from public;
create trigger guard_unit_modules before insert or update on public.business_units
  for each row execute function app_private.guard_unit_modules();
