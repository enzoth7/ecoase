import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const port = 3200 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let serverOutput = "";

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path = "/", init = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, redirect: "manual" });
}

async function createMasterFixture({ name, address, zetaCode, productId = "palbin-p02" }) {
  const clientResponse = await request("/api/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, address, department: "Canelones" }) });
  assert.equal(clientResponse.status, 201);
  const client = (await clientResponse.json()).client;
  const relationResponse = await request(`/api/clients/${client.id}/products`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, zetaCode, operationalName: "Pallet operativo", initialControl: "Revisar clavado y separación" }) });
  assert.equal(relationResponse.status, 201);
  let relation = (await relationResponse.json()).product;
  const form = new FormData();
  form.set("file", new File(["%PDF-1.4\n%%EOF"], "plano.pdf", { type: "application/pdf" }));
  form.set("altText", "Plano principal del pallet");
  form.set("assetType", "plan");
  form.set("isPrimary", "true");
  const assetResponse = await request(`/api/client-products/${relation.id}/assets`, { method: "POST", body: form });
  assert.equal(assetResponse.status, 201);
  relation = (await (await request(`/api/client-products/${relation.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: true }) })).json()).product;
  assert.equal(relation.active, true);
  return { client, relation };
}

before(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "server/node.ts", "--serve-dist"], {
    cwd: projectRoot,
    env: { ...process.env, ECOASE_DATA_BACKEND: "memory", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await request("/api/orders");
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await pause(100);
  }

  throw new Error(`No se pudo iniciar Ecoase para las pruebas.\n${serverOutput}`);
});

after(async () => {
  if (server?.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
});

test("sirve la aplicación React en todas las rutas directas", async () => {
  for (const path of ["/", "/pedidos", "/historial", "/calendario", "/logistica", "/produccion", "/produccion-real", "/recursos", "/reglas-produccion", "/produccion?vista=semanal", "/produccion?vista=recursos", "/produccion?vista=reglas", "/produccion?vista=excepciones", "/produccion?vista=configuracion", "/secadero", "/registro-ht", "/reglas-secadero", "/secadero?vista=registro", "/viajes", "/logistica?vista=viajes", "/stock", "/stock-pamer", "/movimientos", "/clientes", "/clientes/test", "/productos", "/niveles", "/proveedores", "/plan", "/capacidad", "/tratamiento"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/, path);
    const html = await response.text();
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /<title>Operaciones<\/title>/);
  }
});

test("aplica la base de pallets a cada cliente sin compartir sus cambios", async () => {
  const first = await createMasterFixture({ name: `Base A ${Date.now()}`, address: "Ruta 5", zetaCode: "BASE-A" });
  const second = await createMasterFixture({ name: `Base B ${Date.now()}`, address: "Ruta 8", zetaCode: "BASE-B" });
  const snapshot = (await (await request("/api/capacity?from=2026-11-05&to=2026-11-05")).json()).capacity;
  const expected = [
    ["blanc", 250, 350],
    ["sandro_raul", 200, 240],
    ["enzo", 120, 140],
    ["lito", 80, 120],
  ];
  for (const relation of [first.relation, second.relation]) {
    const rules = snapshot.production.rules.filter((rule) => String(rule.clientProductId) === String(relation.id));
    assert.equal(rules.length, 4);
    for (const [resourceId, normal, maximum] of expected) {
      const rule = rules.find((item) => item.resourceId === resourceId);
      assert.equal(rule?.normalUnitsPerDay, normal);
      assert.equal(rule?.maximumUnitsPerDay, maximum);
    }
  }
  const firstBlanc = snapshot.production.rules.find((rule) => String(rule.clientProductId) === String(first.relation.id) && rule.resourceId === "blanc");
  const edited = await request("/api/capacity/rules", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: firstBlanc.id, resourceId: "blanc", productId: first.relation.productId, clientProductId: first.relation.id, configurationLabel: "Ajuste del cliente", normalUnitsPerDay: 260, maximumUnitsPerDay: 360, validFrom: "2026-01-01", source: "manual" }) });
  assert.equal(edited.status, 200);
  const after = (await (await request("/api/capacity?from=2026-11-05&to=2026-11-05")).json()).capacity;
  assert.equal(after.production.rules.find((rule) => String(rule.clientProductId) === String(first.relation.id) && rule.resourceId === "blanc").normalUnitsPerDay, 260);
  assert.equal(after.production.rules.find((rule) => String(rule.clientProductId) === String(second.relation.id) && rule.resourceId === "blanc").normalUnitsPerDay, 250);
});

test("asigna reglas de fábrica por modelo de pallet", async () => {
  for (const [index, { model, expected }] of [
    { model: "Mercosur", expected: [["fabrica_john", 550, 600], ["fabrica_omar", 140, 160]] },
    { model: "Citrus", expected: [["fabrica_john", 450, 550]] },
  ].entries()) {
    const code = String(800000000 + (Date.now() % 100000000) + index);
    const response = await request("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "Pallet", measure: `${123 + index} x 99`, attributes: { modelo: model }, zetaCode: code }) });
    assert.equal(response.status, 201);
    const { product } = await response.json();
    const { relation, client } = await createMasterFixture({ name: `${model} ${Date.now()}`, zetaCode: code, productId: product.id });
    const options = await (await request(`/api/clients/${client.id}/products`)).json();
    assert.equal(options.products[0].kind, "Pallet");
    const snapshot = (await (await request("/api/capacity?from=2026-11-05&to=2026-11-05")).json()).capacity;
    const rules = snapshot.production.rules.filter((rule) => String(rule.clientProductId) === String(relation.id));
    assert.equal(rules.length, 4 + expected.length);
    for (const [resourceId, normal, maximum] of expected) {
      const rule = rules.find((item) => item.resourceId === resourceId);
      assert.equal(rule?.normalUnitsPerDay, normal);
      assert.equal(rule?.maximumUnitsPerDay, maximum);
    }
    assert.equal(rules.some((rule) => rule.resourceId === "john_esteban"), false);
  }
});

test("administra capacidad por recurso y producto con confirmación trazable", async () => {
  const transport = await request("/api/capacity/transport", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "internal", palletCapacity: 25, status: "confirmed" }) });
  const transportAdjustment = await request("/api/capacity/adjustments", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-09-08", resourceType: "transport", source: "internal", palletAdjustment: 10, responsible: "Flota Ecoase" }) });
  assert.equal(transport.status, 200);
  assert.equal(transportAdjustment.status, 200);

  const capacityMaster = await createMasterFixture({ name: "Capacidad prueba", address: "Ruta 5 km 18", zetaCode: "CAP-01" });
  const created = await request("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    clientProductId: capacityMaster.relation.id, requested: 40, orderDate: "2026-09-01", requestedDeliveryDate: "2026-09-08", plannedDate: "2026-09-08", stage: "produccion",
    productionSource: "internal", productionDate: "2026-09-07", requiredOperations: ["assembly"], transportSource: "internal",
  }) });
  assert.equal(created.status, 201);
  const unplannedOrder = (await created.json()).order;
  assert.equal(unplannedOrder.productionDefined, false);
  assert.equal(unplannedOrder.transportDefined, false);
  assert.equal(unplannedOrder.lines[0].productionAllocations.length, 0);
  const planned = await request(`/api/orders/${unplannedOrder.id}/production-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allocations: [{ orderLineId: unplannedOrder.lines[0].id, resourceId: "internal", plannedDate: "2026-09-07", plannedQuantity: 40 }] }) });
  assert.equal(planned.status, 200);
  const createdOrder = (await planned.json()).order;
  assert.equal(createdOrder.productionDefined, true);
  assert.equal(createdOrder.productionDate, "2026-09-07");
  const allocation = createdOrder.lines[0].productionAllocations[0];
  assert.equal(allocation.status, "draft");

  const ruleBody = { resourceId: "internal", productId: "palbin-p02", clientProductId: capacityMaster.relation.id, peopleCount: 2, configurationLabel: "Fábrica ×2", normalUnitsPerDay: 30, maximumUnitsPerDay: 50, validFrom: "2026-09-01", source: "prueba" };
  const ruleResponse = await request("/api/capacity/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ruleBody) });
  assert.equal(ruleResponse.status, 201);
  const rule = (await ruleResponse.json()).rule;
  const overlapping = await request("/api/capacity/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ruleBody, configurationLabel: "Solapada" }) });
  assert.equal(overlapping.status, 400);

  const editedRuleResponse = await request("/api/capacity/rules", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ruleBody, id: rule.id, configurationLabel: "Fábrica ×2 editada", normalUnitsPerDay: 32, maximumUnitsPerDay: 55 }) });
  assert.equal(editedRuleResponse.status, 200);
  const editedRule = (await editedRuleResponse.json()).rule;
  assert.equal(editedRule.configurationLabel, "Fábrica ×2 editada");
  assert.equal(editedRule.normalUnitsPerDay, 32);

  const before = (await (await request("/api/capacity?from=2026-09-07&to=2026-09-08")).json()).capacity;
  const factoryBefore = before.production.days[0].resources.find((item) => item.resource.name === "Fábrica");
  assert.equal(factoryBefore.status, "stretched");
  assert.equal(factoryBefore.assignments[0].status, "draft");
  assert.equal(before.days[1].transportTotals.committed, 40);

  const noteRequired = await request(`/api/production-allocations/${allocation.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceId: "internal", capacityRuleId: rule.id }) });
  assert.equal(noteRequired.status, 400);
  const confirmed = await request(`/api/production-allocations/${allocation.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceId: "internal", capacityRuleId: rule.id, overloadNote: "Pico coordinado" }) });
  assert.equal(confirmed.status, 200);

  const completionNoteRequired = await request(`/api/production-allocations/${allocation.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: 35 }) });
  assert.equal(completionNoteRequired.status, 400);
  const completed = await request(`/api/production-allocations/${allocation.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: 35, completionNote: "Quedan cinco para replanificar" }) });
  assert.equal(completed.status, 200);

  const referencedDelete = await request(`/api/capacity/rules?id=${rule.id}`, { method: "DELETE" });
  assert.equal(referencedDelete.status, 409);

  const disposableRuleResponse = await request("/api/capacity/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceId: "mirasol", productId: "palbin-p02", clientProductId: capacityMaster.relation.id, configurationLabel: "Regla descartable", normalUnitsPerDay: 20, maximumUnitsPerDay: 30, validFrom: "2030-01-01", source: "prueba" }) });
  assert.equal(disposableRuleResponse.status, 201);
  const disposableRule = (await disposableRuleResponse.json()).rule;
  const disposableDelete = await request(`/api/capacity/rules?id=${disposableRule.id}`, { method: "DELETE" });
  assert.equal(disposableDelete.status, 200);
  assert.equal((await disposableDelete.json()).deleted, true);

  const after = (await (await request("/api/capacity?from=2026-09-07&to=2026-09-08")).json()).capacity;
  const completedAssignment = after.production.days[0].resources.find((item) => item.resource.name === "Fábrica").assignments[0];
  assert.equal(completedAssignment.status, "completed");
  assert.equal(completedAssignment.pendingQuantity, 5);

  const retiredOverride = await request("/api/capacity/daily-overrides", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-09-07", resourceId: "internal", available: false, reason: "Mantenimiento", responsible: "Encargado" }) });
  assert.equal(retiredOverride.status, 404);
  const unchanged = (await (await request("/api/capacity?from=2026-09-07&to=2026-09-07")).json()).capacity;
  assert.equal("overrides" in unchanged.production, false);

  const crew = await request("/api/capacity/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Cuadrilla QA", resourceType: "internal_crew", displayOrder: 40 }) });
  assert.equal(crew.status, 201);
  const crewResource = (await crew.json()).resource;
  const deactivated = await request("/api/capacity/resources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crewResource.id, active: false }) });
  assert.equal(deactivated.status, 200);

  const cleanupOrder = await request(`/api/orders/${createdOrder.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cancelled: true }) });
  assert.equal(cleanupOrder.status, 200);
});

test("registra, consulta y revierte tratamiento sin alterar el stock físico", async () => {
  const optionsResponse = await request("/api/treatment/options");
  assert.equal(optionsResponse.status, 200);
  const options = (await optionsResponse.json()).options;
  const product = options.find((item) => item.product.id === "palbin-p02");
  assert.ok(product);
  assert.equal(product.pending, 35);
  assert.equal(product.ready, 0);

  const missingReason = await request("/api/treatment/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.product.id, quantity: 10, performedAt: "2026-09-07T14:00:00.000Z", responsible: "Operador QA", controls: [] }) });
  assert.equal(missingReason.status, 400);

  const postedResponse = await request("/api/treatment/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.product.id, quantity: 10, performedAt: "2026-09-07T14:00:00.000Z", responsible: "Operador QA", note: "Lote general de prueba", controls: [] }) });
  assert.equal(postedResponse.status, 201);
  const posted = (await postedResponse.json()).result;
  assert.equal(posted.status, "posted");
  assert.equal(posted.previousPending, 35);
  assert.equal(posted.newPending, 25);
  assert.equal(posted.previousReady, 0);
  assert.equal(posted.newReady, 10);

  const detailResponse = await request(`/api/treatment/batches/${posted.batchId}`);
  assert.equal(detailResponse.status, 200);
  const batch = (await detailResponse.json()).batch;
  assert.equal(batch.movements.length, 2);
  assert.equal(batch.movements.reduce((sum, movement) => sum + movement.quantity, 0), 0);

  const insufficient = await request("/api/treatment/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.product.id, quantity: 30, performedAt: "2026-09-07T15:00:00.000Z", responsible: "Operador QA", note: "No debe alcanzar", controls: [] }) });
  assert.equal(insufficient.status, 400);

  const reverseResponse = await request(`/api/treatment/batches/${posted.batchId}/reverse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ performedAt: "2026-09-07T16:00:00.000Z", responsible: "Encargado QA", note: "Reversión controlada" }) });
  assert.equal(reverseResponse.status, 201);
  const reversed = (await reverseResponse.json()).result;
  assert.equal(reversed.status, "reversal");
  assert.equal(reversed.newPending, 35);
  assert.equal(reversed.newReady, 0);

  const duplicateReverse = await request(`/api/treatment/batches/${posted.batchId}/reverse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ performedAt: "2026-09-07T17:00:00.000Z", responsible: "Encargado QA", note: "No debe duplicarse" }) });
  assert.equal(duplicateReverse.status, 400);

  const dashboard = (await (await request("/api/treatment?date=2026-09-07")).json()).treatment;
  assert.deepEqual(Object.keys(dashboard).sort(), ["batches", "date", "summary"]);
  assert.equal(dashboard.summary.processed, 10);
  assert.equal(dashboard.summary.reversed, 10);
  assert.equal(dashboard.summary.pending + dashboard.summary.ready, 35);
});

test("registra entradas, ajustes y reversiones en stock", async () => {
  const initial = (await (await request("/api/stock/summary")).json()).stock.find((row) => row.product.id === "palbin-p02");
  const receipt = await request("/api/stock/movements/receipts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: "palbin-p02", stockState: "ready", quantity: 20, movementType: "supplier_receipt", providerId: "mirasol", occurredAt: "2026-09-08T12:00:00.000Z", responsible: "Recepción QA", sourceReference: "REM-QA" }) });
  assert.equal(receipt.status, 201);
  const receiptId = (await receipt.json()).movementId;
  let current = (await (await request("/api/stock/summary")).json()).stock.find((row) => row.product.id === "palbin-p02");
  assert.equal(current.ready, initial.ready + 20);

  const adjustment = await request("/api/stock/movements/adjustments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: "palbin-p02", stockState: "ready", quantityDelta: 5, occurredAt: "2026-09-08T13:00:00.000Z", responsible: "Inventario QA", reason: "Conteo físico" }) });
  assert.equal(adjustment.status, 201);
  current = (await (await request("/api/stock/summary")).json()).stock.find((row) => row.product.id === "palbin-p02");
  assert.equal(current.ready, initial.ready + 25);

  const reversed = await request(`/api/stock/movements/${receiptId}/reverse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ occurredAt: "2026-09-08T14:00:00.000Z", responsible: "Encargado QA", reason: "Remito anulado" }) });
  assert.equal(reversed.status, 201);
  current = (await (await request("/api/stock/summary")).json()).stock.find((row) => row.product.id === "palbin-p02");
  assert.equal(current.ready, initial.ready + 5);

  const duplicate = await request(`/api/stock/movements/${receiptId}/reverse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ occurredAt: "2026-09-08T15:00:00.000Z", responsible: "Encargado QA", reason: "No duplicar" }) });
  assert.equal(duplicate.status, 400);
});

test("reprograma un viaje desde el calendario y actualiza su fecha", async () => {
  const initialResponse = await request("/api/calendar?from=2026-01-01&to=2026-12-31");
  assert.equal(initialResponse.status, 200);
  const initial = (await initialResponse.json()).calendar;
  const shipment = initial.find((item) => ["planned", "ready"].includes(item.status));
  assert.ok(shipment);
  const originalDate = shipment.plannedDate;
  const target = new Date(`${originalDate}T12:00:00`);
  target.setDate(target.getDate() + 1);
  const targetDate = target.toISOString().slice(0, 10);

  const movedResponse = await request(`/api/shipments/${shipment.id}/reschedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newDate: targetDate, reason: "logistics", responsible: "Prueba calendario" }) });
  assert.equal(movedResponse.status, 200);
  const moved = await movedResponse.json();
  assert.equal(moved.shipment.plannedDate, targetDate);

  const calendar = (await (await request(`/api/calendar?from=${targetDate}&to=${targetDate}`)).json()).calendar;
  assert.ok(calendar.some((item) => String(item.id) === String(shipment.id) && item.plannedDate === targetDate));

  const restoredResponse = await request(`/api/shipments/${shipment.id}/reschedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newDate: originalDate, reason: "client", responsible: "Prueba calendario" }) });
  assert.equal(restoredResponse.status, 200);
});

test("muestra el catálogo de productos en columnas separadas", async () => {
  const productsResponse = await request("/api/products");
  assert.equal(productsResponse.status, 200);
  const apiProducts = (await productsResponse.json()).products;
  const internalCodeNumbers = apiProducts.map((product) => Number(product.sourceCode?.match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY));
  assert.deepEqual(internalCodeNumbers, [...internalCodeNumbers].sort((left, right) => left - right));
  const sourceCodes = apiProducts.map((product) => product.sourceCode?.trim().toLocaleUpperCase("es")).filter(Boolean);
  assert.equal(new Set(sourceCodes).size, sourceCodes.length);
  const measureKeys = apiProducts.map((product) => `${product.kind}|${product.measure ?? "sin medida"}`);
  assert.equal(new Set(measureKeys).size, measureKeys.length);
  assert.ok(apiProducts.every((product) => Array.isArray(product.clientNames)));
  assert.ok(apiProducts.every((product) => Object.keys(product).every((field) => ["id", "kind", "measure", "treatment", "requiresTreatment", "stockName", "sourceCatalog", "sourceCode", "zetaCode", "stockActive", "clientNames", "attributes"].includes(field))));
});

test("muestra proveedores por tipo y abastecimiento", async () => {
  const providersResponse = await request("/api/providers");
  assert.equal(providersResponse.status, 200);
  const { providers } = await providersResponse.json();
  assert.equal(providers.length, 6);
  assert.equal(providers.some((provider) => provider.id === "linares"), false);
});

test("expone pedidos activos e historial en endpoints separados", async () => {
  const [ordersResponse, historyResponse, clientsResponse, calendarResponse, logisticsResponse, planResponse] = await Promise.all([
    request("/api/orders"),
    request("/api/history"),
    request("/api/clients"),
    request("/api/calendar"),
    request("/api/logistics"),
    request("/api/plan"),
  ]);

  assert.equal(ordersResponse.status, 200);
  assert.equal(historyResponse.status, 200);
  assert.equal(clientsResponse.status, 200);
  assert.equal(calendarResponse.status, 200);
  assert.equal(logisticsResponse.status, 200);
  assert.equal(planResponse.status, 200);
  assert.equal((await ordersResponse.json()).orders.length, 2);
  assert.ok((await historyResponse.json()).history.length >= 10);
  assert.ok((await clientsResponse.json()).clients.length > 0);
  assert.equal((await calendarResponse.json()).calendar.length, 2);
  assert.equal((await logisticsResponse.json()).logistics.length, 2);
  assert.equal((await planResponse.json()).plan.length, 2);
});

test("permite editar el plan y registra los cambios del pedido", async () => {
  const response = await request("/api/orders/frutura-74", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transport: "Milton",
      plannedDate: "2026-08-18",
      requested: 650,
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.order.transport, "Milton");
  assert.match(payload.order.dateLabel, /18 de agosto/i);
  assert.equal(payload.order.plannedDate, "2026-08-18");
  assert.equal(payload.order.originalPlannedDate, "2026-08-14");
  assert.equal(payload.order.requested, 650);
  assert.equal(payload.order.lines.reduce((total, line) => total + line.quantity, 0), 650);
  assert.equal(payload.order.stage, "produccion");

  const history = await (await request("/api/orders/frutura-74/history")).json();
  assert.ok(history.history.length >= 2);
  const planChange = history.history.find((entry) => entry.changes.some((change) => change.field === "Fecha planificada"));
  assert.ok(planChange);
  assert.equal(planChange.changes.some((change) => change.field === "Cantidad de pallets"), true);
  assert.equal(planChange.changes.some((change) => change.field === "Transportista"), true);
});

test("al registrar la entrega total el pedido se mueve al historial", async () => {
  const updateResponse = await request("/api/orders/proquimur-63/updates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "entrega", deliveredQuantity: 600 }),
  });
  assert.equal(updateResponse.status, 200);

  const [ordersResponse, historyResponse] = await Promise.all([request("/api/orders"), request("/api/history")]);
  const activeOrders = (await ordersResponse.json()).orders;
  const history = (await historyResponse.json()).history;
  assert.equal(activeOrders.some((order) => order.id === "proquimur-63"), false);
  assert.equal(history.some((order) => order.id === "proquimur-63"), true);
});

test("registra entregas y cambios de dirección en el seguimiento del pedido", async () => {
  const delivery = await request("/api/orders/frutura-74/updates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "entrega", deliveredQuantity: 200 }),
  });
  assert.equal(delivery.status, 200);
  const deliveryPayload = await delivery.json();
  assert.equal(deliveryPayload.order.delivered, 200);
  assert.equal(deliveryPayload.order.pending, 450);

  const address = await request("/api/orders/frutura-74/updates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "direccion", deliveryAddress: "Camino de los Aromos 120" }),
  });
  assert.equal(address.status, 200);
  const addressPayload = await address.json();
  assert.equal(addressPayload.order.deliveryAddress, "Camino de los Aromos 120");

  const history = await (await request("/api/orders/frutura-74/history")).json();
  const addressChange = history.history.find((entry) => entry.kind === "direccion");
  const deliveryChange = history.history.find((entry) => entry.kind === "entrega");
  assert.ok(addressChange);
  assert.equal(addressChange.changes.some((change) => change.field === "Dirección de entrega"), true);
  assert.ok(deliveryChange);
  assert.equal(deliveryChange.changes.some((change) => change.field === "Cantidad entregada"), true);
});

test("crea pedidos mediante POST /api/orders", async () => {
  const invalidTransport = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client: "Cliente prueba", product: "Pallet prueba", requested: 50, orderDate: "2026-08-01", requestedDeliveryDate: "2026-08-10", plannedDate: "2026-08-10", stage: "negociacion", transport: "Remito 603" }),
  });
  assert.equal(invalidTransport.status, 400);

  const master = await createMasterFixture({ name: "Cliente prueba", address: "Ruta 5 km 18", zetaCode: "Z-08" });

  const response = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientProductId: master.relation.id,
      client: "Nombre falsificado",
      product: "Producto falsificado",
      requested: 50,
      orderDate: "2026-08-01",
      requestedDeliveryDate: "2026-08-10",
      plannedDate: "2026-08-10",
      stage: "reorganizando",
      transport: "Matías",
      reference: "OC-4321",
      zetaCode: "Z-08",
      deliveryAddress: "Ruta 5 km 18",
      notes: "Descargar por el acceso norte.",
      productionSource: "internal",
      productionDate: "2026-08-09",
      requiredOperations: ["assembly"],
      transportSource: "external",
      transportProviderId: "matias",
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.order.client, "Cliente prueba");
  assert.equal(payload.order.product, "Pallet operativo");
  assert.equal(payload.order.pending, 50);
  assert.equal(payload.order.orderDate, "2026-08-01");
  assert.equal(payload.order.requestedDeliveryDate, "2026-08-10");
  assert.equal(payload.order.stage, "negociacion");
  assert.equal(payload.order.zetaCode, "P02");
  assert.equal(payload.order.deliveryAddress, "Ruta 5 km 18");
  assert.equal(payload.order.notes, "Descargar por el acceso norte.");
});

test("gestiona el maestro cliente-producto, filtra opciones y protege los datos automáticos", async () => {
  const first = await createMasterFixture({ name: "Maestro Uno", address: "Camino Uno 123", zetaCode: "MASTER-1", productId: "palbin-p01" });
  const second = await createMasterFixture({ name: "Maestro Dos", address: "Camino Dos 456", zetaCode: "MASTER-2", productId: "palbin-p04" });
  const clientPage = await request(`/clientes/${first.client.id}`);
  assert.equal(clientPage.status, 200);
  const options = (await (await request(`/api/clients/${first.client.id}/products?active=true`)).json()).products;
  assert.equal(options.length, 1);
  assert.equal(options[0].id, first.relation.id);
  assert.equal(options[0].zetaCode, "P01");
  assert.equal(options[0].clientAddress, "Camino Uno 123");
  assert.ok(!options.some((option) => option.id === second.relation.id));

  const additionalProduct = await request(`/api/clients/${first.client.id}/products`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: "palbin-p04", zetaCode: "MASTER-1", initialControl: "Control adicional" }) });
  assert.equal(additionalProduct.status, 201);
  assert.equal((await additionalProduct.json()).product.zetaCode, "P04");

  const invalidFile = new FormData();
  invalidFile.set("file", new File(["no válido"], "plano.txt", { type: "text/plain" }));
  invalidFile.set("altText", "Archivo inválido");
  const invalidUpload = await request(`/api/client-products/${first.relation.id}/assets`, { method: "POST", body: invalidFile });
  assert.equal(invalidUpload.status, 400);

  const detail = await request(`/api/clients/${first.client.id}`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).products[0].assets[0].isPrimary, true);
  const signed = await request(`/api/client-product-assets/${first.relation.assets[0]?.id ?? 0}/signed-url`, { method: "POST" });
  assert.equal(signed.status, 200);
  const signedUrl = (await signed.json()).url;
  assert.match(signedUrl, /\/api\/client-product-assets\/\d+\/content$/);
  assert.equal((await request(signedUrl)).headers.get("content-type"), "application/pdf");
});

test("permite crear pedidos sin dirección, controles ni foto", async () => {
  const clientResponse = await request("/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Cliente opcional" }),
  });
  assert.equal(clientResponse.status, 201);
  const client = (await clientResponse.json()).client;
  assert.equal(client.active, true);
  assert.equal(client.address, undefined);

  const relationResponse = await request(`/api/clients/${client.id}/products`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId: "palbin-p02", operationalName: "Pallet sin referencias" }),
  });
  assert.equal(relationResponse.status, 201);
  const relation = (await relationResponse.json()).product;
  assert.equal(relation.active, true);
  assert.deepEqual(relation.controls, []);
  assert.deepEqual(relation.assets, []);

  const options = (await (await request(`/api/clients/${client.id}/products?active=true`)).json()).products;
  assert.equal(options.length, 1);
  assert.equal(options[0].clientAddress, undefined);

  const orderResponse = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lines: [{ clientProductId: relation.id, quantity: 25 }],
      reference: "Opcionales 1",
      orderDate: "2026-08-30",
      requestedDeliveryDate: "2026-09-03",
      plannedDate: "2026-09-03",
      productionSource: "internal",
      productionDate: "2026-09-01",
      requiredOperations: ["assembly"],
      transportSource: "internal",
      stage: "negociacion",
    }),
  });
  assert.equal(orderResponse.status, 201);
  const order = (await orderResponse.json()).order;
  assert.equal(order.client, "Cliente opcional");
  assert.equal(order.deliveryAddress, undefined);
  await request(`/api/orders/${order.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "completado" }) });
});

