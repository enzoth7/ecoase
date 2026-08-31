-- Applied to Supabase as 20260829195920_shipments_calendar_logistics.
alter table public.order_lines
  add column if not exists requested_quantity integer;

update public.order_lines set requested_quantity = quantity where requested_quantity is null;
alter table public.order_lines alter column requested_quantity set not null;
alter table public.order_lines add constraint order_lines_requested_quantity_positive check (requested_quantity > 0);
create index if not exists order_lines_order_id_idx on public.order_lines(order_id, position, id);

create table public.production_allocations (
  id bigint generated always as identity primary key,
  order_line_id text not null references public.order_lines(id) on delete restrict,
  resource_id text,
  planned_date date not null,
  planned_quantity integer not null check (planned_quantity > 0),
  status text not null default 'draft' check (status in ('draft','confirmed','completed','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('confirmed','completed') or nullif(trim(resource_id), '') is not null)
);

create index production_allocations_line_idx on public.production_allocations(order_line_id, planned_date, id);
create index production_allocations_date_idx on public.production_allocations(planned_date, status) where status <> 'cancelled';

create table public.shipments (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete restrict,
  planned_date date not null,
  status text not null default 'planned' check (status in ('planned','ready','loaded','dispatched','delivered','cancelled')),
  transport_source text not null check (transport_source in ('internal','external')),
  transport_provider_id text references public.providers(id) on delete restrict,
  remittance text,
  shared_remittance_reason text,
  delivery_address_snapshot text,
  loaded_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (transport_source = 'internal' or transport_provider_id is not null),
  check (status in ('planned','cancelled') or nullif(trim(remittance), '') is not null),
  check (status in ('planned','cancelled') or nullif(trim(delivery_address_snapshot), '') is not null),
  check (status not in ('loaded','dispatched','delivered') or loaded_at is not null),
  check (status not in ('dispatched','delivered') or dispatched_at is not null),
  check (status <> 'delivered' or delivered_at is not null)
);

create index shipments_order_idx on public.shipments(order_id, planned_date, id);
create index shipments_calendar_idx on public.shipments(planned_date, status) where status <> 'cancelled';
create index shipments_transport_provider_idx on public.shipments(transport_provider_id) where transport_provider_id is not null;
create index shipments_remittance_idx on public.shipments(lower(trim(remittance))) where remittance is not null and status <> 'cancelled';

create table public.shipment_lines (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  order_line_id text not null references public.order_lines(id) on delete restrict,
  planned_quantity integer not null check (planned_quantity > 0),
  delivered_quantity integer not null default 0 check (delivered_quantity >= 0 and delivered_quantity <= planned_quantity),
  unique (shipment_id, order_line_id)
);

create index shipment_lines_shipment_idx on public.shipment_lines(shipment_id, id);
create index shipment_lines_order_line_idx on public.shipment_lines(order_line_id, shipment_id);

create table public.shipment_events (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  event_type text not null check (event_type in ('created','transition','rescheduled','incident','remittance_corrected')),
  previous_status text,
  next_status text,
  previous_date date,
  next_date date,
  reason text check (reason is null or reason in ('production','logistics','client','weather','other')),
  note text,
  previous_remittance text,
  next_remittance text,
  responsible text not null check (nullif(trim(responsible), '') is not null),
  created_at timestamptz not null default now()
);

create index shipment_events_shipment_idx on public.shipment_events(shipment_id, created_at desc, id desc);

create trigger production_allocations_set_updated_at before update on public.production_allocations
for each row execute function public.set_client_master_updated_at();
create trigger shipments_set_updated_at before update on public.shipments
for each row execute function public.set_client_master_updated_at();

create or replace function public.prevent_shipment_event_changes()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  raise exception 'El historial de viajes es inmutable.';
end; $$;
revoke execute on function public.prevent_shipment_event_changes() from public, anon, authenticated;
create trigger shipment_events_no_update before update or delete on public.shipment_events
for each row execute function public.prevent_shipment_event_changes();

alter table public.production_allocations enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_lines enable row level security;
alter table public.shipment_events enable row level security;

create policy production_allocations_public_read on public.production_allocations for select to anon, authenticated using (true);
create policy shipments_public_read on public.shipments for select to anon, authenticated using (true);
create policy shipment_lines_public_read on public.shipment_lines for select to anon, authenticated using (true);
create policy shipment_events_public_read on public.shipment_events for select to anon, authenticated using (true);

grant select on public.production_allocations, public.shipments, public.shipment_lines, public.shipment_events to anon, authenticated;
grant select, insert, update, delete on public.production_allocations, public.shipments, public.shipment_lines to service_role;
grant select, insert on public.shipment_events to service_role;
grant usage, select on sequence public.production_allocations_id_seq, public.shipments_id_seq, public.shipment_lines_id_seq, public.shipment_events_id_seq to service_role;

create or replace function public.refresh_order_from_shipments(p_order_id text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_delivered integer; v_requested integer; v_next_date date;
begin
  select requested into v_requested from public.orders where id = p_order_id for update;
  select coalesce(sum(sl.delivered_quantity), 0) into v_delivered
  from public.shipments s join public.shipment_lines sl on sl.shipment_id = s.id
  where s.order_id = p_order_id and s.status <> 'cancelled';
  select min(planned_date) into v_next_date from public.shipments
  where order_id = p_order_id and status not in ('cancelled','delivered');
  update public.orders set
    delivered = v_delivered,
    pending = greatest(v_requested - v_delivered, 0),
    delivery = v_delivered || ' de ' || v_requested || ' entregados',
    delivery_status = case when v_delivered = 0 then delivery_status when v_delivered >= v_requested then 'completa' else 'parcial' end,
    stage = case when v_delivered >= v_requested then 'completado' else stage end,
    status = case when v_delivered >= v_requested then 'completado' else status end,
    status_label = case when v_delivered >= v_requested then 'Completado' else status_label end,
    planned_date = coalesce(v_next_date, planned_date),
    updated_at = now()
  where id = p_order_id;
end; $$;
revoke execute on function public.refresh_order_from_shipments(text) from public, anon, authenticated;
grant execute on function public.refresh_order_from_shipments(text) to service_role;

create or replace function public.create_operation_order_v4(
  p_lines jsonb, p_order_date date, p_requested_delivery_date date, p_production_date date, p_planned_date date,
  p_reference text, p_notes text, p_stage text, p_production_source text, p_producer_provider_id text,
  p_import_arrival_date date, p_required_operations text[], p_transport_source text, p_transport_provider_id text
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_item jsonb; v_link public.client_products%rowtype; v_client public.clients%rowtype; v_product public.products%rowtype;
  v_client_id text; v_id text; v_reference text; v_transport text; v_producer text; v_product_summary text := ''; v_zeta_summary text := '';
  v_total integer := 0; v_quantity integer; v_position integer := 0; v_line_id text; v_shipment_id bigint;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Indique al menos una línea.'; end if;
  if p_order_date is null or p_requested_delivery_date is null or p_planned_date is null then raise exception 'Las fechas son obligatorias.'; end if;
  if p_stage not in ('negociacion','produccion','logistica','atrasado','pospuesto','cancelado','reorganizando') then raise exception 'Etapa inválida.'; end if;
  if p_production_source not in ('internal','sawmill','import') or p_transport_source not in ('internal','external') then raise exception 'Origen operativo inválido.'; end if;
  if cardinality(p_required_operations) = 0 or not (p_required_operations <@ array['assembly','marking','ht']::text[]) then raise exception 'Seleccione operaciones válidas.'; end if;
  if p_production_source = 'sawmill' and not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Aserradero') then raise exception 'Seleccione un aserradero registrado.'; end if;
  if p_production_source <> 'import' and p_production_date is null then raise exception 'Indique la fecha de producción.'; end if;
  if p_production_source = 'import' and (p_import_arrival_date is null or not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Importador')) then raise exception 'Seleccione un importador y fecha de llegada.'; end if;
  if p_transport_source = 'external' and not exists (select 1 from public.providers where id = p_transport_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista registrado.'; end if;

  for v_item in select * from jsonb_array_elements(p_lines) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Cada línea necesita una cantidad mayor a cero.'; end if;
    select * into v_link from public.client_products where id = (v_item->>'clientProductId')::bigint and active for share;
    if not found then raise exception 'Un producto no está habilitado.'; end if;
    if v_client_id is null then v_client_id := v_link.client_id; elsif v_client_id <> v_link.client_id then raise exception 'Todas las líneas deben pertenecer al mismo cliente.'; end if;
    if not exists (select 1 from public.client_product_controls where client_product_id = v_link.id and active)
      or not exists (select 1 from public.client_product_assets where client_product_id = v_link.id and active and is_primary) then
      raise exception 'Una ficha de producto está incompleta.';
    end if;
    select * into v_product from public.products where id = v_link.product_id;
    v_product_summary := concat_ws(' · ', nullif(v_product_summary, ''), coalesce(nullif(trim(v_link.operational_name), ''), concat_ws(' ', v_product.kind, v_product.measure)));
    v_zeta_summary := concat_ws(' · ', nullif(v_zeta_summary, ''), v_link.zeta_code);
    v_total := v_total + v_quantity;
  end loop;

  select * into v_client from public.clients where id = v_client_id and active and nullif(trim(address), '') is not null;
  if not found then raise exception 'El cliente no está activo o no tiene dirección.'; end if;
  select name into v_transport from public.providers where id = p_transport_provider_id;
  select name into v_producer from public.providers where id = p_producer_provider_id;
  v_transport := case when p_transport_source = 'internal' then 'Interno' else v_transport end;
  v_id := 'pedido-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  select coalesce(nullif(trim(p_reference), ''), 'Pedido ' || (count(*) + 1)::text) into v_reference from public.orders;

  insert into public.orders(id, reference, client, product, requested, delivered, pending, status, status_label, stage,
    order_date, requested_delivery_date, planned_date, transport, supply, preparation, logistics, delivery, action,
    delivery_address, zeta_code, notes, source, production_source, producer_provider_id, production_date,
    import_arrival_date, required_operations, transport_source, transport_provider_id)
  values (v_id, v_reference, v_client.name, v_product_summary, v_total, 0, v_total, 'coordinacion', 'En coordinación', p_stage,
    p_order_date, p_requested_delivery_date, p_planned_date, v_transport,
    case p_production_source when 'internal' then 'Producción interna' when 'sawmill' then 'Produce ' || v_producer else 'Importación · llegada ' || p_import_arrival_date::text end,
    'Operaciones: ' || array_to_string(p_required_operations, ', '), v_transport || ' · entrega planificada', '0 de ' || v_total || ' entregados',
    'Preparar y coordinar la entrega.', v_client.address, v_zeta_summary, nullif(trim(p_notes), ''), 'Alta con líneas, producción y viaje',
    p_production_source, p_producer_provider_id, p_production_date, p_import_arrival_date, p_required_operations, p_transport_source, p_transport_provider_id);

  insert into public.shipments(order_id, planned_date, status, transport_source, transport_provider_id)
  values (v_id, p_planned_date, 'planned', p_transport_source, p_transport_provider_id) returning id into v_shipment_id;

  for v_item in select * from jsonb_array_elements(p_lines) loop
    select * into v_link from public.client_products where id = (v_item->>'clientProductId')::bigint;
    select * into v_product from public.products where id = v_link.product_id;
    v_quantity := (v_item->>'quantity')::integer;
    v_line_id := v_id || '-' || (v_position + 1);
    insert into public.order_lines(id, order_id, product, product_id, client_product_id, quantity, requested_quantity, position)
    values (v_line_id, v_id, coalesce(nullif(trim(v_link.operational_name), ''), concat_ws(' · ', v_product.kind, coalesce(v_product.measure,'Sin medida'), coalesce(v_product.treatment,'Sin tratamiento'))), v_product.id, v_link.id, v_quantity, v_quantity, v_position);
    insert into public.production_allocations(order_line_id, resource_id, planned_date, planned_quantity, status)
    values (v_line_id, case when p_production_source = 'internal' then 'internal' else p_producer_provider_id end,
      coalesce(p_production_date, p_import_arrival_date), v_quantity, case when p_stage = 'produccion' then 'confirmed' else 'draft' end);
    insert into public.shipment_lines(shipment_id, order_line_id, planned_quantity) values (v_shipment_id, v_line_id, v_quantity);
    v_position := v_position + 1;
  end loop;
  insert into public.shipment_events(shipment_id, event_type, next_status, next_date, responsible)
  values (v_shipment_id, 'created', 'planned', p_planned_date, 'Sistema');
  return v_id;
end; $$;

create or replace function public.update_planned_shipment_v1(
  p_shipment_id bigint, p_planned_date date, p_transport_source text, p_transport_provider_id text, p_lines jsonb, p_responsible text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_shipment public.shipments%rowtype; v_item jsonb; v_line public.order_lines%rowtype; v_committed integer; v_quantity integer;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  if v_shipment.status <> 'planned' then raise exception 'Solo se edita un viaje planificado.'; end if;
  if p_planned_date is null or p_transport_source not in ('internal','external') then raise exception 'Fecha y transporte son obligatorios.'; end if;
  if p_transport_source = 'external' and not exists (select 1 from public.providers where id = p_transport_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Indique líneas para el viaje.'; end if;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.order_lines where id = v_item->>'orderLineId' and order_id = v_shipment.order_id for update;
    if not found then raise exception 'Línea inválida para el pedido.'; end if;
    v_quantity := (v_item->>'plannedQuantity')::integer;
    select coalesce(sum(sl.planned_quantity),0) into v_committed
    from public.shipment_lines sl join public.shipments s on s.id = sl.shipment_id
    where sl.order_line_id = v_line.id and s.status <> 'cancelled' and s.id <> p_shipment_id;
    if v_quantity <= 0 or v_committed + v_quantity > v_line.requested_quantity then raise exception 'La cantidad de viajes supera la línea.'; end if;
  end loop;
  delete from public.shipment_lines where shipment_id = p_shipment_id;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    insert into public.shipment_lines(shipment_id, order_line_id, planned_quantity)
    values (p_shipment_id, v_item->>'orderLineId', (v_item->>'plannedQuantity')::integer);
  end loop;
  update public.shipments set planned_date = p_planned_date, transport_source = p_transport_source,
    transport_provider_id = case when p_transport_source = 'internal' then null else p_transport_provider_id end
  where id = p_shipment_id;
  if p_planned_date <> v_shipment.planned_date then
    insert into public.shipment_events(shipment_id, event_type, previous_date, next_date, reason, note, responsible)
    values (p_shipment_id, 'rescheduled', v_shipment.planned_date, p_planned_date, 'logistics', 'Ajuste de planificación del viaje', coalesce(nullif(trim(p_responsible),''),'Operación'));
  end if;
  perform public.refresh_order_from_shipments(v_shipment.order_id);
  return true;
end; $$;

create or replace function public.replace_production_allocations_v1(p_order_line_id text, p_allocations jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare v_line public.order_lines%rowtype; v_item jsonb; v_total integer := 0; v_completed integer;
begin
  select * into v_line from public.order_lines where id = p_order_line_id for update;
  if not found then raise exception 'Línea no encontrada.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'Formato de asignaciones inválido.'; end if;
  select coalesce(sum(planned_quantity),0) into v_completed from public.production_allocations where order_line_id = p_order_line_id and status = 'completed';
  for v_item in select * from jsonb_array_elements(p_allocations) loop
    if (v_item->>'plannedQuantity')::integer <= 0 then raise exception 'Las cantidades deben ser mayores a cero.'; end if;
    if (v_item->>'status') in ('confirmed','completed') and nullif(trim(v_item->>'resourceId'),'') is null then raise exception 'La asignación confirmada necesita recurso.'; end if;
    v_total := v_total + (v_item->>'plannedQuantity')::integer;
  end loop;
  if v_total + v_completed > v_line.requested_quantity then raise exception 'La producción asignada supera la cantidad de la línea.'; end if;
  delete from public.production_allocations where order_line_id = p_order_line_id and status in ('draft','confirmed');
  for v_item in select * from jsonb_array_elements(p_allocations) loop
    insert into public.production_allocations(order_line_id, resource_id, planned_date, planned_quantity, status, note)
    values (p_order_line_id, nullif(trim(v_item->>'resourceId'),''), (v_item->>'plannedDate')::date,
      (v_item->>'plannedQuantity')::integer, coalesce(nullif(v_item->>'status',''),'draft'), nullif(trim(v_item->>'note'),''));
  end loop;
  return true;
end; $$;

create or replace function public.create_shipment_v1(
  p_order_id text, p_planned_date date, p_transport_source text, p_transport_provider_id text, p_lines jsonb, p_responsible text
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint; v_item jsonb; v_line public.order_lines%rowtype; v_committed integer; v_quantity integer;
begin
  perform 1 from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if p_transport_source not in ('internal','external') then raise exception 'Origen de transporte inválido.'; end if;
  if p_transport_source = 'external' and not exists (select 1 from public.providers where id = p_transport_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Indique líneas para el viaje.'; end if;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.order_lines where id = v_item->>'orderLineId' and order_id = p_order_id for update;
    if not found then raise exception 'Línea inválida para el pedido.'; end if;
    v_quantity := (v_item->>'plannedQuantity')::integer;
    select coalesce(sum(sl.planned_quantity),0) into v_committed from public.shipment_lines sl join public.shipments s on s.id = sl.shipment_id where sl.order_line_id = v_line.id and s.status <> 'cancelled';
    if v_quantity <= 0 or v_committed + v_quantity > v_line.requested_quantity then raise exception 'La cantidad de viajes supera la línea.'; end if;
  end loop;
  insert into public.shipments(order_id, planned_date, transport_source, transport_provider_id)
  values (p_order_id, p_planned_date, p_transport_source, p_transport_provider_id) returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    insert into public.shipment_lines(shipment_id, order_line_id, planned_quantity)
    values (v_id, v_item->>'orderLineId', (v_item->>'plannedQuantity')::integer);
  end loop;
  insert into public.shipment_events(shipment_id, event_type, next_status, next_date, responsible)
  values (v_id, 'created', 'planned', p_planned_date, coalesce(nullif(trim(p_responsible),''),'Operación'));
  return v_id;
end; $$;

create or replace function public.transition_shipment_v1(
  p_shipment_id bigint, p_next_status text, p_remittance text, p_shared_remittance_reason text,
  p_delivered_lines jsonb, p_responsible text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_shipment public.shipments%rowtype; v_expected text; v_address text; v_item jsonb; v_line public.shipment_lines%rowtype; v_now timestamptz := now();
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  v_expected := case v_shipment.status when 'planned' then 'ready' when 'ready' then 'loaded' when 'loaded' then 'dispatched' when 'dispatched' then 'delivered' else null end;
  if p_next_status = 'cancelled' and v_shipment.status not in ('dispatched','delivered','cancelled') then v_expected := 'cancelled'; end if;
  if p_next_status <> v_expected then raise exception 'Transición inválida desde %.', v_shipment.status; end if;
  if p_next_status not in ('planned','cancelled') and nullif(trim(coalesce(p_remittance, v_shipment.remittance)), '') is null then raise exception 'El remito es obligatorio.'; end if;
  if p_next_status not in ('planned','cancelled') and exists (
    select 1 from public.shipments where id <> p_shipment_id and status <> 'cancelled'
      and lower(trim(remittance)) = lower(trim(coalesce(p_remittance, v_shipment.remittance)))
  ) and nullif(trim(p_shared_remittance_reason),'') is null then raise exception 'Ese remito ya pertenece a otro viaje; indique el motivo para compartirlo.'; end if;
  if p_next_status = 'ready' then select delivery_address into v_address from public.orders where id = v_shipment.order_id; else v_address := v_shipment.delivery_address_snapshot; end if;
  if p_next_status = 'ready' and nullif(trim(v_address),'') is null then raise exception 'El cliente no tiene dirección de entrega.'; end if;
  if p_next_status = 'delivered' then
    if jsonb_typeof(p_delivered_lines) <> 'array' then raise exception 'Indique las cantidades aceptadas.'; end if;
    for v_item in select * from jsonb_array_elements(p_delivered_lines) loop
      select * into v_line from public.shipment_lines where id = (v_item->>'shipmentLineId')::bigint and shipment_id = p_shipment_id for update;
      if not found or (v_item->>'deliveredQuantity')::integer < 0 or (v_item->>'deliveredQuantity')::integer > v_line.planned_quantity then raise exception 'Cantidad entregada inválida.'; end if;
      update public.shipment_lines set delivered_quantity = (v_item->>'deliveredQuantity')::integer where id = v_line.id;
    end loop;
  end if;
  update public.shipments set status = p_next_status,
    remittance = case when p_next_status = 'cancelled' then remittance else coalesce(nullif(trim(p_remittance),''), remittance) end,
    shared_remittance_reason = coalesce(nullif(trim(p_shared_remittance_reason),''), shared_remittance_reason),
    delivery_address_snapshot = coalesce(v_address, delivery_address_snapshot),
    loaded_at = case when p_next_status = 'loaded' then v_now else loaded_at end,
    dispatched_at = case when p_next_status = 'dispatched' then v_now else dispatched_at end,
    delivered_at = case when p_next_status = 'delivered' then v_now else delivered_at end
  where id = p_shipment_id;
  insert into public.shipment_events(shipment_id, event_type, previous_status, next_status, previous_remittance, next_remittance, responsible)
  values (p_shipment_id, 'transition', v_shipment.status, p_next_status, v_shipment.remittance, coalesce(nullif(trim(p_remittance),''),v_shipment.remittance), coalesce(nullif(trim(p_responsible),''),'Operación'));
  perform public.refresh_order_from_shipments(v_shipment.order_id);
  return true;
end; $$;

create or replace function public.reschedule_shipment_v1(
  p_shipment_id bigint, p_new_date date, p_reason text, p_note text, p_responsible text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_shipment public.shipments%rowtype;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  if v_shipment.status not in ('planned','ready') then raise exception 'Solo se reprograman viajes planificados o prontos.'; end if;
  if p_new_date is null or p_new_date = v_shipment.planned_date then raise exception 'Indique una fecha nueva.'; end if;
  if p_reason not in ('production','logistics','client','weather','other') then raise exception 'Indique el motivo de reprogramación.'; end if;
  if p_reason = 'other' and nullif(trim(p_note),'') is null then raise exception 'Detalle el motivo.'; end if;
  update public.shipments set planned_date = p_new_date where id = p_shipment_id;
  insert into public.shipment_events(shipment_id, event_type, previous_date, next_date, reason, note, responsible)
  values (p_shipment_id, 'rescheduled', v_shipment.planned_date, p_new_date, p_reason, nullif(trim(p_note),''), coalesce(nullif(trim(p_responsible),''),'Operación'));
  perform public.refresh_order_from_shipments(v_shipment.order_id);
  return true;
end; $$;

revoke execute on function public.create_operation_order_v4(jsonb,date,date,date,date,text,text,text,text,text,date,text[],text,text) from public, anon, authenticated;
revoke execute on function public.replace_production_allocations_v1(text,jsonb) from public, anon, authenticated;
revoke execute on function public.create_shipment_v1(text,date,text,text,jsonb,text) from public, anon, authenticated;
revoke execute on function public.update_planned_shipment_v1(bigint,date,text,text,jsonb,text) from public, anon, authenticated;
revoke execute on function public.transition_shipment_v1(bigint,text,text,text,jsonb,text) from public, anon, authenticated;
revoke execute on function public.reschedule_shipment_v1(bigint,date,text,text,text) from public, anon, authenticated;
grant execute on function public.create_operation_order_v4(jsonb,date,date,date,date,text,text,text,text,text,date,text[],text,text) to service_role;
grant execute on function public.replace_production_allocations_v1(text,jsonb) to service_role;
grant execute on function public.create_shipment_v1(text,date,text,text,jsonb,text) to service_role;
grant execute on function public.update_planned_shipment_v1(bigint,date,text,text,jsonb,text) to service_role;
grant execute on function public.transition_shipment_v1(bigint,text,text,text,jsonb,text) to service_role;
grant execute on function public.reschedule_shipment_v1(bigint,date,text,text,text) to service_role;

insert into public.production_allocations(order_line_id, resource_id, planned_date, planned_quantity, status, note)
select ol.id, coalesce(o.producer_provider_id, case when o.production_source = 'internal' then 'internal' end), coalesce(o.production_date, o.planned_date), ol.requested_quantity, 'draft', 'Migrado desde planificación histórica'
from public.order_lines ol join public.orders o on o.id = ol.order_id
where not exists (select 1 from public.production_allocations pa where pa.order_line_id = ol.id);

insert into public.shipments(order_id, planned_date, status, transport_source, transport_provider_id, remittance, delivery_address_snapshot, loaded_at, dispatched_at, delivered_at)
select o.id, o.planned_date,
  case when o.stage = 'completado' then 'delivered' when o.dispatched_at is not null then 'dispatched' else 'planned' end,
  case when o.transport_source = 'external' and o.transport_provider_id is not null then 'external' else 'internal' end,
  case when o.transport_source = 'external' and o.transport_provider_id is not null then o.transport_provider_id end,
  case when o.stage = 'completado' or o.dispatched_at is not null then coalesce(nullif(trim(o.remittance),''),'Remito histórico no informado') else o.remittance end,
  case when o.stage = 'completado' or o.dispatched_at is not null then coalesce(nullif(trim(o.delivery_address),''),'Dirección histórica no informada') end,
  case when o.stage = 'completado' or o.dispatched_at is not null then coalesce(o.dispatched_at,o.delivered_at,o.updated_at) end,
  case when o.stage = 'completado' then coalesce(o.dispatched_at,o.delivered_at,o.updated_at) else o.dispatched_at end,
  case when o.stage = 'completado' then coalesce(o.delivered_at,o.updated_at) end
from public.orders o where not exists (select 1 from public.shipments s where s.order_id = o.id);

insert into public.shipment_lines(shipment_id, order_line_id, planned_quantity, delivered_quantity)
select x.shipment_id, x.order_line_id, x.requested_quantity,
  least(x.requested_quantity, greatest(x.order_delivered - x.previous_quantity, 0))
from (
  select s.id shipment_id, ol.id order_line_id, ol.requested_quantity, o.delivered order_delivered,
    coalesce(sum(ol.requested_quantity) over (partition by o.id order by ol.position, ol.id rows between unbounded preceding and 1 preceding),0) previous_quantity
  from public.orders o join public.shipments s on s.order_id = o.id join public.order_lines ol on ol.order_id = o.id
) x where not exists (select 1 from public.shipment_lines sl where sl.shipment_id = x.shipment_id and sl.order_line_id = x.order_line_id);

insert into public.shipment_events(shipment_id, event_type, next_status, next_date, responsible, note)
select s.id, 'created', s.status, s.planned_date, 'Migración', 'Viaje equivalente creado desde pedido histórico'
from public.shipments s where not exists (select 1 from public.shipment_events e where e.shipment_id = s.id);
