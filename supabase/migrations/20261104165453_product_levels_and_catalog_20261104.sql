-- Niveles de producto configurables.
-- La Medida va primero y el resto sigue las pestañas Productos del árbol y Nomenclatura.
-- Cada producto guarda un valor por nivel en products.attributes; las opciones de cada nivel son sugerencias.
-- Las columnas viejas (model, reinforcement, board_count, quality, finish, heat_treatment) se conservan sin usar.

create table if not exists public.product_levels (
  id text primary key,
  label text not null check (btrim(label) <> ''),
  position integer not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  system boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.product_levels enable row level security;
drop policy if exists product_levels_public_read on public.product_levels;
create policy product_levels_public_read on public.product_levels for select to anon, authenticated using (true);

-- Niveles de partida (los mismos que defaultProductLevels en app/classification.ts).
insert into public.product_levels(id, label, position, options, system) values
  ('medida', 'Medida', 0, '["100 x 80","100 x 100","100 x 120","106 x 106","113 x 113","115 x 115","116 x 116","116,5 x 114","119 x 106","120 x 80","120 x 90","120 x 100","120 x 112","120 x 120","120 x 130","121 x 103","122 x 102","140 x 120","145 x 80","145 x 100","160 x 110","216 x 110"]', true),
  ('modelo', 'Modelo', 1, '["Mercosur","Simple entrada","Doble entrada","Cerrado","Citrus","Adium","Doble entrada · Cerrado"]', false),
  ('taco', 'Taco', 2, '["5 tacos","Taco corrido","Con taco"]', false),
  ('refuerzo', 'Refuerzo', 3, '["Liviano","Reforzado","7 tablas","Reforzado Celsius"]', false),
  ('identificacion', 'Identificación', 4, '["N° 1","N° 3","N° 6","Punto Azul","Punto Rojo","Punto Negro","N° 3 Punto Azul","Adium"]', false),
  ('corte-esquina', 'Corte esquina', 5, '["Con corte","Sin corte","Con corte en maquina","Sin corte en la esquina"]', false),
  ('terminacion', 'Terminación', 6, '["Rústico","Cepillado","Rebaje en todas las tablas"]', false),
  ('espesor', 'Espesor', 7, '["20 mm"]', false),
  ('exportacion', 'Exportación', 8, '["Exportación","Exportación Industria"]', true),
  ('tratamiento', 'Tratamiento', 9, '["Sin HT","Con HT"]', true)
on conflict (id) do nothing;

alter table public.products add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists identity_key text;
alter table public.products drop constraint if exists products_heat_treatment_check;

-- Pasa lo cargado con la clasificación vieja a niveles (misma regla que attributesFromLegacy en app/classification.ts).
update public.products p set attributes = jsonb_strip_nulls(jsonb_build_object(
  'modelo', case when btrim(coalesce(p.model, '')) = 'Mercosur · Adium' then 'Mercosur'
                 when btrim(coalesce(p.model, '')) = 'Simple entrada · 5 tacos' then 'Simple entrada'
                 when btrim(coalesce(p.model, '')) = 'Mercosur 20 mm' then 'Mercosur'
                 when btrim(coalesce(p.model, '')) in ('', 'Con taco', 'Exportación industria') then null
                 else btrim(p.model) end,
  'taco', case when btrim(coalesce(p.model, '')) = 'Simple entrada · 5 tacos' then '5 tacos'
               when btrim(coalesce(p.model, '')) = 'Con taco' then 'Con taco' end,
  'refuerzo', nullif(concat_ws(' · ', nullif(btrim(coalesce(p.reinforcement, '')), ''), case when p.board_count is not null then p.board_count || ' tablas' end), ''),
  'identificacion', coalesce(nullif(btrim(coalesce(p.quality, '')), ''), case when btrim(coalesce(p.model, '')) = 'Mercosur · Adium' then 'Adium' end),
  'corte-esquina', case when lower(coalesce(p.finish, '')) like '%con corte%' then 'Con corte'
                         when lower(coalesce(p.finish, '')) like '%sin corte%' then 'Sin corte' end,
  'terminacion', case when lower(coalesce(p.finish, '')) like '%cepillado%' then 'Cepillado'
                       when lower(coalesce(p.finish, '')) like '%rebaje en todas las tablas%' then 'Rebaje en todas las tablas' end,
  'espesor', case when btrim(coalesce(p.model, '')) = 'Mercosur 20 mm' or lower(coalesce(p.finish, '')) like '%20 mm%' then '20 mm' end,
  'exportacion', case when btrim(coalesce(p.heat_treatment, '')) = 'Con HT · exportación' then 'Exportación'
                      when btrim(coalesce(p.model, '')) = 'Exportación industria' then 'Exportación Industria' end,
  'tratamiento', case when btrim(coalesce(p.heat_treatment, '')) in ('Con HT', 'Con HT · exportación') then 'Con HT'
                      when btrim(coalesce(p.heat_treatment, '')) = 'Sin HT' then 'Sin HT'
                      when p.requires_treatment then 'Con HT' else 'Sin HT' end
))
where p.attributes = '{}'::jsonb;

-- Identidad del producto: tipo, medida (sin espacios ni mayúsculas) y todos sus valores, sin el cliente.
-- "120 x 100" y "100 x 120" son productos distintos. La misma clave la arma productKey en app/classification.ts.
create or replace function public.product_identity_key(p_kind text, p_measure text, p_attributes jsonb)
returns text language sql immutable as $$
  select lower(p_kind) || '|' || public.product_measure_key(p_measure) || coalesce((
    select string_agg('|' || e.key || '=' || lower(btrim(e.value)), '' order by e.key collate "C")
    from jsonb_each_text(coalesce(p_attributes, '{}'::jsonb)) e where btrim(e.value) <> ''
  ), '')
$$;

update public.products set identity_key = public.product_identity_key(kind, measure, attributes) where identity_key is null;
create unique index if not exists products_identity_key_idx on public.products(identity_key) where identity_key is not null;

-- Valores limpios: sólo texto no vacío; el tratamiento manda sobre requires_treatment; Exportación implica Con HT.
create or replace function public.clean_product_attributes(p_attributes jsonb)
returns jsonb language plpgsql set search_path to 'public' as $$
declare v jsonb;
begin
  select coalesce(jsonb_object_agg(e.key, btrim(e.value)), '{}'::jsonb) into v
  from jsonb_each_text(coalesce(p_attributes, '{}'::jsonb)) e where btrim(e.value) <> '';
  if v ? 'exportacion' and v->>'tratamiento' not like 'Con HT%' then v := jsonb_set(v, '{tratamiento}', '"Con HT"'); end if;
  if v ? 'tratamiento' and v->>'tratamiento' <> 'Sin HT' and v->>'tratamiento' not like 'Con HT%' then raise exception 'El tratamiento tiene que ser Sin HT o Con HT.'; end if;
  return v;
end; $$;

create or replace function public.create_catalog_product_v6(
  p_kind text, p_measure text, p_attributes jsonb, p_zeta_code text, p_stock_name text, p_client_ids text[])
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
  v_attrs := public.clean_product_attributes(p_attributes);
  if exists (select 1 from public.products where upper(trim(zeta_code)) = v_zeta) then
    raise exception 'Ya existe un producto con el código Zeta %.', v_zeta;
  end if;
  v_key := public.product_identity_key(p_kind, p_measure, v_attrs);
  select coalesce(zeta_code, id) into v_twin from public.products where identity_key = v_key limit 1;
  if v_twin is not null then raise exception 'Ya existe un producto con esa clasificación (código Zeta %).', v_twin; end if;

  v_id := 'producto-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  insert into public.products(id, kind, measure, requires_treatment, zeta_code, stock_name, attributes, identity_key, heat_treatment)
  values (v_id, p_kind, nullif(trim(p_measure), ''), coalesce(v_attrs->>'tratamiento' like 'Con HT%', false), v_zeta, nullif(trim(p_stock_name), ''), v_attrs, v_key, v_attrs->>'tratamiento');
  foreach v_client in array coalesce(p_client_ids, array[]::text[]) loop
    insert into public.client_products(client_id, product_id, zeta_code, active, display_order)
    values (v_client, v_id, v_zeta, true, (select count(*) from public.client_products where client_id = v_client))
    on conflict (client_id, product_id) do update set active = true;
  end loop;
  return v_id;
end; $$;

create or replace function public.update_catalog_product_v4(
  p_id text, p_kind text, p_measure text, p_attributes jsonb, p_zeta_code text, p_stock_name text)
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
  v_attrs := public.clean_product_attributes(p_attributes);
  if v_zeta is not null and v_zeta !~ '^[1-9][0-9]*$' then raise exception 'Indique un código numérico.'; end if;
  if v_zeta is not null then perform public.check_product_zeta_available(p_id, v_zeta); end if;
  v_key := public.product_identity_key(p_kind, p_measure, v_attrs);
  select coalesce(zeta_code, id) into v_twin from public.products where identity_key = v_key and id <> p_id limit 1;
  if v_twin is not null then raise exception 'Ya existe un producto con esa clasificación (código Zeta %).', v_twin; end if;

  update public.products set
    kind = p_kind,
    measure = nullif(trim(p_measure), ''),
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

-- Guarda la lista completa de niveles y opciones en el orden recibido. Los niveles de sistema no se quitan
-- y un nivel con productos tampoco.
create or replace function public.save_product_levels_v1(p_levels jsonb)
returns boolean language plpgsql set search_path to 'public' as $$
declare v_item jsonb; v_pos integer := 0; v_gone record;
begin
  if jsonb_typeof(p_levels) <> 'array' then raise exception 'Formato de niveles inválido.'; end if;
  if (p_levels->0->>'id') is distinct from 'medida' then raise exception 'La Medida es siempre el primer nivel.'; end if;
  for v_gone in
    select l.id, l.label, l.system, (select count(*) from public.products p where p.attributes ? l.id) as used
    from public.product_levels l
    where l.id not in (select e->>'id' from jsonb_array_elements(p_levels) e)
  loop
    if v_gone.system then raise exception 'No se puede quitar el nivel «%».', v_gone.label; end if;
    if v_gone.used > 0 then raise exception 'No se puede eliminar el nivel «%»: % productos lo usan.', v_gone.label, v_gone.used; end if;
  end loop;
  delete from public.product_levels where not system and id not in (select e->>'id' from jsonb_array_elements(p_levels) e);
  for v_item in select e from jsonb_array_elements(p_levels) e loop
    insert into public.product_levels(id, label, position, options, system)
    values (v_item->>'id', btrim(v_item->>'label'), v_pos, coalesce(v_item->'options', '[]'::jsonb), false)
    on conflict (id) do update set label = excluded.label, position = excluded.position, options = excluded.options, updated_at = now();
    v_pos := v_pos + 1;
  end loop;
  return true;
end; $$;

-- Cierre de seguridad: estas funciones sólo las llama la app con la clave de servidor.
-- (Las funciones de las migraciones anteriores de esta serie quedaron abiertas al rol anónimo por defecto.)
revoke execute on function public.create_catalog_product_v6(text, text, jsonb, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.update_catalog_product_v4(text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.save_product_levels_v1(jsonb) from public, anon, authenticated;
revoke execute on function public.clean_product_attributes(jsonb) from public, anon, authenticated;
revoke execute on function public.delete_operation_order_v1(text) from public, anon, authenticated;
revoke execute on function public.assign_order_transport_v1(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.plan_order_production_v1(text, jsonb) from public, anon, authenticated;
revoke execute on function public.plan_order_drying_v1(text, date, date, text) from public, anon, authenticated;
revoke execute on function public.create_operation_order_v7(jsonb, date, date, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.create_catalog_product_v4(text, text, boolean, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.create_catalog_product_v5(text, text, text, text, integer, text, text, text, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.update_catalog_product_v3(text, text, text, text, text, integer, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.delete_catalog_product_v2(text) from public, anon, authenticated;
revoke execute on function public.set_product_clients_v1(text, text[]) from public, anon, authenticated;
revoke execute on function public.check_product_zeta_available(text, text) from public, anon, authenticated;
revoke execute on function public.check_product_combination_available(text, text, text, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.create_catalog_product_v6(text, text, jsonb, text, text, text[]) to service_role;
grant execute on function public.update_catalog_product_v4(text, text, text, jsonb, text, text) to service_role;
grant execute on function public.save_product_levels_v1(jsonb) to service_role;
grant execute on function public.clean_product_attributes(jsonb) to service_role;
grant execute on function public.delete_operation_order_v1(text) to service_role;
grant execute on function public.assign_order_transport_v1(text, text, text, text) to service_role;
grant execute on function public.plan_order_production_v1(text, jsonb) to service_role;
grant execute on function public.plan_order_drying_v1(text, date, date, text) to service_role;
grant execute on function public.create_operation_order_v7(jsonb, date, date, text, text, text[]) to service_role;
grant execute on function public.create_catalog_product_v4(text, text, boolean, text, text, text[]) to service_role;
grant execute on function public.create_catalog_product_v5(text, text, text, text, integer, text, text, text, text, text, text[]) to service_role;
grant execute on function public.update_catalog_product_v3(text, text, text, text, text, integer, text, text, text, text, text) to service_role;
grant execute on function public.delete_catalog_product_v2(text) to service_role;
grant execute on function public.set_product_clients_v1(text, text[]) to service_role;
grant execute on function public.check_product_zeta_available(text, text) to service_role;
grant execute on function public.check_product_combination_available(text, text, text, text, text, integer, text, text, text) to service_role;

-- Catálogo PRODUCTOS: 74 filas de «Productos del árbol», 58 combinaciones y 73 asociaciones.
-- Fuente: https://docs.google.com/spreadsheets/d/1t2vtQfIDgUP2XMv3STSPnvALK08VFtk2bLF7CnLB-lc/edit?gid=253069878
-- Los dos productos anteriores sin equivalencia (Z7 y Z8) se conservan para el pedido histórico.
create temp table ecoase_catalog_import on commit drop as
select code, measure, stock_name, attributes, clients, null::text as id
from jsonb_to_recordset($ecoase_catalog$
[
  {
    "code": "1",
    "measure": "100 x 100",
    "stock_name": "Pallet · 100 x 100 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "2",
    "measure": "100 x 100",
    "stock_name": "Pallet · 100 x 100 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "3",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Adium · Rústico",
    "attributes": {
      "modelo": "Adium",
      "terminacion": "Rústico"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "4",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Mercosur · Rústico · Con HT",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "5",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Mercosur · Rústico · Sin HT",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "6",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Citrus · Rústico · Exportación · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "exportacion": "Exportación",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Antonio de Souza e Hijos",
      "Forbel",
      "Frutos de Chapicuy Ltda.",
      "Frutura Uruguay S.A. BIC",
      "Sanducitrus SRL"
    ]
  },
  {
    "code": "7",
    "measure": "100 x 80",
    "stock_name": "Pallet · 100 x 80 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "8",
    "measure": "106 x 106",
    "stock_name": "Pallet · 106 x 106 · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Saint Gobain"
    ]
  },
  {
    "code": "9",
    "measure": "113 x 113",
    "stock_name": "Pallet · 113 x 113 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Frutura Uruguay S.A. BIC",
      "San Miguel"
    ]
  },
  {
    "code": "10",
    "measure": "115 x 115",
    "stock_name": "Pallet · 115 x 115 · Rústico · Con HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Aluminio del Uruguay"
    ]
  },
  {
    "code": "11",
    "measure": "115 x 115",
    "stock_name": "Pallet · 115 x 115 · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Aluminio del Uruguay"
    ]
  },
  {
    "code": "12",
    "measure": "116 x 116",
    "stock_name": "Pallet · 116 x 116 · Citrus · Cepillado · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Cepillado",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Frutura Uruguay S.A. BIC"
    ]
  },
  {
    "code": "13",
    "measure": "116,5 x 114",
    "stock_name": "Pallet · 116,5 x 114 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "San Miguel"
    ]
  },
  {
    "code": "14",
    "measure": "119 x 106",
    "stock_name": "Pallet · 119 x 106 · Rústico",
    "attributes": {
      "terminacion": "Rústico"
    },
    "clients": [
      "Cristalpet"
    ]
  },
  {
    "code": "15",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Con corte · Rústico",
    "attributes": {
      "modelo": "Mercosur",
      "corte-esquina": "Con corte",
      "terminacion": "Rústico"
    },
    "clients": [
      "Conaprole",
      "Azucarlito",
      "Granja Pocha",
      "Ghelfa",
      "Labrezza"
    ]
  },
  {
    "code": "16",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Sin corte · Rústico · 20 mm",
    "attributes": {
      "modelo": "Mercosur",
      "espesor": "20 mm",
      "corte-esquina": "Sin corte",
      "terminacion": "Rústico"
    },
    "clients": [
      "Proquimur"
    ]
  },
  {
    "code": "17",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Sin corte · Rústico",
    "attributes": {
      "modelo": "Mercosur",
      "corte-esquina": "Sin corte",
      "terminacion": "Rústico"
    },
    "clients": [
      "Azucarlito",
      "Granja Pocha",
      "Ghelfa",
      "Labrezza"
    ]
  },
  {
    "code": "18",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Con corte · Cepillado",
    "attributes": {
      "modelo": "Mercosur",
      "corte-esquina": "Con corte",
      "terminacion": "Cepillado"
    },
    "clients": [
      "Alimentos Fray Bentos"
    ]
  },
  {
    "code": "19",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Con corte · Rebaje en todas las tablas",
    "attributes": {
      "modelo": "Mercosur",
      "corte-esquina": "Con corte",
      "terminacion": "Rebaje en todas las tablas"
    },
    "clients": [
      "Molinos  San José"
    ]
  },
  {
    "code": "20",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Rústico",
    "attributes": {
      "terminacion": "Rústico"
    },
    "clients": [
      "CRUFI"
    ]
  },
  {
    "code": "21",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Aluminio del Uruguay"
    ]
  },
  {
    "code": "22",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Rústico · Con HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Aluminio del Uruguay",
      "Gamorel"
    ]
  },
  {
    "code": "23",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Punto Rojo · Rústico · Sin HT",
    "attributes": {
      "identificacion": "Punto Rojo",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": []
  },
  {
    "code": "24",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Rústico · Exportación · Con HT",
    "attributes": {
      "terminacion": "Rústico",
      "exportacion": "Exportación",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Azucarlito"
    ]
  },
  {
    "code": "25",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Reforzado · Rústico · Con HT",
    "attributes": {
      "modelo": "Mercosur",
      "refuerzo": "Reforzado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "26",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Reforzado Celsius · Rústico · Sin HT",
    "attributes": {
      "modelo": "Mercosur",
      "refuerzo": "Reforzado Celsius",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "27",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "28",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "29",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Citrus · N° 1 · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "identificacion": "N° 1",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Azucitrus"
    ]
  },
  {
    "code": "30",
    "measure": "120 x 112",
    "stock_name": "Pallet · 120 x 112 · Citrus · Rústico · Exportación · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "exportacion": "Exportación",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Frutura Uruguay S.A. BIC"
    ]
  },
  {
    "code": "31",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "32",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "33",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Doble entrada · Cerrado · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "34",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Citrus · Rústico · Sin HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "San Miguel"
    ]
  },
  {
    "code": "35",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Citrus · Reforzado · Rústico · Sin HT",
    "attributes": {
      "modelo": "Citrus",
      "refuerzo": "Reforzado",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "San Miguel"
    ]
  },
  {
    "code": "36",
    "measure": "120 x 130",
    "stock_name": "Pallet · 120 x 130 · Sin corte · Rústico · Sin HT",
    "attributes": {
      "corte-esquina": "Sin corte",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Forestal Oriental"
    ]
  },
  {
    "code": "37",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "38",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "39",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Doble entrada · Cerrado · Rústico",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "40",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Noridel"
    ]
  },
  {
    "code": "41",
    "measure": "120 x 90",
    "stock_name": "Pallet · 120 x 90 · Doble entrada · Cerrado · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "42",
    "measure": "120 x 90",
    "stock_name": "Pallet · 120 x 90 · Doble entrada · Cerrado · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "43",
    "measure": "121 x 103",
    "stock_name": "Pallet · 121 x 103 · Citrus · N° 3 Punto Azul · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "identificacion": "N° 3 Punto Azul",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Azucitrus"
    ]
  },
  {
    "code": "44",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Rústico · Exportación · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "exportacion": "Exportación",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Antonio de Souza e Hijos",
      "Forbel",
      "Frutos de Chapicuy Ltda.",
      "Frutura Uruguay S.A. BIC"
    ]
  },
  {
    "code": "45",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Punto Azul · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "identificacion": "Punto Azul",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Forbel"
    ]
  },
  {
    "code": "46",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Reforzado · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "refuerzo": "Reforzado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Noridel"
    ]
  },
  {
    "code": "47",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Reforzado · Punto Negro · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "refuerzo": "Reforzado",
      "identificacion": "Punto Negro",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Noridel"
    ]
  },
  {
    "code": "48",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Reforzado · N° 6 · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "refuerzo": "Reforzado",
      "identificacion": "N° 6",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Azucitrus"
    ]
  },
  {
    "code": "49",
    "measure": "140 x 120",
    "stock_name": "Pallet · 140 x 120 · Doble entrada · 7 tablas · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "refuerzo": "7 tablas",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "50",
    "measure": "140 x 120",
    "stock_name": "Pallet · 140 x 120 · Doble entrada · 7 tablas · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "refuerzo": "7 tablas",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "51",
    "measure": "140 x 120",
    "stock_name": "Pallet · 140 x 120 · Cerrado · Rústico · Con HT",
    "attributes": {
      "modelo": "Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "52",
    "measure": "145 x 100",
    "stock_name": "Pallet · 145 x 100 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "53",
    "measure": "145 x 100",
    "stock_name": "Pallet · 145 x 100 · Cerrado · Rústico · Con HT",
    "attributes": {
      "modelo": "Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "54",
    "measure": "145 x 80",
    "stock_name": "Pallet · 145 x 80 · Doble entrada · Reforzado · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "refuerzo": "Reforzado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "55",
    "measure": "145 x 80",
    "stock_name": "Pallet · 145 x 80 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "56",
    "measure": "160 x 110",
    "stock_name": "Pallet · 160 x 110 · Simple entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Simple entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "57",
    "measure": "216 x 110",
    "stock_name": "Pallet · 216 x 110 · Simple entrada · 5 tacos · Rústico · Con HT",
    "attributes": {
      "modelo": "Simple entrada",
      "taco": "5 tacos",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    },
    "clients": [
      "Pamer"
    ]
  },
  {
    "code": "58",
    "measure": "216 x 110",
    "stock_name": "Pallet · 216 x 110 · Simple entrada · Taco corrido · Rústico · Sin HT",
    "attributes": {
      "modelo": "Simple entrada",
      "taco": "Taco corrido",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    },
    "clients": [
      "Pamer"
    ]
  }
]
$ecoase_catalog$::jsonb) as item(
  code text, measure text, stock_name text, attributes jsonb, clients jsonb
);

