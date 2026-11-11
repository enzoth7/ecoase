-- Cifras de la primera fila de la antigua planilla de rendimiento.
-- La columna "normal" es la producción habitual, no un mínimo obligatorio.
-- Cada vínculo cliente-producto conserva sus propias reglas si ya existen.
create or replace function public.seed_pallet_production_rules_v1(p_client_product_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $function$
begin
  with baseline(resource_name, normal_units, maximum_units) as (
    values
      ('blanc', 250, 350),
      ('sandro raul', 200, 240),
      ('enzo', 120, 140),
      ('lito', 80, 120)
  )
  insert into public.production_capacity_rules (
    resource_id, product_id, client_product_id, configuration_label,
    normal_units_per_day, maximum_units_per_day, valid_from, source, note
  )
  select
    resource.id, cp.product_id, cp.id, 'Base para pallets',
    baseline.normal_units, baseline.maximum_units, date '2026-01-01',
    'planilla de rendimiento inicial',
    'Valores iniciales compartidos; ajustar este cliente y producto cuando corresponda.'
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

create or replace function public.seed_pallet_rules_on_client_product_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  if new.active then
    perform public.seed_pallet_production_rules_v1(new.id);
  end if;
  return new;
end;
$function$;

revoke execute on function public.seed_pallet_rules_on_client_product_v1() from public, anon, authenticated;
grant execute on function public.seed_pallet_rules_on_client_product_v1() to service_role;

create trigger client_product_seed_pallet_rules
after insert or update of active, product_id on public.client_products
for each row execute function public.seed_pallet_rules_on_client_product_v1();
