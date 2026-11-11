-- Altura inicial editable de 10 cm para todos los pallets existentes y nuevos.
alter table public.products
  add column height_cm numeric(7,2) check (height_cm > 0);

update public.products set height_cm = 10 where kind = 'Pallet' and height_cm is null;

create or replace function public.create_catalog_product_v7(
  p_kind text, p_measure text, p_height_cm numeric, p_attributes jsonb,
  p_zeta_code text, p_stock_name text, p_client_ids text[])
returns text language plpgsql set search_path to 'public' as $$
declare
  v_id text;
  v_zeta text := upper(nullif(trim(p_zeta_code), ''));
  v_client text;
  v_attrs jsonb;
  v_key text;
  v_twin text;
begin
  if p_kind not in ('Pallet', 'Piso', 'Bin') then raise exception 'El tipo indicado no es válido.'; end if;
  if v_zeta is null or v_zeta !~ '^[1-9][0-9]*$' then raise exception 'Indique un código numérico.'; end if;
  if nullif(trim(p_measure), '') is null then raise exception 'Indique la medida.'; end if;
  if p_height_cm is not null and p_height_cm <= 0 then raise exception 'La altura debe ser positiva.'; end if;
  v_attrs := public.clean_product_attributes(p_attributes);
  if exists (select 1 from public.products where upper(trim(zeta_code)) = v_zeta) then
    raise exception 'Ya existe un producto con el código Zeta %.', v_zeta;
  end if;
  v_key := public.product_identity_key(p_kind, p_measure, v_attrs);
  select coalesce(zeta_code, id) into v_twin from public.products where identity_key = v_key limit 1;
  if v_twin is not null then raise exception 'Ya existe un producto con esa clasificación (código Zeta %).', v_twin; end if;

  v_id := 'producto-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  insert into public.products(id, kind, measure, height_cm, requires_treatment, zeta_code, stock_name, attributes, identity_key, heat_treatment)
  values (v_id, p_kind, nullif(trim(p_measure), ''), case when p_kind = 'Pallet' then coalesce(p_height_cm, 10) else p_height_cm end, coalesce(v_attrs->>'tratamiento' like 'Con HT%', false),
    v_zeta, nullif(trim(p_stock_name), ''), v_attrs, v_key, v_attrs->>'tratamiento');
  foreach v_client in array coalesce(p_client_ids, array[]::text[]) loop
    insert into public.client_products(client_id, product_id, zeta_code, active, display_order)
    values (v_client, v_id, v_zeta, true, (select count(*) from public.client_products where client_id = v_client))
    on conflict (client_id, product_id) do update set active = true;
  end loop;
  return v_id;
end; $$;

create or replace function public.update_catalog_product_v5(
  p_id text, p_kind text, p_measure text, p_height_cm numeric, p_height_provided boolean,
  p_attributes jsonb, p_zeta_code text, p_stock_name text)
returns text language plpgsql set search_path to 'public' as $$
declare
  v_zeta text := upper(nullif(trim(p_zeta_code), ''));
  v_attrs jsonb;
  v_key text;
  v_twin text;
  v_id text;
begin
  if p_kind not in ('Pallet', 'Piso', 'Bin') then raise exception 'El tipo indicado no es válido.'; end if;
  if nullif(trim(p_measure), '') is null then raise exception 'Indique la medida.'; end if;
  if p_height_provided and p_height_cm is not null and p_height_cm <= 0 then raise exception 'La altura debe ser positiva.'; end if;
  v_attrs := public.clean_product_attributes(p_attributes);
  if v_zeta is not null and v_zeta !~ '^[1-9][0-9]*$' then raise exception 'Indique un código numérico.'; end if;
  if v_zeta is not null then perform public.check_product_zeta_available(p_id, v_zeta); end if;
  v_key := public.product_identity_key(p_kind, p_measure, v_attrs);
  select coalesce(zeta_code, id) into v_twin from public.products where identity_key = v_key and id <> p_id limit 1;
  if v_twin is not null then raise exception 'Ya existe un producto con esa clasificación (código Zeta %).', v_twin; end if;

  update public.products set
    kind = p_kind,
    measure = nullif(trim(p_measure), ''),
    height_cm = case when p_height_provided then case when p_kind = 'Pallet' then coalesce(p_height_cm, 10) else p_height_cm end else height_cm end,
    requires_treatment = coalesce(v_attrs->>'tratamiento' like 'Con HT%', false),
    attributes = v_attrs,
    identity_key = v_key,
    heat_treatment = v_attrs->>'tratamiento',
    zeta_code = coalesce(v_zeta, zeta_code),
    stock_name = coalesce(nullif(trim(p_stock_name), ''), stock_name)
  where id = p_id returning id into v_id;
  if v_id is null then raise exception 'Producto no encontrado.'; end if;
  return v_id;
end; $$;

revoke execute on function public.create_catalog_product_v7(text, text, numeric, jsonb, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.update_catalog_product_v5(text, text, text, numeric, boolean, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_catalog_product_v7(text, text, numeric, jsonb, text, text, text[]) to service_role;
grant execute on function public.update_catalog_product_v5(text, text, text, numeric, boolean, jsonb, text, text) to service_role;
