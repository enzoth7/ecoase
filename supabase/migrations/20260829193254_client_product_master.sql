alter table public.clients
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.clients set active = false where nullif(trim(address), '') is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_active_requires_address' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_active_requires_address check (not active or nullif(trim(address), '') is not null);
  end if;
end $$;

create table public.client_products (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
  zeta_code text not null check (nullif(trim(zeta_code), '') is not null),
  operational_name text,
  active boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, product_id)
);

create unique index client_products_client_zeta_unique on public.client_products (client_id, lower(trim(zeta_code)));
create index client_products_client_id_idx on public.client_products (client_id, display_order, id);
create index client_products_product_id_idx on public.client_products (product_id);
create index client_products_active_client_idx on public.client_products (client_id, display_order) where active;

create table public.client_product_controls (
  id bigint generated always as identity primary key,
  client_product_id bigint not null references public.client_products(id) on delete cascade,
  title text not null check (nullif(trim(title), '') is not null),
  detail text,
  display_order integer not null default 0 check (display_order >= 0),
  active boolean not null default true
);

create index client_product_controls_parent_idx on public.client_product_controls (client_product_id, display_order, id);

create table public.client_product_assets (
  id bigint generated always as identity primary key,
  client_product_id bigint not null references public.client_products(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null check (nullif(trim(file_name), '') is not null),
  asset_type text not null check (asset_type in ('photo', 'plan')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 6291456),
  alt_text text not null check (nullif(trim(alt_text), '') is not null),
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index client_product_assets_parent_idx on public.client_product_assets (client_product_id, created_at desc);
create unique index client_product_assets_one_primary on public.client_product_assets (client_product_id) where active and is_primary;

alter table public.order_lines
  add column if not exists client_product_id bigint references public.client_products(id) on delete restrict,
  add column if not exists product_id text references public.products(id) on delete restrict;

create index if not exists order_lines_client_product_id_idx on public.order_lines (client_product_id) where client_product_id is not null;
create index if not exists order_lines_product_id_idx on public.order_lines (product_id) where product_id is not null;

alter table public.client_products enable row level security;
alter table public.client_product_controls enable row level security;
alter table public.client_product_assets enable row level security;

create policy client_products_public_read on public.client_products for select to anon, authenticated using (true);
create policy client_product_controls_public_read on public.client_product_controls for select to anon, authenticated using (true);
create policy client_product_assets_public_read on public.client_product_assets for select to anon, authenticated using (true);

grant select on public.client_products, public.client_product_controls, public.client_product_assets to anon, authenticated;
grant select, insert, update, delete on public.client_products, public.client_product_controls, public.client_product_assets to service_role;
grant usage, select on sequence public.client_products_id_seq, public.client_product_controls_id_seq, public.client_product_assets_id_seq to service_role;

revoke execute on function public.create_operation_client(text, text, text) from anon, authenticated;
grant execute on function public.create_operation_client(text, text, text) to service_role;
grant update on public.clients to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-product-control', 'client-product-control', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.set_client_master_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

revoke execute on function public.set_client_master_updated_at() from public, anon, authenticated;

create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_client_master_updated_at();
create trigger client_products_set_updated_at before update on public.client_products for each row execute function public.set_client_master_updated_at();

create or replace function public.create_operation_order_v3(
  p_client_product_id bigint, p_requested integer, p_order_date date, p_requested_delivery_date date, p_planned_date date,
  p_reference text, p_notes text, p_stage text, p_production_source text, p_producer_provider_id text,
  p_production_date date, p_import_arrival_date date, p_required_operations text[], p_transport_source text, p_transport_provider_id text
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_link public.client_products%rowtype;
  v_client public.clients%rowtype;
  v_product public.products%rowtype;
  v_id text;
  v_reference text;
  v_transport text;
  v_producer text;
  v_product_label text;
begin
  select * into v_link from public.client_products where id = p_client_product_id and active for share;
  if not found then raise exception 'El producto no está habilitado para ese cliente.'; end if;
  select * into v_client from public.clients where id = v_link.client_id and active;
  select * into v_product from public.products where id = v_link.product_id;
  if nullif(trim(v_client.address), '') is null then raise exception 'El cliente no tiene dirección de entrega.'; end if;
  if nullif(trim(v_link.zeta_code), '') is null then raise exception 'El producto no tiene código Zeta.'; end if;
  if not exists (select 1 from public.client_product_controls where client_product_id = v_link.id and active) then raise exception 'El producto no tiene controles definidos.'; end if;
  if not exists (select 1 from public.client_product_assets where client_product_id = v_link.id and active and is_primary) then raise exception 'El producto no tiene plano o fotografía principal.'; end if;
  if p_requested is null or p_requested <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
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
  v_product_label := coalesce(nullif(trim(v_link.operational_name), ''), concat_ws(' · ', v_product.kind, coalesce(v_product.measure, 'Sin medida'), coalesce(v_product.treatment, 'Sin tratamiento')));
  v_id := 'pedido-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  select coalesce(nullif(trim(p_reference), ''), 'Pedido ' || (count(*) + 1)::text) into v_reference from public.orders;

  insert into public.orders (
    id, reference, client, product, requested, delivered, pending, status, status_label, stage, order_date, requested_delivery_date,
    planned_date, transport, supply, preparation, logistics, delivery, action, delivery_address, zeta_code, notes, source,
    production_source, producer_provider_id, production_date, import_arrival_date, required_operations, transport_source, transport_provider_id
  ) values (
    v_id, v_reference, v_client.name, v_product_label, p_requested, 0, p_requested, 'coordinacion', 'En coordinación', p_stage,
    p_order_date, p_requested_delivery_date, p_planned_date, v_transport,
    case p_production_source when 'internal' then 'Producción interna' when 'sawmill' then 'Produce ' || v_producer else 'Importación · llegada ' || p_import_arrival_date::text end,
    'Operaciones: ' || array_to_string(p_required_operations, ', '), v_transport || ' · entrega planificada', '0 de ' || p_requested || ' entregados',
    'Preparar y coordinar la entrega.', v_client.address, v_link.zeta_code, nullif(trim(p_notes), ''), 'Alta desde maestro cliente-producto',
    p_production_source, p_producer_provider_id, p_production_date, p_import_arrival_date, p_required_operations, p_transport_source, p_transport_provider_id
  );
  insert into public.order_lines(id, order_id, product, product_id, client_product_id, quantity, position)
  values (v_id || '-1', v_id, v_product_label, v_product.id, v_link.id, p_requested, 0);
  return v_id;
end; $$;

revoke execute on function public.create_operation_order_v3(bigint,integer,date,date,date,text,text,text,text,text,date,date,text[],text,text) from public, anon, authenticated;
grant execute on function public.create_operation_order_v3(bigint,integer,date,date,date,text,text,text,text,text,date,date,text[],text,text) to service_role;

create or replace function public.create_client_product_master(
  p_client_id text, p_product_id text, p_zeta_code text, p_operational_name text,
  p_control_title text, p_control_detail text
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.clients where id = p_client_id) then raise exception 'Cliente no encontrado.'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'Producto no encontrado.'; end if;
  if nullif(trim(p_zeta_code), '') is null then raise exception 'Indique el código Zeta.'; end if;
  if nullif(trim(p_control_title), '') is null then raise exception 'Indique al menos un punto de control.'; end if;
  insert into public.client_products(client_id, product_id, zeta_code, operational_name, active)
  values (p_client_id, p_product_id, trim(p_zeta_code), nullif(trim(p_operational_name), ''), false)
  returning id into v_id;
  insert into public.client_product_controls(client_product_id, title, detail, display_order)
  values (v_id, trim(p_control_title), nullif(trim(p_control_detail), ''), 0);
  return v_id;
end; $$;

create or replace function public.replace_client_product_controls(p_client_product_id bigint, p_controls jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare v_control jsonb; v_order integer := 0;
begin
  if not exists (select 1 from public.client_products where id = p_client_product_id) then raise exception 'Relación cliente-producto no encontrada.'; end if;
  if jsonb_typeof(p_controls) <> 'array' or jsonb_array_length(p_controls) = 0 then raise exception 'Indique al menos un punto de control.'; end if;
  delete from public.client_product_controls where client_product_id = p_client_product_id;
  for v_control in select * from jsonb_array_elements(p_controls) loop
    if nullif(trim(v_control->>'title'), '') is null then raise exception 'Todos los controles necesitan un título.'; end if;
    insert into public.client_product_controls(client_product_id, title, detail, display_order, active)
    values (p_client_product_id, trim(v_control->>'title'), nullif(trim(v_control->>'detail'), ''), v_order, coalesce((v_control->>'active')::boolean, true));
    v_order := v_order + 1;
  end loop;
  return true;
end; $$;

create or replace function public.update_client_product_master(
  p_id bigint, p_zeta_code text, p_operational_name text, p_active boolean, p_display_order integer
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_client_id text;
begin
  select client_id into v_client_id from public.client_products where id = p_id for update;
  if not found then raise exception 'Relación cliente-producto no encontrada.'; end if;
  if nullif(trim(p_zeta_code), '') is null then raise exception 'Indique el código Zeta.'; end if;
  if p_display_order < 0 then raise exception 'El orden no puede ser negativo.'; end if;
  if p_active and not exists (select 1 from public.clients where id = v_client_id and active and nullif(trim(address), '') is not null) then
    raise exception 'El cliente debe estar activo y tener dirección.';
  end if;
  if p_active and not exists (select 1 from public.client_product_controls where client_product_id = p_id and active) then
    raise exception 'Indique al menos un punto de control activo.';
  end if;
  if p_active and not exists (select 1 from public.client_product_assets where client_product_id = p_id and active and is_primary) then
    raise exception 'Cargue un plano o fotografía principal.';
  end if;
  update public.client_products set zeta_code = trim(p_zeta_code), operational_name = nullif(trim(p_operational_name), ''), active = p_active, display_order = p_display_order where id = p_id;
  return true;
end; $$;

create or replace function public.add_client_product_asset(
  p_client_product_id bigint, p_storage_path text, p_file_name text, p_asset_type text,
  p_mime_type text, p_size_bytes bigint, p_alt_text text, p_is_primary boolean
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint;
begin
  if p_is_primary then update public.client_product_assets set is_primary = false where client_product_id = p_client_product_id and active; end if;
  insert into public.client_product_assets(client_product_id, storage_path, file_name, asset_type, mime_type, size_bytes, alt_text, is_primary)
  values (p_client_product_id, p_storage_path, p_file_name, p_asset_type, p_mime_type, p_size_bytes, trim(p_alt_text), p_is_primary)
  returning id into v_id;
  return v_id;
end; $$;

revoke execute on function public.create_client_product_master(text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.replace_client_product_controls(bigint,jsonb) from public, anon, authenticated;
revoke execute on function public.update_client_product_master(bigint,text,text,boolean,integer) from public, anon, authenticated;
revoke execute on function public.add_client_product_asset(bigint,text,text,text,text,bigint,text,boolean) from public, anon, authenticated;
grant execute on function public.create_client_product_master(text,text,text,text,text,text) to service_role;
grant execute on function public.replace_client_product_controls(bigint,jsonb) to service_role;
grant execute on function public.update_client_product_master(bigint,text,text,boolean,integer) to service_role;
grant execute on function public.add_client_product_asset(bigint,text,text,text,text,bigint,text,boolean) to service_role;
