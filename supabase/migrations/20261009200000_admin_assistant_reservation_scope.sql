-- Corrige a autorização da reserva sem alterar a migration já aplicada.
-- A função continua acessível somente ao service_role: a Edge Function autentica
-- o usuário e encaminha p_user, p_unit e p_action após validar o pedido.
create or replace function public.reserve_assistant_request(
  p_id uuid,
  p_unit uuid,
  p_user uuid,
  p_action text,
  p_model text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_unit is null or not exists (
    select 1
    from public.business_units
    where id = p_unit and active = true
  ) then
    raise exception 'Unidade inválida ou inativa' using errcode = '22023';
  end if;

  if p_user is null or not exists (
    select 1 from auth.users where id = p_user
  ) then
    raise exception 'Usuário inválido' using errcode = '22023';
  end if;

  if p_action is null or p_action not in ('chat', 'document') then
    raise exception 'Ação do assistente não permitida' using errcode = '22023';
  end if;

  -- Uma trava por unidade serializa as reservas concorrentes e mantém a
  -- contagem das janelas de quota atômica.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_unit::text, 19)
  );

  if p_action = 'chat' then
    if not exists (
      select 1
      from public.user_roles
      where user_id = p_user
        and (
          (business_unit_id = p_unit and role::text in ('admin', 'attendant', 'kitchen', 'cashier'))
          or (business_unit_id is null and role::text = 'admin')
        )
    ) then
      raise exception 'Não autorizado' using errcode = '42501';
    end if;
  elsif not exists (
    select 1
    from public.user_roles
    where user_id = p_user
      and role::text = 'admin'
      and (business_unit_id = p_unit or business_unit_id is null)
  ) then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.ai_assistant_usage where id = p_id
  ) then
    raise exception 'Solicitação já utilizada' using errcode = '23505';
  end if;

  if (
    select count(*)
    from public.ai_assistant_usage
    where business_unit_id = p_unit
      and created_at > now() - interval '15 minutes'
  ) >= 30 or (
    select count(*)
    from public.ai_assistant_usage
    where business_unit_id = p_unit
      and created_at > now() - interval '24 hours'
  ) >= 200 then
    raise exception 'Limite de IA da unidade atingido. Tente novamente mais tarde.' using errcode = '54000';
  end if;

  insert into public.ai_assistant_usage(
    id, business_unit_id, user_id, action, model
  ) values (
    p_id, p_unit, p_user, p_action, p_model
  );
end;
$$;

-- Não abrir a função RPC para clientes: somente a Edge Function com service role
-- pode reservar, após autenticar o usuário e validar o escopo da solicitação.
revoke all on function public.reserve_assistant_request(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_assistant_request(uuid, uuid, uuid, text, text)
  to service_role;
