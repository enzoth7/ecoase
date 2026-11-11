-- Completa las reglas de fábrica para modelos de pallet sin alterar ajustes por cliente.
-- De las cifras normales en rango se usa el extremo inferior como ritmo habitual.
create or replace function public.seed_pallet_production_rules_v1(p_client_product_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $function$
begin
  with baseline(resource_name, model, normal_units, maximum_units) as (
    values
      ('blanc', 'all', 250, 350),
      ('sandro raul', 'all', 200, 240),
      ('enzo', 'all', 120, 140),
      ('lito', 'all', 80, 120),
      ('fábrica john', 'mercosur', 550, 600),
      ('fábrica omar', 'mercosur', 140, 160),
      ('fábrica john', 'citrus', 450, 550)
  )
  insert into public.production_capacity_rules (
    resource_id, product_id, client_product_id, configuration_label,
    normal_units_per_day, maximum_units_per_day, valid_from, source, note
  )
  select
    resource.id, cp.product_id, cp.id, 'Base para pallets',
    baseline.normal_units, baseline.maximum_units, date '2026-01-01',
    'planilla de rendimiento inicial',
    'Valor inicial por modelo; ajustar este cliente y producto cuando corresponda.'
  from public.client_products cp
  join public.products product on product.id = cp.product_id
  cross join baseline
  join public.production_resources resource
    on resource.active
   and (
     lower(btrim(resource.name)) = baseline.resource_name
     or (baseline.resource_name = 'sandro raul' and lower(btrim(resource.name)) = 'sandro raúl')
   )
  where cp.id = p_client_product_id
    and cp.active
    and product.kind = 'Pallet'
    and product.stock_active
    and (
      baseline.model = 'all'
      or (baseline.model = 'mercosur' and lower(btrim(product.attributes->>'modelo')) like 'mercosur%')
      or (baseline.model = 'citrus' and lower(btrim(product.attributes->>'modelo')) = 'citrus')
    )
    and not exists (
      select 1 from public.production_capacity_rules existing
      where existing.client_product_id = cp.id
        and existing.resource_id = resource.id
    );
end;
$function$;

revoke execute on function public.seed_pallet_production_rules_v1(bigint) from public, anon, authenticated;
grant execute on function public.seed_pallet_production_rules_v1(bigint) to service_role;

select public.seed_pallet_production_rules_v1(id)
from public.client_products
where active;
