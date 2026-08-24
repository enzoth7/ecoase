create temporary table product_measure_keep on commit drop as
select
  kind,
  measure,
  min(id) as keep_id,
  case
    when bool_or(treatment = 'Marcado') and bool_or(treatment = 'HT') then 'Marcado y HT'
    when bool_or(treatment = 'Marcado') then 'Marcado'
    when bool_or(treatment = 'HT') then 'HT'
    else null
  end as treatment
from public.products
where measure is not null
group by kind, measure;

alter table public.products drop constraint if exists products_treatment_check;

update public.products product
set
  treatment = kept.treatment,
  updated_at = now()
from product_measure_keep kept
where product.id = kept.keep_id;

delete from public.products product
using product_measure_keep kept
where product.kind = kept.kind
  and product.measure = kept.measure
  and product.id <> kept.keep_id;

alter table public.products
  add constraint products_treatment_check
  check (treatment is null or treatment in ('Marcado', 'HT', 'Marcado y HT'));

drop function if exists public.update_catalog_product(text, text, text, text, text, text);

alter table public.products
  drop column code,
  drop column name,
  drop column assignment,
  drop column specification,
  drop column catalog;

create function public.update_catalog_product(
  p_id text,
  p_kind text,
  p_measure text default null,
  p_treatment text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id text;
begin
  if p_kind not in ('Pallet', 'Piso', 'Bin') then
    raise exception 'El tipo indicado no es válido.';
  end if;
  if p_treatment is not null and p_treatment not in ('Marcado', 'HT', 'Marcado y HT') then
    raise exception 'El tratamiento indicado no es válido.';
  end if;

  update public.products
  set
    kind = p_kind,
    measure = nullif(trim(p_measure), ''),
    treatment = p_treatment,
    updated_at = now()
  where id = p_id
  returning id into updated_id;

  if updated_id is null then
    raise exception 'Producto no encontrado.';
  end if;
  return updated_id;
end;
$$;

revoke all on function public.update_catalog_product(text, text, text, text) from public;
grant execute on function public.update_catalog_product(text, text, text, text) to anon, authenticated;
