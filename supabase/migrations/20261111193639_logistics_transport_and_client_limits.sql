create table public.logistics_transport_capacities (
  id text primary key,
  kind text not null check (kind in ('provider', 'customer_pickup')),
  provider_id text references public.providers(id) on delete cascade,
  large_capacity integer check (large_capacity is null or large_capacity >= 0),
  small_capacity integer check (small_capacity is null or small_capacity >= 0),
  updated_at timestamptz not null default now(),
  check (large_capacity is null or small_capacity is null or large_capacity <= small_capacity),
  check (
    (kind = 'provider' and provider_id is not null and id = 'provider:' || provider_id)
    or (kind = 'customer_pickup' and provider_id is null and id = 'customer_pickup')
  )
);

create table public.logistics_client_delivery_limits (
  client_id text primary key references public.clients(id) on delete cascade,
  distance_km numeric(8,1) check (distance_km is null or distance_km >= 0),
  orders_per_day integer check (orders_per_day is null or orders_per_day > 0),
  updated_at timestamptz not null default now()
);

alter table public.logistics_transport_capacities enable row level security;
alter table public.logistics_client_delivery_limits enable row level security;

grant select, insert, update, delete on public.logistics_transport_capacities,
  public.logistics_client_delivery_limits to service_role;
