-- Credenciais do Twilio Verify por unidade, informadas em Admin › Conexões › Twilio (SMS) e guardadas
-- CRIPTOGRAFADAS no Vault do Supabase (um segredo JSON por unidade: 'twilio:<unidade>').
-- Nada disso vai para public.integrations (lá ficam só dicas mascaradas) nem volta para o navegador.
-- Só a service_role (Edge Functions) grava e lê.

create or replace function public.save_twilio_credentials(p_unit uuid, p_account_sid text, p_auth_token text, p_service_sid text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := 'twilio:' || p_unit::text;
  v_id uuid; v_current jsonb; v_token text := nullif(btrim(coalesce(p_auth_token, '')), ''); v_secret text;
begin
  if p_unit is null or not exists (select 1 from public.business_units where id = p_unit) then raise exception 'Unidade inválida'; end if;
  if coalesce(btrim(p_account_sid), '') !~ '^AC[0-9a-fA-F]{32}$' then raise exception 'Account SID inválido (começa com AC e tem 34 caracteres)'; end if;
  if coalesce(btrim(p_service_sid), '') !~ '^VA[0-9a-fA-F]{32}$' then raise exception 'Verify Service SID inválido (começa com VA e tem 34 caracteres)'; end if;
  select id, decrypted_secret::jsonb into v_id, v_current from vault.decrypted_secrets where name = v_name limit 1;
  -- Token em branco mantém o já salvo (editar só os SIDs sem redigitar o segredo).
  v_token := coalesce(v_token, v_current->>'authToken');
  if v_token is null or length(v_token) < 16 or length(v_token) > 128 then raise exception 'Informe o Auth Token do Twilio'; end if;
  v_secret := jsonb_build_object('accountSid', btrim(p_account_sid), 'authToken', v_token, 'verifyServiceSid', btrim(p_service_sid))::text;
  if v_id is null then perform vault.create_secret(v_secret, v_name, 'Twilio Verify (SMS) da unidade');
  else perform vault.update_secret(v_id, v_secret); end if;
end $$;
revoke all on function public.save_twilio_credentials(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.save_twilio_credentials(uuid, text, text, text) to service_role;

create or replace function public.twilio_credentials(p_unit uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'twilio:' || p_unit::text limit 1;
$$;
revoke all on function public.twilio_credentials(uuid) from public, anon, authenticated;
grant execute on function public.twilio_credentials(uuid) to service_role;