test("cancela un pedido a historial y elimina otro por completo", async () => {
  const clientResponse = await request("/api/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Cliente para borrar" }) });
  assert.equal(clientResponse.status, 201);
  const client = (await clientResponse.json()).client;
  const relationResponse = await request(`/api/clients/${client.id}/products`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: "palbin-p02", operationalName: "Pallet de prueba" }) });
  assert.equal(relationResponse.status, 201);
  const relation = (await relationResponse.json()).product;
  const createOrder = async (quantity) => {
    const response = await request("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: [{ clientProductId: relation.id, quantity }], orderDate: "2026-10-29", plannedDate: "2026-11-06", requiredOperations: ["assembly"] }) });
    assert.equal(response.status, 201);
    return (await response.json()).order;
  };

  const toCancel = await createOrder(40);
  const cancelResponse = await request(`/api/orders/${toCancel.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cancelled: true }) });
  assert.equal(cancelResponse.status, 200);
  assert.equal((await (await request("/api/history")).json()).history.some((order) => order.id === toCancel.id), true);
  assert.equal((await (await request("/api/orders")).json()).orders.some((order) => order.id === toCancel.id), false);

  const toDelete = await createOrder(60);
  assert.equal((await request(`/api/orders/${toDelete.id}`)).status, 200);
  const deleteResponse = await request(`/api/orders/${toDelete.id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  assert.equal((await request(`/api/orders/${toDelete.id}`)).status, 404);
  assert.equal((await (await request("/api/orders")).json()).orders.some((order) => order.id === toDelete.id), false);
  assert.equal((await request(`/api/orders/${toDelete.id}`, { method: "DELETE" })).status, 404);

  // También se puede eliminar un pedido ya cancelado.
  assert.equal((await request(`/api/orders/${toCancel.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await (await request("/api/history")).json()).history.some((order) => order.id === toCancel.id), false);
});

test("agrega productos y clientes mediante sus endpoints", async () => {
  const productResponse = await request("/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "Pallet", measure: "123 × 99", requiresTreatment: true, zetaCode: "1001" }),
  });
  assert.equal(productResponse.status, 201);
  assert.deepEqual((await productResponse.json()).product.kind, "Pallet");

  const clientResponse = await request("/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Cliente nuevo", address: "Camino de los Aromos 120", department: "Canelones" }),
  });
  assert.equal(clientResponse.status, 201);
  const createdClient = (await clientResponse.json()).client;
  assert.equal(createdClient.name, "Cliente nuevo");
  assert.equal(createdClient.address, "Camino de los Aromos 120");
  assert.equal(createdClient.department, "Canelones");

  const clients = (await (await request("/api/clients")).json()).clients;
  assert.ok(clients.some((client) => client.name === "Cliente nuevo" && client.orders === 0 && client.activeOrders === 0 && client.activePallets === 0));
});

test("identifica productos por niveles y rechaza repetidos", async () => {
  const post = (body) => request("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const full = { kind: "Pallet", measure: "120 x 100", attributes: { modelo: "Mercosur", refuerzo: "Liviano", identificacion: "N° 1", tratamiento: "Con HT" }, zetaCode: "1002" };
  const created = await post(full);
  assert.equal(created.status, 201);
  const product = (await created.json()).product;
  assert.deepEqual(product.attributes, full.attributes);
  assert.equal(product.requiresTreatment, true);
  assert.equal(product.stockName, "Pallet · 120 x 100 · Mercosur · Liviano · N° 1 · Con HT");

  // El tratamiento respeta el valor explícito de la planilla y no se infiere de otro nivel.
  const untreated = await post({ ...full, attributes: { ...full.attributes, identificacion: undefined, tratamiento: "Sin HT" }, zetaCode: "1003" });
  assert.equal(untreated.status, 201);
  const untreatedProduct = (await untreated.json()).product;
  assert.equal(untreatedProduct.attributes.tratamiento, "Sin HT");
  assert.equal(untreatedProduct.requiresTreatment, false);

  // Misma identidad con la medida escrita distinto y otro código: es el mismo producto.
  const repeated = await post({ ...full, measure: "120×100", zetaCode: "1004" });
  assert.equal(repeated.status, 400);
  assert.match((await repeated.json()).error, /esa clasificación/);

  // 100 x 120 es otra medida (en Pamer cambia el sentido de las tablas).
  const turned = await post({ ...full, measure: "100 x 120", zetaCode: "1005" });
  assert.equal(turned.status, 201);

  // Cambiar un solo nivel lo vuelve un producto distinto, y la nomenclatura del cliente se guarda tal cual.
  const variant = await post({ ...full, attributes: { ...full.attributes, identificacion: "Punto Azul", taco: "Taco especial" }, zetaCode: "1006" });
  assert.equal(variant.status, 201);
  const variantProduct = (await variant.json()).product;
  assert.equal(variantProduct.attributes.taco, "Taco especial");
  const levels = (await (await request("/api/product-levels")).json()).levels;
  assert.ok(levels.find((level) => level.id === "taco").options.includes("Taco especial"), "un valor nuevo pasa a ser opción del nivel");
  const logoLevel = levels.find((level) => level.id === "logo-propio");
  assert.deepEqual(logoLevel.options, ["A", "Crufi", "MSJ"]);
  assert.equal(levels.findIndex((level) => level.id === "logo-propio"), levels.findIndex((level) => level.id === "tratamiento") + 1);
  const withLogo = await post({ ...full, attributes: { ...full.attributes, "logo-propio": "Crufi" }, zetaCode: "1009" });
  assert.equal(withLogo.status, 201);
  const logoProduct = (await withLogo.json()).product;
  assert.equal(logoProduct.attributes["logo-propio"], "Crufi");
  assert.match(logoProduct.stockName, /Crufi$/);

  // El tratamiento puede quedar vacío; los niveles inexistentes siguen rechazándose.
  const withoutTreatment = await post({ kind: "Pallet", measure: "120 x 100", zetaCode: "1007" });
  assert.equal(withoutTreatment.status, 201);
  const withoutTreatmentProduct = (await withoutTreatment.json()).product;
  assert.equal(withoutTreatmentProduct.attributes.tratamiento, undefined);
  const unknown = await post({ kind: "Pallet", measure: "120 x 100", attributes: { inexistente: "x", tratamiento: "Sin HT" }, zetaCode: "1008" });
  assert.equal(unknown.status, 400);
  assert.match((await unknown.json()).error, /no existe/);

  // La edición no puede chocar con otro producto.
  const collide = await request(`/api/products/${variantProduct.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...full, kind: "Pallet" }) });
  assert.equal(collide.status, 400);
  for (const id of [product.id, untreatedProduct.id, (await turned.json()).product.id, variantProduct.id, logoProduct.id, withoutTreatmentProduct.id]) assert.equal((await request(`/api/products/${id}`, { method: "DELETE" })).status, 200);
});

test("arma, reordena y protege los niveles de producto", async () => {
  const put = (levels) => request("/api/product-levels", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ levels }) });
  const original = (await (await request("/api/product-levels")).json()).levels;
  try {
    assert.equal(original[0].id, "medida");
    assert.ok(original.some((level) => level.id === "tratamiento" && level.system));
    assert.equal(original.length, 9);
    assert.ok(!original.some((level) => ["exportacion", "espesor"].includes(level.id)));

    // Un nivel nuevo, con opciones repetidas o vacías limpias, y la Medida siempre primera.
    const withNew = await put([...original, { label: "Pintura", options: ["Verde", " verde ", "", "Gris"] }]);
    assert.equal(withNew.status, 200);
    const added = (await withNew.json()).levels.find((level) => level.label === "Pintura");
    assert.equal(added.id, "pintura");
    assert.deepEqual(added.options, ["Verde", "Gris"]);
    assert.equal(added.system, false);

    // Se puede usar en un producto y entonces ya no se puede eliminar.
    const product = await request("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "Pallet", measure: "99 x 99", attributes: { pintura: "Verde", tratamiento: "Sin HT" }, zetaCode: "1101" }) });
    assert.equal(product.status, 201);
    const productId = (await product.json()).product.id;
    const usage = (await (await request("/api/product-levels")).json()).usage;
    assert.equal(usage.pintura.verde, 1);
    const blocked = await put(original);
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).error, /lo usa/);

    // Los niveles de sistema no se quitan ni se mueve la Medida.
    const withoutTreatment = await put(original.filter((level) => level.id !== "tratamiento"));
    assert.equal(withoutTreatment.status, 400);
    const measureLast = await put([...original.slice(1), original[0]]);
    assert.equal(measureLast.status, 400);
    const duplicated = await put([...original, { label: "modelo", options: [] }]);
    assert.equal(duplicated.status, 400);

    // Cambiar el orden cambia el nombre armado.
    assert.equal((await request(`/api/products/${productId}`, { method: "DELETE" })).status, 200);
    const reordered = [original[0], ...original.slice(1).reverse()];
    assert.equal((await put(reordered)).status, 200);
    const moved = (await (await request("/api/product-levels")).json()).levels;
    assert.equal(moved[1].id, "logo-propio");
  } finally {
    const restored = await put(original.filter((level) => level.id !== "pintura"));
    assert.equal(restored.status, 200);
  }
  const final = (await (await request("/api/product-levels")).json()).levels;
  assert.deepEqual(final.map((level) => level.id), original.map((level) => level.id));
});

