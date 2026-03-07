ALTER TABLE public.order_items 
  ADD COLUMN claimed_by uuid DEFAULT NULL,
  ADD COLUMN claimed_at timestamptz DEFAULT NULL;