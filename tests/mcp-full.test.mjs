import assert from "node:assert/strict";
import test from "node:test";

// La tienda en memoria se elige al cargar el módulo: tiene que quedar definida antes de importar la ruta.
process.env.ECOASE_DATA_BACKEND = "memory";
delete process.env.ECOASE_MCP_TOKEN;
delete process.env.ECOASE_MCP_READ_TOKEN;

const route = await import("../app/mcp/route.ts");
const WRITE_TOKEN = "token-escritura-de-prueba";
const READ_TOKEN = "token-lectura-de-prueba";
let nextId = 1;

async function rpc(method, params = {}, token) {
  const response = await route.POST(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  }));
  return { status: response.status, body: response.status === 401 ? await response.json() : await response.json() };
}

async function toolNames(token) {
  const { body } = await rpc("tools/list", {}, token);
  return body.result.tools.map((tool) => tool.name);
}

async function call(name, args = {}, token = WRITE_TOKEN) {
  const { body } = await rpc("tools/call", { name, arguments: args }, token);
  assert.ok(body.result, `Sin resultado para ${name}: ${JSON.stringify(body)}`);
  const text = body.result.content?.[0]?.text ?? "";
  const newline = text.indexOf("\n");
  let data;
  if (newline >= 0) { try { data = JSON.parse(text.slice(newline + 1)); } catch { data = undefined; } }
  return { isError: Boolean(body.result.isError), text, data, structured: body.result.structuredContent };
}

const readTools = ["guia_operativa", "resumen_operativo", "listar_pedidos", "detalle_pedido", "historial_pedido", "calendario", "capacidad_produccion", "listar_recursos_produccion",
  "logistica_resumen", "logistica_configuracion", "listar_salidas_logistica", "stock_producto", "consultar_stock", "listar_productos", "niveles_producto", "listar_proveedores",
  "ver_cliente", "listar_clientes", "clientes_con_actividad", "registro_ht_dia", "registro_ht_semana", "opciones_ht", "ver_lote_ht", "ver_pedido", "listar_pedidos_en_riesgo"];
const writeTools = ["crear_pedido", "editar_pedido", "cancelar_pedido", "eliminar_pedido", "registrar_novedad_pedido", "planificar_produccion", "mover_asignacion_produccion",
  "registrar_resultado_produccion", "programar_secado", "registrar_ht", "registrar_ht_no_realizado", "revertir_lote_ht", "asignar_transporte_pedido", "crear_viaje", "editar_viaje",
  "avanzar_viaje", "reprogramar_viaje", "guardar_salida", "calcular_ruta_salida", "guardar_configuracion_logistica", "registrar_entrada_stock", "ajustar_stock",
  "revertir_movimiento_stock", "guardar_recurso_produccion", "guardar_regla_rendimiento", "eliminar_regla_rendimiento", "guardar_capacidad_secadero", "guardar_capacidad_transporte",
  "guardar_cupos_viajes_dia", "ajustar_capacidad_dia", "guardar_cliente", "eliminar_cliente", "habilitar_producto_cliente", "editar_producto_cliente", "guardar_controles_producto_cliente",
  "eliminar_archivo_producto_cliente", "guardar_producto", "eliminar_producto", "guardar_niveles_producto", "guardar_proveedor", "eliminar_proveedor"];

test("sin tokens configurados el MCP queda abierto pero solo de lectura", async () => {
  const names = await toolNames();
  for (const name of readTools) assert.ok(names.includes(name), `Falta la herramienta de lectura ${name}`);
  for (const name of writeTools) assert.ok(!names.includes(name), `${name} no debería estar disponible sin permiso de escritura`);
});

test("con tokens configurados exige autorización y separa lectura de escritura", async () => {
  process.env.ECOASE_MCP_TOKEN = WRITE_TOKEN;
  process.env.ECOASE_MCP_READ_TOKEN = READ_TOKEN;
  try {
    const anonymous = await rpc("tools/list", {});
    assert.equal(anonymous.status, 401);
    const wrong = await rpc("tools/list", {}, "otro-token");
    assert.equal(wrong.status, 401);

    const readOnly = await toolNames(READ_TOKEN);
    assert.ok(readOnly.includes("detalle_pedido"));
    assert.ok(!readOnly.includes("crear_pedido"));

    const full = await toolNames(WRITE_TOKEN);
    for (const name of [...readTools, ...writeTools]) assert.ok(full.includes(name), `Falta ${name}`);
    assert.equal(new Set(full).size, full.length, "Hay herramientas repetidas");
  } finally {
    delete process.env.ECOASE_MCP_TOKEN;
    delete process.env.ECOASE_MCP_READ_TOKEN;
  }
});

