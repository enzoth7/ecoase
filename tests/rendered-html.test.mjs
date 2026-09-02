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
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    cwd: projectRoot,
    env: { ...process.env, ECOASE_DATA_BACKEND: "memory" },
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

  throw new Error(`No se pudo iniciar Next.js para las pruebas.\n${serverOutput}`);
});

after(async () => {
  if (server?.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
});

test("renderiza pedidos activos e incluye acceso al historial", async () => {
  const response = await request("/pedidos");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="es">/i);
  assert.match(html, /Control operativo/);
  assert.match(html, /app-sidebar/);
  assert.match(html, /Historial/);
  assert.match(html, /href="\/historial"/i);
  assert.match(html, /href="\/proveedores"/i);
  assert.match(html, /Palets en marcha/);
  assert.match(html, /Palets en espera/);
  assert.match(html, /Palets totales/);
  assert.match(html, /Nivel de cumplimiento/);
  assert.match(html, /Cliente/);
  assert.match(html, /Pedido/);
  assert.match(html, /Fecha de entrega/);
  assert.match(html, /Estado/);
  assert.match(html, /Palets/);
  assert.doesNotMatch(html, /order-detail-placeholder/);
  assert.doesNotMatch(html, /Bloqueado|En coordinación/);
  assert.doesNotMatch(html, /Preparación y entrega|Abastecimiento/);
  assert.match(html, /Frutura/);
  assert.match(html, /Proquimur/);
  assert.doesNotMatch(html, /Pamer/);
  assert.doesNotMatch(html, /<header\b/i);
  assert.doesNotMatch(html, /piloto|qué falta confirmar|tres preguntas para Jony|casos para validar|modelo completo|no confirmado/i);
});

test("publica metadatos del control operativo", async () => {
  const response = await request("/pedidos");
  const html = await response.text();
  assert.match(html, /<title>Control de operaciones<\/title>/i);
  assert.match(html, /Control de pedidos, preparación, logística y entregas de Ecoase\./i);
  assert.doesNotMatch(html, /Piloto operativo/i);
});

