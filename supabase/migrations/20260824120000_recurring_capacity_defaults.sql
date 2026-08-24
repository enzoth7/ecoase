create table public.internal_production_defaults (
  operation text primary key check (operation in ('assembly', 'marking', 'ht')),
  people_count integer not null check (people_count >= 0),
  manual_capacity integer check (manual_capacity is null or manual_capacity >= 0),
  updated_at timestamptz not null default now()
);

create table public.external_production_defaults (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.providers(id) on delete cascade,
  operation text not null check (operation in ('assembly', 'marking', 'ht')),
  pallet_capacity integer not null check (pallet_capacity >= 0),
  status text not null check (status in ('estimated', 'confirmed')),
  updated_at timestamptz not null default now(),
  unique (provider_id, operation)
);

create table public.transport_capacity_defaults (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('internal', 'external')),
  provider_id text references public.providers(id) on delete cascade,
  pallet_capacity integer not null check (pallet_capacity >= 0),
  status text not null check (status in ('estimated', 'confirmed')),
  updated_at timestamptz not null default now(),
  check ((source = 'internal' and provider_id is null) or (source = 'external' and provider_id is not null))
);

create unique index transport_capacity_defaults_internal on public.transport_capacity_defaults(source) where source = 'internal';
create unique index transport_capacity_defaults_external on public.transport_capacity_defaults(provider_id) where source = 'external';
create index external_production_defaults_provider_idx on public.external_production_defaults(provider_id);
create index transport_capacity_defaults_provider_idx on public.transport_capacity_defaults(provider_id);

create table public.capacity_daily_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_date date not null,
  resource_type text not null check (resource_type in ('internal_production', 'external_production', 'transport')),
  operation text check (operation in ('assembly', 'marking', 'ht')),
  source text check (source in ('internal', 'external')),
  provider_id text references public.providers(id) on delete cascade,
  pallet_adjustment integer not null,
  updated_at timestamptz not null default now(),
  check (
    (resource_type = 'internal_production' and operation is not null and source is null and provider_id is null) or
    (resource_type = 'external_production' and operation is not null and source is null and provider_id is not null) or
    (resource_type = 'transport' and operation is null and source = 'internal' and provider_id is null) or
    (resource_type = 'transport' and operation is null and source = 'external' and provider_id is not null)
  )
);

create unique index capacity_daily_adjustments_key on public.capacity_daily_adjustments (
  adjustment_date,
  resource_type,
  coalesce(operation, ''),
  coalesce(source, ''),
  coalesce(provider_id, '')
);
create index capacity_daily_adjustments_date_idx on public.capacity_daily_adjustments(adjustment_date);
create index capacity_daily_adjustments_provider_idx on public.capacity_daily_adjustments(provider_id);

alter table public.internal_production_defaults enable row level security;
alter table public.external_production_defaults enable row level security;
alter table public.transport_capacity_defaults enable row level security;
alter table public.capacity_daily_adjustments enable row level security;

create policy internal_production_defaults_public_read on public.internal_production_defaults for select to anon, authenticated using (true);
create policy external_production_defaults_public_read on public.external_production_defaults for select to anon, authenticated using (true);
create policy transport_capacity_defaults_public_read on public.transport_capacity_defaults for select to anon, authenticated using (true);
create policy capacity_daily_adjustments_public_read on public.capacity_daily_adjustments for select to anon, authenticated using (true);

grant select on public.internal_production_defaults, public.external_production_defaults, public.transport_capacity_defaults, public.capacity_daily_adjustments to anon, authenticated;

