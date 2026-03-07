
-- =============================================
-- FIX RLS POLICIES: Replace permissive USING(true) with role-based checks
-- =============================================

-- order_items: DROP 3, CREATE 3
DROP POLICY IF EXISTS "Staff can read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can update order_items" ON public.order_items;

CREATE POLICY "Staff can read order_items" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

CREATE POLICY "Staff can insert order_items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant')
  );

CREATE POLICY "Staff can update order_items" ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

-- orders: DROP 3, CREATE 3
DROP POLICY IF EXISTS "Staff can read orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

CREATE POLICY "Staff can read orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

CREATE POLICY "Staff can insert orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant')
  );

CREATE POLICY "Staff can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

-- session_clients: DROP 4, CREATE 4
DROP POLICY IF EXISTS "Staff can read session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can insert session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can update session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can delete session_clients" ON public.session_clients;

CREATE POLICY "Staff can read session_clients" ON public.session_clients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant')
  );

CREATE POLICY "Staff can insert session_clients" ON public.session_clients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant')
  );

CREATE POLICY "Staff can update session_clients" ON public.session_clients
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant')
  );

CREATE POLICY "Staff can delete session_clients" ON public.session_clients
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant')
  );

-- sessions: DROP 2 (SELECT, UPDATE), CREATE 2 — INSERT already has auth.uid() = created_by
DROP POLICY IF EXISTS "Staff can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Staff can update sessions" ON public.sessions;

CREATE POLICY "Staff can read sessions" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

CREATE POLICY "Staff can update sessions" ON public.sessions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant')
  );
