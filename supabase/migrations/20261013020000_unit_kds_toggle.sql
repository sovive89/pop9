-- Modo KDS por unidade. Desligado: a cozinha trabalha só com a comanda impressa
-- (que já sai ao enviar o pedido) e o atendimento confirma a entrega sem esperar
-- o pedido ficar "pronto" na tela da cozinha. Padrão ligado: nada muda para
-- unidades existentes.
alter table public.business_units add column if not exists kds_enabled boolean not null default true;
comment on column public.business_units.kds_enabled is 'true = usa a tela da cozinha (KDS); false = só comanda impressa, entrega direta pelo atendimento.';

-- Alteração só pelo admin DA UNIDADE (a policy geral de business_units não é por unidade).
create or replace function public.set_unit_kds(p_unit uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_unit_role(p_unit, array['admin']) then
    raise exception 'Sem permissão para alterar o KDS desta unidade' using errcode = '42501';
  end if;
  update public.business_units set kds_enabled = p_enabled where id = p_unit;
  if not found then raise exception 'Unidade não encontrada'; end if;
  return p_enabled;
end;
$$;
revoke all on function public.set_unit_kds(uuid, boolean) from public, anon;
grant execute on function public.set_unit_kds(uuid, boolean) to authenticated;
