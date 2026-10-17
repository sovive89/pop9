-- Remove legacy global-role policies which OR-open access across units.
-- Existing mvp_unit_* and mvp_roles_* policies remain in force.
-- Review and run cross-unit integration tests before applying to production.
BEGIN;
DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can read orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Staff can read payments" ON public.payments;
DROP POLICY IF EXISTS "Staff can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
COMMIT;
