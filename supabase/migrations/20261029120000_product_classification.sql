-- Clasificación de productos por niveles (pallets):
-- tipo (kind) → medida (measure) → modelo → refuerzo → calidad → acabado → tratamiento.
-- Todas las columnas nuevas son opcionales para no romper los productos ya cargados.

alter table public.products
  add column if not exists model text,
  add column if not exists reinforcement text,
  add column if not exists board_count integer,
  add column if not exists quality text,
  add column if not exists finish text,
  add column if not exists heat_treatment text;

alter table public.products drop constraint if exists products_board_count_positive;
alter table public.products add constraint products_board_count_positive check (board_count is null or board_count > 0);

alter table public.products drop constraint if exists products_heat_treatment_check;
alter table public.products add constraint products_heat_treatment_check
  check (heat_treatment is null or heat_treatment in ('Sin HT', 'Con HT', 'Con HT · exportación'));

-- "120 x 100", "120x100" y "120 × 100" son la misma medida.
create or replace function public.product_measure_key(p text)
returns text language sql immutable as $$
  select regexp_replace(replace(replace(lower(coalesce(p, '')), '×', 'x'), ',', '.'), '\s+', '', 'g')
$$;

-- Un producto es único por su clasificación completa (el cliente no forma parte).
create or replace function public.check_product_combination_available(
  p_product_id text, p_kind text, p_measure text, p_model text, p_reinforcement text,
  p_board_count integer, p_quality text, p_finish text, p_heat_treatment text)
returns boolean language plpgsql set search_path to 'public' as $$
declare v_other record;
begin
  select p.id, p.zeta_code into v_other from public.products p
  where p.id is distinct from p_product_id
    and p.kind = p_kind
    and public.product_measure_key(p.measure) = public.product_measure_key(p_measure)
    and lower(coalesce(trim(p.model), '')) = lower(coalesce(trim(p_model), ''))
    and lower(coalesce(trim(p.reinforcement), '')) = lower(coalesce(trim(p_reinforcement), ''))
    and coalesce(p.board_count, 0) = coalesce(p_board_count, 0)
    and lower(coalesce(trim(p.quality), '')) = lower(coalesce(trim(p_quality), ''))
    and lower(coalesce(trim(p.finish), '')) = lower(coalesce(trim(p_finish), ''))
    and lower(coalesce(nullif(trim(p.heat_treatment), ''), case when p.requires_treatment then 'Con HT' else 'Sin HT' end)) = lower(coalesce(trim(p_heat_treatment), ''))
  limit 1;
  if found then
    raise exception 'Ya existe un producto con esa clasificación (código Zeta %).', coalesce(v_other.zeta_code, v_other.id);
  end if;
  return true;
end; $$;

create or replace function public.create_catalog_product_v5(
  p_kind text, p_measure text, p_model text, p_reinforcement text, p_board_count integer,
  p_quality text, p_finish text, p_heat_treatment text, p_zeta_code text, p_stock_name text, p_client_ids text[])
returns text language plpgsql set search_path to 'public' as $$
declare
  v_id text;
  v_zeta text := upper(nullif(trim(p_zeta_code), ''));
  v_client text;
  v_heat text := nullif(trim(p_heat_treatment), '');
begin
  if p_kind not in ('Pallet', 'Piso', 'Bin') then raise exception 'El tipo indicado no es válido.'; end if;
  if v_zeta is null then raise exception 'Indique el código Zeta.'; end if;
  if nullif(trim(p_measure), '') is null then raise exception 'Indique la medida.'; end if;
  if v_heat is null or v_heat not in ('Sin HT', 'Con HT', 'Con HT · exportación') then raise exception 'Indique el tratamiento.'; end if;
  if exists (select 1 from public.products where upper(trim(zeta_code)) = v_zeta) then
    raise exception 'Ya existe un producto con el código Zeta %.', v_zeta;
  end if;
  perform public.check_product_combination_available(null, p_kind, p_measure, p_model, p_reinforcement, p_board_count, p_quality, p_finish, v_heat);

  v_id := 'producto-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  insert into public.products(id, kind, measure, requires_treatment, zeta_code, stock_name, model, reinforcement, board_count, quality, finish, heat_treatment)
  values (v_id, p_kind, nullif(trim(p_measure), ''), v_heat like 'Con HT%', v_zeta, nullif(trim(p_stock_name), ''),
          nullif(trim(p_model), ''), nullif(trim(p_reinforcement), ''), p_board_count, nullif(trim(p_quality), ''), nullif(trim(p_finish), ''), v_heat);
  foreach v_client in array coalesce(p_client_ids, array[]::text[]) loop
    insert into public.client_products(client_id, product_id, zeta_code, active, display_order)
    values (v_client, v_id, v_zeta, true, (select count(*) from public.client_products where client_id = v_client))
    on conflict (client_id, product_id) do update set active = true;
  end loop;
  return v_id;
end; $$;

create or replace function public.update_catalog_product_v3(
  p_id text, p_kind text, p_measure text, p_model text, p_reinforcement text, p_board_count integer,
  p_quality text, p_finish text, p_heat_treatment text, p_zeta_code text, p_stock_name text)
returns text language plpgsql set search_path to 'public' as $$
declare
  v_heat text := nullif(trim(p_heat_treatment), '');
  v_zeta text := upper(nullif(trim(p_zeta_code), ''));
  v_id text;
begin
  if p_kind not in ('Pallet', 'Piso', 'Bin') then raise exception 'El tipo indicado no es válido.'; end if;
  if nullif(trim(p_measure), '') is null then raise exception 'Indique la medida.'; end if;
  if v_heat is null or v_heat not in ('Sin HT', 'Con HT', 'Con HT · exportación') then raise exception 'Indique el tratamiento.'; end if;
  if v_zeta is not null then perform public.check_product_zeta_available(p_id, v_zeta); end if;
  perform public.check_product_combination_available(p_id, p_kind, p_measure, p_model, p_reinforcement, p_board_count, p_quality, p_finish, v_heat);

  update public.products set
    kind = p_kind,
    measure = nullif(trim(p_measure), ''),
    requires_treatment = v_heat like 'Con HT%',
    model = nullif(trim(p_model), ''),
    reinforcement = nullif(trim(p_reinforcement), ''),
    board_count = p_board_count,
    quality = nullif(trim(p_quality), ''),
    finish = nullif(trim(p_finish), ''),
    heat_treatment = v_heat,
    zeta_code = coalesce(v_zeta, zeta_code),
    stock_name = coalesce(nullif(trim(p_stock_name), ''), stock_name)
  where id = p_id returning id into v_id;
  if v_id is null then raise exception 'Producto no encontrado.'; end if;
  return v_id;
end; $$;
