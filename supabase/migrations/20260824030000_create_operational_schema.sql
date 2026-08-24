create table public.providers (
  id text primary key,
  name text not null unique,
  type text not null check (type in ('Aserradero', 'Transporte')),
  supplies text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id text primary key,
  reference text not null,
  client text not null,
  product text not null,
  requested integer not null check (requested > 0),
  delivered integer not null default 0 check (delivered >= 0),
  pending integer not null check (pending >= 0),
  status text not null check (status in ('bloqueado', 'coordinacion', 'completado')),
  status_label text not null,
  stage text not null check (stage in ('negociacion', 'produccion', 'logistica', 'completado')),
  planned_date date not null,
  original_planned_date date,
  transport text not null,
  supply text not null,
  preparation text not null,
  logistics text not null,
  delivery text not null,
  action text not null,
  remittance text,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_delivery_balance check (requested = delivered + pending)
);

create table public.order_lines (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  product text not null,
  quantity integer not null check (quantity >= 0),
  preparation text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.order_changes (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  changed_at timestamptz not null default now()
);

create table public.order_change_items (
  id bigint generated always as identity primary key,
  change_id uuid not null references public.order_changes(id) on delete cascade,
  field text not null,
  from_value text not null,
  to_value text not null,
  position integer not null default 0
);

create index order_lines_order_id_idx on public.order_lines(order_id, position);
create index order_changes_order_id_idx on public.order_changes(order_id, changed_at desc);
create index order_change_items_change_id_idx on public.order_change_items(change_id, position);
create index orders_status_idx on public.orders(status);
create index orders_planned_date_idx on public.orders(planned_date);

alter table public.providers enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_changes enable row level security;
alter table public.order_change_items enable row level security;

create policy providers_public_read on public.providers for select to anon, authenticated using (true);
create policy orders_public_read on public.orders for select to anon, authenticated using (true);
create policy order_lines_public_read on public.order_lines for select to anon, authenticated using (true);
create policy order_changes_public_read on public.order_changes for select to anon, authenticated using (true);
create policy order_change_items_public_read on public.order_change_items for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.providers, public.orders, public.order_lines, public.order_changes, public.order_change_items to anon, authenticated;

create or replace function public.create_operation_order(
  p_client text,
  p_product text,
  p_requested integer,
  p_planned_date date,
  p_transport text,
  p_reference text default null
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
  if not exists (select 1 from public.providers where name = trim(p_transport) and type = 'Transporte') then
    raise exception 'Seleccione un transportista registrado en Proveedores.';
  end if;

  v_id := 'pedido-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  select coalesce(nullif(trim(p_reference), ''), 'Pedido ' || (count(*) + 1)::text) into v_reference from public.orders;

  insert into public.orders (
    id, reference, client, product, requested, delivered, pending, status, status_label, stage,
    planned_date, transport, supply, preparation, logistics, delivery, action, source
  ) values (
    v_id, v_reference, trim(p_client), trim(p_product), p_requested, 0, p_requested,
    'coordinacion', 'En coordinación', 'negociacion', p_planned_date, trim(p_transport),
    'Pendiente de asignación', 'Pendiente de preparación', trim(p_transport) || ' · entrega planificada',
    '0 de ' || p_requested || ' entregados', 'Preparar y coordinar la entrega.', 'Alta desde dashboard'
  );

  insert into public.order_lines (id, order_id, product, quantity, position)
  values (v_id || '-1', v_id, trim(p_product), p_requested, 0);

  return v_id;
end;
$$;

create or replace function public.update_operation_order(
  p_id text,
  p_status text default null,
  p_transport text default null,
  p_planned_date date default null,
  p_requested integer default null,
  p_stage text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_change_id uuid;
  v_has_changes boolean;
  v_difference integer;
  v_reduction integer;
  v_line record;
begin
  select * into v_order from public.orders where id = p_id for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'P0002';
  end if;

  if p_status is not null and p_status not in ('bloqueado', 'coordinacion', 'completado') then
    raise exception 'Estado inválido.';
  end if;
  if p_stage is not null and p_stage not in ('negociacion', 'produccion', 'logistica', 'completado') then
    raise exception 'Etapa inválida.';
  end if;
  if p_transport is not null and not exists (
    select 1 from public.providers where name = trim(p_transport) and type = 'Transporte'
  ) then
    raise exception 'Seleccione un transportista registrado en Proveedores.';
  end if;
  if p_requested is not null and p_requested < v_order.delivered then
    raise exception 'La cantidad no puede ser menor que lo ya entregado.';
  end if;

  v_has_changes :=
    (p_planned_date is not null and p_planned_date <> v_order.planned_date)
    or (p_requested is not null and p_requested <> v_order.requested)
    or (p_transport is not null and trim(p_transport) <> v_order.transport)
    or (p_stage is not null and p_stage <> v_order.stage)
    or (p_status is not null and p_status <> v_order.status);

  if not v_has_changes then
    return p_id;
  end if;

  insert into public.order_changes(order_id) values (p_id) returning id into v_change_id;

  if p_planned_date is not null and p_planned_date <> v_order.planned_date then
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Fecha planificada', v_order.planned_date::text, p_planned_date::text, 0);
    update public.orders set
      original_planned_date = coalesce(original_planned_date, planned_date),
      planned_date = p_planned_date,
      updated_at = now()
    where id = p_id;
  end if;

  if p_requested is not null and p_requested <> v_order.requested then
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Cantidad de pallets', v_order.requested::text, p_requested::text, 1);

    v_difference := p_requested - v_order.requested;
    if v_difference > 0 then
      update public.order_lines set quantity = quantity + v_difference
      where id = (select id from public.order_lines where order_id = p_id order by position desc, id desc limit 1);
    else
      v_reduction := abs(v_difference);
      for v_line in select id, quantity from public.order_lines where order_id = p_id order by position desc, id desc for update loop
        exit when v_reduction = 0;
        update public.order_lines
        set quantity = quantity - least(quantity, v_reduction)
        where id = v_line.id;
        v_reduction := v_reduction - least(v_line.quantity, v_reduction);
      end loop;
    end if;

    update public.orders set
      requested = p_requested,
      pending = p_requested - delivered,
      delivery = delivered || ' de ' || p_requested || ' entregados',
      updated_at = now()
    where id = p_id;
  end if;

  if p_transport is not null and trim(p_transport) <> v_order.transport then
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Transportista', v_order.transport, trim(p_transport), 2);
    update public.orders set
      transport = trim(p_transport),
      logistics = replace(logistics, v_order.transport, trim(p_transport)),
      updated_at = now()
    where id = p_id;
  end if;

  if p_stage is not null and p_stage <> v_order.stage then
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (
      v_change_id,
      'Etapa',
      case v_order.stage when 'negociacion' then 'Negociación' when 'produccion' then 'Producción' when 'logistica' then 'Logística' else 'Completado' end,
      case p_stage when 'negociacion' then 'Negociación' when 'produccion' then 'Producción' when 'logistica' then 'Logística' else 'Completado' end,
      3
    );
    update public.orders set
      stage = p_stage,
      status = case when p_stage = 'completado' then 'completado' else 'coordinacion' end,
      status_label = case when p_stage = 'completado' then 'Completado' else 'En coordinación' end,
      updated_at = now()
    where id = p_id;
  end if;

  select * into v_order from public.orders where id = p_id;
  if p_status is not null and p_status <> v_order.status then
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (
      v_change_id,
      'Estado',
      v_order.status_label,
      case p_status when 'bloqueado' then 'Bloqueado' when 'coordinacion' then 'En coordinación' else 'Completado' end,
      4
    );
    update public.orders set
      status = p_status,
      status_label = case p_status when 'bloqueado' then 'Bloqueado' when 'coordinacion' then 'En coordinación' else 'Completado' end,
      updated_at = now()
    where id = p_id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.create_operation_order(text, text, integer, date, text, text) from public;
revoke all on function public.update_operation_order(text, text, text, date, integer, text) from public;
grant execute on function public.create_operation_order(text, text, integer, date, text, text) to anon, authenticated;
grant execute on function public.update_operation_order(text, text, text, date, integer, text) to anon, authenticated;
