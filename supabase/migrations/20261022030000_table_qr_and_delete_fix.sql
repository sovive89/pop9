-- QR por mesa (item 3) + correção do "Apagar mesa".
-- 1) delete_dining_table checava sessions.status='open', mas o banco só aceita 'active'/'closed':
--    mesa com conta aberta NÃO era bloqueada. Agora checa 'active' e desativa o QR da mesa antes de apagar.
-- 2) table_qr_codes não tem policy (só service role escreve). O editor de mesas usa estas funções.

create or replace function public.delete_dining_table(p_table_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_table public.dining_tables%rowtype; v_max integer;
begin
  select * into v_table from public.dining_tables where id = p_table_id for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  if not app_private.has_unit_role(v_table.business_unit_id, array['admin']) then
    raise exception 'Sem permissão para apagar mesa nesta unidade' using errcode = '42501';
  end if;
  if exists (select 1 from public.sessions s where s.business_unit_id = v_table.business_unit_id
             and s.table_number = v_table.number and s.status = 'active') then
    raise exception 'A mesa % tem conta aberta. Feche a conta antes de apagar.', v_table.number;
  end if;
  update public.table_qr_codes set active = false
   where business_unit_id = v_table.business_unit_id and table_number = v_table.number and active;
  delete from public.dining_tables where id = p_table_id;
  select coalesce(max(number), 0) into v_max from public.dining_tables where business_unit_id = v_table.business_unit_id;
  update public.business_units set table_count = v_max where id = v_table.business_unit_id;
end $$;

-- Devolve o token ativo da mesa; cria se não houver. p_regenerate=true desativa o antigo e cria outro.
create or replace function public.table_qr_token(p_table_id uuid, p_regenerate boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_table public.dining_tables%rowtype; v_token uuid;
begin
  select * into v_table from public.dining_tables where id = p_table_id for update;
  if not found or v_table.archived_at is not null then raise exception 'Mesa não encontrada'; end if;
  if not app_private.has_unit_role(v_table.business_unit_id, array['admin']) then
    raise exception 'Sem permissão para o QR desta mesa' using errcode = '42501';
  end if;
  if p_regenerate then
    update public.table_qr_codes set active = false
     where business_unit_id = v_table.business_unit_id and table_number = v_table.number and active;
  else
    select token into v_token from public.table_qr_codes
     where business_unit_id = v_table.business_unit_id and table_number = v_table.number and active;
    if found then return v_token; end if;
  end if;
  insert into public.table_qr_codes(business_unit_id, table_number)
    values (v_table.business_unit_id, v_table.number) returning token into v_token;
  return v_token;
end $$;
revoke all on function public.table_qr_token(uuid, boolean) from public, anon;
grant execute on function public.table_qr_token(uuid, boolean) to authenticated;
