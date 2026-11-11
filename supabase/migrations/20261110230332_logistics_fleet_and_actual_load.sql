create table public.logistics_drivers (
  id text primary key,
  name text not null check (trim(name) <> ''),
  active boolean not null default true
);

create table public.logistics_vehicles (
  id text primary key,
  name text not null check (trim(name) <> ''),
  small_capacity integer check (small_capacity is null or small_capacity >= 0),
  large_capacity integer check (large_capacity is null or large_capacity >= 0),
  habitual_driver_id text references public.logistics_drivers(id) on delete set null,
  length_m numeric(7,2), width_m numeric(7,2), height_m numeric(7,2), weight_t numeric(7,2),
  active boolean not null default true
);

insert into public.logistics_drivers(id,name) values ('susalla','Susalla'),('giossa','Giossa')
on conflict (id) do nothing;
insert into public.logistics_vehicles(id,name,small_capacity,large_capacity,habitual_driver_id) values
  ('howo','HOWO grande',638,273,null),
  ('vw_camion','Volkswagen camión',638,273,'susalla'),
  ('vw_tractor','Volkswagen tractor',560,251,'giossa'),
  ('internacional','Internacional',638,273,null)
on conflict (id) do nothing;

create table public.logistics_product_classes (
  product_id text primary key references public.products(id) on delete cascade,
  pallet_class text not null check (pallet_class in ('small','large','unclassified')),
  reason text,
  updated_at timestamptz not null default now()
);

create table public.logistics_settings (
  id integer primary key default 1 check (id = 1),
  origin_address text not null default 'Paysandú, Uruguay',
  origin_latitude double precision,
  origin_longitude double precision,
  origin_precision text not null default 'city' check (origin_precision in ('exact','city','unknown')),
  shift_start time,
  shift_end time,
  break_minutes integer check (break_minutes is null or break_minutes >= 0),
  load_minutes integer check (load_minutes is null or load_minutes >= 0),
  unload_minutes integer check (unload_minutes is null or unload_minutes >= 0),
  margin_minutes integer check (margin_minutes is null or margin_minutes >= 0),
  updated_at timestamptz not null default now()
);
insert into public.logistics_settings(id) values (1) on conflict do nothing;

create table public.logistics_locations (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('client','provider')),
  entity_id text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  precision text not null default 'unknown' check (precision in ('exact','city','unknown')),
  verified boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (entity_type,entity_id)
);

create table public.logistics_runs (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('delivery','supplier_pickup','customer_pickup')),
  shipment_id bigint unique references public.shipments(id) on delete restrict,
  provider_id text references public.providers(id) on delete restrict,
  order_id text references public.orders(id) on delete restrict,
  vehicle_id text references public.logistics_vehicles(id) on delete set null,
  driver_id text references public.logistics_drivers(id) on delete set null,
  planned_date date not null,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  end_time_source text check (end_time_source in ('manual','route')),
  destination_address text,
  destination_latitude double precision,
  destination_longitude double precision,
  destination_precision text check (destination_precision in ('exact','city','unknown')),
  route_distance_m integer,
  route_duration_s integer,
  route_geometry jsonb,
  route_checked_at timestamptz,
  route_status text check (route_status in ('viable','tight','not_viable','no_data')),
  route_reason text,
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  note text,
  responsible text not null default 'Operación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mode = 'supplier_pickup' and provider_id is not null and shipment_id is null)
    or (mode in ('delivery','customer_pickup') and shipment_id is not null)),
  check (planned_end_at is null or planned_start_at is null or planned_end_at >= planned_start_at)
);
create index logistics_runs_calendar_idx on public.logistics_runs(planned_date,vehicle_id,planned_start_at);
create index logistics_runs_driver_idx on public.logistics_runs(driver_id,planned_start_at) where driver_id is not null;

create table public.logistics_incidents (
  id bigint generated always as identity primary key,
  run_id bigint references public.logistics_runs(id) on delete restrict,
  shipment_id bigint references public.shipments(id) on delete restrict,
  code text not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  responsible text not null default 'Operación',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);
create index logistics_incidents_open_idx on public.logistics_incidents(shipment_id,created_at desc) where resolved_at is null;

