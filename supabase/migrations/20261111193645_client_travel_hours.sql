alter table public.logistics_client_delivery_limits
  add column travel_hours numeric(5,2) check (travel_hours is null or travel_hours >= 0),
  add column route_checked_at timestamptz;
