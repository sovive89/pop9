-- Add destination column to order_items to separate kitchen vs bar items
ALTER TABLE public.order_items 
ADD COLUMN destination text NOT NULL DEFAULT 'kitchen' 
CHECK (destination IN ('kitchen', 'bar'));