
-- ═══════════════════════════════════════════════════════════════
-- 1. Tabelas de Cardápio
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.menu_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL,
  category text NOT NULL CHECK (category IN ('burgers', 'sides', 'drinks', 'desserts')),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  removable boolean NOT NULL DEFAULT false,
  extra_price numeric,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.menu_item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- Trigger de updated_at para menu_items
CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_menu_items_category ON public.menu_items(category);
CREATE INDEX idx_menu_item_ingredients_item ON public.menu_item_ingredients(menu_item_id);
CREATE INDEX idx_menu_item_variants_item ON public.menu_item_variants(menu_item_id);

-- ═══════════════════════════════════════════════════════════════
-- 2. RLS para tabelas de Cardápio
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;

-- menu_items: leitura para todos autenticados, escrita para admin
CREATE POLICY "Staff can read menu_items" ON public.menu_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

CREATE POLICY "Admin can insert menu_items" ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update menu_items" ON public.menu_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete menu_items" ON public.menu_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- menu_item_ingredients: mesma lógica
CREATE POLICY "Staff can read menu_item_ingredients" ON public.menu_item_ingredients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

CREATE POLICY "Admin can insert menu_item_ingredients" ON public.menu_item_ingredients
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update menu_item_ingredients" ON public.menu_item_ingredients
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete menu_item_ingredients" ON public.menu_item_ingredients
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- menu_item_variants: mesma lógica
CREATE POLICY "Staff can read menu_item_variants" ON public.menu_item_variants
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'attendant') OR
    public.has_role(auth.uid(), 'kitchen')
  );

CREATE POLICY "Admin can insert menu_item_variants" ON public.menu_item_variants
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update menu_item_variants" ON public.menu_item_variants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete menu_item_variants" ON public.menu_item_variants
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ═══════════════════════════════════════════════════════════════
-- 3. Admin pode ler todos os profiles (para gestão de usuários)
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "Admin can read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