test("edita, asigna cliente y elimina productos mediante endpoints separados", async () => {
  const before = (await (await request("/api/products")).json()).products;
  const clients = (await (await request("/api/clients")).json()).clients;
  const pamer = clients.find((client) => client.name === "Pamer");
  assert.ok(pamer?.id);
  const editResponse = await request("/api/products/palbin-p05", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "Pallet", measure: "122 × 102", stockName: "Pallet especial", zetaCode: "1201", requiresTreatment: true, clientId: pamer.id }),
  });
  assert.equal(editResponse.status, 200);
  const edited = await editResponse.json();
  assert.equal(edited.product.measure, "122 × 102");
  assert.equal(edited.product.stockName, "Pallet especial");
  assert.equal(edited.product.sourceCode, "P05");
  assert.equal(edited.product.zetaCode, "1201");
  assert.deepEqual(edited.product.clientNames, ["Pamer"]);
  assert.deepEqual(Object.keys(edited.product).sort(), ["attributes", "clientNames", "id", "kind", "measure", "requiresTreatment", "sourceCatalog", "sourceCode", "stockActive", "stockName", "treatment", "zetaCode"]);

  const deleteResponse = await request("/api/products/palbin-p05", { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  const products = await (await request("/api/products")).json();
  assert.equal(products.products.some((product) => product.id === "palbin-p05"), false);
  assert.equal(products.products.length, before.length - 1);
});

