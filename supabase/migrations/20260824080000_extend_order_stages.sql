alter table public.orders drop constraint if exists orders_stage_check;
alter table public.orders add constraint orders_stage_check check (stage in (
  'negociacion', 'produccion', 'logistica', 'atrasado', 'pospuesto', 'cancelado', 'reorganizando', 'completado'
));

create or replace function public.create_operation_order(
  p_client text, p_product text, p_requested integer, p_planned_date date, p_transport text,
  p_reference text default null, p_order_date date default null, p_requested_delivery_date date default null,
  p_zeta_code text default null, p_delivery_address text default null, p_notes text default null,
  p_stage text default 'negociacion'
) returns text
language plpgsql security definer set search_path = public
as $$
declare v_id text; v_reference text;
begin
  if nullif(trim(p_client), '') is null or nullif(trim(p_product), '') is null then raise exception 'Cliente y producto son obligatorios.'; end if;
  if p_requested is null or p_requested <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if p_order_date is null or p_requested_delivery_date is null or p_planned_date is null then raise exception 'Las fechas del pedido son obligatorias.'; end if;
  if p_stage not in ('negociacion', 'produccion', 'logistica', 'atrasado', 'pospuesto', 'cancelado', 'reorganizando') then raise exception 'Etapa inválida.'; end if;
  if not exists (select 1 from public.providers where name = trim(p_transport) and type = 'Transporte') then raise exception 'Seleccione un transportista registrado en Proveedores.'; end if;

  v_id := 'pedido-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  select coalesce(nullif(trim(p_reference), ''), 'Pedido ' || (count(*) + 1)::text) into v_reference from public.orders;
  insert into public.orders (
    id, reference, client, product, requested, delivered, pending, status, status_label, stage,
    order_date, requested_delivery_date, planned_date, transport, supply, preparation, logistics,
    delivery, action, delivery_address, zeta_code, notes, source
  ) values (
    v_id, v_reference, trim(p_client), trim(p_product), p_requested, 0, p_requested,
    'coordinacion', 'En coordinación', p_stage,
    p_order_date, p_requested_delivery_date, p_planned_date, trim(p_transport),
    case when p_stage = 'produccion' then 'Producción planificada' else 'Pendiente de asignación' end,
    'Pendiente de preparación', trim(p_transport) || ' · entrega planificada',
    '0 de ' || p_requested || ' entregados',
    case when p_stage = 'logistica' then 'Coordinar la entrega.' else 'Preparar y coordinar la entrega.' end,
    nullif(trim(p_delivery_address), ''), nullif(trim(p_zeta_code), ''), nullif(trim(p_notes), ''), 'Alta desde dashboard'
  );
  insert into public.order_lines (id, order_id, product, quantity, position) values (v_id || '-1', v_id, trim(p_product), p_requested, 0);
  return v_id;
end;
$$;

