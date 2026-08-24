import assert from "node:assert/strict";
import test from "node:test";
import { getOrderStage, orders, products, providers } from "../app/data.ts";
import { buildCapacitySnapshot } from "../app/capacity.ts";

test("separa los pedidos activos del historial", () => {
  assert.equal(orders.length, 12);
  assert.equal(orders.filter((order) => getOrderStage(order) !== "completado").length, 2);
  assert.equal(orders.filter((order) => getOrderStage(order) === "completado").length, 10);
});

test("distingue proveedores de aserradero y transporte", () => {
  assert.deepEqual(providers.map((provider) => [provider.name, provider.type]), [
    ["Blanc", "Aserradero"],
    ["Mirasol", "Aserradero"],
    ["Linares", "Transporte"],
    ["Milton", "Transporte"],
    ["Matías", "Transporte"],
  ]);
});

test("conserva una sola fila por medida y tipo", () => {
  const productKeys = products.map((product) => `${product.kind}|${product.measure ?? "sin medida"}`);
  assert.equal(new Set(productKeys).size, products.length);
  assert.ok(products.some((product) => product.measure === "120 × 100" && product.treatment === "Marcado y HT"));
  assert.ok(products.every((product) => Object.keys(product).every((field) => ["id", "kind", "measure", "treatment"].includes(field))));
});

test("cada pedido reconcilia pedido, entrega y saldo", () => {
  for (const order of orders) {
    assert.equal(order.requested, order.delivered + order.pending, order.id);
    assert.equal(order.requested, order.lines.reduce((total, line) => total + line.quantity, 0), order.id);
    assert.ok(order.supply.length > 0, `${order.id}: abastecimiento`);
    assert.ok(order.preparation.length > 0, `${order.id}: preparación`);
    assert.ok(order.logistics.length > 0, `${order.id}: logística`);
    assert.ok(order.delivery.length > 0, `${order.id}: entrega`);
    assert.ok(order.source.length > 0, `${order.id}: fuente`);
  }
});

test("Pamer 184833 conserva las cinco líneas y el remito 603", () => {
  const order = orders.find((item) => item.id === "pamer-184833");
  assert.ok(order);
  assert.equal(order.requested, 500);
  assert.equal(order.delivered, 500);
  assert.equal(order.pending, 0);
  assert.equal(order.remittance, "603");
  assert.equal(order.lines.length, 5);
  assert.match(order.source, /filas 4–8/);
});

test("Frutura mantiene los 600 pallets pendientes", () => {
  const order = orders.find((item) => item.id === "frutura-74");
  assert.ok(order);
  assert.equal(getOrderStage(order), "produccion");
  assert.equal(order.requested, 600);
  assert.equal(order.pending, 600);
  assert.match(order.supply, /no llegaron/i);
  assert.match(order.source, /fila 74/);
});

test("Proquimur separa preparación, stock y transporte", () => {
  const order = orders.find((item) => item.id === "proquimur-63");
  assert.ok(order);
  assert.equal(getOrderStage(order), "produccion");
  assert.deepEqual(order.lines.map((line) => [line.quantity, line.preparation]), [
    [300, "Con HT"],
    [300, "Sin HT"],
  ]);
  assert.match(order.supply, /300 marcados y 300 sin marcar/i);
  assert.equal(order.transport, "Linares");
  assert.match(order.source, /fila 63/);
});

test("el modelo operativo no contiene texto de validación", () => {
  const serialized = JSON.stringify({ orders, providers });
  assert.doesNotMatch(serialized, /piloto|qué falta confirmar|pregunta para|casos para validar|modelo completo|no confirmado/i);
});

test("la capacidad usa reglas exactas y respeta ajustes manuales", () => {
  const snapshot = buildCapacitySnapshot({
    from: "2026-08-24", to: "2026-08-24", providers, orders: [],
    rules: [{ operation: "assembly", peopleCount: 5, palletCapacity: 300 }],
    internalDefaults: [
      { operation: "assembly", peopleCount: 6 },
      { operation: "marking", peopleCount: 6, manualCapacity: 240 },
    ],
    externalDefaults: [], transportDefaults: [], adjustments: [],
  });
  assert.equal(snapshot.days[0].internalProduction.find((item) => item.operation === "assembly").capacity, undefined);
  assert.equal(snapshot.days[0].internalProduction.find((item) => item.operation === "marking").capacity, 240);
});

