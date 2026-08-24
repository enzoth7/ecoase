alter table public.products
  drop column created_at,
  drop column updated_at;

create or replace function public.update_catalog_product(
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
    treatment = p_treatment
  where id = p_id
  returning id into updated_id;

  if updated_id is null then
    raise exception 'Producto no encontrado.';
  end if;
  return updated_id;
end;
$$;
