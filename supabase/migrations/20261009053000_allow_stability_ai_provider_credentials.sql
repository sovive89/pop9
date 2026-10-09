ALTER TABLE public.ai_provider_credentials DROP CONSTRAINT IF EXISTS ai_provider_credentials_provider_check;
ALTER TABLE public.ai_provider_credentials ADD CONSTRAINT ai_provider_credentials_provider_check CHECK (provider = ANY (ARRAY['openai','google','xai','bfl','ideogram','anthropic','stability']));
