drop view if exists public.stock_daily_projection;
drop view if exists public.stock_risk;
drop function if exists public.upsert_client_product_consumption_v1(text,text,numeric,integer,integer,date,date,text,text);
drop table if exists public.client_product_consumption;

create or replace function public.delete_catalog_product_v2(p_id text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_orders integer; v_clients text; v_stock integer;
begin
  if not exists (select 1 from public.products where id = p_id) then raise exception 'Producto no encontrado.'; end if;
  select count(distinct ol.order_id), string_agg(distinct o.client, ', ') into v_orders, v_clients
  from public.order_lines ol join public.orders o on o.id = ol.order_id where ol.product_id = p_id;
  if v_orders > 0 then
    raise exception 'No se puede eliminar: el producto figura en % pedido(s) de %. Cancelá o eliminá esos pedidos primero.', v_orders, v_clients;
  end if;
  select (select count(*) from public.stock_movements where product_id = p_id) + (select count(*) from public.treatment_batches where product_id = p_id) + (select count(*) from public.stock_reservations where product_id = p_id) into v_stock;
  if v_stock > 0 then raise exception 'No se puede eliminar: el producto tiene movimientos de stock o de secadero registrados.'; end if;
  if exists (select 1 from public.production_allocations pa join public.production_capacity_rules r on r.id = pa.capacity_rule_id where r.product_id = p_id) then
    raise exception 'No se puede eliminar: hay producción confirmada con reglas de este producto.';
  end if;
  delete from public.production_capacity_rules where product_id = p_id;
  delete from public.stock_import_rows where product_id = p_id;
  delete from public.client_product_assets where client_product_id in (select id from public.client_products where product_id = p_id);
  delete from public.client_products where product_id = p_id;
  delete from public.products where id = p_id;
  return p_id;
end; $$;

notify pgrst, 'reload schema';