test("todas las herramientas declaran si leen, escriben o destruyen", async () => {
  process.env.ECOASE_MCP_TOKEN = WRITE_TOKEN;
  try {
    const { body } = await rpc("tools/list", {}, WRITE_TOKEN);
    for (const tool of body.result.tools) {
      assert.ok(tool.description?.length > 20, `${tool.name} necesita una descripción`);
      assert.equal(typeof tool.annotations?.readOnlyHint, "boolean", `${tool.name} sin readOnlyHint`);
      if (readTools.includes(tool.name)) assert.equal(tool.annotations.readOnlyHint, true, `${tool.name} debería ser de lectura`);
      if (writeTools.includes(tool.name)) assert.equal(tool.annotations.readOnlyHint, false, `${tool.name} debería ser de escritura`);
    }
    const destructive = body.result.tools.filter((tool) => tool.annotations.destructiveHint).map((tool) => tool.name);
    for (const name of ["eliminar_pedido", "cancelar_pedido", "eliminar_cliente", "eliminar_producto", "eliminar_proveedor", "revertir_lote_ht", "ajustar_stock"]) assert.ok(destructive.includes(name), `${name} debería marcarse como destructiva`);
  } finally { delete process.env.ECOASE_MCP_TOKEN; }
});

test("recorre un pedido completo desde el MCP: pedido, producción, viaje y entrega", async () => {
  process.env.ECOASE_MCP_TOKEN = WRITE_TOKEN;
  try {
    const guide = await call("guia_operativa");
    assert.equal(guide.isError, false);
    assert.match(guide.text, /advertencias/i);

    // Un cliente con un producto listo para pedir. El plano se sube por la tienda porque el MCP no maneja archivos.
    const client = await call("guardar_cliente", { nombre: "Cliente flujo MCP", direccion: "Ruta 3 km 400, Paysandú", departamento: "Paysandú" });
    assert.equal(client.isError, false, client.text);
    const enabled = await call("habilitar_producto_cliente", { clienteId: client.data.client.id, productoId: "palbin-p02", controlInicial: "Revisar el plano antes de armar" });
    assert.equal(enabled.isError, false, enabled.text);
    const store = await import("../app/api/store.ts");
    await store.addClientProductAsset(enabled.data.product.id, new File(["%PDF-1.4\n%%EOF"], "plano.pdf", { type: "application/pdf" }), { altText: "Plano", assetType: "plan", isPrimary: true });
    assert.equal((await call("editar_producto_cliente", { clienteProductoId: enabled.data.product.id, activo: true })).isError, false);
    const options = await call("ver_cliente", { clienteId: client.data.client.id });
    const target = { client: client.data.client, product: options.data.productosParaPedido[0] };
    assert.ok(target.product, "El producto habilitado debería poder pedirse");

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date());
    const created = await call("crear_pedido", { productos: [{ clienteProductoId: target.product.id, cantidad: 20 }], fechaPedido: today, fechaEntrega: today });
    assert.equal(created.isError, false, created.text);
    const orderId = created.data.order.id;

    const detail = await call("detalle_pedido", { pedidoId: orderId });
    assert.equal(detail.isError, false);
    const line = detail.data.order.lines[0];
    assert.equal(line.quantity, 20);

    // Producción: superar lo que hay se rechaza; pasarse de capacidad no.
    const tooMuch = await call("planificar_produccion", { pedidoId: orderId, asignaciones: [{ lineaId: line.id, recursoId: "internal", fecha: today, cantidad: 25 }] });
    assert.equal(tooMuch.isError, true, "Más unidades que las del pedido debe rechazarse");
    const planned = await call("planificar_produccion", { pedidoId: orderId, asignaciones: [{ lineaId: line.id, recursoId: "internal", fecha: today, cantidad: 20 }] });
    assert.equal(planned.isError, false, planned.text);

    const afterPlan = (await call("detalle_pedido", { pedidoId: orderId })).data.order.lines[0].productionAllocations;
    assert.equal(afterPlan.length, 1);
    const result = await call("registrar_resultado_produccion", { asignacionId: afterPlan[0].id, cantidadReal: 20, fechaReal: today, destino: "cliente" });
    assert.equal(result.isError, false, result.text);

    // Viaje: se crea, se carga, se despacha y se entrega.
    const trip = await call("crear_viaje", { pedidoId: orderId, fecha: today, origenTransporte: "internal", lineas: [{ lineaId: line.id, cantidad: 20 }] });
    assert.equal(trip.isError, false, trip.text);
    const shipment = trip.data.shipment;
    const stateOf = async (estado, extra = {}) => call("avanzar_viaje", { viajeId: shipment.id, estado, ...extra });
    assert.equal((await stateOf("ready")).isError, false);
    assert.equal((await stateOf("loaded")).isError, false);
    assert.equal((await stateOf("dispatched", { remito: "R-MCP-1" })).isError, false);
    const delivered = await stateOf("delivered", { entregaReal: [{ lineaViajeId: shipment.lines[0].id, cantidad: 20 }] });
    assert.equal(delivered.isError, false, delivered.text);

    const closed = await call("listar_pedidos", { estado: "cerrados" });
    assert.ok(closed.data.pedidos.some((order) => order.id === orderId), "El pedido entregado pasa al historial");
    const history = await call("historial_pedido", { pedidoId: orderId });
    assert.equal(history.isError, false);
  } finally { delete process.env.ECOASE_MCP_TOKEN; }
});

