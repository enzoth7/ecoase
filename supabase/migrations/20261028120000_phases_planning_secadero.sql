-- Fases operativas: pedido sin producción ni transporte, planificación por recurso,
-- secadero (tratamiento térmico / marcado) y transportes internos.

alter table public.orders add column if not exists delivery_date_note text;
alter table public.orders add column if not exists production_defined boolean not null default true;
alter table public.orders add column if not exists production_end_date date;
alter table public.orders add column if not exists transport_defined boolean not null default true;
alter table public.orders add column if not exists drying_start_date date;
alter table public.orders add column if not exists drying_end_date date;
alter table public.orders add column if not exists drying_note text;

alter table public.providers add column if not exists internal_transport boolean not null default false;
update public.providers set internal_transport = true where id = 'linares';
insert into public.providers(id, name, type, supplies, internal_transport)
values ('susalla', 'Susalla', 'Transporte', 'Transporte interno', true),
       ('giossa', 'Giossa', 'Transporte', 'Transporte interno', true)
on conflict (id) do update set internal_transport = true;

-- Los productos asignados a un cliente quedan habilitados para pedidos.
update public.client_products set active = true where not active;

-- Productos: el código Zeta identifica al producto. Tipo y medida pueden repetirse
-- entre clientes (antes esa restricción impedía guardar productos nuevos).
create or replace function public.create_catalog_product_v4(p_kind text, p_measure text, p_requires_treatment boolean, p_zeta_code text, p_stock_name text, p_client_ids text[])
returns text language plpgsql set search_path to 'public' as $$
declare v_id text; v_zeta text := upper(nullif(trim(p_zeta_code), '')); v_client text;
begin
  if p_kind not in ('Pallet', 'Piso', 'Bin') then raise exception 'El tipo indicado no es válido.'; end if;
  if v_zeta is null then raise exception 'Indique el código Zeta.'; end if;
  if exists (select 1 from public.products where upper(trim(zeta_code)) = v_zeta) then
    raise exception 'Ya existe un producto con el código Zeta %.', v_zeta;
  end if;
  v_id := 'producto-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  insert into public.products(id, kind, measure, requires_treatment, zeta_code, stock_name)
  values (v_id, p_kind, nullif(trim(p_measure), ''), coalesce(p_requires_treatment, false), v_zeta, nullif(trim(p_stock_name), ''));
  foreach v_client in array coalesce(p_client_ids, array[]::text[]) loop
    insert into public.client_products(client_id, product_id, zeta_code, active, display_order)
    values (v_client, v_id, v_zeta, true, (select count(*) from public.client_products where client_id = v_client))
    on conflict (client_id, product_id) do update set active = true;
  end loop;
  return v_id;
end; $$;

create or replace function public.set_product_clients_v1(p_product_id text, p_client_ids text[])
returns boolean language plpgsql set search_path to 'public' as $$
declare v_client text; v_link record; v_zeta text;
begin
  select nullif(trim(zeta_code), '') into v_zeta from public.products where id = p_product_id;
  if not found then raise exception 'Producto no encontrado.'; end if;
  foreach v_client in array coalesce(p_client_ids, array[]::text[]) loop
    insert into public.client_products(client_id, product_id, zeta_code, active, display_order)
    values (v_client, p_product_id, v_zeta, true, (select count(*) from public.client_products where client_id = v_client))
    on conflict (client_id, product_id) do update set active = true;
  end loop;
  for v_link in select id from public.client_products where product_id = p_product_id and not (client_id = any(coalesce(p_client_ids, array[]::text[]))) loop
    if exists (select 1 from public.order_lines where client_product_id = v_link.id) then
      update public.client_products set active = false where id = v_link.id;
    else
      delete from public.client_product_assets where client_product_id = v_link.id;
      delete from public.client_products where id = v_link.id;
    end if;
  end loop;
  return true;
end; $$;

create or replace function public.check_product_zeta_available(p_product_id text, p_zeta_code text)
returns boolean language plpgsql set search_path to 'public' as $$
begin
  if exists (select 1 from public.products where id <> p_product_id and upper(trim(zeta_code)) = upper(trim(p_zeta_code))) then
    raise exception 'Ya existe otro producto con el código Zeta %.', upper(trim(p_zeta_code));
  end if;
  return true;
end; $$;

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
  delete from public.production_daily_overrides where product_id = p_id;
  delete from public.production_capacity_rules where product_id = p_id;
  delete from public.client_product_consumption where product_id = p_id;
  delete from public.stock_import_rows where product_id = p_id;
  delete from public.client_product_assets where client_product_id in (select id from public.client_products where product_id = p_id);
  delete from public.client_products where product_id = p_id;
  delete from public.products where id = p_id;
  return p_id;
