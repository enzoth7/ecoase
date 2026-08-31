-- A product may be assigned to a client before its operational master sheet is
-- complete. Zeta remains mandatory when the relation is activated for orders.
alter table public.client_products
  alter column zeta_code drop not null;

alter table public.client_products
  drop constraint if exists client_products_zeta_code_check,
  add constraint client_products_zeta_code_check
    check (zeta_code is null or nullif(trim(zeta_code), '') is not null);

drop index if exists public.client_products_client_zeta_unique;
create unique index client_products_client_zeta_unique
  on public.client_products (client_id, lower(trim(zeta_code)))
  where nullif(trim(zeta_code), '') is not null;

-- Restore client/product links that were already present in the imported
-- order history and in the source product names. Pamer is both the legacy
-- source catalogue and the client that owns all products in that catalogue.
with inferred_links as (
  select c.id as client_id, ol.product_id
  from public.order_lines ol
  join public.orders o on o.id = ol.order_id
  join public.clients c on lower(trim(c.name)) = lower(trim(o.client))
  where ol.product_id is not null

  union

  select c.id, p.id
  from public.clients c
  join public.products p on p.source_catalog = 'Pamer'
  where lower(trim(c.name)) = 'pamer'

  union

  select c.id, p.id
  from public.clients c
  join public.products p on lower(trim(p.stock_name)) like lower(trim(c.name)) || '%'
  where lower(trim(c.name)) <> 'pamer'
), ordered_links as (
  select client_id, product_id,
    row_number() over (partition by client_id order by product_id) - 1 as display_order
  from inferred_links
)
insert into public.client_products (
  client_id, product_id, zeta_code, operational_name, active, display_order
)
select client_id, product_id, null, null, false, display_order
from ordered_links
on conflict (client_id, product_id) do nothing;
