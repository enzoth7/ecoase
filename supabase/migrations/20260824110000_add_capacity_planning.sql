alter table public.providers drop constraint if exists providers_type_check;
alter table public.providers add constraint providers_type_check check (type in ('Aserradero', 'Transporte', 'Importador'));

alter table public.orders
  add column production_source text not null default 'internal' check (production_source in ('internal', 'sawmill', 'import')),
  add column producer_provider_id text references public.providers(id) on delete set null,
  add column production_date date,
  add column import_arrival_date date,
  add column required_operations text[] not null default array['assembly']::text[],
  add column transport_source text not null default 'external' check (transport_source in ('internal', 'external')),
  add column transport_provider_id text references public.providers(id) on delete set null;

update public.orders set
  production_date = planned_date,
  required_operations = array_remove(array[
    'assembly',
    case when lower(product || ' ' || preparation) like '%marc%' then 'marking' end,
    case when lower(product || ' ' || preparation) like '%ht%' then 'ht' end
  ], null),
  transport_source = case when lower(transport) in ('propio', 'interno') then 'internal' else 'external' end,
  transport_provider_id = (select id from public.providers where type = 'Transporte' and name = orders.transport limit 1);

alter table public.orders add constraint orders_required_operations_check check (
  cardinality(required_operations) > 0 and required_operations <@ array['assembly', 'marking', 'ht']::text[]
);

create table public.capacity_rules (
  id bigint generated always as identity primary key,
  operation text not null check (operation in ('assembly', 'marking', 'ht')),
  people_count integer not null check (people_count >= 0),
  pallet_capacity integer not null check (pallet_capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation, people_count)
);

create table public.internal_production_capacity (
  capacity_date date not null,
  operation text not null check (operation in ('assembly', 'marking', 'ht')),
  people_count integer not null check (people_count >= 0),
  manual_capacity integer check (manual_capacity is null or manual_capacity >= 0),
  updated_at timestamptz not null default now(),
  primary key (capacity_date, operation)
);

create table public.external_production_capacity (
  id uuid primary key default gen_random_uuid(),
  capacity_date date not null,
  provider_id text not null references public.providers(id) on delete cascade,
  operation text not null check (operation in ('assembly', 'marking', 'ht')),
  pallet_capacity integer not null check (pallet_capacity >= 0),
  status text not null check (status in ('estimated', 'confirmed')),
  updated_at timestamptz not null default now(),
  unique (capacity_date, provider_id, operation)
);

create table public.transport_capacity (
  id uuid primary key default gen_random_uuid(),
  capacity_date date not null,
  source text not null check (source in ('internal', 'external')),
  provider_id text references public.providers(id) on delete cascade,
  pallet_capacity integer not null check (pallet_capacity >= 0),
  status text not null check (status in ('estimated', 'confirmed')),
  updated_at timestamptz not null default now(),
  check ((source = 'internal' and provider_id is null) or (source = 'external' and provider_id is not null))
);

create unique index transport_capacity_internal_date on public.transport_capacity(capacity_date) where source = 'internal';
create unique index transport_capacity_external_provider on public.transport_capacity(capacity_date, provider_id) where source = 'external';

alter table public.capacity_rules enable row level security;
alter table public.internal_production_capacity enable row level security;
alter table public.external_production_capacity enable row level security;
alter table public.transport_capacity enable row level security;

create policy capacity_rules_public_read on public.capacity_rules for select to anon, authenticated using (true);
create policy internal_capacity_public_read on public.internal_production_capacity for select to anon, authenticated using (true);
create policy external_capacity_public_read on public.external_production_capacity for select to anon, authenticated using (true);
create policy transport_capacity_public_read on public.transport_capacity for select to anon, authenticated using (true);

grant select on public.capacity_rules, public.internal_production_capacity, public.external_production_capacity, public.transport_capacity to anon, authenticated;

