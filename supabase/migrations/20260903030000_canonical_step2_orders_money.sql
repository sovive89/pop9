-- Passo 3.2 do Modelo Canônico: campos monetários em orders.
--
-- Hoje o total de um pedido só existe calculado no frontend (soma de
-- order_items) — não há nenhum campo de dinheiro em orders. Aditivo,
-- sem backfill: pedidos existentes ficam com subtotal/total NULL até
-- o Normalizer (passo futuro) recalcular a partir de order_items.
alter table public.orders
  add column if not exists subtotal numeric,
  add column if not exists discount numeric not null default 0,
  add column if not exists delivery_fee numeric not null default 0,
  add column if not exists total numeric,
  add column if not exists payment_status text not null default 'pending';

alter table public.orders
  drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending', 'partial', 'paid'));

comment on column public.orders.subtotal is 'Soma dos order_items antes de desconto/taxa. NULL = ainda não calculado (pedidos antigos).';
comment on column public.orders.total is 'subtotal - discount + delivery_fee. NULL = ainda não calculado (pedidos antigos).';
