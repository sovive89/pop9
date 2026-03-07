
-- Dynamic menu categories
CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  destination text NOT NULL DEFAULT 'kitchen',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read menu_categories" ON public.menu_categories FOR SELECT
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'attendant') OR has_role(auth.uid(), 'kitchen'));

CREATE POLICY "Admin can insert menu_categories" ON public.menu_categories FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update menu_categories" ON public.menu_categories FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete menu_categories" ON public.menu_categories FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Seed existing categories
INSERT INTO public.menu_categories (key, label, destination, sort_order) VALUES
  ('burgers', 'Hambúrgueres', 'kitchen', 0),
  ('sides', 'Entradas', 'kitchen', 1),
  ('drinks', 'Bebidas', 'bar', 2),
  ('desserts', 'Extras', 'bar', 3);
