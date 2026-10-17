-- Security: remove legacy global-role RLS policies after unit-scoped replacements exist.
-- Depends on previously deployed mvp_unit_* policies. Validate in staging before production.
BEGIN;
DROP POLICY IF EXISTS "Admin can delete menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Admin can insert menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Admin can update menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Staff can read menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Admin can delete menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Admin can insert menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Admin can update menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Staff can read menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Staff can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can delete session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can insert session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can read session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can update session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "Staff can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Staff can update sessions" ON public.sessions;
COMMIT;
