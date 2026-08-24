create index orders_producer_provider_id_idx on public.orders(producer_provider_id) where producer_provider_id is not null;
create index orders_transport_provider_id_idx on public.orders(transport_provider_id) where transport_provider_id is not null;
create index external_production_capacity_provider_id_idx on public.external_production_capacity(provider_id);
create index transport_capacity_provider_id_idx on public.transport_capacity(provider_id) where provider_id is not null;
