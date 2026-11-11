-- Sincroniza PRODUCTOS con «Productos del árbol» (74 filas, 57 tipos compartidos).
-- Fuente: https://docs.google.com/spreadsheets/d/1t2vtQfIDgUP2XMv3STSPnvALK08VFtk2bLF7CnLB-lc/edit?gid=253069878
-- La hoja ya no tiene Espesor ni Exportación. No se infiere ninguno de esos atributos.
create temp table ecoase_catalog_current on commit drop as
select code, measure, stock_name, attributes
from jsonb_to_recordset($catalog$
[
  {
    "code": "1",
    "measure": "100 x 100",
    "stock_name": "Pallet · 100 x 100 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "2",
    "measure": "100 x 100",
    "stock_name": "Pallet · 100 x 100 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "3",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Adium · Rústico",
    "attributes": {
      "modelo": "Adium",
      "terminacion": "Rústico"
    }
  },
  {
    "code": "4",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Mercosur · Rústico · Con HT",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "5",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Mercosur · Rústico · Sin HT",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "6",
    "measure": "100 x 120",
    "stock_name": "Pallet · 100 x 120 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "7",
    "measure": "100 x 80",
    "stock_name": "Pallet · 100 x 80 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "8",
    "measure": "106 x 106",
    "stock_name": "Pallet · 106 x 106 · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "9",
    "measure": "113 x 113",
    "stock_name": "Pallet · 113 x 113 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "10",
    "measure": "115 x 115",
    "stock_name": "Pallet · 115 x 115 · Rústico · Con HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "11",
    "measure": "115 x 115",
    "stock_name": "Pallet · 115 x 115 · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "12",
    "measure": "116 x 116",
    "stock_name": "Pallet · 116 x 116 · Citrus · Cepillado · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Cepillado",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "13",
    "measure": "116,5 x 114",
    "stock_name": "Pallet · 116,5 x 114 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "14",
    "measure": "119 x 106",
    "stock_name": "Pallet · 119 x 106 · Rústico",
    "attributes": {
      "terminacion": "Rústico"
    }
  },
  {
    "code": "15",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Con corte · Rústico",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Rústico",
      "corte-esquina": "Con corte"
    }
  },
  {
    "code": "16",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur 20 mm · Sin corte · Rústico",
    "attributes": {
      "modelo": "Mercosur 20 mm",
      "terminacion": "Rústico",
      "corte-esquina": "Sin corte"
    }
  },
  {
    "code": "17",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Sin corte · Rústico",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Rústico",
      "corte-esquina": "Sin corte"
    }
  },
  {
    "code": "18",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Con corte · Cepillado",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Cepillado",
      "corte-esquina": "Con corte"
    }
  },
  {
    "code": "19",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Mercosur · Con corte · Rebaje en todas las tablas del piso",
    "attributes": {
      "modelo": "Mercosur",
      "terminacion": "Rebaje en todas las tablas del piso",
      "corte-esquina": "Con corte"
    }
  },
  {
    "code": "20",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Rústico",
    "attributes": {
      "terminacion": "Rústico"
    }
  },
  {
    "code": "21",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "22",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Rústico · Con HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "23",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Punto Rojo · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT",
      "identificacion": "Punto Rojo"
    }
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
    }
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
    }
  },
  {
    "code": "27",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "28",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "29",
    "measure": "120 x 100",
    "stock_name": "Pallet · 120 x 100 · Citrus · N° 1 · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT",
      "identificacion": "N° 1"
    }
  },
  {
    "code": "30",
    "measure": "120 x 112",
    "stock_name": "Pallet · 120 x 112 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "31",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "32",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "33",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Doble entrada · Cerrado · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "34",
    "measure": "120 x 120",
    "stock_name": "Pallet · 120 x 120 · Citrus · Rústico · Sin HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
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
    }
  },
  {
    "code": "36",
    "measure": "120 x 130",
    "stock_name": "Pallet · 120 x 130 · Sin corte · Rústico · Sin HT",
    "attributes": {
      "terminacion": "Rústico",
      "tratamiento": "Sin HT",
      "corte-esquina": "Sin corte"
    }
  },
  {
    "code": "37",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "38",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "39",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Doble entrada · Cerrado · Rústico",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico"
    }
  },
  {
    "code": "40",
    "measure": "120 x 80",
    "stock_name": "Pallet · 120 x 80 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "41",
    "measure": "120 x 90",
    "stock_name": "Pallet · 120 x 90 · Doble entrada · Cerrado · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "42",
    "measure": "120 x 90",
    "stock_name": "Pallet · 120 x 90 · Doble entrada · Cerrado · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada · Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "43",
    "measure": "121 x 103",
    "stock_name": "Pallet · 121 x 103 · Citrus · N° 3 Punto Azul · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT",
      "identificacion": "N° 3 Punto Azul"
    }
  },
  {
    "code": "44",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "45",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Punto Azul · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "terminacion": "Rústico",
      "tratamiento": "Con HT",
      "identificacion": "Punto Azul"
    }
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
    }
  },
  {
    "code": "47",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Reforzado · Punto Negro · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "refuerzo": "Reforzado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT",
      "identificacion": "Punto Negro"
    }
  },
  {
    "code": "48",
    "measure": "122 x 102",
    "stock_name": "Pallet · 122 x 102 · Citrus · Reforzado · N° 6 · Rústico · Con HT",
    "attributes": {
      "modelo": "Citrus",
      "refuerzo": "Reforzado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT",
      "identificacion": "N° 6"
    }
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
    }
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
    }
  },
  {
    "code": "51",
    "measure": "140 x 120",
    "stock_name": "Pallet · 140 x 120 · Cerrado · Rústico · Con HT",
    "attributes": {
      "modelo": "Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "52",
    "measure": "145 x 100",
    "stock_name": "Pallet · 145 x 100 · Doble entrada · Rústico · Con HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "53",
    "measure": "145 x 100",
    "stock_name": "Pallet · 145 x 100 · Cerrado · Rústico · Con HT",
    "attributes": {
      "modelo": "Cerrado",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
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
    }
  },
  {
    "code": "55",
    "measure": "145 x 80",
    "stock_name": "Pallet · 145 x 80 · Doble entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Doble entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "56",
    "measure": "160 x 110",
    "stock_name": "Pallet · 160 x 110 · Simple entrada · Rústico · Sin HT",
    "attributes": {
      "modelo": "Simple entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  },
  {
    "code": "57",
    "measure": "216 x 110",
    "stock_name": "Pallet · 216 x 110 · Simple entrada · 5 tacos · Rústico · Con HT",
    "attributes": {
      "taco": "5 tacos",
      "modelo": "Simple entrada",
      "terminacion": "Rústico",
      "tratamiento": "Con HT"
    }
  },
  {
    "code": "58",
    "measure": "216 x 110",
    "stock_name": "Pallet · 216 x 110 · Simple entrada · Taco corrido · Rústico · Sin HT",
    "attributes": {
      "taco": "Taco corrido",
      "modelo": "Simple entrada",
      "terminacion": "Rústico",
      "tratamiento": "Sin HT"
    }
  }
]
$catalog$::jsonb) as entry(code text, measure text, stock_name text, attributes jsonb);

do $verify_before$
begin
  if (select count(*) from ecoase_catalog_current) <> 57 then
    raise exception 'La fuente debe contener 57 tipos de producto.';
  end if;
  if (select count(*) from public.products where source_catalog = 'Manual' and stock_active) <> 58 then
    raise exception 'El catálogo actual cambió; revisar antes de sincronizar.';
  end if;
  if (select count(*) from public.products p join ecoase_catalog_current c on p.zeta_code = c.code where p.source_catalog = 'Manual' and p.stock_active) <> 57 then
    raise exception 'Falta un código existente del catálogo.';
  end if;
  if (select count(*) from public.client_products cp join public.products p on p.id = cp.product_id
      where p.zeta_code = '24' and cp.active) <> 1 then
    raise exception 'La asociación del código 24 cambió; revisar la fusión.';
  end if;
  if exists (select 1 from public.order_lines where product_id = (select id from public.products where zeta_code = '24'))
    or exists (select 1 from public.order_lines where client_product_id in (select id from public.client_products where product_id = (select id from public.products where zeta_code = '24')))
    or exists (select 1 from public.client_product_consumption where product_id = (select id from public.products where zeta_code = '24'))
    or exists (select 1 from public.production_capacity_rules where product_id = (select id from public.products where zeta_code = '24'))
    or exists (select 1 from public.production_daily_overrides where product_id = (select id from public.products where zeta_code = '24'))
    or exists (select 1 from public.stock_import_rows where product_id = (select id from public.products where zeta_code = '24'))
    or exists (select 1 from public.stock_movements where product_id = (select id from public.products where zeta_code = '24'))
    or exists (select 1 from public.stock_reservations where product_id = (select id from public.products where zeta_code = '24'))
    or exists (select 1 from public.treatment_batches where product_id = (select id from public.products where zeta_code = '24')) then
    raise exception 'El código 24 tiene actividad; revisar la fusión.';
  end if;
end $verify_before$;

-- Las filas 35, 36 y 38 pasan a compartir el mismo producto y código 22.
update public.client_products
set product_id = (select id from public.products where zeta_code = '22'),
    zeta_code = '22'
where product_id = (select id from public.products where zeta_code = '24');

delete from public.products where zeta_code = '24' and source_catalog = 'Manual';

update public.products p
set measure = c.measure,
    stock_name = c.stock_name,
    attributes = c.attributes,
    identity_key = public.product_identity_key(p.kind, c.measure, c.attributes),
    requires_treatment = coalesce(c.attributes->>'tratamiento' = 'Con HT', false),
    heat_treatment = c.attributes->>'tratamiento'
from ecoase_catalog_current c
where p.zeta_code = c.code and p.source_catalog = 'Manual' and p.stock_active;

-- El editor de niveles ofrece sólo las ocho columnas actuales y sus valores.
delete from public.product_levels where id in ('espesor', 'exportacion');
update public.product_levels l
set label = c.label, position = c.position, options = c.options, updated_at = now()
from jsonb_to_recordset($levels$
[
  {
    "id": "medida",
    "label": "Medida",
    "options": [
      "100 x 80",
      "100 x 100",
      "100 x 120",
      "106 x 106",
      "113 x 113",
      "115 x 115",
      "116 x 116",
      "116,5 x 114",
      "119 x 106",
      "120 x 80",
      "120 x 90",
      "120 x 100",
      "120 x 112",
      "120 x 120",
      "120 x 130",
      "121 x 103",
      "122 x 102",
      "140 x 120",
      "145 x 80",
      "145 x 100",
      "160 x 110",
      "216 x 110"
    ],
    "position": 0
  },
  {
    "id": "modelo",
    "label": "Modelo",
    "options": [
      "Mercosur",
      "Simple entrada",
      "Doble entrada",
      "Cerrado",
      "Citrus",
      "Adium",
      "Mercosur 20 mm",
      "Doble entrada · Cerrado"
    ],
    "position": 1
  },
  {
    "id": "taco",
    "label": "Taco",
    "options": [
      "5 tacos",
      "Taco corrido",
      "Con taco"
    ],
    "position": 2
  },
  {
    "id": "refuerzo",
    "label": "Refuerzo",
    "options": [
      "Liviano",
      "Reforzado",
      "7 tablas",
      "Reforzado Celsius"
    ],
    "position": 3
  },
  {
    "id": "identificacion",
    "label": "Identificación",
    "options": [
      "N° 1",
      "N° 3",
      "N° 6",
      "Punto Azul",
      "Punto Rojo",
      "Punto Negro",
      "N° 3 Punto Azul"
    ],
    "position": 4
  },
  {
    "id": "corte-esquina",
    "label": "Corte esquina",
    "options": [
      "Con corte",
      "Sin corte",
      "Con corte en maquina"
    ],
    "position": 5
  },
  {
    "id": "terminacion",
    "label": "Terminación",
    "options": [
      "Cepillado",
      "Rebaje en todas las tablas del piso",
      "Rústico"
    ],
    "position": 6
  },
  {
    "id": "tratamiento",
    "label": "Tratamiento",
    "options": [
      "Sin HT",
      "Con HT"
    ],
    "position": 7
  }
]
$levels$::jsonb) as c(id text, label text, position integer, options jsonb)
where l.id = c.id;

-- Ningún atributo faltante en la hoja debe generar HT de forma automática.
create or replace function public.clean_product_attributes(p_attributes jsonb)
returns jsonb language plpgsql set search_path to 'public' as $function$
declare v jsonb;
begin
  select coalesce(jsonb_object_agg(e.key, btrim(e.value)), '{}'::jsonb) into v
  from jsonb_each_text(coalesce(p_attributes, '{}'::jsonb)) e where btrim(e.value) <> '';
  if v ? 'tratamiento' and v->>'tratamiento' <> 'Sin HT' and v->>'tratamiento' not like 'Con HT%' then
    raise exception 'El tratamiento tiene que ser Sin HT o Con HT.';
  end if;
  return v;
end; $function$;

do $verify_after$
begin
  if (select count(*) from public.products p join ecoase_catalog_current c on p.zeta_code = c.code
      where p.source_catalog = 'Manual' and p.stock_active
        and p.measure = c.measure and p.stock_name = c.stock_name and p.attributes = c.attributes) <> 57 then
    raise exception 'Hay productos que no coinciden con la planilla.';
  end if;
  if (select count(*) from public.product_levels) <> 8 then
    raise exception 'La clasificación debe tener ocho niveles.';
  end if;
  if (select count(*) from public.client_products cp join public.products p on p.id = cp.product_id
      where cp.active and p.source_catalog = 'Manual' and p.stock_active)
      + (select count(*) from public.products p where p.source_catalog = 'Manual' and p.stock_active
         and not exists (select 1 from public.client_products cp where cp.product_id = p.id and cp.active)) <> 74 then
    raise exception 'El catálogo debe representar 74 filas de la planilla.';
  end if;
end $verify_after$;
