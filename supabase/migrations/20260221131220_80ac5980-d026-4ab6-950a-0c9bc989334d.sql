-- Add ready_quantity to track how many units of each item are done
ALTER TABLE public.order_items 
ADD COLUMN ready_quantity integer NOT NULL DEFAULT 0;