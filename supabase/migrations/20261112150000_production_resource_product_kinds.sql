-- Qué tipos de producto produce cada recurso. NULL = todos.
alter table public.production_resources add column if not exists product_kinds text[];
alter table public.production_resources drop constraint if exists production_resources_product_kinds_check;
alter table public.production_resources add constraint production_resources_product_kinds_check
  check (product_kinds is null or (cardinality(product_kinds) > 0 and product_kinds <@ array['Pallet','Bin','Piso']::text[]));

-- John y Esteban trabaja solo con bins (regla que antes estaba fija en el código).
update public.production_resources set product_kinds = array['Bin']::text[]
where lower(trim(name)) = 'john y esteban' and product_kinds is null;