create temp table ecoase_catalog_legacy_map (old_code text, code text) on commit drop;
insert into ecoase_catalog_legacy_map(old_code, code) values
  ('Z1', '7'), ('Z2', '1'), ('Z3', '2'), ('Z4', '37'),
  ('Z5', '38'), ('Z6', '41'), ('Z9', '31'), ('Z10', '50'),
  ('Z11', '54'), ('Z12', '52'), ('Z13', '53'), ('Z14', '56'),
  ('Z15', '57'), ('Z16', '58');

update ecoase_catalog_import c set id = p.id
from ecoase_catalog_legacy_map m join public.products p on p.zeta_code = m.old_code
where c.code = m.code;
update ecoase_catalog_import set id = 'catalogo-' || code where id is null;

-- Libera los códigos anteriores antes de asignar los números nuevos.
update public.products set zeta_code = null
where zeta_code in (select old_code from ecoase_catalog_legacy_map);

insert into public.products (
  id, kind, measure, treatment, requires_treatment, stock_name,
  source_catalog, source_code, stock_active, zeta_code,
  attributes, identity_key, heat_treatment
)
select
  c.id, 'Pallet', c.measure,
  case when c.attributes->>'tratamiento' = 'Con HT' then 'Marcado' else null end,
  coalesce(c.attributes->>'tratamiento' = 'Con HT', false),
  c.stock_name, 'Manual', c.code, true, c.code,
  c.attributes, public.product_identity_key('Pallet', c.measure, c.attributes),
  c.attributes->>'tratamiento'
