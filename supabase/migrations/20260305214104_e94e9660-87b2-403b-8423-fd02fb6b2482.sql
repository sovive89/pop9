-- Fix session_clients policies
DROP POLICY IF EXISTS "Staff can delete session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can insert session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can read session_clients" ON public.session_clients;
DROP POLICY IF EXISTS "Staff can update session_clients" ON public.session_clients;

CREATE POLICY "Staff can delete session_clients" ON public.session_clients FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));
CREATE POLICY "Staff can insert session_clients" ON public.session_clients FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));
CREATE POLICY "Staff can read session_clients" ON public.session_clients FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));
CREATE POLICY "Staff can update session_clients" ON public.session_clients FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));

-- Fix orders policies
DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can read orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

CREATE POLICY "Staff can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));
CREATE POLICY "Staff can read orders" ON public.orders FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Fix order_items policies
DROP POLICY IF EXISTS "Staff can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can update order_items" ON public.order_items;

CREATE POLICY "Staff can insert order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role));
CREATE POLICY "Staff can read order_items" ON public.order_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));
CREATE POLICY "Staff can update order_items" ON public.order_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Fix menu tables policies
DROP POLICY IF EXISTS "Admin can delete menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Admin can insert menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Admin can update menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Staff can read menu_items" ON public.menu_items;

CREATE POLICY "Admin can delete menu_items" ON public.menu_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can insert menu_items" ON public.menu_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update menu_items" ON public.menu_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can read menu_items" ON public.menu_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Fix menu_categories
DROP POLICY IF EXISTS "Admin can delete menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Admin can insert menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Admin can update menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Staff can read menu_categories" ON public.menu_categories;

CREATE POLICY "Admin can delete menu_categories" ON public.menu_categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can insert menu_categories" ON public.menu_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update menu_categories" ON public.menu_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can read menu_categories" ON public.menu_categories FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Fix menu_item_ingredients
DROP POLICY IF EXISTS "Admin can delete menu_item_ingredients" ON public.menu_item_ingredients;
DROP POLICY IF EXISTS "Admin can insert menu_item_ingredients" ON public.menu_item_ingredients;
DROP POLICY IF EXISTS "Admin can update menu_item_ingredients" ON public.menu_item_ingredients;
DROP POLICY IF EXISTS "Staff can read menu_item_ingredients" ON public.menu_item_ingredients;

CREATE POLICY "Admin can delete menu_item_ingredients" ON public.menu_item_ingredients FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can insert menu_item_ingredients" ON public.menu_item_ingredients FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update menu_item_ingredients" ON public.menu_item_ingredients FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can read menu_item_ingredients" ON public.menu_item_ingredients FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Fix menu_item_variants
DROP POLICY IF EXISTS "Admin can delete menu_item_variants" ON public.menu_item_variants;
DROP POLICY IF EXISTS "Admin can insert menu_item_variants" ON public.menu_item_variants;
DROP POLICY IF EXISTS "Admin can update menu_item_variants" ON public.menu_item_variants;
DROP POLICY IF EXISTS "Staff can read menu_item_variants" ON public.menu_item_variants;

CREATE POLICY "Admin can delete menu_item_variants" ON public.menu_item_variants FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can insert menu_item_variants" ON public.menu_item_variants FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update menu_item_variants" ON public.menu_item_variants FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can read menu_item_variants" ON public.menu_item_variants FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Fix table_zones
DROP POLICY IF EXISTS "Admin can delete table_zones" ON public.table_zones;
DROP POLICY IF EXISTS "Admin can insert table_zones" ON public.table_zones;
DROP POLICY IF EXISTS "Admin can update table_zones" ON public.table_zones;
DROP POLICY IF EXISTS "Staff can read table_zones" ON public.table_zones;

CREATE POLICY "Admin can delete table_zones" ON public.table_zones FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can insert table_zones" ON public.table_zones FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update table_zones" ON public.table_zones FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can read table_zones" ON public.table_zones FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'attendant'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Fix user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Fix profiles
DROP POLICY IF EXISTS "Admin can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Admin can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);