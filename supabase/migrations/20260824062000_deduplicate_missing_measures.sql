create temporary table product_type_keep on commit drop as
select
  kind,
  min(id) as keep_id,
  case
    when bool_or(treatment = 'Marcado') and bool_or(treatment = 'HT') then 'Marcado y HT'
    when bool_or(treatment = 'Marcado') then 'Marcado'
    when bool_or(treatment = 'HT') then 'HT'
    else null
  end as treatment
from public.products
where measure is null
group by kind;

update public.products product
set treatment = kept.treatment
from product_type_keep kept
where product.id = kept.keep_id;

delete from public.products product
using product_type_keep kept
where product.kind = kept.kind
  and product.measure is null
  and product.id <> kept.keep_id;