from ecoase_catalog_import c
on conflict (id) do update set
  kind = excluded.kind,
  measure = excluded.measure,
  treatment = excluded.treatment,
  requires_treatment = excluded.requires_treatment,
  stock_name = excluded.stock_name,
  source_catalog = excluded.source_catalog,
  source_code = excluded.source_code,
  stock_active = excluded.stock_active,
  zeta_code = excluded.zeta_code,
  attributes = excluded.attributes,
  identity_key = excluded.identity_key,
  heat_treatment = excluded.heat_treatment;

update public.products set stock_active = false where zeta_code in ('Z7', 'Z8');
update public.client_products set active = false
where product_id in (select id from public.products where zeta_code in ('Z7', 'Z8'));

-- Conserva los IDs de clientes y corrige sus nombres según la planilla.
update public.clients set name = case name
  when 'Aluminos del Uruguay' then 'Aluminio del Uruguay'
  when 'Cristal PET' then 'Cristalpet'
  when 'Frutos de Chapicuy' then 'Frutos de Chapicuy Ltda.'
  when 'Frutura' then 'Frutura Uruguay S.A. BIC'
  when 'Molinos San Jose' then 'Molinos  San José'
  when 'Sanducitrus' then 'Sanducitrus SRL'
  else name end
where name in ('Aluminos del Uruguay', 'Cristal PET', 'Frutos de Chapicuy',
  'Frutura', 'Molinos San Jose', 'Sanducitrus');