create or replace function public.update_operation_order(
  p_id text, p_status text default null, p_transport text default null, p_planned_date date default null,
  p_requested integer default null, p_stage text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype; v_change_id uuid; v_has_changes boolean; v_difference integer; v_reduction integer; v_line record;
begin
  select * into v_order from public.orders where id = p_id for update;
  if not found then raise exception 'Pedido no encontrado.' using errcode = 'P0002'; end if;
  if p_status is not null and p_status not in ('bloqueado', 'coordinacion', 'completado') then raise exception 'Estado inválido.'; end if;
  if p_stage is not null and p_stage not in ('negociacion', 'produccion', 'logistica', 'atrasado', 'pospuesto', 'cancelado', 'reorganizando', 'completado') then raise exception 'Etapa inválida.'; end if;
  if p_transport is not null and not exists (select 1 from public.providers where name = trim(p_transport) and type = 'Transporte') then raise exception 'Seleccione un transportista registrado en Proveedores.'; end if;
  if p_requested is not null and p_requested < v_order.delivered then raise exception 'La cantidad no puede ser menor que lo ya entregado.'; end if;
  v_has_changes := (p_planned_date is not null and p_planned_date <> v_order.planned_date) or (p_requested is not null and p_requested <> v_order.requested) or (p_transport is not null and trim(p_transport) <> v_order.transport) or (p_stage is not null and p_stage <> v_order.stage) or (p_status is not null and p_status <> v_order.status);
  if not v_has_changes then return p_id; end if;
  insert into public.order_changes(order_id) values (p_id) returning id into v_change_id;
  if p_planned_date is not null and p_planned_date <> v_order.planned_date then
    insert into public.order_change_items(change_id, field, from_value, to_value, position) values (v_change_id, 'Fecha planificada', v_order.planned_date::text, p_planned_date::text, 0);
    update public.orders set original_planned_date = coalesce(original_planned_date, planned_date), planned_date = p_planned_date, updated_at = now() where id = p_id;
  end if;
  if p_requested is not null and p_requested <> v_order.requested then
    insert into public.order_change_items(change_id, field, from_value, to_value, position) values (v_change_id, 'Cantidad de pallets', v_order.requested::text, p_requested::text, 1);
    v_difference := p_requested - v_order.requested;
    if v_difference > 0 then update public.order_lines set quantity = quantity + v_difference where id = (select id from public.order_lines where order_id = p_id order by position desc, id desc limit 1);
    else
      v_reduction := abs(v_difference);
      for v_line in select id, quantity from public.order_lines where order_id = p_id order by position desc, id desc for update loop
        exit when v_reduction = 0;
        update public.order_lines set quantity = quantity - least(quantity, v_reduction) where id = v_line.id;
        v_reduction := v_reduction - least(v_line.quantity, v_reduction);
      end loop;
    end if;
    update public.orders set requested = p_requested, pending = p_requested - delivered, delivery = delivered || ' de ' || p_requested || ' entregados', updated_at = now() where id = p_id;
  end if;
  if p_transport is not null and trim(p_transport) <> v_order.transport then
    insert into public.order_change_items(change_id, field, from_value, to_value, position) values (v_change_id, 'Transportista', v_order.transport, trim(p_transport), 2);
    update public.orders set transport = trim(p_transport), logistics = replace(logistics, v_order.transport, trim(p_transport)), updated_at = now() where id = p_id;
  end if;
  if p_stage is not null and p_stage <> v_order.stage then
    insert into public.order_change_items(change_id, field, from_value, to_value, position) values (
      v_change_id, 'Etapa',
      case v_order.stage when 'negociacion' then 'Negociación' when 'produccion' then 'Producción' when 'logistica' then 'Logística' when 'atrasado' then 'Atrasado' when 'pospuesto' then 'Pospuesto' when 'cancelado' then 'Cancelado' when 'reorganizando' then 'Reorganizando' else 'Completado' end,
      case p_stage when 'negociacion' then 'Negociación' when 'produccion' then 'Producción' when 'logistica' then 'Logística' when 'atrasado' then 'Atrasado' when 'pospuesto' then 'Pospuesto' when 'cancelado' then 'Cancelado' when 'reorganizando' then 'Reorganizando' else 'Completado' end, 3
    );
    update public.orders set stage = p_stage, status = case when p_stage = 'completado' then 'completado' else 'coordinacion' end, status_label = case when p_stage = 'completado' then 'Completado' else 'En coordinación' end, updated_at = now() where id = p_id;
  end if;
  select * into v_order from public.orders where id = p_id;
  if p_status is not null and p_status <> v_order.status then
    insert into public.order_change_items(change_id, field, from_value, to_value, position) values (v_change_id, 'Estado', v_order.status_label, case p_status when 'bloqueado' then 'Bloqueado' when 'coordinacion' then 'En coordinación' else 'Completado' end, 4);
    update public.orders set status = p_status, status_label = case p_status when 'bloqueado' then 'Bloqueado' when 'coordinacion' then 'En coordinación' else 'Completado' end, updated_at = now() where id = p_id;
  end if;
  return p_id;
end;
$$;
