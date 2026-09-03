-- Passo 3.3 do Modelo Canônico: source + external_id em customers,
-- orders, payments e menu_items.
--
-- `source` diz de qual sistema aquele registro veio (mesa = criado
-- direto no Pop9; futuramente 'ifood'/'saipos'/'whatsapp' etc. quando os
-- connectors existirem). `external_id` é o ID daquele registro no sistema
-- de origem — NUNCA usado como chave estrangeira interna (regra do
-- projeto), só para saber "de onde veio" e evitar duplicar na
-- reimportação.
--
-- Distinto de orders.origin (que já existe e é só 'mesa'/'pwa' — como o
-- PEDIDO foi feito pelo cliente dentro do Pop9): source é sobre o
-- SISTEMA externo de onde o registro se origina, não a interface usada.
alter table public.customers
  add column if not exists source text not null default 'mesa',
  add column if not exists external_id text;

alter table public.orders
  add column if not exists source text not null default 'mesa',
  add column if not exists external_id text;

alter table public.payments
  add column if not exists source text not null default 'mesa',
  add column if not exists external_id text;

alter table public.menu_items
  add column if not exists source text not null default 'mesa',
  add column if not exists external_id text;

comment on column public.customers.source is 'Sistema de origem do registro (mesa | ifood | saipos | whatsapp | ...). Nunca usar external_id como FK interna.';
comment on column public.orders.source is 'Sistema de origem do registro. Distinto de orders.origin (mesa/pwa = como o pedido foi feito dentro do Pop9).';
comment on column public.payments.source is 'Sistema de origem do registro.';
comment on column public.menu_items.source is 'Sistema de origem do registro (cardápio pode vir de import de outro PDV).';
