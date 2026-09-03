-- Central de Conexões (galeria de integrações estilo app-store). Uma linha
-- por provedor com o estado real da conexão — o catálogo em si (nome,
-- categoria, logo, campos) é só metadado estático no frontend
-- (src/components/admin/connections/catalog.ts), não vive no banco.
--
-- Chave natural é só `provider` (não `business_unit_id` + `provider`):
-- mesmo raciocínio de printer_configs — o isolamento por unidade ainda não
-- é aplicado em lugar nenhum do app, e um UNIQUE composto com uma coluna
-- nullable não deduplicaria linhas com business_unit_id null de qualquer
-- forma (NULL nunca conflita com NULL no Postgres). Revisitar quando o
-- multi-unidade for implementado de fato.
--
-- `config` guarda só os campos NÃO-secretos preenchidos no modal (ex.:
-- phoneNumberId, storeUrl). Nenhum token/secret é gravado aqui — quem tem
-- `secret: true` no catálogo nunca chega a este jsonb, fica só como
-- instrução de "configure no backend" (ver IntegrationConfigModal.tsx).
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units(id),
  provider text not null unique,
  status text not null default 'NOT_CONNECTED'
    check (status in ('NOT_CONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'DISCONNECTED')),
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_sync_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integrations_status
  on public.integrations (status);

create policy "Admin manages integrations"
  on public.integrations for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can read integrations"
  on public.integrations for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));
