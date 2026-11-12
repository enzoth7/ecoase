import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isOrderClosed } from "../data";
import { getOrders } from "../api/store";
import { callApi, apiErrorMessage } from "./bridge";
import { summarizeOrder } from "./operational";
import { apiTool, count, done, fail, fecha, identificador, normalize, pickKeys, todayKey, tool, type ToolContext } from "./kit";

export const guideText = `GUÍA OPERATIVA DE ECOASE

Flujo normal de un pedido
1. Pedido: crear_pedido (cliente y productos salen de ver_cliente; usá clienteProductoId).
2. Producción: planificar_produccion reparte cantidades por día y recurso. Al terminar la jornada, registrar_resultado_produccion carga lo realmente producido (destino: cliente o stock).
3. Secadero / HT (solo productos con HT): programar_secado reparte las unidades por día; registrar_ht carga el tratamiento hecho; registrar_ht_no_realizado marca lo que no se hizo.
4. Logística: crear_viaje reparte lo listo en viajes; guardar_salida agenda vehículo, chofer y horario; avanzar_viaje lo lleva por listo → cargado → despachado → entregado.
5. Seguimiento: detalle_pedido, calendario, resumen_operativo y listar_pedidos_en_riesgo.

Reglas que conviene respetar
- Capacidad, stock y fechas son advertencias, nunca bloqueos: si algo supera la capacidad o se planifica fuera de fecha, se puede guardar igual; informá la advertencia a la persona. Solo se rechaza lo incoherente (más unidades que las del pedido, datos inválidos, resultado real con fecha futura).
- Las fechas van como AAAA-MM-DD en hora de Uruguay; los momentos como ISO 8601 con zona (-03:00).
- Las cantidades de producción, secadero y HT son unidades (no "palets").
- Etapas del pedido: Planificando (amarillo), Produciendo (azul), Enviando (verde); luego Entregado o Cancelado.
- Antes de modificar o borrar, mostrale a la persona lo que vas a cambiar y pedí confirmación si hay dudas. Borrar y revertir no se puede deshacer.
- Los identificadores (pedido, línea, asignación, viaje, lote, producto, cliente) se obtienen con las herramientas de lectura; nunca los inventes.`;

