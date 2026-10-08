-- current_stock <= min_stock disparava alerta falso quando os dois são 0
-- (estoque zerado por reset de teste, sem mínimo configurado ainda) —
-- 0 <= 0 é verdadeiro. Corrige pra < : só alerta quando o estoque está
-- de fato ABAIXO do mínimo, não igual a ele.
create or replace view public.low_stock_alerts as
select id, name, unit, current_stock, min_stock,
       min_stock - current_stock as deficit
from public.raw_materials
where active = true and current_stock < min_stock
order by (min_stock - current_stock) desc;
