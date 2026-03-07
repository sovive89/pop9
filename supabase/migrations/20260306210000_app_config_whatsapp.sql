-- Configurações gerais da aplicação (ex.: WhatsApp)
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage app_config" ON public.app_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Valores iniciais (opcional)
INSERT INTO public.app_config (key, value) VALUES
  ('whatsapp_welcome_message', 'Olá! Obrigado por falar conosco. Em breve nosso atendimento retorna.'),
  ('whatsapp_phone_number_id', ''),
  ('whatsapp_bot_webhook_url', '')
ON CONFLICT (key) DO NOTHING;
