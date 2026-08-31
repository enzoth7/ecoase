with requested_clients(id, name) as (values
  ('source-chacra-anaranjado', 'Chacra Anaranjado'),
  ('source-aluminos-del-uruguay', 'Aluminos del Uruguay'),
  ('source-avanti', 'Avanti'),
  ('source-chacra-azul', 'Chacra Azul'),
  ('source-chacra-blanco', 'Chacra Blanco'),
  ('source-chacra-chapicuy', 'Chacra Chapicuy'),
  ('source-chacra-rojo', 'Chacra Rojo'),
  ('source-cristal-pet', 'Cristal PET'),
  ('source-fricasa', 'Fricasa'),
  ('source-molinos-san-jose', 'Molinos San Jose'),
  ('source-saint-gobain', 'Saint Gobain')
)
insert into public.clients(id, name, active)
select requested.id, requested.name, false
from requested_clients requested
where not exists (
  select 1 from public.clients existing
  where lower(trim(existing.name)) = lower(trim(requested.name))
)
on conflict (id) do nothing;

with requested_links(client_name, product_id, product_name) as (values
  ('Chacra Anaranjado', 'palbin-p20', 'Bins'),
  ('Aluminos del Uruguay', 'palbin-p29', 'Pallet'),
  ('Avanti', 'palbin-p39', 'Pallet'),
  ('Chacra Azul', 'palbin-p17', 'Bins'),
  ('Chacra Blanco', 'palbin-p18', 'Bins'),
  ('Chacra Chapicuy', 'palbin-p37', 'Bins'),
  ('Chacra Rojo', 'palbin-p19', 'Bins'),
  ('Cristal PET', 'palbin-p01', 'Pallet'),
  ('Fricasa', 'palbin-p10', 'Pallet'),
  ('Molinos San Jose', 'palbin-p03', 'Pallet'),
  ('Saint Gobain', 'palbin-p04', 'Pallet')
), resolved_links as (
  select client.id as client_id, requested.product_id, requested.product_name
  from requested_links requested
  join public.clients client
    on lower(trim(client.name)) = lower(trim(requested.client_name))
)
insert into public.client_products(
  client_id, product_id, zeta_code, operational_name, active, display_order
)
select client_id, product_id, null, null, false, 0
from resolved_links
on conflict (client_id, product_id) do nothing;

with normalized_products(product_id, product_name) as (values
  ('palbin-p20', 'Bins'),
  ('palbin-p29', 'Pallet'),
  ('palbin-p39', 'Pallet'),
  ('palbin-p17', 'Bins'),
  ('palbin-p18', 'Bins'),
  ('palbin-p37', 'Bins'),
  ('palbin-p19', 'Bins'),
  ('palbin-p01', 'Pallet'),
  ('palbin-p10', 'Pallet'),
  ('palbin-p03', 'Pallet'),
  ('palbin-p04', 'Pallet')
)
update public.products product
set stock_name = normalized.product_name
from normalized_products normalized
where product.id = normalized.product_id;

update public.products
set treatment = 'Marcado'
where requires_treatment;
