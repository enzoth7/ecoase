import assert from "node:assert/strict";
import test from "node:test";

async function request(path = "/", init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, init ?? { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const render = () => request("/pedidos");

test("renderiza un dashboard operativo de pedidos", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="es">/i);
  assert.match(html, /Control operativo/);
  assert.match(html, /Control operativo/);
  assert.doesNotMatch(html, /Pedidos y logística|Cartera operativa|Entregas y transporte|Relación comercial/i);
  assert.match(html, /app-sidebar/);
  assert.match(html, /En gestión/);
  assert.match(html, /Completados/);
  assert.match(html, /Secciones principales/);
  assert.match(html, /Clientes/);
  assert.match(html, /Calendario/);
  assert.match(html, /Preparación y entrega/);
  assert.match(html, /Abastecimiento/);
  assert.match(html, /Logística/);
  assert.match(html, /Frutura/);
  assert.match(html, /Proquimur/);
  assert.doesNotMatch(html, /<header\b/i);
  assert.doesNotMatch(html, /piloto|qué falta confirmar|tres preguntas para Jony|casos para validar|modelo completo|no confirmado/i);
});

test("publica metadatos del control operativo", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /<title>Ecoase — Control operativo<\/title>/i);
  assert.match(html, /Control de pedidos, preparación, logística y entregas de Ecoase\./i);
  assert.doesNotMatch(html, /Piloto operativo/i);
});

test("usa rutas reales sin navegación por hash", async () => {
  const rootResponse = await request("/");
  assert.equal(rootResponse.status, 307);
  assert.equal(rootResponse.headers.get("location"), "/pedidos");

  for (const path of ["/pedidos", "/calendario", "/logistica", "/clientes"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
  }

  const html = await (await request("/pedidos")).text();
  assert.doesNotMatch(html, /href="#/i);
  assert.match(html, /href="\/calendario"/i);
  assert.match(html, /href="\/logistica"/i);
  assert.match(html, /href="\/clientes"/i);
});

test("expone endpoints separados para cada módulo", async () => {
  const [ordersResponse, clientsResponse, calendarResponse, logisticsResponse] = await Promise.all([
    request("/api/orders"),
    request("/api/clients"),
    request("/api/calendar"),
    request("/api/logistics"),
  ]);

  assert.equal(ordersResponse.status, 200);
  assert.equal(clientsResponse.status, 200);
  assert.equal(calendarResponse.status, 200);
  assert.equal(logisticsResponse.status, 200);
  assert.equal((await ordersResponse.json()).orders.length, 12);
  assert.ok((await clientsResponse.json()).clients.length > 0);
  assert.equal((await calendarResponse.json()).calendar.length, 12);
  assert.equal((await logisticsResponse.json()).logistics.length, 12);
});

test("crea pedidos mediante POST /api/orders", async () => {
  const response = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client: "Cliente prueba",
      product: "Pallet prueba",
      requested: 50,
      dateLabel: "Lunes 10",
      transport: "Propio",
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.order.client, "Cliente prueba");
  assert.equal(payload.order.pending, 50);
});
