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
  assert.match(html, /Pedidos en marcha/);
  assert.match(html, /Pedidos en espera/);
  assert.match(html, /Pallets por hacer/);
  assert.match(html, /Nivel de cumplimiento/);
  assert.match(html, /Período de los indicadores/);
  assert.match(html, /Esta semana/);
  assert.match(html, /Seguimiento del pedido/);
  assert.match(html, /Agregar actualización/);
  assert.match(html, /Cliente y pedido/);
  assert.match(html, /Etapa/);
  assert.match(html, /Transporte/);
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
  assert.match(html, /<title>Ecoase — Control operativo<\/title>/i);
  assert.match(html, /Control de pedidos, preparación, logística y entregas de Ecoase\./i);
  assert.doesNotMatch(html, /Piloto operativo/i);
});

test("usa rutas reales sin navegación por hash", async () => {
  const rootResponse = await request("/");
  assert.equal(rootResponse.status, 307);
  assert.equal(rootResponse.headers.get("location"), "/pedidos");

  for (const path of ["/pedidos", "/historial", "/plan", "/calendario", "/logistica", "/clientes", "/productos", "/proveedores"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
  }

  const html = await (await request("/pedidos")).text();
  assert.doesNotMatch(html, /href="#/i);
  assert.match(html, /href="\/calendario"/i);
  assert.match(html, /href="\/historial"/i);
  assert.match(html, /href="\/plan"/i);
  assert.match(html, /href="\/logistica"/i);
  assert.match(html, /href="\/clientes"/i);
  assert.match(html, /href="\/proveedores"/i);
  assert.match(html, /href="\/productos"/i);
});

test("muestra el catálogo de productos sin clientes ni catálogos", async () => {
  const [pageResponse, productsResponse] = await Promise.all([request("/productos"), request("/api/products")]);
  assert.equal(pageResponse.status, 200);
  assert.equal(productsResponse.status, 200);
  const html = await pageResponse.text();
  assert.match(html, /Productos/);
  assert.match(html, /Medida/);
  assert.match(html, /Tratamiento/);
  assert.match(html, /Filtrar productos por tipo/);
  assert.match(html, /Editar Pallet 106 × 119/);
  assert.doesNotMatch(html, /Cliente \/ asignación|Catálogo|Azucarlito|Reparados|Granja Pocha punto rojo/);
  assert.match(html, /216 × 110/);
  assert.doesNotMatch(html, /abiertas|cerradas|reforzadas|Mercosur liviano/i);
  const apiProducts = (await productsResponse.json()).products;
  const measureKeys = apiProducts.map((product) => `${product.kind}|${product.measure ?? "sin medida"}`);
  assert.equal(new Set(measureKeys).size, measureKeys.length);
  assert.ok(apiProducts.every((product) => Object.keys(product).every((field) => ["id", "kind", "measure", "treatment"].includes(field))));
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
  assert.equal((await historyResponse.json()).history.length, 10);
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
      status: "coordinacion",
      transport: "Milton",
      plannedDate: "2026-08-18",
      requested: 650,
      stage: "logistica",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.order.status, "coordinacion");
  assert.equal(payload.order.statusLabel, "En coordinación");
  assert.equal(payload.order.transport, "Milton");
  assert.match(payload.order.dateLabel, /18 de agosto/i);
  assert.equal(payload.order.plannedDate, "2026-08-18");
  assert.equal(payload.order.originalPlannedDate, "2026-08-14");
  assert.equal(payload.order.requested, 650);
  assert.equal(payload.order.lines.reduce((total, line) => total + line.quantity, 0), 650);
  assert.equal(payload.order.stage, "logistica");

  const history = await (await request("/api/orders/frutura-74/history")).json();
  assert.equal(history.history.length, 1);
  assert.equal(history.history[0].changes.some((change) => change.field === "Fecha planificada"), true);
  assert.equal(history.history[0].changes.some((change) => change.field === "Cantidad de pallets"), true);
  assert.equal(history.history[0].changes.some((change) => change.field === "Transportista"), true);
});

test("al completar un pedido se mueve al historial", async () => {
  const updateResponse = await request("/api/orders/proquimur-63", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "completado" }),
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
  assert.equal(history.history[0].kind, "direccion");
  assert.equal(history.history[0].changes.some((change) => change.field === "Dirección de entrega"), true);
  assert.equal(history.history[1].kind, "entrega");
  assert.equal(history.history[1].changes.some((change) => change.field === "Cantidad entregada"), true);
});

test("muestra el plan simplificado con edición por lápiz", async () => {
  const html = await (await request("/plan")).text();
  assert.match(html, /Cliente/);
  assert.match(html, /Cantidad de pallets/);
  assert.match(html, /Fecha planificada/);
  assert.match(html, /Etapa/);
  assert.match(html, /Transportista/);
  assert.match(html, /aria-label="Editar pedido de Frutura"/i);
  assert.doesNotMatch(html, /aria-label="Estado de Frutura"/i);
});

test("crea pedidos mediante POST /api/orders", async () => {
  const invalidTransport = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client: "Cliente prueba", product: "Pallet prueba", requested: 50, orderDate: "2026-08-01", requestedDeliveryDate: "2026-08-10", plannedDate: "2026-08-10", stage: "negociacion", transport: "Remito 603" }),
  });
  assert.equal(invalidTransport.status, 400);

  const response = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client: "Cliente prueba",
      product: "Pallet prueba",
      requested: 50,
      orderDate: "2026-08-01",
      requestedDeliveryDate: "2026-08-10",
      plannedDate: "2026-08-10",
      stage: "produccion",
      transport: "Matías",
      reference: "OC-4321",
      zetaCode: "Z-08",
      deliveryAddress: "Ruta 5 km 18",
      notes: "Descargar por el acceso norte.",
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.order.client, "Cliente prueba");
  assert.equal(payload.order.pending, 50);
  assert.equal(payload.order.orderDate, "2026-08-01");
  assert.equal(payload.order.requestedDeliveryDate, "2026-08-10");
  assert.equal(payload.order.stage, "produccion");
  assert.equal(payload.order.zetaCode, "Z-08");
  assert.equal(payload.order.deliveryAddress, "Ruta 5 km 18");
  assert.equal(payload.order.notes, "Descargar por el acceso norte.");
});

test("agrega productos y clientes mediante sus endpoints", async () => {
  const productResponse = await request("/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "Pallet", measure: "123 × 99", treatment: "HT" }),
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

test("edita y elimina productos mediante endpoints separados", async () => {
  const before = (await (await request("/api/products")).json()).products;
  const editResponse = await request("/api/products/palbin-p05", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "Pallet", measure: "122 × 102", treatment: "Marcado" }),
  });
  assert.equal(editResponse.status, 200);
  const edited = await editResponse.json();
  assert.equal(edited.product.measure, "122 × 102");
  assert.deepEqual(Object.keys(edited.product).sort(), ["id", "kind", "measure", "treatment"]);

  const deleteResponse = await request("/api/products/palbin-p05", { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  const products = await (await request("/api/products")).json();
  assert.equal(products.products.some((product) => product.id === "palbin-p05"), false);
  assert.equal(products.products.length, before.length - 1);
});
