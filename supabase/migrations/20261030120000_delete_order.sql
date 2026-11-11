-- Eliminar pedido: pensado para pedidos de prueba o cargados por error.
-- Un pedido con movimientos de stock o marcados registrados no se elimina (hay que cancelarlo para conservar el historial).

-- El historial de viajes sigue siendo inmutable, salvo cuando se elimina un pedido completo desde delete_operation_order_v1.
create or replace function public.prevent_shipment_event_changes()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' and current_setting('ecoase.deleting_order', true) = 'on' then
    return old;
  end if;
  raise exception 'El historial de viajes es inmutable.';
end; $$;

create or replace function public.delete_operation_order_v1(p_order_id text)
returns boolean language plpgsql set search_path to 'public' as $$
begin
  if not exists (select 1 from public.orders where id = p_order_id) then raise exception 'Pedido no encontrado.'; end if;
  if exists (
    select 1 from public.stock_movements sm
    where sm.order_line_id in (select id from public.order_lines where order_id = p_order_id)
       or sm.production_allocation_id in (select pa.id from public.production_allocations pa join public.order_lines ol on ol.id = pa.order_line_id where ol.order_id = p_order_id)
       or sm.shipment_line_id in (select sl.id from public.shipment_lines sl join public.shipments s on s.id = sl.shipment_id where s.order_id = p_order_id)
  ) or exists (
    select 1 from public.treatment_batches tb where tb.order_line_id in (select id from public.order_lines where order_id = p_order_id)
  ) then
    raise exception 'El pedido ya tiene movimientos de stock o marcados registrados. Cancelalo para conservar el historial.';
  end if;

  perform set_config('ecoase.deleting_order', 'on', true);
  delete from public.stock_reservations where shipment_line_id in (select sl.id from public.shipment_lines sl join public.shipments s on s.id = sl.shipment_id where s.order_id = p_order_id);
  delete from public.shipment_events where shipment_id in (select id from public.shipments where order_id = p_order_id);
  delete from public.shipment_lines where shipment_id in (select id from public.shipments where order_id = p_order_id);
  delete from public.shipments where order_id = p_order_id;
  delete from public.production_allocations where order_line_id in (select id from public.order_lines where order_id = p_order_id);
  delete from public.orders where id = p_order_id;
  perform set_config('ecoase.deleting_order', 'off', true);
  return true;
end; $$;
