
-- Add image column to menu_items
ALTER TABLE public.menu_items ADD COLUMN image_url text;

-- Create storage bucket for menu images
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true);

-- Anyone authenticated can read
CREATE POLICY "Anyone can view menu images" ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

-- Admin can upload
CREATE POLICY "Admin can upload menu images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-images' AND has_role(auth.uid(), 'admin'));

-- Admin can update
CREATE POLICY "Admin can update menu images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'menu-images' AND has_role(auth.uid(), 'admin'));

-- Admin can delete
CREATE POLICY "Admin can delete menu images" ON storage.objects FOR DELETE
  USING (bucket_id = 'menu-images' AND has_role(auth.uid(), 'admin'));