export function registerReadTools(server: McpServer, context: ToolContext) {
  tool(server, context, {
    name: "guia_operativa",
    title: "Guía operativa de Ecoase",
    description: "Explica el flujo de trabajo del dashboard, las reglas y qué herramienta usar en cada paso. Leela al empezar si no conocés la operación.",
    access: "read",
    input: {},
    run: async () => done(guideText, { hoy: todayKey(), zonaHoraria: "America/Montevideo" }),
  });

  tool(server, context, {
    name: "listar_pedidos",
    title: "Listar pedidos",
    description: "Lista pedidos con su estado, cantidades, productos, producción y viajes. Filtra por abiertos, cerrados (entregados o cancelados) o todos, por cliente y por texto.",
    access: "read",
    input: {
      estado: z.enum(["abiertos", "cerrados", "todos"]).default("abiertos").describe("Abiertos = en curso; cerrados = entregados o cancelados."),
      cliente: z.string().optional().describe("Parte del nombre del cliente."),
      texto: z.string().optional().describe("Busca en referencia, producto y notas."),
      limite: z.number().int().min(1).max(200).default(50).describe("Máximo de pedidos a devolver."),
    },
    run: async ({ estado, cliente, texto, limite }) => {
      const clientNeedle = normalize(cliente ?? "");
      const textNeedle = normalize(texto ?? "");
      const matches = (await getOrders()).filter((order) => {
        if (estado === "abiertos" && isOrderClosed(order)) return false;
        if (estado === "cerrados" && !isOrderClosed(order)) return false;
        if (clientNeedle && !normalize(order.client).includes(clientNeedle)) return false;
        if (textNeedle && !normalize([order.id, order.reference, order.notes ?? "", ...order.lines.map((line) => line.product)].join(" ")).includes(textNeedle)) return false;
        return true;
      });
      return done(`Hay ${matches.length} pedido(s) ${estado === "todos" ? "" : estado}${matches.length > limite ? `; muestro los primeros ${limite}` : ""}.`, { total: matches.length, pedidos: matches.slice(0, limite).map(summarizeOrder) });
    },
  });

  apiTool(server, context, {
    name: "detalle_pedido",
    title: "Detalle completo de un pedido",
    description: "Devuelve todo un pedido por su ID: líneas con sus IDs, producción planificada y real, secadero, HT, viajes, transporte y fechas. Usalo antes de planificar o modificar.",
    access: "read",
    input: { pedidoId: identificador("ID del pedido (lo da listar_pedidos o ver_pedido).") },
    request: ({ pedidoId }) => ({ method: "GET", path: `/api/orders/${encodeURIComponent(String(pedidoId))}` }),
    summary: "Detalle del pedido.",
  });

  apiTool(server, context, {
    name: "historial_pedido",
    title: "Historial de cambios de un pedido",
    description: "Lista los cambios registrados de un pedido (quién, cuándo y qué cambió).",
    access: "read",
    input: { pedidoId: identificador("ID del pedido.") },
    request: ({ pedidoId }) => ({ method: "GET", path: `/api/orders/${encodeURIComponent(String(pedidoId))}/history` }),
    summary: (data) => `El pedido tiene ${count(data, "history")} cambio(s) registrados.`,
  });

  apiTool(server, context, {
    name: "calendario",
    title: "Calendario operativo",
    description: "Viajes, salidas de transporte, producción planificada y entregas pedidas dentro de un rango de fechas, más la capacidad de esos días. Sin fechas, usa la semana actual.",
    access: "read",
    input: { desde: fecha("Primer día.").optional(), hasta: fecha("Último día.").optional() },
    request: ({ desde, hasta }) => ({ method: "GET", path: "/api/calendar", query: { from: desde, to: hasta } }),
    summary: (data) => `Calendario: ${count(data, "calendar")} viaje(s), ${count(data, "transport")} salida(s), ${count(data, "production")} día(s) de producción.`,
  });

  apiTool(server, context, {
    name: "capacidad_produccion",
    title: "Capacidad y carga por día",
    description: "Capacidad de producción por recurso y producto, carga asignada, estado (libre, ok, sobre lo normal, sobre el máximo) y capacidad de transporte, día por día. La sobrecarga es una advertencia, no un bloqueo.",
    access: "read",
    input: { desde: fecha("Primer día."), hasta: fecha("Último día.") },
    request: ({ desde, hasta }) => ({ method: "GET", path: "/api/capacity", query: { from: desde, to: hasta } }),
    summary: "Capacidad del período.",
  });

  apiTool(server, context, {
    name: "listar_recursos_produccion",
    title: "Recursos de producción",
    description: "Fábricas, cuadrillas y aserraderos externos que producen, con qué tipos de producto produce cada uno (Pallet, Bin, Piso), orden y si están activos.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/capacity/resources" }),
    summary: (data) => `Hay ${count(data, "resources")} recurso(s) de producción.`,
  });

  apiTool(server, context, {
    name: "logistica_resumen",
    title: "Logística: panorama general",
    description: "Foto de Logística: salidas agendadas, vehículos, choferes, disponibilidad de palets listos por línea de pedido, stock y límites. Por defecto devuelve salidas, vehículos, choferes, ajustes y disponibilidad; pedí otras secciones con `secciones`.",
    access: "read",
    input: {
      secciones: z.array(z.string()).optional().describe("Secciones a devolver: runs, vehicles, drivers, settings, availability, orders, products, clients, providers, stock, classes, locations, transportCapacities, clientLimits."),
    },
    request: () => ({ method: "GET", path: "/api/logistics/snapshot" }),
    pick: (data, { secciones }) => pickKeys(data, secciones?.length ? secciones : ["runs", "vehicles", "drivers", "settings", "availability"]),
    summary: "Panorama de Logística.",
  });

  apiTool(server, context, {
    name: "logistica_configuracion",
    title: "Configuración de Logística",
    description: "Vehículos, choferes, jornada, tamaño de cada producto (chico/grande), ubicaciones, capacidades de transportistas y límites por cliente.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/logistics/config" }),
    summary: "Configuración de Logística.",
  });

  apiTool(server, context, {
    name: "listar_salidas_logistica",
    title: "Salidas de transporte",
    description: "Salidas agendadas con vehículo, chofer, horarios, ruta calculada y estado. Se puede filtrar por pedido.",
    access: "read",
    input: { pedidoId: identificador("Solo las salidas de este pedido.").optional() },
    request: ({ pedidoId }) => ({ method: "GET", path: "/api/logistics/runs", query: { orderId: pedidoId === undefined ? undefined : String(pedidoId) } }),
    summary: (data) => `Hay ${count(data, "runs")} salida(s).`,
  });

  apiTool(server, context, {
    name: "stock_producto",
    title: "Stock y movimientos de un producto",
    description: "Detalle de stock de un producto: pendiente de HT, listo, reservado, disponible y su historial de movimientos.",
    access: "read",
    input: { productoId: identificador("ID del producto (lo da listar_productos o consultar_stock).") },
    request: ({ productoId }) => ({ method: "GET", path: `/api/stock/${encodeURIComponent(String(productoId))}` }),
    summary: "Detalle de stock.",
  });

  tool(server, context, {
    name: "listar_productos",
    title: "Catálogo de productos",
    description: "Productos del catálogo con tipo (Pallet, Piso, Bin), medida, clasificación por niveles, código Zeta, si requiere HT y clientes asociados.",
    access: "read",
    input: {
      consulta: z.string().optional().describe("Texto a buscar en nombre, medida o código."),
      tipo: z.enum(["Pallet", "Piso", "Bin"]).optional(),
      limite: z.number().int().min(1).max(300).default(100),
    },
    run: async ({ consulta, tipo, limite }) => {
      const response = await callApi({ method: "GET", path: "/api/products" });
      if (!response.ok) return fail(apiErrorMessage(response));
      const needle = normalize(consulta ?? "");
      const all = ((response.data as { products?: Array<Record<string, unknown>> }).products ?? []);
      const found = all.filter((product) => (!tipo || product.kind === tipo) && (!needle || normalize(JSON.stringify(product)).includes(needle)));
      return done(`Hay ${found.length} producto(s)${found.length > limite ? `; muestro ${limite}` : ""}.`, { total: found.length, productos: found.slice(0, limite) });
    },
  });

  apiTool(server, context, {
    name: "niveles_producto",
    title: "Niveles de clasificación de productos",
    description: "Los niveles con los que se clasifican los productos (Medida, Tratamiento, etc.), sus opciones y cuántos productos usa cada una.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/product-levels" }),
    summary: "Niveles de clasificación.",
  });

  tool(server, context, {
    name: "listar_proveedores",
    title: "Proveedores y transportistas",
    description: "Aserraderos, transportistas e importadores registrados.",
    access: "read",
    input: { tipo: z.enum(["Aserradero", "Transporte", "Importador"]).optional() },
    run: async ({ tipo }) => {
      const response = await callApi({ method: "GET", path: "/api/providers" });
      if (!response.ok) return fail(apiErrorMessage(response));
      const providers = ((response.data as { providers?: Array<{ type?: string }> }).providers ?? []).filter((provider) => !tipo || provider.type === tipo);
      return done(`Hay ${providers.length} proveedor(es).`, { proveedores: providers });
    },
  });

  tool(server, context, {
    name: "ver_cliente",
    title: "Ver un cliente con sus productos",
    description: "Datos de un cliente y los productos que tiene habilitados, con el clienteProductoId que hace falta para crear pedidos y los puntos de control de cada producto.",
    access: "read",
    input: { clienteId: identificador("ID del cliente (lo da listar_clientes o clientes_con_actividad).") },
    run: async ({ clienteId }) => {
      const id = encodeURIComponent(String(clienteId));
      const [detail, options] = await Promise.all([
        callApi({ method: "GET", path: `/api/clients/${id}` }),
        callApi({ method: "GET", path: `/api/clients/${id}/products`, query: { active: true } }),
      ]);
      if (!detail.ok) return fail(apiErrorMessage(detail));
      return done("Cliente y productos habilitados para pedidos.", { cliente: detail.data, productosParaPedido: (options.data as { products?: unknown })?.products ?? [] });
    },
  });

  apiTool(server, context, {
    name: "clientes_con_actividad",
    title: "Clientes con su actividad",
    description: "Clientes con cantidad de pedidos, unidades pedidas, entregadas y pendientes, y pedidos abiertos.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/clients" }),
    summary: (data) => `Hay ${count(data, "clients")} cliente(s).`,
  });

  apiTool(server, context, {
    name: "registro_ht_dia",
    title: "Registro de HT de un día",
    description: "Resumen del secadero y los lotes de HT registrados en un día.",
    access: "read",
    input: { fecha: fecha("Día a consultar. Sin fecha, hoy.").optional() },
    request: ({ fecha: day }) => ({ method: "GET", path: "/api/treatment", query: { date: day } }),
    summary: "Registro de HT del día.",
  });

  apiTool(server, context, {
    name: "registro_ht_semana",
    title: "Programación y resultados de HT de la semana",
    description: "Para cada día del rango (máximo siete días): lo programado, lo registrado y lo que no se hizo, por pedido y producto.",
    access: "read",
    input: { desde: fecha("Primer día."), hasta: fecha("Último día, hasta siete días desde el primero.") },
    request: ({ desde, hasta }) => ({ method: "GET", path: "/api/treatment/results", query: { from: desde, to: hasta } }),
    summary: "Semana de HT.",
  });

  apiTool(server, context, {
    name: "opciones_ht",
    title: "Qué se puede registrar en HT",
    description: "Productos con HT y su stock pendiente, con los clientes, líneas de pedido y puntos de control disponibles para registrar un lote.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/treatment/options" }),
    summary: (data) => `Hay ${count(data, "options")} producto(s) con HT.`,
  });

  apiTool(server, context, {
    name: "ver_lote_ht",
    title: "Ver un lote de HT",
    description: "Detalle de un lote de HT: cantidades, controles, responsable y movimientos de stock.",
    access: "read",
    input: { loteId: identificador("ID del lote.") },
    request: ({ loteId }) => ({ method: "GET", path: `/api/treatment/batches/${encodeURIComponent(String(loteId))}` }),
    summary: "Detalle del lote.",
  });

  apiTool(server, context, {
    name: "url_archivo_producto_cliente",
    title: "Enlace temporal a un plano o foto",
    description: "Devuelve un enlace temporal para abrir un plano o foto de un producto de cliente.",
    access: "read",
    input: { archivoId: identificador("ID del archivo.") },
    request: ({ archivoId }) => ({ method: "POST", path: `/api/client-product-assets/${encodeURIComponent(String(archivoId))}/signed-url` }),
    summary: "Enlace temporal (vence en poco tiempo).",
  });
}
