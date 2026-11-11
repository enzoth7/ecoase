import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLineAvailability, classifyPallet, estimatedTransportVolumeM3, estimateDailyClientOrders, loadWarnings, palletFootprintM2, palletVolumeM3, tripWarnings } from "../app/logistics.ts";

test("estima entregas en una jornada contando la vuelta entre pedidos", () => {
  assert.equal(estimateDailyClientOrders(1.85, 60), 5);
  assert.equal(estimateDailyClientOrders(1.85, 0), 6);
  assert.equal(estimateDailyClientOrders(24, 60), 0);
  assert.equal(estimateDailyClientOrders(undefined, 60), undefined);
  assert.equal(estimateDailyClientOrders(1.85, undefined), undefined);
  assert.equal(estimateDailyClientOrders(0, 60), 24);
  assert.equal(estimateDailyClientOrders(0, 0), undefined);
});

test("clasifica pallets por superficie hasta 1,20 m² y permite excepciones", () => {
  const product = (measure) => ({ kind: "Pallet", measure });
  assert.equal(classifyPallet(product("120 × 100")), "small");
  assert.equal(classifyPallet(product("100 x 120")), "small");
  assert.equal(classifyPallet(product("150 x 80")), "small");
  assert.equal(classifyPallet(product("145 × 80")), "small");
  assert.equal(classifyPallet(product("122 × 102")), "large");
  assert.equal(classifyPallet(product("100 x 121")), "large");
  assert.equal(classifyPallet(product("220 × 117")), "large");
  assert.equal(classifyPallet(product("120 × 120")), "large");
  assert.equal(classifyPallet(product("216 × 110")), "large");
  assert.equal(classifyPallet(product("116,5 x 114")), "large");
  assert.equal(classifyPallet(product("122 × 102"), "small"), "small");
  assert.equal(classifyPallet(product("120 × 100"), "large"), "large");
  assert.equal(classifyPallet(product("120 × 100"), "unclassified"), "unclassified");
  assert.equal(classifyPallet(product("0 x 120")), "unclassified");
  assert.equal(classifyPallet(product("sin medida")), "unclassified");
});

test("estima volumen de cargas completas con referencias y 10 cm de alto", () => {
  assert.equal(palletFootprintM2("120 x 100"), 1.2);
  assert.equal(palletFootprintM2("220 × 117"), 2.574);
  assert.equal(palletFootprintM2("sin medida"), undefined);
  assert.equal(palletVolumeM3({ measure: "120 x 100" }), 0.12);
  assert.equal(palletVolumeM3({ measure: "120 x 100", heightCm: 12 }), 0.144);
  const howo = estimatedTransportVolumeM3(638, 273);
  assert.ok(howo);
  assert.ok(Math.abs(howo.lower - 70.2702) < 0.00001);
  assert.ok(Math.abs(howo.upper - 76.56) < 0.00001);
  assert.equal(estimatedTransportVolumeM3(undefined, 273), undefined);
  assert.equal(estimatedTransportVolumeM3(638, -1), undefined);
});

test("la mezcla de tamaños no genera una advertencia de capacidad", () => {
  assert.deepEqual(loadWarnings({ small: 500, large: 100, unclassified: 0 }), []);
  assert.deepEqual(loadWarnings({ small: 639, large: 0, unclassified: 0 }), []);
  assert.match(loadWarnings({ small: 0, large: 0, unclassified: 1 })[0], /sin tamaño/);
});

test("reconcilia una línea sin contar HT dos veces", () => {
  const order = { id: "o1", lines: [{ id: "l1", productId: "p1", product: "Pallet", quantity: 500 }], shipments: [] };
  const stock = [{ product: { id: "p1" }, ready: 180, pending: 120, available: 180, reserved: 0 }];
  const movements = [
    { orderLineId: "l1", movementType: "production_receipt", stockState: "ready", quantity: 180 },
    { orderLineId: "l1", movementType: "production_receipt", stockState: "pending_treatment", quantity: 120 },
  ];
  const first = calculateLineAvailability([order], stock, movements, [])[0];
  assert.deepEqual([first.readyAttributed, first.pendingHT, first.unproduced, first.unassigned], [180, 120, 200, 0]);
  stock[0].ready = 240; stock[0].pending = 60; stock[0].available = 240;
  const afterHT = calculateLineAvailability([order], stock, movements, [{ orderLineId: "l1", quantity: 60, status: "posted" }])[0];
  assert.deepEqual([afterHT.readyAttributed, afterHT.pendingHT, afterHT.unproduced, afterHT.unassigned], [240, 60, 200, 0]);
  assert.equal(afterHT.readyAttributed + afterHT.pendingHT + afterHT.unproduced + afterHT.unassigned, afterHT.pending);
  stock[0].ready = 180; stock[0].pending = 120; stock[0].available = 180;
  const reversed = calculateLineAvailability([order], stock, movements, [
    { orderLineId: "l1", quantity: 60, status: "posted" },
    { orderLineId: "l1", quantity: 60, status: "reversal" },
  ])[0];
  assert.deepEqual([reversed.readyAttributed, reversed.pendingHT], [180, 120]);
});

test("distribuye stock físico compartido sin atribuirlo dos veces", () => {
  const orders = ["a", "b"].map((id) => ({ id, lines: [{ id, productId: "p1", product: "Pallet", quantity: 10 }], shipments: [] }));
  const stock = [{ product: { id: "p1" }, ready: 12, pending: 0, available: 12, reserved: 0 }];
  const movements = ["a", "b"].map((id) => ({ orderLineId: id, movementType: "production_receipt", stockState: "ready", quantity: 8 }));
  const result = calculateLineAvailability(orders, stock, movements, []);
  assert.equal(result.reduce((sum, line) => sum + line.readyAttributed, 0), 12);
  assert.equal(result.reduce((sum, line) => sum + line.generalAssignable, 0), 0);
  assert.ok(result.every((line) => line.readyAttributed + line.generalAssignable + line.pendingHT + line.unproduced + line.unassigned === line.pending));
  const general = calculateLineAvailability(orders, [{ ...stock[0], ready: 20, available: 20 }], [], []);
  assert.equal(general.reduce((sum, line) => sum + line.generalAssignable, 0), 20);
  assert.equal(general.reduce((sum, line) => sum + line.readyAttributed, 0), 0);
  assert.ok(general.every((line) => line.readyAttributed + line.generalAssignable + line.pendingHT + line.unproduced + line.unassigned === line.pending));
});

test("avisa solapamientos del vehículo y del chofer sin fijar número de vueltas", () => {
  const run = { id: 2, vehicleId: "howo", driverId: "susalla", plannedDate: "2026-11-10",
    plannedStartAt: "2026-11-10T14:00:00Z", plannedEndAt: "2026-11-10T17:00:00Z", destinationAddress: "Ruta 3",
    destinationPrecision: "exact", status: "planned" };
  const other = { ...run, id: 1, plannedStartAt: "2026-11-10T13:00:00Z", plannedEndAt: "2026-11-10T15:00:00Z" };
  const warnings = tripWarnings(run, [other], { originPrecision: "exact", shiftStart: "08:00", shiftEnd: "18:00" });
  assert.ok(warnings.some((item) => item.includes("vehículo")));
  assert.ok(warnings.some((item) => item.includes("chofer")));
  const withoutShift = tripWarnings(run, [], { originPrecision: "approximate" });
  assert.ok(!withoutShift.some((item) => item.includes("Faltan horarios") || item.includes("ubicación")));
});
