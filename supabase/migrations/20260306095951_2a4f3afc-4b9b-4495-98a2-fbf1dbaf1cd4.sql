
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.session_clients(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  service_charge numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'dinheiro',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read payments" ON public.payments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));

CREATE POLICY "Staff can insert payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));

CREATE POLICY "Staff can delete payments" ON public.payments
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
