insert into public.providers (id, name, type, supplies) values
  ('blanc', 'Blanc', 'Aserradero', 'Pallets y mercadería de terceros'),
  ('mirasol', 'Mirasol', 'Aserradero', 'Pallets y mercadería de terceros'),
  ('linares', 'Linares', 'Transporte', 'Traslado y entrega de pedidos'),
  ('milton', 'Milton', 'Transporte', 'Traslado y entrega de pedidos'),
  ('matias', 'Matías', 'Transporte', 'Traslado y entrega de pedidos')
on conflict (id) do nothing;

-- Datos ficticios para visualizar clientes completos en el entorno de demostración.
-- Solo completa campos vacíos para no sobrescribir información real.
with demo(id, address, department) as (
  values
    ('cliente-9f536174f0d5', 'Camino Industrial Ficticio 101', 'Canelones'),
    ('source-aluminos-del-uruguay', 'Avenida Fabril Ficticia 220', 'Montevideo'),
    ('source-avanti', 'Camino del Parque Ficticio 45', 'San José'),
    ('source-azucarlito', 'Ruta Ficticia 3 km 190', 'Paysandú'),
    ('cliente-1da1a2ba9ad8', 'Camino Citrícola Ficticio 312', 'Salto'),
    ('source-chacra-anaranjado', 'Camino Rural Ficticio 401', 'Salto'),
    ('source-chacra-azul', 'Camino Rural Ficticio 402', 'Salto'),
    ('source-chacra-blanco', 'Camino Rural Ficticio 403', 'Paysandú'),
    ('source-chacra-chapicuy', 'Ruta Ficticia 3 km 455', 'Paysandú'),
    ('source-chacra-rojo', 'Camino Rural Ficticio 404', 'Río Negro'),
    ('source-conaprole', 'Avenida Logística Ficticia 510', 'Montevideo'),
    ('source-cristal-pet', 'Camino de las Industrias Ficticio 620', 'Canelones'),
    ('cliente-c6c5e600200e', 'Ruta Forestal Ficticia 5 km 78', 'Tacuarembó'),
    ('source-fricasa', 'Camino Frigorífico Ficticio 730', 'Tacuarembó'),
    ('cliente-bfd586dd7050', 'Ruta Frutícola Ficticia 2 km 41', 'Río Negro'),
    ('cliente-04b9246c2858', 'Camino de la Granja Ficticio 815', 'Canelones'),
    ('source-molinos-san-jose', 'Avenida del Molino Ficticia 920', 'San José'),
    ('source-noridel', 'Camino Comercial Ficticio 1030', 'Montevideo'),
    ('cliente-cd2057842651', 'Ruta Industrial Ficticia 12 km 64', 'Soriano'),
    ('cliente-3c0a1b2929c6', 'Camino Pontevedra Ficticio 1140', 'Canelones'),
    ('cliente-173a1075f43d', 'Avenida Química Ficticia 1250', 'Montevideo'),
    ('source-saint-gobain', 'Camino de la Planta Ficticio 1360', 'Canelones'),
    ('cliente-a4955f8e100e', 'Ruta Citrícola Ficticia 3 km 87', 'Salto')
)
update public.clients c
set
  address = case
    when nullif(btrim(coalesce(c.address, '')), '') is null then demo.address
    else c.address
  end,
  department = case
    when nullif(btrim(coalesce(c.department, '')), '') is null then demo.department
    else c.department
  end
from demo
where c.id = demo.id
  and (
    nullif(btrim(coalesce(c.address, '')), '') is null
    or nullif(btrim(coalesce(c.department, '')), '') is null
  );