test("crea, actualiza y elimina proveedores mediante endpoints dedicados", async () => {
  const initial = (await (await request("/api/providers")).json()).providers;

  // 1. Crear proveedor
  const createResponse = await request("/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Aserradero El Ceibo",
      type: "Aserradero",
      supplies: "Tablas y tirantes de pino",
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).provider;
  assert.equal(created.name, "Aserradero El Ceibo");
  assert.equal(created.type, "Aserradero");
  assert.equal(created.supplies, "Tablas y tirantes de pino");
  assert.ok(created.id.includes("aserradero-el-ceibo"));

  // 2. Comprobar que aparece en listado
  const afterCreate = (await (await request("/api/providers")).json()).providers;
  assert.equal(afterCreate.length, initial.length + 1);
  assert.ok(afterCreate.some((p) => p.id === created.id));

  // 3. Actualizar proveedor
  const updateResponse = await request(`/api/providers/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "El Ceibo Forestal",
      supplies: "Madera tratada y pallets rústicos",
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = (await updateResponse.json()).provider;
  assert.equal(updated.name, "El Ceibo Forestal");
  assert.equal(updated.supplies, "Madera tratada y pallets rústicos");

  // 4. Intentar eliminar un proveedor con dependencias (ej. mirasol)
  const failDeleteResponse = await request("/api/providers/mirasol", { method: "DELETE" });
  assert.equal(failDeleteResponse.status, 400);

  // 5. Eliminar el proveedor recién creado (sin dependencias)
  const deleteResponse = await request(`/api/providers/${created.id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);

  // 6. Verificar que ya no está
  const final = (await (await request("/api/providers")).json()).providers;
  assert.equal(final.length, initial.length);
  assert.ok(!final.some((p) => p.id === created.id));
});

test("cuenta toda la producción física al replanificar, incluso la enviada a stock general", async () => {
  const fixture = await createMasterFixture({ name: `Producción real ${Date.now()}`, address: "Ruta 5", zetaCode: "REAL-01" });
  const created = await request("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    clientProductId: fixture.relation.id, requested: 30, orderDate: "2026-09-01", requestedDeliveryDate: "2026-09-10", plannedDate: "2026-09-10", stage: "produccion",
    productionSource: "internal", productionDate: "2026-09-07", requiredOperations: ["assembly"], transportSource: "internal",
  }) });
  assert.equal(created.status, 201);
  const order = (await created.json()).order;
  const lineId = order.lines[0].id;
  const plan = async (date, quantity) => {
    const response = await request(`/api/orders/${order.id}/production-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allocations: [{ orderLineId: lineId, resourceId: "internal", plannedDate: date, plannedQuantity: quantity }] }) });
    assert.equal(response.status, 200);
    return (await response.json()).order.lines[0].productionAllocations.find((item) => item.status === "draft");
  };
  const first = await plan("2026-09-07", 10);
  const before = (await (await request("/api/stock/palbin-p02")).json()).stock.movements.filter((item) => String(item.productionAllocationId) === String(first.id));
  assert.equal(before.length, 0);
  const stockResult = await request(`/api/production-allocations/${first.id}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: 13, actualDate: "2026-09-07", destination: "stock" }) });
  assert.equal(stockResult.status, 200);
  const duplicate = await request(`/api/production-allocations/${first.id}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: 13, actualDate: "2026-09-07", destination: "stock" }) });
  assert.equal(duplicate.status, 400);
  const movements = (await (await request("/api/stock/palbin-p02")).json()).stock.movements.filter((item) => String(item.productionAllocationId) === String(first.id));
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity, 13);
  const second = await plan("2026-09-08", 10);
  const missed = await request(`/api/production-allocations/${second.id}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: 0, actualDate: "2026-09-08" }) });
  assert.equal(missed.status, 200);
  const stockBeforeClient = (await (await request("/api/stock/summary")).json()).stock.find((item) => item.product.id === "palbin-p02");
  const third = await plan("2026-09-09", 10);
  const clientResult = await request(`/api/production-allocations/${third.id}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: 6, actualDate: "2026-09-09", destination: "client" }) });
  assert.equal(clientResult.status, 200);
  const stockAfterClient = (await (await request("/api/stock/summary")).json()).stock.find((item) => item.product.id === "palbin-p02");
  assert.equal(stockAfterClient.reserved, stockBeforeClient.reserved + 6);
  const fourth = await plan("2026-09-10", 11);
  assert.equal(fourth.plannedQuantity, 11);
  const overplanned = await request(`/api/orders/${order.id}/production-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allocations: [{ orderLineId: lineId, resourceId: "internal", plannedDate: "2026-09-10", plannedQuantity: 12 }] }) });
  assert.equal(overplanned.status, 400);
  const snapshot = (await (await request("/api/capacity?from=2026-09-07&to=2026-09-10")).json()).capacity;
  const firstSummary = snapshot.production.days[0].resources.flatMap((item) => item.assignments).find((item) => String(item.id) === String(first.id));
  assert.equal(firstSummary.resultDestination, "stock");
  assert.equal(firstSummary.pendingQuantity, 0);
});

