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

test("renderiza el dashboard Ecoase sin contenido del starter", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="es">/i);
  assert.match(html, /Ecoase/);
  assert.match(html, /Lo que necesita atención/);
  assert.match(html, /Demostración de solo lectura/);
  assert.match(html, /Pedidos/);
  assert.match(html, /Stock y preparación/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Building your site|react-loading-skeleton/i);
});

test("publica metadatos específicos de Ecoase", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /<title>Ecoase — Control operativo<\/title>/i);
  assert.match(html, /Una lectura simple de pedidos, stock, preparación y entregas de Ecoase\./i);
});
