-- Drop existing restrictive policies on sessions
DROP POLICY IF EXISTS "Staff can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "Staff can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Staff can update sessions" ON public.sessions;

-- Recreate as PERMISSIVE
CREATE POLICY "Staff can insert sessions" ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Staff can read sessions" ON public.sessions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

CREATE POLICY "Staff can update sessions" ON public.sessions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));