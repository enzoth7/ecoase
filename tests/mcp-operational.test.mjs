import assert from "node:assert/strict";
import test from "node:test";

test("MCP endpoint is present and registers the pilot read-only tools", async () => {
  const route = await import("../app/mcp/route.ts");
  assert.equal(typeof route.POST, "function");
  assert.equal(typeof route.OPTIONS, "function");

  const initialized = await route.POST(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ecoase-test", version: "1.0.0" } } }),
  }));
  assert.equal(initialized.status, 200);
  const initBody = await initialized.json();
  assert.equal(initBody.result.serverInfo.name, "ecoase-control-operativo");

  const listed = await route.POST(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  }));
  assert.equal(listed.status, 200);
  const tools = (await listed.json()).result.tools.map((tool) => tool.name);
  assert.deepEqual(tools, ["resumen_operativo", "listar_pedidos_en_riesgo", "ver_pedido", "listar_clientes", "consultar_stock"]);
});

