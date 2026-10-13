-- Revisão da trava dos módulos (20261013040000): ela aceitava um marcador de sessão
-- (pop9.unit_settings) que qualquer conexão SQL consegue ligar com set_config. Agora a
-- regra real fica no próprio gatilho: alterar kds_enabled/print_mode de uma unidade exige
-- ser admin DAQUELA unidade (auth.uid() continua sendo quem chamou, mesmo dentro das
-- funções set_unit_kds/set_unit_print_mode). Criar unidade só aceita os valores padrão.
-- Sem usuário (service_role, migrations) segue liberado.
create or replace function app_private.guard_unit_modules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.kds_enabled is distinct from true or new.print_mode is distinct from 'device' then
      raise exception 'Unidade nova começa com os módulos padrão; ajuste em Configurações → Módulos' using errcode = '42501';
    end if;
  elsif (new.kds_enabled is distinct from old.kds_enabled or new.print_mode is distinct from old.print_mode)
        and not app_private.has_unit_role(old.id, array['admin']) then
    raise exception 'Só um administrador desta unidade altera os módulos (Configurações → Módulos)' using errcode = '42501';
  end if;
  return new;
end;
$$;