insert into public.orders (
  id, reference, client, product, requested, delivered, pending, status, status_label, stage,
  planned_date, transport, supply, preparation, logistics, delivery, action, remittance, source
) values
  ('frutura-74', 'Plan 74', 'Frutura', 'Pallet 122 × 102', 600, 0, 600, 'bloqueado', 'Bloqueado', 'negociacion', '2026-08-14', 'Linares', 'Los pallets previstos no llegaron', 'Marcado requerido', 'Viaje con Linares detenido', '0 de 600 entregados', 'Reprogramar la entrega cuando ingrese la mercadería.', null, 'Plan semanal · fila 74'),
  ('proquimur-63', 'Plan 63', 'Proquimur', 'Pallet 120 × 100 Mercosur', 600, 0, 600, 'coordinacion', 'En coordinación', 'negociacion', '2026-08-11', 'Linares', '600 en stock Palbin · 300 marcados y 300 sin marcar', '300 con HT · 300 sin HT', 'Linares asignado', 'Pedido en coordinación', 'Coordinar fecha con el cliente y reservar el viaje.', null, 'Plan semanal · fila 63 / Stock Palbin · fila 19'),
  ('pamer-184833', 'Orden 184833', 'Pamer', 'Cinco líneas de pallets', 500, 500, 0, 'completado', 'Completado', 'completado', '2026-07-28', 'No registrado', 'Orden despachada en cinco líneas', '380 sin HT · 120 con HT', 'Remito 603', '500 entregados · saldo 0', 'Pedido cerrado.', '603', 'Órdenes Pamer · filas 4–8'),
  ('pamer-641', 'Remito 641', 'Pamer', 'Seis líneas de pallets', 360, 360, 0, 'completado', 'Completado', 'completado', '2026-08-12', 'Propio', 'Seis líneas despachadas', '200 sin HT · 160 con HT', 'Transporte propio · remito 641', '360 entregados · saldo 0', 'Pedido cerrado.', '641', 'Órdenes Pamer · filas 10–15'),
  ('afb-62', 'Plan 62', 'AFB', 'Pallet 120 × 100 Mercosur cepillado', 600, 600, 0, 'completado', 'Completado', 'completado', '2026-08-11', 'Linares', 'Pedido completo', 'Mercosur cepillado', 'Linares · un viaje', '600 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 62'),
  ('granja-pocha-65', 'Plan 65', 'Granja Pocha', 'Punto rojo y Mercosur exportación', 600, 600, 0, 'completado', 'Completado', 'completado', '2026-08-12', 'Linares', 'Dos líneas completas', '400 punto rojo · 200 Mercosur exportación', 'Linares · un viaje', '600 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 65'),
  ('forestal-66', 'Plan 66', 'Forestal Oriental', 'Pallet 120 × 130', 50, 50, 0, 'completado', 'Completado', 'completado', '2026-08-12', 'Matías', 'Pedido completo', 'Sin HT · sin corte de esquina · sin rebaje', 'Matías · un viaje', '50 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 66'),
  ('frutura-67', 'Plan 67', 'Frutura', 'Pallet 122 × 102', 518, 518, 0, 'completado', 'Completado', 'completado', '2026-08-12', 'Milton', 'Pedido completo', 'Pallet 122 × 102', 'Milton · un viaje', '518 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 67'),
  ('frutura-69', 'Plan 69', 'Frutura', 'Pallet 120 × 100', 600, 600, 0, 'completado', 'Completado', 'completado', '2026-08-13', 'Linares', 'Pedido completo', 'Pallet 120 × 100', 'Linares · un viaje', '600 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 69'),
  ('azucitrus-75', 'Plan 75', 'Azucitrus', 'Pallet 120 × 100', 600, 600, 0, 'completado', 'Completado', 'completado', '2026-08-14', 'Linares', 'Pedido completo', 'Pallet 120 × 100', 'Linares · un viaje', '600 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 75'),
  ('san-miguel-76', 'Plan 76', 'San Miguel', 'Dos medidas de pallets', 360, 360, 0, 'completado', 'Completado', 'completado', '2026-08-14', 'Milton', 'Dos líneas completas', '250 de 120 × 120 · 110 de 116,5 × 114', 'Milton · un viaje', '360 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 76'),
  ('pontevedra-79', 'Plan 79', 'Pontevedra', 'Pallet Mercosur con HT', 150, 150, 0, 'completado', 'Completado', 'completado', '2026-08-15', 'Matías', 'Pedido completo', 'Mercosur con HT', 'Matías · un viaje', '150 entregados', 'Pedido cerrado.', null, 'Plan semanal · fila 79')
on conflict (id) do nothing;

insert into public.order_lines (id, order_id, product, quantity, preparation, position) values
  ('frutura-74-1', 'frutura-74', 'Pallet 122 × 102', 600, 'Marcado', 0),
  ('proquimur-63-1', 'proquimur-63', 'Pallet 120 × 100 Mercosur', 300, 'Con HT', 0),
  ('proquimur-63-2', 'proquimur-63', 'Pallet 120 × 100 Mercosur', 300, 'Sin HT', 1),
  ('184833-1', 'pamer-184833', 'Pallet 100 × 100 doble entrada', 100, 'Sin HT', 0),
  ('184833-2', 'pamer-184833', 'Pallet 100 × 100', 20, 'Con HT', 1),
  ('184833-3', 'pamer-184833', 'Pallet 120 × 80 doble entrada', 180, 'Sin HT', 2),
  ('184833-4', 'pamer-184833', 'Pallet 120 × 130', 100, 'Sin HT', 3),
  ('184833-5', 'pamer-184833', 'Pallet 100 × 120 Mercosur', 100, 'Con HT', 4),
  ('641-1', 'pamer-641', 'Pallet 216 × 110 simple', 100, 'Con HT', 0),
  ('641-2', 'pamer-641', 'Pallet 216 × 110 simple', 41, 'Sin HT', 1),
  ('641-3', 'pamer-641', 'Pallet 100 × 80', 100, 'Sin HT', 2),
  ('641-4', 'pamer-641', 'Pallet 100 × 100', 59, 'Sin HT', 3),
  ('641-5', 'pamer-641', 'Pallet 120 × 80', 20, 'Con HT', 4),
  ('641-6', 'pamer-641', 'Pallet 120 × 90 cerrado', 40, 'Con HT', 5),
  ('afb-62-1', 'afb-62', 'Pallet 120 × 100 Mercosur cepillado', 600, null, 0),
  ('pocha-65-1', 'granja-pocha-65', 'Pallet punto rojo 120 × 100', 400, null, 0),
  ('pocha-65-2', 'granja-pocha-65', 'Pallet Mercosur exportación 120 × 100', 200, null, 1),
  ('forestal-66-1', 'forestal-66', 'Pallet 120 × 130', 50, 'Sin HT', 0),
  ('frutura-67-1', 'frutura-67', 'Pallet 122 × 102', 518, null, 0),
  ('frutura-69-1', 'frutura-69', 'Pallet 120 × 100', 600, null, 0),
  ('azucitrus-75-1', 'azucitrus-75', 'Pallet 120 × 100', 600, null, 0),
  ('san-miguel-76-1', 'san-miguel-76', 'Pallet 120 × 120', 250, null, 0),
  ('san-miguel-76-2', 'san-miguel-76', 'Pallet 116,5 × 114', 110, null, 1),
  ('pontevedra-79-1', 'pontevedra-79', 'Pallet Mercosur', 150, 'Con HT', 0)
on conflict (id) do nothing;
