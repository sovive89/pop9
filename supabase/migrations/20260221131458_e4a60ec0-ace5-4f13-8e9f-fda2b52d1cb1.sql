-- Allow staff to update order_items (for ready_quantity tracking)
CREATE POLICY "Staff can update order_items"
ON public.order_items
FOR UPDATE
USING (true)
WITH CHECK (true);