alter table public.shipment_lines add column loaded_quantity integer
  check (loaded_quantity is null or loaded_quantity between 0 and planned_quantity);

do $$ declare v_name text; begin
  for v_name in select c.conname from pg_constraint c
    where c.conrelid = 'public.shipments'::regclass and c.contype = 'c'
      and (pg_get_constraintdef(c.oid) like '%remittance%' or pg_get_constraintdef(c.oid) like '%delivery_address_snapshot%'
        or (pg_get_constraintdef(c.oid) like '%transport_source%' and pg_get_constraintdef(c.oid) like '%transport_provider_id%'))
  loop execute format('alter table public.shipments drop constraint %I', v_name); end loop;
end $$;

create function public.logistics_other_ready_claim_v1(p_product_id text,p_order_line_id text)
returns integer language sql stable security invoker set search_path=public as $$
  select coalesce(sum(greatest(
    (case when p.requires_treatment then
      coalesce((select sum(case when tb.status='posted' then tb.quantity when tb.status='reversal' then -tb.quantity else 0 end)
        from public.treatment_batches tb where tb.order_line_id=ol.id),0)
    else
      coalesce((select sum(pa.actual_quantity) from public.production_allocations pa
        where pa.order_line_id=ol.id and pa.status='completed' and pa.result_destination='client'),0)
    end)
    - coalesce((select -sum(sm.quantity) from public.stock_movements sm
        where sm.order_line_id=ol.id and sm.movement_type='dispatch'),0)
    - coalesce((select sum(sr.quantity) from public.stock_reservations sr
        join public.shipment_lines sl on sl.id=sr.shipment_line_id
        where sl.order_line_id=ol.id and sr.status='active'),0),0)),0)::integer
  from public.order_lines ol join public.products p on p.id=ol.product_id
  where ol.product_id=p_product_id and ol.id<>p_order_line_id;
$$;
revoke all on function public.logistics_other_ready_claim_v1(text,text) from public,anon,authenticated;
grant execute on function public.logistics_other_ready_claim_v1(text,text) to service_role;

alter table public.logistics_drivers enable row level security;
alter table public.logistics_vehicles enable row level security;
alter table public.logistics_product_classes enable row level security;
alter table public.logistics_settings enable row level security;
alter table public.logistics_locations enable row level security;
alter table public.logistics_runs enable row level security;
alter table public.logistics_incidents enable row level security;
grant select,insert,update,delete on public.logistics_drivers,public.logistics_vehicles,
  public.logistics_product_classes,public.logistics_settings,public.logistics_locations,
  public.logistics_runs,public.logistics_incidents to service_role;
grant usage,select on sequence public.logistics_locations_id_seq,public.logistics_runs_id_seq,
  public.logistics_incidents_id_seq to service_role;