test("pedidos internos, externos e importados reservan donde corresponde", () => {
  const base = { reference: "", delivered: 0, pending: 100, dateLabel: "", supply: "", preparation: "", logistics: "", delivery: "", action: "", lines: [], source: "" };
  const capacityOrders = [
    { ...base, id: "internal", client: "Uno", product: "Pallet", requested: 100, stage: "produccion", plannedDate: "2026-08-25", transport: "Interno", transportSource: "internal", productionSource: "internal", productionDate: "2026-08-24", requiredOperations: ["assembly", "ht"] },
    { ...base, id: "external", client: "Dos", product: "Pallet", requested: 80, stage: "pospuesto", plannedDate: "2026-08-25", transport: "Linares", transportSource: "external", transportProviderId: "linares", productionSource: "sawmill", producerProviderId: "blanc", productionDate: "2026-08-24", requiredOperations: ["assembly"] },
    { ...base, id: "import", client: "Tres", product: "Pallet", requested: 70, stage: "reorganizando", plannedDate: "2026-08-25", transport: "Interno", transportSource: "internal", productionSource: "import", importArrivalDate: "2026-08-24", requiredOperations: ["assembly"] },
    { ...base, id: "cancelled", client: "Cuatro", product: "Pallet", requested: 999, stage: "cancelado", plannedDate: "2026-08-25", transport: "Interno", transportSource: "internal", productionSource: "internal", productionDate: "2026-08-24", requiredOperations: ["assembly"] },
  ];
  const snapshot = buildCapacitySnapshot({
    from: "2026-08-24", to: "2026-08-25", providers, orders: capacityOrders,
    rules: [{ operation: "assembly", peopleCount: 5, palletCapacity: 120 }, { operation: "ht", peopleCount: 2, palletCapacity: 90 }],
    internalDefaults: [{ operation: "assembly", peopleCount: 5 }, { operation: "ht", peopleCount: 2 }],
    externalDefaults: [{ providerId: "blanc", operation: "assembly", palletCapacity: 60, status: "confirmed" }],
    transportDefaults: [{ source: "internal", palletCapacity: 120, status: "confirmed" }, { source: "external", providerId: "linares", palletCapacity: 60, status: "confirmed" }],
    adjustments: [],
  });
  assert.equal(snapshot.days[0].internalProduction.find((item) => item.operation === "assembly").committed, 100);
  assert.equal(snapshot.days[0].internalProduction.find((item) => item.operation === "ht").overload, 10);
  assert.equal(snapshot.days[0].externalProduction[0].committed, 80);
  assert.equal(snapshot.days[0].imports[0].pallets, 70);
  assert.equal(snapshot.days[0].productionTotals.committed, 180);
  assert.equal(snapshot.days[0].productionTotals.capacity, 180);
  assert.equal(snapshot.days[0].productionTotals.available, 20);
  assert.equal(snapshot.days[0].productionTotals.missing, 20);
  assert.equal(snapshot.days[1].transportTotals.committed, 250);
  assert.equal(snapshot.days[1].transportTotals.missing, 70);
});

test("la capacidad general se repite y los ajustes afectan solo un día", () => {
  const snapshot = buildCapacitySnapshot({
    from: "2026-08-24", to: "2026-08-25", providers, orders: [],
    rules: [{ operation: "assembly", peopleCount: 5, palletCapacity: 300 }],
    internalDefaults: [{ operation: "assembly", peopleCount: 5 }, { operation: "marking", peopleCount: 0, manualCapacity: 0 }, { operation: "ht", peopleCount: 0, manualCapacity: 0 }],
    externalDefaults: [],
    transportDefaults: [{ source: "internal", palletCapacity: 200, status: "confirmed" }],
    adjustments: [
      { date: "2026-08-25", resourceType: "internal_production", operation: "assembly", palletAdjustment: -50 },
      { date: "2026-08-25", resourceType: "transport", source: "internal", palletAdjustment: 40 },
    ],
  });
  assert.equal(snapshot.days[0].internalProduction.find((item) => item.operation === "assembly").capacity, 300);
  assert.equal(snapshot.days[1].internalProduction.find((item) => item.operation === "assembly").capacity, 250);
  assert.equal(snapshot.days[0].transportTotals.internal, 200);
  assert.equal(snapshot.days[1].transportTotals.internal, 240);
  assert.equal(snapshot.days[0].productionTotals.capacity, 300);
  assert.equal(snapshot.days[1].productionTotals.capacity, 250);
  assert.equal(snapshot.days[0].productionTotals.available, 300);
  assert.equal(snapshot.days[1].productionTotals.available, 250);
  assert.equal(snapshot.days[0].internalTeam.assignedPeople, 5);
  assert.equal(snapshot.days[1].internalTeam.assignedPeople, 5);
});

test("las personas adicionales se suman a la dotación habitual y avisan el faltante", () => {
  const snapshot = buildCapacitySnapshot({
    from: "2026-08-24", to: "2026-08-24", providers, orders: [], availablePeople: 50,
    rules: [],
    internalDefaults: [
      { operation: "assembly", peopleCount: 10, manualCapacity: 1000 },
      { operation: "marking", peopleCount: 10, manualCapacity: 1000 },
      { operation: "ht", peopleCount: 10, manualCapacity: 1000 },
    ],
    externalDefaults: [], transportDefaults: [],
    adjustments: [{ date: "2026-08-24", resourceType: "internal_production", operation: "assembly", palletAdjustment: 0, peopleCount: 30 }],
  });
  assert.equal(snapshot.days[0].internalTeam.assignedPeople, 60);
  assert.equal(snapshot.days[0].internalTeam.freePeople, 0);
  assert.equal(snapshot.days[0].internalTeam.missingPeople, 10);
  assert.ok(snapshot.days[0].issues.includes("Faltan personas"));
});

test("marca en rojo lógico los días sin definir o con faltantes", () => {
  const base = { id: "overload", reference: "", client: "Uno", product: "Pallet", requested: 100, delivered: 0, pending: 100, stage: "produccion", dateLabel: "", plannedDate: "2026-08-24", transport: "Interno", transportSource: "internal", productionSource: "internal", productionDate: "2026-08-24", requiredOperations: ["assembly"], supply: "", preparation: "", logistics: "", delivery: "", action: "", lines: [], source: "" };
  const snapshot = buildCapacitySnapshot({
    from: "2026-08-24", to: "2026-08-24", providers, orders: [base], rules: [],
    internalDefaults: [], externalDefaults: [], transportDefaults: [], adjustments: [],
  });
  assert.deepEqual(snapshot.days[0].issues, ["Producción sin definir", "Falta producción", "Transporte sin definir", "Faltan camiones"]);
  assert.equal(snapshot.days[0].productionTotals.committed, 100);
  assert.equal(snapshot.days[0].productionTotals.available, undefined);
  assert.equal(snapshot.days[0].productionTotals.missing, 100);
});
