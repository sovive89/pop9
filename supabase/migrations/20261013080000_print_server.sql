-- Print server (agente local que imprime direto na térmica por rede, ESC/POS na porta 9100).
--
-- Usa a fila que já existe (print_jobs + claim_print_job/finish_print_job, migration
-- 20261013030000_print_queue.sql). NÃO usa o print_jobs proposto no PR #26
-- (print-server/migrations/001_print_jobs.sql): aquele desenho tinha outra estrutura
-- (printer_id/payload) e conflita com a tabela já em produção.
--
-- Aqui só falta dizer, por impressora, quais setores da comanda ela imprime:
-- cozinha, bar ou os dois (cada item do cardápio já tem destination = kitchen | bar).
alter table public.printer_configs
  add column if not exists destinos text[] not null default array['kitchen', 'bar']::text[];

alter table public.printer_configs
  add constraint printer_configs_destinos_valid check (
    cardinality(destinos) between 1 and 2 and destinos <@ array['kitchen', 'bar']::text[]
  );

comment on column public.printer_configs.destinos is
  'Setores da comanda que esta impressora recebe no print server: kitchen, bar ou ambos.';
