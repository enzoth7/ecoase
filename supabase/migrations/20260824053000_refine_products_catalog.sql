delete from public.products
where id in ('palbin-p06', 'palbin-p07', 'palbin-p08');

update public.products
set
  name = case id
    when 'palbin-p05' then 'Pallet 122 × 102'
    when 'palbin-p13' then 'Pallet 120 × 80'
    else name
  end,
  assignment = null,
  updated_at = now();

create or replace function public.update_catalog_product(
  p_id text,
  p_code text,
  p_name text,
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
  if nullif(trim(p_code), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'El código y el nombre son obligatorios.';
  end if;
  if p_kind not in ('Pallet', 'Piso', 'Bin') then
    raise exception 'El tipo indicado no es válido.';
  end if;
  if p_treatment is not null and p_treatment not in ('Marcado', 'HT') then
    raise exception 'El tratamiento indicado no es válido.';
  end if;

  update public.products
  set
    code = trim(p_code),
    name = trim(p_name),
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

create or replace function public.delete_catalog_product(p_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_id text;
begin
  delete from public.products where id = p_id returning id into deleted_id;
  if deleted_id is null then
    raise exception 'Producto no encontrado.';
  end if;
  return deleted_id;
end;
$$;

revoke all on function public.update_catalog_product(text, text, text, text, text, text) from public;
revoke all on function public.delete_catalog_product(text) from public;
grant execute on function public.update_catalog_product(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_catalog_product(text) to anon, authenticated;
