-- Trazido do PR #26 (feat/printer-escpos-test) sem alteração: já foi aplicado em
-- produção (versão 20261009023733 "printer_connection_options") mas não estava no main.
-- Mantém o repositório igual ao banco real.
alter table public.printer_configs
  add column if not exists host text,
  add column if not exists port integer not null default 9100,
  add column if not exists paper_width integer not null default 80,
  add column if not exists copies integer not null default 1,
  add column if not exists auto_cut boolean not null default false,
  add column if not exists encoding text not null default 'cp850',
  add column if not exists transport text not null default 'tcp';
