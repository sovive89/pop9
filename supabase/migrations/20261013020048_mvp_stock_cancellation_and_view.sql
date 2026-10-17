-- Corrige bloqueios confirmados na revisão do MVP. Não cria saldos nem produtos.
-- Devolve as baixas reais da venda, independentemente da ficha técnica atual.
create or replace function public.order_cancel_reverts_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.stock_movements
      (business_unit_id, raw_material_id, type, quantity, reason,
       reference_type, reference_id, lote_id, batch_info, unit_cost)
    select sm.business_unit_id, sm.raw_material_id, 'entrada', sm.quantity,
           'estorno_cancelamento', 'order_item_cancel', sm.id,
           sm.lote_id, sm.batch_info, sm.unit_cost
    from public.stock_movements sm
    join public.order_items oi on oi.id = sm.reference_id
    where oi.order_id = new.id
      and sm.business_unit_id = new.business_unit_id
      and sm.type = 'saida' and sm.reason = 'venda'
      and sm.reference_type = 'order_item'
      and not exists (
        select 1 from public.stock_movements refund
        where refund.business_unit_id = sm.business_unit_id
          and refund.reference_type = 'order_item_cancel'
          and refund.reference_id = sm.id
      );
  end if;
  return new;
end;
$$;
-- Trigger interno, não é uma RPC pública. O trigger continua autorizado a executá-lo.
revoke all on function public.order_cancel_reverts_stock() from public, anon, authenticated;

alter view public.low_stock_alerts set (security_invoker = true);
revoke all on public.low_stock_alerts from anon;
