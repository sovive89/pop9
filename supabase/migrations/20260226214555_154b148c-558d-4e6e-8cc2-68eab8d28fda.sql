-- Table to store zone configurations for the table map
CREATE TABLE public.table_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  icon text NOT NULL DEFAULT 'UtensilsCrossed',
  cols integer NOT NULL DEFAULT 4,
  table_start integer NOT NULL,
  table_end integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.table_zones ENABLE ROW LEVEL SECURITY;

-- All staff can read zones
CREATE POLICY "Staff can read table_zones" ON public.table_zones
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'attendant') OR 
    public.has_role(auth.uid(), 'kitchen')
  );

-- Only admins can manage zones
CREATE POLICY "Admin can insert table_zones" ON public.table_zones
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update table_zones" ON public.table_zones
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete table_zones" ON public.table_zones
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_table_zones_updated_at
  BEFORE UPDATE ON public.table_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default zones
INSERT INTO public.table_zones (key, label, icon, cols, table_start, table_end, sort_order) VALUES
  ('salao', 'Salão Principal', 'UtensilsCrossed', 4, 1, 12, 0),
  ('varanda', 'Varanda', 'Coffee', 5, 13, 22, 1),
  ('vip', 'Área VIP', 'Users', 4, 23, 30, 2);