create function public.upsert_capacity_rule(p_operation text, p_people_count integer, p_pallet_capacity integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_operation not in ('assembly', 'marking', 'ht') or p_people_count < 0 or p_pallet_capacity < 0 then raise exception 'Regla de capacidad inválida.'; end if;
  insert into public.capacity_rules(operation, people_count, pallet_capacity) values (p_operation, p_people_count, p_pallet_capacity)
  on conflict (operation, people_count) do update set pallet_capacity = excluded.pallet_capacity, updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create function public.upsert_internal_production_capacity(p_date date, p_operation text, p_people_count integer, p_manual_capacity integer default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_date is null or p_operation not in ('assembly', 'marking', 'ht') or p_people_count < 0 or (p_manual_capacity is not null and p_manual_capacity < 0) then raise exception 'Capacidad interna inválida.'; end if;
  insert into public.internal_production_capacity(capacity_date, operation, people_count, manual_capacity) values (p_date, p_operation, p_people_count, p_manual_capacity)
  on conflict (capacity_date, operation) do update set people_count = excluded.people_count, manual_capacity = excluded.manual_capacity, updated_at = now();
  return p_date::text || ':' || p_operation;
end; $$;

create function public.upsert_external_production_capacity(p_date date, p_provider_id text, p_operation text, p_pallet_capacity integer, p_status text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_date is null or p_operation not in ('assembly', 'marking', 'ht') or p_pallet_capacity < 0 or p_status not in ('estimated', 'confirmed') then raise exception 'Capacidad externa inválida.'; end if;
  if not exists (select 1 from public.providers where id = p_provider_id and type = 'Aserradero') then raise exception 'Seleccione un aserradero registrado.'; end if;
  insert into public.external_production_capacity(capacity_date, provider_id, operation, pallet_capacity, status) values (p_date, p_provider_id, p_operation, p_pallet_capacity, p_status)
  on conflict (capacity_date, provider_id, operation) do update set pallet_capacity = excluded.pallet_capacity, status = excluded.status, updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create function public.upsert_transport_capacity(p_date date, p_source text, p_provider_id text, p_pallet_capacity integer, p_status text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_date is null or p_source not in ('internal', 'external') or p_pallet_capacity < 0 or p_status not in ('estimated', 'confirmed') then raise exception 'Capacidad de transporte inválida.'; end if;
  if p_source = 'external' and not exists (select 1 from public.providers where id = p_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista registrado.'; end if;
  if p_source = 'internal' then
    insert into public.transport_capacity(capacity_date, source, provider_id, pallet_capacity, status) values (p_date, 'internal', null, p_pallet_capacity, 'confirmed')
    on conflict (capacity_date) where source = 'internal' do update set pallet_capacity = excluded.pallet_capacity, status = 'confirmed', updated_at = now()
    returning id into v_id;
  else
    insert into public.transport_capacity(capacity_date, source, provider_id, pallet_capacity, status) values (p_date, 'external', p_provider_id, p_pallet_capacity, p_status)
    on conflict (capacity_date, provider_id) where source = 'external' do update set pallet_capacity = excluded.pallet_capacity, status = excluded.status, updated_at = now()
    returning id into v_id;
  end if;
  return v_id;
end; $$;

create function public.create_operation_order_v2(
  p_client text, p_product text, p_requested integer, p_order_date date, p_requested_delivery_date date, p_planned_date date,
  p_reference text, p_zeta_code text, p_delivery_address text, p_notes text, p_stage text,
  p_production_source text, p_producer_provider_id text, p_production_date date, p_import_arrival_date date, p_required_operations text[],
  p_transport_source text, p_transport_provider_id text
) returns text language plpgsql security definer set search_path = public as $$
declare v_id text; v_reference text; v_transport text; v_producer text;
begin
  if nullif(trim(p_client), '') is null or nullif(trim(p_product), '') is null or p_requested <= 0 then raise exception 'Cliente, producto y cantidad son obligatorios.'; end if;
  if p_order_date is null or p_requested_delivery_date is null or p_planned_date is null then raise exception 'Las fechas del pedido son obligatorias.'; end if;
  if p_stage not in ('negociacion','produccion','logistica','atrasado','pospuesto','cancelado','reorganizando') then raise exception 'Etapa inválida.'; end if;
  if p_production_source not in ('internal','sawmill','import') or p_transport_source not in ('internal','external') then raise exception 'Origen operativo inválido.'; end if;
  if cardinality(p_required_operations) = 0 or not (p_required_operations <@ array['assembly','marking','ht']::text[]) then raise exception 'Seleccione al menos una operación válida.'; end if;
  if p_production_source in ('internal','sawmill') and p_production_date is null then raise exception 'Indique la fecha de producción.'; end if;
  if p_production_source = 'sawmill' and not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Aserradero') then raise exception 'Seleccione un aserradero registrado.'; end if;
  if p_production_source = 'import' and (p_import_arrival_date is null or not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Importador')) then raise exception 'Seleccione importador y fecha prevista de llegada.'; end if;
  if p_transport_source = 'external' and not exists (select 1 from public.providers where id = p_transport_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista registrado.'; end if;
  select name into v_transport from public.providers where id = p_transport_provider_id;
  select name into v_producer from public.providers where id = p_producer_provider_id;
  v_transport := case when p_transport_source = 'internal' then 'Interno' else v_transport end;
  v_id := 'pedido-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  select coalesce(nullif(trim(p_reference), ''), 'Pedido ' || (count(*) + 1)::text) into v_reference from public.orders;
  insert into public.orders (
    id, reference, client, product, requested, delivered, pending, status, status_label, stage, order_date, requested_delivery_date,
    planned_date, transport, supply, preparation, logistics, delivery, action, delivery_address, zeta_code, notes, source,
    production_source, producer_provider_id, production_date, import_arrival_date, required_operations, transport_source, transport_provider_id
  ) values (
    v_id, v_reference, trim(p_client), trim(p_product), p_requested, 0, p_requested, 'coordinacion', 'En coordinación', p_stage,
    p_order_date, p_requested_delivery_date, p_planned_date, v_transport,
    case p_production_source when 'internal' then 'Producción interna' when 'sawmill' then 'Produce ' || v_producer else 'Importación · llegada ' || p_import_arrival_date::text end,
    'Operaciones: ' || array_to_string(p_required_operations, ', '), v_transport || ' · entrega planificada', '0 de ' || p_requested || ' entregados',
    'Preparar y coordinar la entrega.', nullif(trim(p_delivery_address), ''), nullif(trim(p_zeta_code), ''), nullif(trim(p_notes), ''), 'Alta desde dashboard',
    p_production_source, p_producer_provider_id, p_production_date, p_import_arrival_date, p_required_operations, p_transport_source, p_transport_provider_id
  );
  insert into public.order_lines(id, order_id, product, quantity, position) values (v_id || '-1', v_id, trim(p_product), p_requested, 0);
  return v_id;
end; $$;

create function public.update_operation_order_v2(
  p_id text, p_planned_date date, p_requested integer, p_stage text, p_production_source text, p_producer_provider_id text,
  p_production_date date, p_import_arrival_date date, p_required_operations text[], p_transport_source text, p_transport_provider_id text
) returns text language plpgsql security definer set search_path = public as $$
declare v_before public.orders%rowtype; v_after public.orders%rowtype; v_transport text; v_change_id uuid; v_position integer := 10;
begin
  select * into v_before from public.orders where id = p_id;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if p_production_source in ('internal','sawmill') and p_production_date is null then raise exception 'Indique la fecha de producción.'; end if;
  if p_production_source = 'sawmill' and not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Aserradero') then raise exception 'Seleccione un aserradero registrado.'; end if;
  if p_production_source = 'import' and (p_import_arrival_date is null or not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Importador')) then raise exception 'Seleccione importador y fecha prevista de llegada.'; end if;
  if p_transport_source = 'external' and not exists (select 1 from public.providers where id = p_transport_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista registrado.'; end if;
  if cardinality(p_required_operations) = 0 or not (p_required_operations <@ array['assembly','marking','ht']::text[]) then raise exception 'Operaciones inválidas.'; end if;
  select name into v_transport from public.providers where id = p_transport_provider_id;
  v_transport := case when p_transport_source = 'internal' then 'Interno' else v_transport end;
  perform public.update_operation_order(p_id, null, case when p_transport_source = 'external' then v_transport else null end, p_planned_date, p_requested, p_stage);
  select * into v_after from public.orders where id = p_id;
  if p_transport_source = 'internal' and v_after.transport <> 'Interno' then update public.orders set transport = 'Interno', logistics = 'Interno · entrega planificada' where id = p_id; end if;
  if v_before.production_source is distinct from p_production_source or v_before.producer_provider_id is distinct from p_producer_provider_id or v_before.production_date is distinct from p_production_date or v_before.import_arrival_date is distinct from p_import_arrival_date or v_before.required_operations is distinct from p_required_operations or v_before.transport_source is distinct from p_transport_source or v_before.transport_provider_id is distinct from p_transport_provider_id then
    insert into public.order_changes(order_id) values (p_id) returning id into v_change_id;
    if v_before.production_source is distinct from p_production_source then insert into public.order_change_items(change_id,field,from_value,to_value,position) values(v_change_id,'Origen de producción',v_before.production_source,p_production_source,v_position); v_position:=v_position+1; end if;
    if v_before.producer_provider_id is distinct from p_producer_provider_id then insert into public.order_change_items(change_id,field,from_value,to_value,position) values(v_change_id,'Productor',coalesce((select name from public.providers where id=v_before.producer_provider_id),'—'),coalesce((select name from public.providers where id=p_producer_provider_id),'Ecoase'),v_position); v_position:=v_position+1; end if;
    if v_before.production_date is distinct from p_production_date then insert into public.order_change_items(change_id,field,from_value,to_value,position) values(v_change_id,'Fecha de producción',coalesce(v_before.production_date::text,'—'),coalesce(p_production_date::text,'—'),v_position); v_position:=v_position+1; end if;
    if v_before.import_arrival_date is distinct from p_import_arrival_date then insert into public.order_change_items(change_id,field,from_value,to_value,position) values(v_change_id,'Llegada de importación',coalesce(v_before.import_arrival_date::text,'—'),coalesce(p_import_arrival_date::text,'—'),v_position); v_position:=v_position+1; end if;
    if v_before.required_operations is distinct from p_required_operations then insert into public.order_change_items(change_id,field,from_value,to_value,position) values(v_change_id,'Operaciones',array_to_string(v_before.required_operations,', '),array_to_string(p_required_operations,', '),v_position); v_position:=v_position+1; end if;
    if v_before.transport_source is distinct from p_transport_source then insert into public.order_change_items(change_id,field,from_value,to_value,position) values(v_change_id,'Origen del transporte',v_before.transport_source,p_transport_source,v_position); v_position:=v_position+1; end if;
    if v_before.transport_provider_id is distinct from p_transport_provider_id then insert into public.order_change_items(change_id,field,from_value,to_value,position) values(v_change_id,'Transportista',coalesce((select name from public.providers where id=v_before.transport_provider_id),'Interno'),coalesce((select name from public.providers where id=p_transport_provider_id),'Interno'),v_position); v_position:=v_position+1; end if;
  end if;
  update public.orders set production_source=p_production_source, producer_provider_id=p_producer_provider_id, production_date=p_production_date, import_arrival_date=p_import_arrival_date, required_operations=p_required_operations, transport_source=p_transport_source, transport_provider_id=p_transport_provider_id, transport=v_transport, updated_at=now() where id=p_id;
  return p_id;
end; $$;

revoke all on function public.upsert_capacity_rule(text, integer, integer) from public;
revoke all on function public.upsert_internal_production_capacity(date, text, integer, integer) from public;
revoke all on function public.upsert_external_production_capacity(date, text, text, integer, text) from public;
revoke all on function public.upsert_transport_capacity(date, text, text, integer, text) from public;
revoke all on function public.create_operation_order_v2(text,text,integer,date,date,date,text,text,text,text,text,text,text,date,date,text[],text,text) from public;
revoke all on function public.update_operation_order_v2(text,date,integer,text,text,text,date,date,text[],text,text) from public;
grant execute on function public.upsert_capacity_rule(text, integer, integer) to anon, authenticated;
grant execute on function public.upsert_internal_production_capacity(date, text, integer, integer) to anon, authenticated;
grant execute on function public.upsert_external_production_capacity(date, text, text, integer, text) to anon, authenticated;
grant execute on function public.upsert_transport_capacity(date, text, text, integer, text) to anon, authenticated;
grant execute on function public.create_operation_order_v2(text,text,integer,date,date,date,text,text,text,text,text,text,text,date,date,text[],text,text) to anon, authenticated;
grant execute on function public.update_operation_order_v2(text,date,integer,text,text,text,date,date,text[],text,text) to anon, authenticated;