end; $$;

-- Alta de pedido: sólo cliente, productos y entrega. Producción y transporte se definen después.
create or replace function public.create_operation_order_v7(p_lines jsonb, p_order_date date, p_planned_date date, p_delivery_date_note text, p_notes text, p_required_operations text[])
returns text language plpgsql set search_path to 'public' as $$
declare v_id text;
begin
  v_id := public.create_operation_order_v6(p_lines, p_order_date, p_planned_date, p_planned_date, p_planned_date, null, p_notes, 'negociacion', 'internal', null, null, p_required_operations, 'internal', null);
  delete from public.production_allocations where status = 'draft' and order_line_id in (select id from public.order_lines where order_id = v_id);
  update public.orders set
    delivery_date_note = nullif(trim(p_delivery_date_note), ''),
    production_defined = false, transport_defined = false, production_date = null,
    transport = 'Sin definir', supply = 'Producción sin planificar', logistics = 'Transporte sin definir'
  where id = v_id;
  return v_id;
end; $$;

-- Planificación de producción por pedido: reemplaza los borradores de cada línea y fija el rango.
create or replace function public.plan_order_production_v1(p_order_id text, p_allocations jsonb)
returns boolean language plpgsql set search_path to 'public' as $$
declare v_line record; v_min date; v_max date;
begin
  if not exists (select 1 from public.orders where id = p_order_id) then raise exception 'Pedido no encontrado.'; end if;
  for v_line in select id from public.order_lines where order_id = p_order_id loop
    perform public.replace_production_allocations_v1(v_line.id, coalesce((select jsonb_agg(e) from jsonb_array_elements(p_allocations) e where e->>'orderLineId' = v_line.id), '[]'::jsonb));
  end loop;
  select min(pa.planned_date), max(pa.planned_date) into v_min, v_max
  from public.production_allocations pa join public.order_lines ol on ol.id = pa.order_line_id
  where ol.order_id = p_order_id and pa.status <> 'cancelled';
  update public.orders set production_defined = v_min is not null, production_date = v_min, production_end_date = v_max,
    supply = case when v_min is null then 'Producción sin planificar' else 'Producción planificada' end, updated_at = now()
  where id = p_order_id;
  return true;
end; $$;

-- Transporte por pedido: interno (Linares, Susalla, Giossa) o externo (existente o nuevo).
create or replace function public.assign_order_transport_v1(p_order_id text, p_source text, p_provider_id text, p_new_provider_name text)
returns boolean language plpgsql set search_path to 'public' as $$
declare v_provider text := nullif(trim(p_provider_id), ''); v_name text := nullif(trim(p_new_provider_name), ''); v_label text;
begin
  if p_source not in ('internal', 'external') then raise exception 'Origen de transporte inválido.'; end if;
  if not exists (select 1 from public.orders where id = p_order_id) then raise exception 'Pedido no encontrado.'; end if;
  if v_name is not null then
    select id into v_provider from public.providers where lower(name) = lower(v_name);
    if v_provider is null then
      v_provider := 'transporte-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
      insert into public.providers(id, name, type, supplies, internal_transport) values (v_provider, v_name, 'Transporte', 'Transporte', p_source = 'internal');
    end if;
  end if;
  if v_provider is null then raise exception 'Seleccioná un transporte.'; end if;
  select name into v_label from public.providers where id = v_provider and type = 'Transporte';
  if v_label is null then raise exception 'Seleccioná un transportista registrado.'; end if;
  update public.orders set transport_source = p_source, transport_provider_id = v_provider, transport = v_label,
    logistics = v_label || ' · entrega planificada', transport_defined = true, updated_at = now()
  where id = p_order_id;
  update public.shipments set transport_source = p_source, transport_provider_id = v_provider, updated_at = now()
  where order_id = p_order_id and status = 'planned';
  return true;
end; $$;

create or replace function public.plan_order_drying_v1(p_order_id text, p_start date, p_end date, p_note text)
returns boolean language plpgsql set search_path to 'public' as $$
begin
  if p_start is null then raise exception 'Indicá la fecha de inicio del secado.'; end if;
  if p_end is not null and p_end < p_start then raise exception 'La fecha de fin no puede ser anterior al inicio.'; end if;
  update public.orders set drying_start_date = p_start, drying_end_date = coalesce(p_end, p_start), drying_note = nullif(trim(p_note), ''), updated_at = now()
  where id = p_order_id;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  return true;
end; $$;
