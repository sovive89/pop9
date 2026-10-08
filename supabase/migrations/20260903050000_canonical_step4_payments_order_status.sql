-- Passo 3.4 do Modelo Canônico: payments.order_id (nullable) + payments.status.
--
-- Hoje payments só liga a session_id + client_id, não a um order
-- específico (um pagamento cobre o consumo do cliente, não um pedido
-- isolado — isso não muda). order_id fica nullable e é preenchido depois
-- pelo Normalizer quando houver essa granularidade; status distingue o
-- ciclo de vida do pagamento (hoje todo pagamento gravado já é
-- 'confirmed', não há fluxo de pagamento assíncrono ainda).
alter table public.payments
  add column if not exists order_id uuid references public.orders(id),
  add column if not exists status text not null default 'confirmed';

alter table public.payments
  drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'confirmed', 'failed', 'refunded'));

comment on column public.payments.order_id is 'Pedido específico coberto por este pagamento, se aplicável. NULL = pagamento cobre o consumo geral do cliente na sessão (fluxo atual).';
