alter table public.orders
  add column order_date date,
  add column requested_delivery_date date,
  add column zeta_code text,
  add column notes text;

drop function if exists public.create_operation_order(text, text, integer, date, text, text);

create function public.create_operation_order(
  p_client text,
  p_product text,
  p_requested integer,
  p_planned_date date,
  p_transport text,
  p_reference text default null,
  p_order_date date default null,
  p_requested_delivery_date date default null,
  p_zeta_code text default null,
  p_delivery_address text default null,
  p_notes text default null,
  p_stage text default 'negociacion'
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_reference text;
begin
  if nullif(trim(p_client), '') is null or nullif(trim(p_product), '') is null then
    raise exception 'Cliente y producto son obligatorios.';
  end if;
  if p_requested is null or p_requested <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;
  if p_order_date is null or p_requested_delivery_date is null or p_planned_date is null then
    raise exception 'Las fechas del pedido son obligatorias.';
  end if;
  if p_stage not in ('negociacion', 'produccion', 'logistica') then
    raise exception 'Etapa inválida.';
  end if;
  if not exists (select 1 from public.providers where name = trim(p_transport) and type = 'Transporte') then
    raise exception 'Seleccione un transportista registrado en Proveedores.';
  end if;

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
    nullif(trim(p_delivery_address), ''), nullif(trim(p_zeta_code), ''), nullif(trim(p_notes), ''),
    'Alta desde dashboard'
  );

  insert into public.order_lines (id, order_id, product, quantity, position)
  values (v_id || '-1', v_id, trim(p_product), p_requested, 0);

  return v_id;
end;
$$;

revoke all on function public.create_operation_order(text, text, integer, date, text, text, date, date, text, text, text, text) from public;
grant execute on function public.create_operation_order(text, text, integer, date, text, text, date, date, text, text, text, text) to anon, authenticated;