test("usa rutas reales sin navegación por hash", async () => {
  const rootResponse = await request("/");
  assert.equal(rootResponse.status, 307);
  assert.equal(rootResponse.headers.get("location"), "/calendario");

  for (const path of ["/pedidos", "/historial", "/calendario", "/logistica", "/produccion", "/produccion?vista=marcado", "/produccion?vista=configuracion", "/stock", "/clientes", "/productos", "/proveedores"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
  }

  const legacyCapacity = await request("/capacidad?fecha=2026-08-30");
  assert.equal(legacyCapacity.status, 307);
  assert.equal(legacyCapacity.headers.get("location"), "/produccion?vista=configuracion&fecha=2026-08-30");
  const legacyTreatment = await request("/tratamiento?fecha=2026-08-30");
  assert.equal(legacyTreatment.status, 307);
  assert.equal(legacyTreatment.headers.get("location"), "/produccion?vista=marcado&fecha=2026-08-30");
  const legacyPlan = await request("/plan?pedido=frutura-74");
  assert.equal(legacyPlan.status, 307);
  assert.equal(legacyPlan.headers.get("location"), "/produccion?pedido=frutura-74");

  const html = await (await request("/pedidos")).text();
  assert.doesNotMatch(html, /href="#/i);
  assert.match(html, /Inicio/);
  assert.match(html, /Operación/);
  assert.match(html, /Gestión/);
  assert.match(html, /Auditoría/);
  assert.match(html, /href="\/calendario"/i);
  assert.match(html, /href="\/historial"/i);
  assert.doesNotMatch(html, /href="\/plan"/i);
  assert.match(html, /href="\/logistica"/i);
  assert.match(html, /href="\/clientes"/i);
  assert.match(html, /href="\/proveedores"/i);
  assert.match(html, /href="\/productos"/i);
  assert.match(html, /href="\/produccion"/i);
  assert.doesNotMatch(html, /href="\/tratamiento"/i);
  assert.match(html, /href="\/stock"/i);
  assert.match(html, /Producción/);
  assert.match(html, /Stock/);
  assert.match(html, /aria-controls="app-navigation"/i);
});

test("administra capacidad por recurso y producto con confirmación trazable", async () => {
  const capacityPage = await request("/produccion?vista=configuracion");
  assert.equal(capacityPage.status, 200);
  const html = await capacityPage.text();
  assert.match(html, /Producción/);
  assert.match(html, /Marcado/);
  assert.match(html, /Configuración/);
  assert.match(html, /Cargando producción/);
  assert.doesNotMatch(html, /Personas disponibles/);

  const logisticsHtml = await (await request("/logistica")).text();
  assert.match(logisticsHtml, /Logística/);
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
  const createdOrder = (await created.json()).order;
  const allocation = createdOrder.lines[0].productionAllocations[0];
  assert.equal(allocation.status, "draft");

  const ruleBody = { resourceId: "internal", productId: "palbin-p02", peopleCount: 2, configurationLabel: "Fábrica ×2", normalUnitsPerDay: 30, maximumUnitsPerDay: 50, validFrom: "2026-09-01", source: "prueba" };
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

  const disposableRuleResponse = await request("/api/capacity/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceId: "blanc", productId: "pamer-p03", configurationLabel: "Regla descartable", normalUnitsPerDay: 20, maximumUnitsPerDay: 30, validFrom: "2030-01-01", source: "prueba" }) });
  assert.equal(disposableRuleResponse.status, 201);
  const disposableRule = (await disposableRuleResponse.json()).rule;
  const disposableDelete = await request(`/api/capacity/rules?id=${disposableRule.id}`, { method: "DELETE" });
  assert.equal(disposableDelete.status, 200);
  assert.equal((await disposableDelete.json()).deleted, true);

  const after = (await (await request("/api/capacity?from=2026-09-07&to=2026-09-08")).json()).capacity;
  const completedAssignment = after.production.days[0].resources.find((item) => item.resource.name === "Fábrica").assignments[0];
  assert.equal(completedAssignment.status, "completed");
  assert.equal(completedAssignment.pendingQuantity, 5);

  const override = await request("/api/capacity/daily-overrides", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-09-07", resourceId: "internal", available: false, reason: "Mantenimiento", responsible: "Encargado" }) });
  assert.equal(override.status, 200);
  const unavailable = (await (await request("/api/capacity?from=2026-09-07&to=2026-09-07")).json()).capacity;
  assert.equal(unavailable.production.days[0].resources.find((item) => item.resource.name === "Fábrica").status, "unavailable");

  const crew = await request("/api/capacity/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Cuadrilla QA", resourceType: "internal_crew", displayOrder: 40 }) });
  assert.equal(crew.status, 201);
  const crewResource = (await crew.json()).resource;
  const deactivated = await request("/api/capacity/resources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crewResource.id, active: false }) });
  assert.equal(deactivated.status, 200);

  const cleanupOrder = await request(`/api/orders/${createdOrder.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cancelled: true }) });
  assert.equal(cleanupOrder.status, 200);
});

test("registra, consulta y revierte tratamiento sin alterar el stock físico", async () => {
  const page = await request("/produccion?vista=marcado");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, />Marcado</);
  assert.doesNotMatch(html, /Tratamiento HT/);
  assert.doesNotMatch(html, />Tratamiento</);
  assert.match(html, /Cargando marcado diario/);

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
  assert.equal(dashboard.summary.processed, 10);
  assert.equal(dashboard.summary.reversed, 10);
  assert.equal(dashboard.summary.pending + dashboard.summary.ready, 35);
});

test("registra entradas, ajustes y reversiones en stock", async () => {
  const page = await request("/stock");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, />Stock</);
  assert.doesNotMatch(html, /Conciliación inicial/);

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

test("muestra el calendario amplio con vistas semanal y mensual", async () => {
  const html = await (await request("/calendario")).text();
  assert.match(html, /Semana anterior/);
  assert.match(html, /Semana siguiente/);
  assert.match(html, /Vista del calendario/);
  assert.match(html, />Semana</);
  assert.match(html, />Mes</);
  assert.match(html, /Arrastrá una tarjeta/);
  assert.match(html, /Lun/);
  assert.match(html, /Dom/);
});

test("el calendario enlaza la alerta compuesta con el filtro de stock", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/components/OperationsCalendar.tsx", import.meta.url), "utf8"));
  assert.match(source, /Alerta de stock/);
  assert.match(source, /href="\/stock\?riesgo=alerta"/);
  assert.doesNotMatch(source, /stockRisk\.message/);

  const stockHtml = await (await request("/stock?riesgo=alerta")).text();
  assert.match(stockHtml, /Con alerta/);
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
  const [pageResponse, productsResponse] = await Promise.all([request("/productos"), request("/api/products")]);
  assert.equal(pageResponse.status, 200);
  assert.equal(productsResponse.status, 200);
  const html = await pageResponse.text();
  assert.match(html, /Productos/);
  assert.match(html, /Código Zeta/);
  assert.match(html, />Producto</);
  assert.match(html, /Medida/);
  assert.match(html, /Cliente/);
  assert.match(html, /Marcado/);
  assert.match(html, /Filtrar productos por tipo/);
  assert.match(html, /Editar Pallet 106 × 119/);
  assert.doesNotMatch(html, /Producto \/ Medida/);
  assert.match(html, /216 × 110/);
  assert.doesNotMatch(html, /abiertas|cerradas|reforzadas|Mercosur liviano/i);
  const apiProducts = (await productsResponse.json()).products;
  const internalCodeNumbers = apiProducts.map((product) => Number(product.sourceCode?.match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY));
  assert.deepEqual(internalCodeNumbers, [...internalCodeNumbers].sort((left, right) => left - right));
  assert.equal(new Set(apiProducts.map((product) => product.sourceCode?.trim().toLocaleUpperCase("es"))).size, apiProducts.length);
  const measureKeys = apiProducts.map((product) => `${product.kind}|${product.measure ?? "sin medida"}`);
  assert.equal(new Set(measureKeys).size, measureKeys.length);
  assert.ok(apiProducts.every((product) => Array.isArray(product.clientNames)));
  assert.ok(apiProducts.every((product) => Object.keys(product).every((field) => ["id", "kind", "measure", "treatment", "requiresTreatment", "stockName", "sourceCatalog", "sourceCode", "zetaCode", "stockActive", "clientNames"].includes(field))));
});

test("muestra proveedores por tipo y abastecimiento", async () => {
  const [pageResponse, providersResponse] = await Promise.all([request("/proveedores"), request("/api/providers")]);
  assert.equal(pageResponse.status, 200);
  assert.equal(providersResponse.status, 200);
  const html = await pageResponse.text();
  assert.match(html, /Tipo de proveedor/);
  assert.match(html, /Qué provee/);
  assert.match(html, /Blanc/);
  assert.match(html, /Aserradero/);
  assert.match(html, /Linares/);
  assert.match(html, /Transporte/);
  assert.equal((await providersResponse.json()).providers.length, 5);
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

test("redirige el plan anterior a producción sin perder parámetros", async () => {
  const response = await request("/plan?pedido=frutura-74&fecha=2026-08-24");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/produccion?pedido=frutura-74&fecha=2026-08-24");
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
  const clientHtml = await clientPage.text();
  assert.match(clientHtml, /Ubicación en clientes/);
  assert.match(clientHtml, /href="\/clientes"/);
  assert.match(clientHtml, /Ficha del cliente/);
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

test("agrega productos y clientes mediante sus endpoints", async () => {
  const productResponse = await request("/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "Pallet", measure: "123 × 99", requiresTreatment: true, zetaCode: "Z-NEW-123" }),
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

test("edita, asigna cliente y elimina productos mediante endpoints separados", async () => {
  const before = (await (await request("/api/products")).json()).products;
  const clients = (await (await request("/api/clients")).json()).clients;
  const pamer = clients.find((client) => client.name === "Pamer");
  assert.ok(pamer?.id);
  const editResponse = await request("/api/products/palbin-p05", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "Pallet", measure: "122 × 102", stockName: "Pallet especial", zetaCode: "Z-P62", requiresTreatment: true, clientId: pamer.id }),
  });
  assert.equal(editResponse.status, 200);
  const edited = await editResponse.json();
  assert.equal(edited.product.measure, "122 × 102");
  assert.equal(edited.product.stockName, "Pallet especial");
  assert.equal(edited.product.sourceCode, "P05");
  assert.equal(edited.product.zetaCode, "Z-P62");
  assert.deepEqual(edited.product.clientNames, ["Pamer"]);
  assert.deepEqual(Object.keys(edited.product).sort(), ["clientNames", "id", "kind", "measure", "requiresTreatment", "sourceCatalog", "sourceCode", "stockActive", "stockName", "treatment", "zetaCode"]);

  const deleteResponse = await request("/api/products/palbin-p05", { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  const products = await (await request("/api/products")).json();
  assert.equal(products.products.some((product) => product.id === "palbin-p05"), false);
  assert.equal(products.products.length, before.length - 1);
});
