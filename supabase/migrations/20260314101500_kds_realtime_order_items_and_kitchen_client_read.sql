-- KDS depends on order_items realtime events to reflect partial progress in multi-screen kitchens.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END
$$;

-- Kitchen users need to read client names used in KDS joins.
DROP POLICY IF EXISTS "Staff can read session_clients" ON public.session_clients;
CREATE POLICY "Staff can read session_clients"
ON public.session_clients
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'attendant'::app_role)
  OR has_role(auth.uid(), 'kitchen'::app_role)
);
