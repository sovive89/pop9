-- Passo 3.1 do Modelo Canônico: entidade Customer.
--
-- session_clients continua existindo e sendo usada como está (garçom
-- adiciona cliente à sessão) — esta migration só cria a tabela nova
-- `customers` e migra os dados já coletados, deduplicados por telefone,
-- SEM apagar nem alterar session_clients. O rewiring de FKs
-- (orders/payments apontando pra customers em vez de session_clients)
-- fica pro Data Hub/Normalizer, passos seguintes do roadmap — aqui é só
-- schema.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  cep text,
  bairro text,
  genero text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  'Entidade canônica de cliente (Modelo de Dados Canônico do Pop9). '
  'Populada inicialmente a partir de session_clients, deduplicada por '
  'telefone. Ainda não referenciada por orders/payments — isso é '
  'trabalho do Data Hub/Normalizer, não desta migration.';

create unique index if not exists customers_phone_key
  on public.customers (phone)
  where phone is not null and phone <> '';

alter table public.customers enable row level security;

drop policy if exists "Authenticated pode ler customers" on public.customers;
create policy "Authenticated pode ler customers" on public.customers
  for select to authenticated
  using (true);

drop policy if exists "Authenticated pode gerenciar customers" on public.customers;
create policy "Authenticated pode gerenciar customers" on public.customers
  for all to authenticated
  using (true)
  with check (true);

-- Referência de volta: qual customer corresponde a este session_clients
-- (nullable, preenchida na migração de dados abaixo). Aditivo.
alter table public.session_clients
  add column if not exists customer_id uuid references public.customers(id);

-- Migração de dados: um customer por telefone distinto em session_clients
-- (mantém o registro mais antigo — primeiro nome/dados vistos para aquele
-- telefone). Idempotente via ON CONFLICT.
insert into public.customers (name, phone, email, cep, bairro, genero, created_at)
select distinct on (sc.phone)
  sc.name, sc.phone, sc.email, sc.cep, sc.bairro, sc.genero, sc.added_at
from public.session_clients sc
where sc.phone is not null and sc.phone <> ''
order by sc.phone, sc.added_at asc
on conflict (phone) where phone is not null and phone <> '' do nothing;

update public.session_clients sc
set customer_id = c.id
from public.customers c
where sc.customer_id is null
  and sc.phone is not null and sc.phone <> ''
  and c.phone = sc.phone;
