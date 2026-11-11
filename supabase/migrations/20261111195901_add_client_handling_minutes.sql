alter table public.logistics_client_delivery_limits
  add column handling_minutes integer check (handling_minutes is null or handling_minutes >= 0);

alter table public.logistics_client_delivery_limits
  drop constraint if exists logistics_client_delivery_limits_orders_per_day_check,
  add constraint logistics_client_delivery_limits_orders_per_day_check
    check (orders_per_day is null or orders_per_day >= 0);
