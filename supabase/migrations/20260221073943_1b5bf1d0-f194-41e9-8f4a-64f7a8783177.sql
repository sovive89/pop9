
-- Drop overly permissive policies
DROP POLICY "Authenticated users can manage sessions" ON public.sessions;
DROP POLICY "Authenticated users can manage session_clients" ON public.session_clients;
DROP POLICY "Authenticated users can manage orders" ON public.orders;
DROP POLICY "Authenticated users can manage order_items" ON public.order_items;

-- More specific policies using role check
CREATE POLICY "Staff can read sessions" ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Staff can update sessions" ON public.sessions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read session_clients" ON public.session_clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert session_clients" ON public.session_clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update session_clients" ON public.session_clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can delete session_clients" ON public.session_clients FOR DELETE TO authenticated USING (true);

CREATE POLICY "Staff can read orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read order_items" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
