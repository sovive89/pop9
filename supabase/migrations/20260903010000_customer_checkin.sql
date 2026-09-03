-- Check-in de cliente via QR Code.
--
-- Hoje só o garçom/sistema abre sessão de mesa (sempre autenticado, INSERT
-- direto em sessions/session_clients pelo client SDK, sob RLS "TO authenticated").
-- Esta migration prepara o terreno pro CLIENTE também poder abrir/entrar numa
-- sessão via QR Code + verificação (código do garçom ou OTP por WhatsApp),
-- sem abrir RLS pra anon: toda escrita do fluxo do cliente passa por uma
-- edge function com service role (supabase/functions/customer-checkin),
-- então as tabelas novas abaixo não recebem nenhuma policy de anon/authenticated.

-- Identidade estável de mesa para QR fixo (impresso/plastificado).
-- Hoje table_number é só um int solto em sessions; esta tabela dá um token
-- opaco e estável por mesa, que não muda entre sessões.
create table if not exists public.table_qr_codes (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units(id),
  table_number integer not null,
  token uuid not null default gen_random_uuid(),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.table_qr_codes is
  'Token estável por mesa, usado no QR Code impresso (/m/t/:token). '
  'Gerado sob demanda pela tela de QR Codes do Admin.';

create unique index if not exists table_qr_codes_token_key
  on public.table_qr_codes (token);

create unique index if not exists table_qr_codes_active_table_unique
  on public.table_qr_codes (business_unit_id, table_number)
  where active;

alter table public.table_qr_codes enable row level security;
-- Nenhuma policy: leitura/escrita só pela edge function (service role).
-- O cliente resolve o token via a própria edge function (get_table_info),
-- nunca lendo esta tabela diretamente pelo SDK.

-- Verificação de check-in do cliente (unifica os dois modos: código dado
-- pelo garçom e OTP por WhatsApp). session_id fica preenchido só no modo
-- staff_code (exige sessão já aberta); no modo whatsapp_otp a sessão pode
-- ainda não existir (é criada na verificação, se necessário).
create table if not exists public.checkin_verifications (
  id uuid primary key default gen_random_uuid(),
  method text not null check (method in ('staff_code', 'whatsapp_otp')),
  business_unit_id uuid references public.business_units(id),
  table_number integer not null,
  phone text,
  code text not null,
  session_id uuid references public.sessions(id),
  expires_at timestamptz not null,
  verified_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.checkin_verifications is
  'Códigos de verificação do check-in via QR (staff_code ou whatsapp_otp). '
  'Acesso exclusivo da edge function customer-checkin (service role) — '
  'sem policy de anon/authenticated de propósito.';

alter table public.checkin_verifications enable row level security;
-- Nenhuma policy: só a edge function (service role) acessa.

-- Distingue sessão aberta pelo garçom da aberta pelo próprio cliente
-- (mesma ideia de orders.origin: 'mesa'/'pwa').
alter table public.sessions
  add column if not exists origin text not null default 'staff'
  check (origin in ('staff', 'customer'));

comment on column public.sessions.origin is
  'staff = aberta pelo garçom/sistema; customer = cliente abriu via QR Code.';

-- app_config está marcada como aplicada no histórico de migrations
-- (20260306210000_app_config_whatsapp.sql) mas a tabela não existe de fato
-- no banco (mesmo padrão de drift já confirmado em payments.cash_received/
-- change_given) — recriando aqui, idempotente, igual ao migration original.
create table if not exists public.app_config (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "Admin can manage app_config" on public.app_config;
create policy "Admin can manage app_config" on public.app_config
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Toggle de admin pra ligar/desligar a rota de check-in do cliente,
-- desligado por padrão. Mesmo padrão key/value já usado por
-- app_config_whatsapp.sql.
insert into public.app_config (key, value)
values ('customer_checkin_enabled', 'false')
on conflict (key) do nothing;
