create index if not exists production_daily_overrides_resource_idx
  on public.production_daily_overrides (resource_id);

create index if not exists production_daily_overrides_capacity_rule_idx
  on public.production_daily_overrides (capacity_rule_id)
  where capacity_rule_id is not null;

create index if not exists production_daily_overrides_product_idx
  on public.production_daily_overrides (product_id)
  where product_id is not null;
