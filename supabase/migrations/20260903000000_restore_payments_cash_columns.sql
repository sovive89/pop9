-- As colunas cash_received/change_given foram criadas pela migration 20260306112220
-- mas removidas manualmente do banco em algum momento, fora do fluxo de migrations
-- (o histórico do Supabase ainda marca aquela migration como aplicada).
-- src/components/CloseAccountPanel.tsx sempre envia essas colunas no insert/select
-- de payments, então o registro de pagamento (qualquer método) estava falhando.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cash_received numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_given numeric DEFAULT 0;
