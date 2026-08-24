import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renderiza el piloto Ecoase como una sola pantalla", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="es">/i);
  assert.match(html, /Cómo se transforma un pedido en una entrega/);
  assert.match(html, /Del pedido al cierre/);
  assert.match(html, /Casos para validar/);
  assert.match(html, /Tres preguntas para Jony/);
  assert.match(html, /Solo lectura/);
  assert.doesNotMatch(html, /Próximos 14 días|Stock y preparación|Supuesto de demostración/i);
});

test("publica metadatos específicos del piloto", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /<title>Ecoase — Piloto operativo<\/title>/i);
  assert.match(html, /Una pantalla simple para validar cómo un pedido de Ecoase se transforma en una entrega\./i);
});