insert into public.clients (id, name, active)
select 'catalogo-cliente-' || md5(names.name), names.name, true
from (
  select distinct jsonb_array_elements_text(clients) as name
  from ecoase_catalog_import
) names
where not exists (select 1 from public.clients c where c.name = names.name);

insert into public.client_products (client_id, product_id, zeta_code, active, display_order)
select clients.id, products.id, c.code, true, c.code::integer - 1
from ecoase_catalog_import c
cross join lateral jsonb_array_elements_text(c.clients) as client_name(name)
join public.clients clients on clients.name = client_name.name
join public.products products on products.id = c.id
on conflict (client_id, product_id) do update set
  zeta_code = excluded.zeta_code,
  active = true,
  display_order = excluded.display_order;

do $verify_catalog$
begin
  if (select count(*) from ecoase_catalog_import) <> 58 then raise exception 'Catálogo incompleto: productos.'; end if;
  if (select count(*) from public.products p join ecoase_catalog_import c on p.id = c.id
      where p.stock_active and p.zeta_code = c.code and p.attributes = c.attributes) <> 58
    then raise exception 'Catálogo incompleto: productos guardados.'; end if;
  if (select count(*) from public.client_products cp join ecoase_catalog_import c on cp.product_id = c.id
      where cp.active) <> 73 then raise exception 'Catálogo incompleto: asociaciones.'; end if;
end; $verify_catalog$;
