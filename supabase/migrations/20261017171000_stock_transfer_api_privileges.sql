-- Grants padrão do projeto podem dar SELECT a anon em novas tabelas.
-- Transferências são consultadas apenas por administradores autenticados,
-- conforme a RLS existente; a escrita continua exclusiva da RPC autorizada.
revoke all on public.stock_transfers from public, anon;
revoke insert, update, delete on public.stock_transfers from authenticated;
grant select on public.stock_transfers to authenticated;
