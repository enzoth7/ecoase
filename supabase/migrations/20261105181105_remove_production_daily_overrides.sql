-- Retire date-specific production exceptions while preserving historical rows.
-- Capacity checks now use the normal and maximum values of the selected rule.
drop function if exists public.upsert_production_daily_override_v1(date,bigint,bigint,text,integer,integer,boolean,text,text,text);
drop policy if exists production_daily_overrides_public_read on public.production_daily_overrides;
revoke select on public.production_daily_overrides from anon, authenticated;
revoke insert, update on public.production_daily_overrides from service_role;

-- Keep old entries as an archive without tying them to active catalog rows.
alter table public.production_daily_overrides
  drop constraint if exists production_daily_overrides_resource_id_fkey,
  drop constraint if exists production_daily_overrides_capacity_rule_id_fkey,
  drop constraint if exists production_daily_overrides_product_id_fkey;

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
  delete from public.client_product_consumption where product_id = p_id;
  delete from public.stock_import_rows where product_id = p_id;
  delete from public.client_product_assets where client_product_id in (select id from public.client_products where product_id = p_id);
  delete from public.client_products where product_id = p_id;
  delete from public.products where id = p_id;
  return p_id;
end; $$;

create or replace function public.confirm_production_allocation_v1(
  p_allocation_id bigint,
  p_resource_id bigint,
  p_capacity_rule_id bigint,
  p_overload_note text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_allocation public.production_allocations%rowtype;
  v_rule public.production_capacity_rules%rowtype;
  v_product_id text;
  v_normal numeric;
  v_maximum numeric;
  v_normal_load numeric := 0;
  v_maximum_load numeric := 0;
  v_other record;
  v_provider_id text;
begin
  select * into v_allocation from public.production_allocations where id = p_allocation_id for update;
  if not found then raise exception 'Asignación no encontrada.'; end if;
  if v_allocation.status <> 'draft' then raise exception 'Solo se confirman asignaciones en borrador.'; end if;
  select product_id into v_product_id from public.order_lines where id = v_allocation.order_line_id;
  if v_product_id is null then raise exception 'La línea no está vinculada a un producto del maestro.'; end if;
  select * into v_rule from public.production_capacity_rules where id = p_capacity_rule_id;
  if not found or v_rule.resource_id <> p_resource_id or v_rule.product_id <> v_product_id
    or v_rule.valid_from > v_allocation.planned_date
    or (v_rule.valid_to is not null and v_rule.valid_to < v_allocation.planned_date) then
    raise exception 'Seleccione una regla vigente para el recurso y producto.';
  end if;
  v_normal := v_rule.normal_units_per_day;
  v_maximum := v_rule.maximum_units_per_day;

  for v_other in
    select pa.*, r.normal_units_per_day as rule_normal, r.maximum_units_per_day as rule_maximum, r.product_id
    from public.production_allocations pa
    join public.production_capacity_rules r on r.id = pa.capacity_rule_id
    where pa.production_resource_id = p_resource_id
      and pa.planned_date = v_allocation.planned_date
      and pa.status in ('confirmed','completed')
      and pa.id <> v_allocation.id
  loop
    v_normal_load := v_normal_load + coalesce(v_other.actual_quantity, v_other.planned_quantity)::numeric / v_other.rule_normal;
    v_maximum_load := v_maximum_load + coalesce(v_other.actual_quantity, v_other.planned_quantity)::numeric / v_other.rule_maximum;
  end loop;

  v_normal_load := v_normal_load + v_allocation.planned_quantity::numeric / v_normal;
  v_maximum_load := v_maximum_load + v_allocation.planned_quantity::numeric / v_maximum;
  if v_maximum_load > 1.0000001 then raise exception 'La asignación supera la capacidad máxima del recurso.'; end if;
  if v_normal_load > 1.0000001 and nullif(trim(p_overload_note), '') is null then
    raise exception 'Indique una nota para confirmar por encima de la capacidad normal.';
  end if;
  select provider_id into v_provider_id from public.production_resources where id = p_resource_id;
  update public.production_allocations set
    production_resource_id = p_resource_id,
    resource_id = coalesce(v_provider_id, case when p_resource_id = (select id from public.production_resources where resource_type = 'internal_factory' and active order by display_order limit 1) then 'internal' else p_resource_id::text end),
    capacity_rule_id = p_capacity_rule_id,
    status = 'confirmed',
    note = coalesce(nullif(trim(p_overload_note), ''), note)
  where id = p_allocation_id;
  return true;
end; $$;
