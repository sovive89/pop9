-- CRM: campos adicionais em session_clients (email, CEP, bairro, gênero)
-- Todos opcionais para não quebrar fluxo existente.
ALTER TABLE public.session_clients
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS genero TEXT;

COMMENT ON COLUMN public.session_clients.email IS 'E-mail do cliente (CRM)';
COMMENT ON COLUMN public.session_clients.cep IS 'CEP do cliente (CRM)';
COMMENT ON COLUMN public.session_clients.bairro IS 'Bairro do cliente (CRM)';
COMMENT ON COLUMN public.session_clients.genero IS 'Gênero: Masculino, Feminino, Outro, Prefiro não dizer';