create function public.upsert_internal_production_default(p_operation text, p_people_count integer, p_manual_capacity integer default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_operation not in ('assembly', 'marking', 'ht') or p_people_count < 0 or (p_manual_capacity is not null and p_manual_capacity < 0) then raise exception 'Capacidad interna inválida.'; end if;
  insert into public.internal_production_defaults(operation, people_count, manual_capacity) values (p_operation, p_people_count, p_manual_capacity)
  on conflict (operation) do update set people_count = excluded.people_count, manual_capacity = excluded.manual_capacity, updated_at = now();
  return p_operation;
end; $$;

create function public.upsert_external_production_default(p_provider_id text, p_operation text, p_pallet_capacity integer, p_status text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_operation not in ('assembly', 'marking', 'ht') or p_pallet_capacity < 0 or p_status not in ('estimated', 'confirmed') then raise exception 'Capacidad externa inválida.'; end if;
  if not exists (select 1 from public.providers where id = p_provider_id and type = 'Aserradero') then raise exception 'Seleccione un aserradero registrado.'; end if;
  insert into public.external_production_defaults(provider_id, operation, pallet_capacity, status) values (p_provider_id, p_operation, p_pallet_capacity, p_status)
  on conflict (provider_id, operation) do update set pallet_capacity = excluded.pallet_capacity, status = excluded.status, updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create function public.upsert_transport_capacity_default(p_source text, p_provider_id text, p_pallet_capacity integer, p_status text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_source not in ('internal', 'external') or p_pallet_capacity < 0 or p_status not in ('estimated', 'confirmed') then raise exception 'Capacidad de transporte inválida.'; end if;
  if p_source = 'external' and not exists (select 1 from public.providers where id = p_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista registrado.'; end if;
  if p_source = 'internal' then
    insert into public.transport_capacity_defaults(source, provider_id, pallet_capacity, status) values ('internal', null, p_pallet_capacity, 'confirmed')
    on conflict (source) where source = 'internal' do update set pallet_capacity = excluded.pallet_capacity, status = 'confirmed', updated_at = now()
    returning id into v_id;
  else
    insert into public.transport_capacity_defaults(source, provider_id, pallet_capacity, status) values ('external', p_provider_id, p_pallet_capacity, p_status)
    on conflict (provider_id) where source = 'external' do update set pallet_capacity = excluded.pallet_capacity, status = excluded.status, updated_at = now()
    returning id into v_id;
  end if;
  return v_id;
end; $$;

create function public.upsert_capacity_daily_adjustment(
  p_date date,
  p_resource_type text,
  p_operation text default null,
  p_source text default null,
  p_provider_id text default null,
  p_pallet_adjustment integer default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_date is null or p_resource_type not in ('internal_production', 'external_production', 'transport') then raise exception 'Ajuste diario inválido.'; end if;
  if p_resource_type = 'internal_production' and (p_operation not in ('assembly', 'marking', 'ht') or p_source is not null or p_provider_id is not null) then raise exception 'Ajuste interno inválido.'; end if;
  if p_resource_type = 'external_production' and (p_operation not in ('assembly', 'marking', 'ht') or p_source is not null or not exists (select 1 from public.providers where id = p_provider_id and type = 'Aserradero')) then raise exception 'Ajuste externo inválido.'; end if;
  if p_resource_type = 'transport' and (p_operation is not null or p_source not in ('internal', 'external') or (p_source = 'internal' and p_provider_id is not null) or (p_source = 'external' and not exists (select 1 from public.providers where id = p_provider_id and type = 'Transporte'))) then raise exception 'Ajuste de transporte inválido.'; end if;

  delete from public.capacity_daily_adjustments
  where adjustment_date = p_date and resource_type = p_resource_type
    and operation is not distinct from p_operation
    and source is not distinct from p_source
    and provider_id is not distinct from p_provider_id;

  insert into public.capacity_daily_adjustments(adjustment_date, resource_type, operation, source, provider_id, pallet_adjustment)
  values (p_date, p_resource_type, p_operation, p_source, p_provider_id, p_pallet_adjustment)
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.upsert_internal_production_default(text, integer, integer) from public;
revoke all on function public.upsert_external_production_default(text, text, integer, text) from public;
revoke all on function public.upsert_transport_capacity_default(text, text, integer, text) from public;
revoke all on function public.upsert_capacity_daily_adjustment(date, text, text, text, text, integer) from public;
grant execute on function public.upsert_internal_production_default(text, integer, integer) to anon, authenticated;
grant execute on function public.upsert_external_production_default(text, text, integer, text) to anon, authenticated;
grant execute on function public.upsert_transport_capacity_default(text, text, integer, text) to anon, authenticated;
grant execute on function public.upsert_capacity_daily_adjustment(date, text, text, text, text, integer) to anon, authenticated;