create or replace function public.transition_shipment_v3(
  p_shipment_id bigint,p_next_status text,p_remittance text,p_shared_remittance_reason text,
  p_delivered_lines jsonb,p_loaded_lines jsonb,p_responsible text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare
  v_shipment public.shipments%rowtype; v_line record; v_item jsonb; v_expected text;
  v_quantity integer; v_available integer; v_reserved integer; v_now timestamptz := now();
  v_actor text := coalesce(nullif(trim(p_responsible),''),'Operación'); v_remittance text;
  v_address text; v_balance integer;
begin
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  v_expected := case v_shipment.status when 'planned' then 'ready' when 'ready' then 'loaded'
    when 'loaded' then 'dispatched' when 'dispatched' then 'delivered' else null end;
  if p_next_status='cancelled' and v_shipment.status in ('planned','ready','loaded') then v_expected := 'cancelled'; end if;
  if p_next_status is distinct from v_expected then raise exception 'Transición inválida desde %.',v_shipment.status; end if;
  v_remittance := coalesce(nullif(trim(p_remittance),''),v_shipment.remittance);
  select delivery_address into v_address from public.orders where id=v_shipment.order_id;
  if p_next_status in ('ready','loaded','dispatched') then
    if v_remittance is null then
      insert into public.logistics_incidents(shipment_id,code,action,responsible)
      values(p_shipment_id,'missing_remittance',p_next_status,v_actor);
    elsif exists(select 1 from public.shipments where id<>p_shipment_id and status<>'cancelled'
      and lower(trim(remittance))=lower(trim(v_remittance))) and nullif(trim(p_shared_remittance_reason),'') is null then
      insert into public.logistics_incidents(shipment_id,code,action,responsible)
      values(p_shipment_id,'shared_remittance',p_next_status,v_actor);
    end if;
    if nullif(trim(coalesce(v_address,'')),'') is null then
      insert into public.logistics_incidents(shipment_id,code,action,responsible)
      values(p_shipment_id,'missing_address',p_next_status,v_actor);
    end if;
  end if;

  if p_next_status='loaded' then
    if p_loaded_lines is not null and jsonb_typeof(p_loaded_lines)<>'array' then raise exception 'Carga inválida.'; end if;
    for v_line in select sl.* from public.shipment_lines sl where sl.shipment_id=p_shipment_id for update loop
      select x into v_item from jsonb_array_elements(coalesce(p_loaded_lines,'[]'::jsonb)) x
      where (x->>'shipmentLineId')::bigint=v_line.id limit 1;
      v_quantity := coalesce((v_item->>'loadedQuantity')::integer,v_line.planned_quantity);
      if v_quantity<0 or v_quantity>v_line.planned_quantity then raise exception 'Cantidad cargada inválida.'; end if;
      update public.shipment_lines set loaded_quantity=v_quantity where id=v_line.id;
    end loop;
  end if;

  if p_next_status in ('ready','loaded','cancelled') then
    update public.stock_reservations set status='released',released_at=v_now,
      note=concat_ws(' ',note,'Liberada por cambio de estado')
    where shipment_line_id in (select id from public.shipment_lines where shipment_id=p_shipment_id) and status='active';
  end if;

  if p_next_status in ('ready','loaded') then
    for v_line in select sl.*,ol.product_id from public.shipment_lines sl
      join public.order_lines ol on ol.id=sl.order_line_id where sl.shipment_id=p_shipment_id
      order by ol.product_id,sl.id loop
      if v_line.product_id is null then raise exception 'Línea sin producto canónico.'; end if;
      perform 1 from public.products where id=v_line.product_id for update;
      select greatest(coalesce(available_quantity,0)
        - public.logistics_other_ready_claim_v1(v_line.product_id,v_line.order_line_id),0) into v_available
        from public.stock_balances where product_id=v_line.product_id;
      v_quantity := case when p_next_status='loaded' then v_line.loaded_quantity else v_line.planned_quantity end;
      v_reserved := least(coalesce(v_available,0),v_quantity);
      if v_reserved>0 then
        insert into public.stock_reservations(shipment_line_id,product_id,quantity,responsible,note)
        values(v_line.id,v_line.product_id,v_reserved,v_actor,'Reserva física parcial o completa');
      end if;
      if v_reserved<v_quantity then
        insert into public.logistics_incidents(shipment_id,code,action,detail,responsible)
        values(p_shipment_id,'stock_shortage',p_next_status,
          jsonb_build_object('shipmentLineId',v_line.id,'productId',v_line.product_id,
            'requested',v_quantity,'reserved',v_reserved,'shortage',v_quantity-v_reserved),v_actor);
      end if;
    end loop;
  elsif p_next_status='dispatched' then
    for v_line in select sl.*,ol.product_id from public.shipment_lines sl
      join public.order_lines ol on ol.id=sl.order_line_id where sl.shipment_id=p_shipment_id
      order by ol.product_id,sl.id loop
      v_quantity := coalesce(v_line.loaded_quantity,v_line.planned_quantity);
      if v_quantity>0 then
        perform 1 from public.products where id=v_line.product_id for update;
        select coalesce(ready_quantity,0) into v_balance from public.stock_balances where product_id=v_line.product_id;
        if coalesce(v_balance,0)<v_quantity then
          insert into public.logistics_incidents(shipment_id,code,action,detail,responsible)
          values(p_shipment_id,'negative_stock','dispatched',
            jsonb_build_object('shipmentLineId',v_line.id,'productId',v_line.product_id,
              'balanceBefore',coalesce(v_balance,0),'dispatched',v_quantity),v_actor);
        end if;
        insert into public.stock_movements(product_id,stock_state,quantity,movement_type,
          order_line_id,shipment_line_id,remittance,performed_at,responsible,note,transformation_id)
        values(v_line.product_id,'ready',-v_quantity,'dispatch',v_line.order_line_id,v_line.id,
          v_remittance,v_now,v_actor,'Despacho de viaje '||p_shipment_id,gen_random_uuid());
      end if;
      update public.stock_reservations set status='consumed',consumed_at=v_now
      where shipment_line_id=v_line.id and status='active';
    end loop;
  elsif p_next_status='delivered' then
    if jsonb_typeof(p_delivered_lines)<>'array' then raise exception 'Cantidades entregadas inválidas.'; end if;
    for v_item in select * from jsonb_array_elements(p_delivered_lines) loop
      select sl.* into v_line from public.shipment_lines sl
        where sl.id=(v_item->>'shipmentLineId')::bigint and sl.shipment_id=p_shipment_id for update;
      v_quantity := (v_item->>'deliveredQuantity')::integer;
      if not found or v_quantity is null or v_quantity<0
        or v_quantity>coalesce(v_line.loaded_quantity,v_line.planned_quantity) then
        raise exception 'Cantidad entregada inválida.';
      end if;
      update public.shipment_lines set delivered_quantity=v_quantity where id=v_line.id;
    end loop;
  end if;

  update public.shipments set status=p_next_status, remittance=coalesce(v_remittance,remittance),
    shared_remittance_reason=coalesce(nullif(trim(p_shared_remittance_reason),''),shared_remittance_reason),
    delivery_address_snapshot=coalesce(nullif(trim(v_address),''),delivery_address_snapshot),
    loaded_at=case when p_next_status='loaded' then v_now else loaded_at end,
    dispatched_at=case when p_next_status='dispatched' then v_now else dispatched_at end,
    delivered_at=case when p_next_status='delivered' then v_now else delivered_at end
  where id=p_shipment_id;
  insert into public.shipment_events(shipment_id,event_type,previous_status,next_status,
    previous_remittance,next_remittance,responsible)
  values(p_shipment_id,'transition',v_shipment.status,p_next_status,v_shipment.remittance,v_remittance,v_actor);
  perform public.refresh_order_from_shipments(v_shipment.order_id);
  return true;
end; $$;
revoke all on function public.transition_shipment_v3(bigint,text,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.transition_shipment_v3(bigint,text,text,text,jsonb,jsonb,text) to service_role;

create or replace function public.create_shipment_v1(
  p_order_id text,p_planned_date date,p_transport_source text,p_transport_provider_id text,
  p_lines jsonb,p_responsible text
) returns bigint language plpgsql security invoker set search_path=public as $$
declare v_id bigint; v_item jsonb; v_line public.order_lines%rowtype; v_quantity integer;
  v_committed integer; v_actor text := coalesce(nullif(trim(p_responsible),''),'Operación');
begin
  perform 1 from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if p_planned_date is null or p_transport_source not in ('internal','external') then raise exception 'Fecha o transporte inválido.'; end if;
  if p_transport_provider_id is not null and not exists(select 1 from public.providers where id=p_transport_provider_id and type='Transporte')
    then raise exception 'Transportista inválido.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Indique líneas para el viaje.'; end if;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.order_lines where id=v_item->>'orderLineId' and order_id=p_order_id for update;
    v_quantity := (v_item->>'plannedQuantity')::integer;
    if not found or v_quantity is null or v_quantity<=0 then raise exception 'Línea o cantidad inválida.'; end if;
  end loop;
  insert into public.shipments(order_id,planned_date,transport_source,transport_provider_id)
    values(p_order_id,p_planned_date,p_transport_source,case when p_transport_source='external' then p_transport_provider_id end)
    returning id into v_id;
  if p_transport_source='external' and p_transport_provider_id is null then
    insert into public.logistics_incidents(shipment_id,code,action,responsible)
    values(v_id,'missing_transporter','create',v_actor);
  end if;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    insert into public.shipment_lines(shipment_id,order_line_id,planned_quantity)
    values(v_id,v_item->>'orderLineId',(v_item->>'plannedQuantity')::integer);
    select requested_quantity into v_quantity from public.order_lines where id=v_item->>'orderLineId';
    select coalesce(sum(coalesce(sl.loaded_quantity,sl.planned_quantity)),0) into v_committed
      from public.shipment_lines sl join public.shipments s on s.id=sl.shipment_id
      where sl.order_line_id=v_item->>'orderLineId' and s.status<>'cancelled';
    if v_committed>v_quantity then
      insert into public.logistics_incidents(shipment_id,code,action,detail,responsible)
      values(v_id,'order_overplanned','create',jsonb_build_object('orderLineId',v_item->>'orderLineId',
        'requested',v_quantity,'committed',v_committed),v_actor);
    end if;
  end loop;
  insert into public.shipment_events(shipment_id,event_type,next_status,next_date,responsible)
    values(v_id,'created','planned',p_planned_date,v_actor);
  return v_id;
end; $$;

create or replace function public.update_planned_shipment_v1(
  p_shipment_id bigint,p_planned_date date,p_transport_source text,p_transport_provider_id text,
  p_lines jsonb,p_responsible text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare v_shipment public.shipments%rowtype; v_item jsonb; v_line public.order_lines%rowtype;
  v_quantity integer; v_committed integer; v_actor text := coalesce(nullif(trim(p_responsible),''),'Operación');
begin
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  if v_shipment.status<>'planned' then raise exception 'Solo se edita un viaje planificado.'; end if;
  if p_planned_date is null or p_transport_source not in ('internal','external') then raise exception 'Fecha o transporte inválido.'; end if;
  if p_transport_provider_id is not null and not exists(select 1 from public.providers where id=p_transport_provider_id and type='Transporte')
    then raise exception 'Transportista inválido.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Indique líneas para el viaje.'; end if;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.order_lines where id=v_item->>'orderLineId' and order_id=v_shipment.order_id for update;
    v_quantity := (v_item->>'plannedQuantity')::integer;
    if not found or v_quantity is null or v_quantity<=0 then raise exception 'Línea o cantidad inválida.'; end if;
  end loop;
  delete from public.shipment_lines where shipment_id=p_shipment_id;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    insert into public.shipment_lines(shipment_id,order_line_id,planned_quantity)
    values(p_shipment_id,v_item->>'orderLineId',(v_item->>'plannedQuantity')::integer);
    select requested_quantity into v_quantity from public.order_lines where id=v_item->>'orderLineId';
    select coalesce(sum(coalesce(sl.loaded_quantity,sl.planned_quantity)),0) into v_committed
      from public.shipment_lines sl join public.shipments s on s.id=sl.shipment_id
      where sl.order_line_id=v_item->>'orderLineId' and s.status<>'cancelled';
    if v_committed>v_quantity then
      insert into public.logistics_incidents(shipment_id,code,action,detail,responsible)
      values(p_shipment_id,'order_overplanned','update',jsonb_build_object('orderLineId',v_item->>'orderLineId',
        'requested',v_quantity,'committed',v_committed),v_actor);
    end if;
  end loop;
  update public.shipments set planned_date=p_planned_date,transport_source=p_transport_source,
    transport_provider_id=case when p_transport_source='external' then p_transport_provider_id end
    where id=p_shipment_id;
  if p_transport_source='external' and p_transport_provider_id is null then
    insert into public.logistics_incidents(shipment_id,code,action,responsible)
    values(p_shipment_id,'missing_transporter','update',v_actor);
  end if;
  if p_planned_date<>v_shipment.planned_date then
    insert into public.shipment_events(shipment_id,event_type,previous_date,next_date,reason,note,responsible)
    values(p_shipment_id,'rescheduled',v_shipment.planned_date,p_planned_date,'logistics','Cambio de planificación',v_actor);
  end if;
  perform public.refresh_order_from_shipments(v_shipment.order_id);
  return true;
end; $$;
