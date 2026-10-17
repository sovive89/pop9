-- Módulos opcionais por unidade (Configurações → Módulos). Desligar só esconde a seção: nenhum dado é apagado.
-- Aditiva: coluna nova com padrão "nenhum desligado" (comportamento atual) + RPC restrita a admin da unidade.
alter table public.business_units add column if not exists disabled_modules text[] not null default '{}';

create or replace function app_private.guard_unit_disabled_modules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.disabled_modules <> '{}' then
      raise exception 'Unidade nova começa com todos os módulos ligados' using errcode = '42501';
    end if;
  elsif new.disabled_modules is distinct from old.disabled_modules
        and not app_private.has_unit_role(old.id, array['admin']) then
    raise exception 'Só um administrador desta unidade altera os módulos (Configurações → Módulos)' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_unit_disabled_modules() from public;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'guard_unit_disabled_modules') then
    create trigger guard_unit_disabled_modules before insert or update on public.business_units
      for each row execute function app_private.guard_unit_disabled_modules();
  end if;
end $$;

create or replace function public.set_unit_module(p_unit uuid, p_module text, p_enabled boolean)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v text[];
begin
  if p_module not in ('financeiro', 'combos', 'crm', 'documents') then
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
revoke all on function public.set_unit_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_unit_module(uuid, text, boolean) to authenticated;