test("protege el stock asignado a un pedido al preparar viajes", async () => {
  const code = String(900000000 + (Date.now() % 100000000));
  const productResponse = await request("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "Pallet", measure: "197 x 91", zetaCode: code }) });
  if (!productResponse.ok) throw new Error(await productResponse.text());
  assert.equal(productResponse.status, 201);
  const { product } = await productResponse.json();
  const first = await createMasterFixture({ name: `Reserva A ${Date.now()}`, address: "Ruta 5", zetaCode: `${code}-A`, productId: product.id });
  const second = await createMasterFixture({ name: `Reserva B ${Date.now()}`, address: "Ruta 8", zetaCode: `${code}-B`, productId: product.id });
  const makeOrder = async (fixture) => {
    const response = await request("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientProductId: fixture.relation.id, requested: 10, orderDate: "2026-09-01", requestedDeliveryDate: "2026-09-10", plannedDate: "2026-09-10", stage: "produccion", productionSource: "internal", productionDate: "2026-09-07", requiredOperations: ["assembly"], transportSource: "internal" }) });
    assert.equal(response.status, 201);
    return (await response.json()).order;
  };
  const orderA = await makeOrder(first);
  const orderB = await makeOrder(second);
  const plan = await request(`/api/orders/${orderA.id}/production-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allocations: [{ orderLineId: orderA.lines[0].id, resourceId: "internal", plannedDate: "2026-09-07", plannedQuantity: 10 }] }) });
  assert.equal(plan.status, 200);
  const allocation = (await plan.json()).order.lines[0].productionAllocations.find((item) => item.status === "draft");
  const produced = await request(`/api/production-allocations/${allocation.id}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: 10, actualDate: "2026-09-07", destination: "client" }) });
  assert.equal(produced.status, 200);
  const stock = (await (await request("/api/stock/summary")).json()).stock.find((item) => item.product.id === product.id);
  assert.equal(stock.physical, 10);
  assert.equal(stock.reserved, 10);
  assert.equal(stock.available, 0);
  const createTrip = async (order) => {
    const response = await request(`/api/orders/${order.id}/shipments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plannedDate: "2026-09-10", transportSource: "internal", lines: [{ orderLineId: order.lines[0].id, plannedQuantity: 10 }] }) });
    if (!response.ok) throw new Error(await response.text());
    assert.equal(response.status, 201);
    return (await response.json()).shipment;
  };
  const tripB = orderB.shipments?.[0] ?? await createTrip(orderB);
  const warned = await request(`/api/shipments/${tripB.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nextStatus: "ready", remittance: `${code}-B` }) });
  assert.equal(warned.status, 200);
  let logistics = await (await request("/api/logistics/snapshot")).json();
  const tripA = orderA.shipments?.[0] ?? await createTrip(orderA);
  const allowed = await request(`/api/shipments/${tripA.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nextStatus: "ready", remittance: `${code}-A` }) });
  assert.equal(allowed.status, 200);
  const loadedB = await request(`/api/shipments/${tripB.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nextStatus: "loaded", loadedLines: [{ shipmentLineId: tripB.lines[0].id, loadedQuantity: 3 }] }) });
  assert.equal(loadedB.status, 200);
  assert.equal((await loadedB.json()).shipment.lines[0].loadedQuantity, 3);
  assert.equal((await request(`/api/shipments/${tripB.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nextStatus: "dispatched" }) })).status, 200);
  const tooMuch = await request(`/api/shipments/${tripB.id}/transition`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nextStatus: "delivered", deliveredLines: [{ shipmentLineId: tripB.lines[0].id, deliveredQuantity: 4 }] }) });
  assert.equal(tooMuch.status, 400);
  const deliveredB = await request(`/api/shipments/${tripB.id}/transition`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nextStatus: "delivered", deliveredLines: [{ shipmentLineId: tripB.lines[0].id, deliveredQuantity: 3 }] }) });
  assert.equal(deliveredB.status, 200);
  const loadedA = await request(`/api/shipments/${tripA.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nextStatus: "loaded", loadedLines: [{ shipmentLineId: tripA.lines[0].id, loadedQuantity: 10 }] }) });
  assert.equal(loadedA.status, 200);
  assert.equal((await request(`/api/shipments/${tripA.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nextStatus: "dispatched" }) })).status, 200);
  logistics = await (await request("/api/logistics/snapshot")).json();
  assert.ok(logistics.stock.find((item) => item.productId === product.id).ready < 0);
  assert.ok(logistics.stock.find((item) => item.productId === product.id).reserved >= 0);
});

test("agenda un retiro a proveedor sin stock y muestra ruta sin datos", async () => {
  const before = await (await request("/api/logistics/snapshot")).json();
  assert.deepEqual(before.vehicles.map((item) => [item.id, item.smallCapacity, item.largeCapacity]).sort((a, b) => a[0].localeCompare(b[0])), [
    ["howo", 638, 273], ["internacional", 638, 273], ["vw_camion", 638, 273], ["vw_tractor", 560, 251],
  ]);
  const provider = before.providers.find((item) => item.type === "Aserradero" || item.type === "Importador");
  assert.ok(provider);
  const response = await request("/api/logistics/runs", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "supplier_pickup", providerId: provider.id, plannedDate: "2026-11-10", vehicleId: "howo", responsible: "Prueba" }) });
  assert.equal(response.status, 200);
  const run = (await response.json()).run;
  assert.equal(run.shipmentId, undefined);
  const route = await request(`/api/logistics/routes/${run.id}`, { method: "POST" });
  assert.equal(route.status, 200);
  assert.equal((await route.json()).status, "no_data");
  const after = await (await request("/api/logistics/snapshot")).json();
  assert.ok(after.runs.some((item) => String(item.id) === String(run.id) && item.mode === "supplier_pickup"));
  assert.deepEqual(after.stock, before.stock);
});

test("el retiro de Pamer no ocupa la flota propia", async () => {
  const snapshot = await (await request("/api/logistics/snapshot")).json();
  const order = snapshot.orders.find((item) => item.client === "Pamer" && item.shipments?.length);
  assert.ok(order);
  const shipment = order.shipments[0];
  const response = await request("/api/logistics/runs", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "customer_pickup", shipmentId: shipment.id, plannedDate: shipment.plannedDate,
      vehicleId: "howo", driverId: "susalla", responsible: "Prueba" }) });
  assert.equal(response.status, 200);
  const run = (await response.json()).run;
  assert.equal(run.vehicleId, undefined);
  assert.equal(run.driverId, undefined);
  const route = await request(`/api/logistics/routes/${run.id}`, { method: "POST" });
  assert.equal((await route.json()).status, "no_data");
});