test("los errores de la API llegan como mensajes claros y no como fallos", async () => {
  process.env.ECOASE_MCP_TOKEN = WRITE_TOKEN;
  try {
    const missing = await call("detalle_pedido", { pedidoId: "no-existe" });
    assert.equal(missing.isError, true);
    assert.match(missing.text, /no encontrado/i);

    const invalidDate = await rpc("tools/call", { name: "crear_pedido", arguments: { productos: [{ clienteProductoId: 1, cantidad: 5 }], fechaPedido: "ayer", fechaEntrega: "mañana" } }, WRITE_TOKEN);
    assert.equal(invalidDate.body.result.isError, true, "Una fecha inválida se rechaza antes de llegar a la API");

    const emptyCreate = await call("guardar_cliente", {});
    assert.equal(emptyCreate.isError, true);
    assert.match(emptyCreate.text, /nombre/i);
  } finally { delete process.env.ECOASE_MCP_TOKEN; }
});

test("administra clientes, recursos y proveedores", async () => {
  process.env.ECOASE_MCP_TOKEN = WRITE_TOKEN;
  try {
    const client = await call("guardar_cliente", { nombre: "Cliente MCP", direccion: "Calle 1, Paysandú", departamento: "Paysandú" });
    assert.equal(client.isError, false, client.text);
    const clientId = client.data.client.id;
    const renamed = await call("guardar_cliente", { clienteId: clientId, direccion: "Calle 2, Paysandú" });
    assert.equal(renamed.isError, false, renamed.text);
    assert.equal(renamed.data.client.address, "Calle 2, Paysandú");
    assert.equal((await call("eliminar_cliente", { clienteId: clientId })).isError, false);

    const resource = await call("guardar_recurso_produccion", { nombre: "Cuadrilla MCP", tipo: "internal_crew", produce: ["Bin"], orden: 120 });
    assert.equal(resource.isError, false, resource.text);
    const resources = (await call("listar_recursos_produccion")).data.resources;
    const created = resources.find((item) => item.name === "Cuadrilla MCP");
    assert.ok(created);
    assert.deepEqual(created.productKinds, ["Bin"]);
    const off = await call("guardar_recurso_produccion", { recursoId: created.id, activo: false });
    assert.equal(off.isError, false, off.text);

    const provider = await call("guardar_proveedor", { nombre: "Transporte MCP", tipo: "Transporte" });
    assert.equal(provider.isError, false, provider.text);
    const providers = (await call("listar_proveedores", { tipo: "Transporte" })).data.proveedores;
    assert.ok(providers.some((item) => item.name === "Transporte MCP"));
    assert.equal((await call("eliminar_proveedor", { proveedorId: provider.data.provider.id })).isError, false);
  } finally { delete process.env.ECOASE_MCP_TOKEN; }
});

test("las lecturas de capacidad, calendario, logística y stock responden", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date());
  for (const [name, args] of [
    ["calendario", {}], ["capacidad_produccion", { desde: today, hasta: today }], ["logistica_resumen", {}], ["logistica_configuracion", {}],
    ["listar_salidas_logistica", {}], ["listar_productos", { limite: 5 }], ["niveles_producto", {}], ["registro_ht_dia", {}], ["registro_ht_semana", { desde: today, hasta: today }],
    ["opciones_ht", {}], ["consultar_stock", {}], ["resumen_operativo", {}], ["listar_pedidos", {}],
  ]) {
    const response = await call(name, args, null);
    assert.equal(response.isError, false, `${name} falló: ${response.text}`);
  }
});
