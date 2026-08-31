import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la migración modela producción, viajes e historial inmutable", async () => {
  const sql = await read("supabase/migrations/20260829195920_shipments_calendar_logistics.sql");
  for (const table of ["production_allocations", "shipments", "shipment_lines", "shipment_events"]) assert.match(sql, new RegExp(`create table public\\.${table}`));
  assert.match(sql, /shipment_events_no_update/);
  assert.match(sql, /El historial de viajes es inmutable/);
});

test("el remito y la dirección son obligatorios desde pronto", async () => {
  const sql = await read("supabase/migrations/20260829195920_shipments_calendar_logistics.sql");
  assert.match(sql, /status in \('planned','cancelled'\) or nullif\(trim\(remittance\)/);
  assert.match(sql, /status in \('planned','cancelled'\) or nullif\(trim\(delivery_address_snapshot\)/);
  assert.match(sql, /Ese remito ya pertenece a otro viaje/);
});

test("las mutaciones operativas solo se exponen al servidor", async () => {
  const sql = await read("supabase/migrations/20260829195920_shipments_calendar_logistics.sql");
  for (const fn of ["create_operation_order_v4", "replace_production_allocations_v1", "create_shipment_v1", "update_planned_shipment_v1", "transition_shipment_v1", "reschedule_shipment_v1"]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`));
  }
});

test("existen las rutas para distribuir producción y operar viajes", async () => {
  const sources = await Promise.all([
    read("app/api/order-lines/[id]/production-allocations/route.ts"),
    read("app/api/orders/[id]/shipments/route.ts"),
    read("app/api/shipments/[id]/route.ts"),
    read("app/api/shipments/[id]/transition/route.ts"),
    read("app/api/shipments/[id]/reschedule/route.ts"),
  ]);
  assert.match(sources.join("\n"), /replaceProductionAllocations/);
  assert.match(sources.join("\n"), /transitionShipment/);
  assert.match(sources.join("\n"), /rescheduleShipment/);
});

test("el calendario muestra producto, marcado, transporte, remito y capacidad", async () => {
  const [calendar, capacity] = await Promise.all([read("app/components/OperationsCalendar.tsx"), read("app/capacity.ts")]);
  assert.match(calendar, /productSummary/);
  assert.match(calendar, /treatmentSummary/);
  assert.match(calendar, /Número de remito/);
  assert.match(calendar, /capacityLabel/);
  assert.match(calendar, /tripsMissing/);
  assert.match(capacity, /productionAllocations/);
  assert.match(capacity, /deliveryShipments/);
});

test("el diálogo de remito usa el sistema visual operativo", async () => {
  const [calendar, styles] = await Promise.all([read("app/components/OperationsCalendar.tsx"), read("app/globals.css")]);
  for (const text of ["Cargar remito", "Guardar remito y dejar pronto", "Cambio de estado", "Obligatorio", "Opcional"]) assert.match(calendar, new RegExp(text));
  assert.match(calendar, /order-operation-modal shipment-transition-modal/);
  assert.match(calendar, /order-operation-form shipment-transition-form/);
  assert.match(styles, /\.shipment-transition-summary/);
  assert.match(styles, /\.shipment-transition-form \.modal-actions/);
});

test("el calendario resume el riesgo y delega el detalle a stock", async () => {
  const calendar = await read("app/components/OperationsCalendar.tsx");
  assert.match(calendar, /Alerta de stock/);
  assert.match(calendar, /\/stock\?riesgo=alerta/);
  assert.doesNotMatch(calendar, /stockRisk\.message/);
});

test("el calendario permite cambiar entre semana y mes y arrastrar entregas", async () => {
  const calendar = await read("app/components/OperationsCalendar.tsx");
  assert.match(calendar, /CalendarViewMode = "week" \| "month"/);
  assert.match(calendar, /draggable=\{movable\}/);
  assert.match(calendar, /onDragOver/);
  assert.match(calendar, /onDrop/);
  assert.match(calendar, /Confirmar cambio de fecha/);
  assert.match(calendar, /Vista del calendario/);
});

test("la capacidad logística usa cupos de viaje y no palets libres", async () => {
  const [calendar, capacity, migration, documentation] = await Promise.all([
    read("app/components/OperationsCalendar.tsx"),
    read("app/capacity.ts"),
    read("supabase/migrations/20260830235500_logistics_trip_slots.sql"),
    read("../Informacion/devolucion-control-operativo/03-pedidos-calendario-logistica.md"),
  ]);
  assert.match(calendar, /Cupos sin configurar/);
  assert.match(calendar, /Configurar cupos/);
  assert.doesNotMatch(calendar, /palets libres/i);
  assert.doesNotMatch(calendar, /day-free-count/);
  assert.match(capacity, /tripCapacity/);
  assert.match(capacity, /tripsCommitted/);
  assert.match(migration, /trip_capacity/);
  assert.match(migration, /upsert_transport_trip_adjustment_v1/);
  assert.match(documentation, /no se convierten automáticamente en camiones/i);
});
