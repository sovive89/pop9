-- Módulo opcional "assistente" (IA): admin pode desligar por unidade. Só amplia a lista aceita.
create or replace function public.set_unit_module(p_unit uuid, p_module text, p_enabled boolean)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v text[];
begin
  if p_module not in ('financeiro', 'combos', 'crm', 'documents', 'assistente') then
    raise exception 'Módulo desconhecido: %', p_module using errcode = '22023';
  end if;
  if not app_private.has_unit_role(p_unit, array['admin']) then
    raise exception 'Só um administrador desta unidade altera os módulos' using errcode = '42501';
  end if;
  update public.business_units
     set disabled_modules = case when p_enabled then array_remove(disabled_modules, p_module)
                                 else (select array(select distinct m from unnest(disabled_modules || p_module) m)) end
   where id = p_unit
   returning disabled_modules into v;
  return v;
end;
$$;
