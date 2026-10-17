-- Registered sectors must also be selectable as a printer's own sector.
-- Existing printer models keep their historical values.
alter table public.printer_configs drop constraint if exists printer_configs_setor_check;
alter table public.printer_configs add constraint printer_configs_setor_check
  check (length(btrim(setor)) between 1 and 64);

create or replace function public.validate_printer_sector() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.setor not in ('cozinha','bar','caixa','expedicao','producao','geral') and not exists (
    select 1 from public.print_sectors s
    where s.business_unit_id = new.business_unit_id and s.slug = new.setor
  ) then
    raise exception 'Cadastre o setor nesta unidade antes de selecionar a impressora.';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_printer_sector on public.printer_configs;
create trigger validate_printer_sector before insert or update of setor,business_unit_id
  on public.printer_configs for each row execute function public.validate_printer_sector();
