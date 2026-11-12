import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClients, getClientDetail, getOrders, getStockSummary } from "../api/store";
import {
  buildOperationalAlerts,
  filterOperationalOrders,
  summarizeOrder,
  type AlertSeverity,
} from "./operational";
import { shrink } from "./bridge";
import { addDays, isoDate, normalize, todayKey, type ToolContext } from "./kit";
import { registerAdminTools } from "./tools-admin";
import { registerLogisticsTools } from "./tools-logistics";
import { registerOperationTools } from "./tools-operations";
import { registerReadTools } from "./tools-read";

const severities: AlertSeverity[] = ["critical", "high", "medium"];

function resolveRange(from?: string, to?: string) {
  const today = todayKey();
  const resolvedFrom = from && isoDate.test(from) ? from : today;
  const resolvedTo = to && isoDate.test(to) ? to : addDays(resolvedFrom, 50);
  if (resolvedFrom > resolvedTo) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  return { from: resolvedFrom, to: resolvedTo, today };
}

function textResult(summary: string, data: unknown) {
  return {
    structuredContent: { data },
    content: [{ type: "text" as const, text: `${summary}\n${JSON.stringify(shrink(data))}` }],
  };
}

export type EcoaseMcpOptions = { canWrite?: boolean };

export function createEcoaseMcpServer(options: EcoaseMcpOptions = {}) {
  const context: ToolContext = { canWrite: Boolean(options.canWrite) };
  const server = new McpServer(
    { name: "ecoase-control-operativo", version: "1.0.0" },
    {
      instructions: [
        "Control operativo de Ecoase: pedidos, producción, secadero y HT, logística, stock, capacidad, clientes, productos y proveedores.",
        "Empezá con guia_operativa si no conocés el flujo. Para saber qué pasa usá resumen_operativo, listar_pedidos, detalle_pedido y calendario; informá siempre el período consultado y no presentes una alerta como certeza si depende de datos faltantes.",
        options.canWrite
          ? "Esta conexión puede modificar datos: antes de crear, cambiar, cancelar, borrar o revertir, confirmá con la persona lo que vas a hacer (salvo que ya lo haya pedido de forma explícita) y, después de escribir, volvé a leer para verificar el resultado."
          : "Esta conexión es de solo lectura: no hay herramientas para modificar datos.",
        "Capacidad, stock y fechas son advertencias, no bloqueos: si algo se pasa de la capacidad, guardalo igual e informá la advertencia. Nunca inventes identificadores: obtenelos con las herramientas de lectura.",
      ].join("\n"),
    },
  );

  server.registerTool(
    "resumen_operativo",
    {
      title: "Resumen operativo de Ecoase",
      description: "Resume pedidos abiertos, entregas y alertas de Ecoase para un período. Usalo para preguntas como qué pasa en los próximos días o qué cambió en la operación.",
      inputSchema: {
        desde: z.string().regex(isoDate).optional().describe("Fecha inicial YYYY-MM-DD. Por defecto, hoy en Uruguay."),
        hasta: z.string().regex(isoDate).optional().describe("Fecha final YYYY-MM-DD. Por defecto, 50 días desde la fecha inicial."),
        clientes: z.array(z.string().min(1)).max(10).optional().describe("Nombres exactos de clientes. Si se omite, incluye todos."),
      },
      outputSchema: { data: z.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ desde, hasta, clientes }) => {
      const range = resolveRange(desde, hasta);
      const allOrders = await getOrders();
      const orders = filterOperationalOrders(allOrders, { from: range.from, to: range.to, clients: clientes });
      const alerts = buildOperationalAlerts(orders, range.today);
      const deliveries = orders.flatMap((order) => (order.shipments ?? [])
        .filter((shipment) => !["cancelled", "delivered"].includes(shipment.status) && shipment.plannedDate >= range.from && shipment.plannedDate <= range.to)
        .map((shipment) => ({
          date: shipment.plannedDate,
          orderId: order.id,
          reference: order.reference,
          client: order.client,
          status: shipment.status,
          transport: shipment.transportLabel,
          quantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0),
        })));
      const data = {
        period: { from: range.from, to: range.to, generatedAt: new Date().toISOString(), timeZone: "America/Montevideo" },
        filters: { clients: clientes ?? [] },
        totals: {
          openOrders: orders.length,
          pendingUnits: orders.reduce((sum, order) => sum + order.pending, 0),
          plannedDeliveries: deliveries.length,
          alerts: alerts.length,
          criticalAlerts: alerts.filter((alert) => alert.severity === "critical").length,
        },
        orders: orders.map(summarizeOrder),
        deliveries: deliveries.sort((a, b) => a.date.localeCompare(b.date)),
        alerts: alerts.slice(0, 50),
      };
      return textResult(`Entre ${range.from} y ${range.to} hay ${orders.length} pedidos abiertos, ${deliveries.length} entregas previstas y ${alerts.length} alertas.`, data);
    },
  );

  server.registerTool(
    "listar_pedidos_en_riesgo",
    {
      title: "Listar pedidos en riesgo",
      description: "Lista alertas operativas por atraso, HT, producción o transporte. Permite filtrar por cliente, fechas y severidad.",
      inputSchema: {
        desde: z.string().regex(isoDate).optional(),
        hasta: z.string().regex(isoDate).optional(),
        clientes: z.array(z.string().min(1)).max(10).optional(),
        severidad: z.enum(severities).optional(),
      },
      outputSchema: { data: z.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ desde, hasta, clientes, severidad }) => {
      const range = resolveRange(desde, hasta);
      const allOrders = await getOrders();
      const orders = filterOperationalOrders(allOrders, { from: range.from, to: range.to, clients: clientes });
      const alerts = buildOperationalAlerts(orders, range.today).filter((alert) => !severidad || alert.severity === severidad);
      return textResult(`Encontré ${alerts.length} alertas para el período ${range.from} a ${range.to}.`, {
        period: { from: range.from, to: range.to, generatedAt: new Date().toISOString() },
        alerts,
      });
    },
  );

  server.registerTool(
    "ver_pedido",
    {
      title: "Ver un pedido",
      description: "Busca un pedido de Ecoase por ID, referencia o nombre de cliente y devuelve su estado, productos, producción, HT y viajes.",
      inputSchema: { consulta: z.string().min(1).describe("ID, referencia o nombre del cliente.") },
      outputSchema: { data: z.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ consulta }) => {
      const needle = normalize(consulta);
      const orders = await getOrders();
      const matches = orders.filter((order) => [order.id, order.reference, order.client].some((value) => normalize(value).includes(needle)));
      const data = matches.slice(0, 20).map(summarizeOrder);
      return textResult(matches.length ? `Encontré ${matches.length} pedido(s) relacionados con “${consulta}”.` : `No encontré pedidos relacionados con “${consulta}”.`, data);
    },
  );

  server.registerTool(
    "listar_clientes",
    {
      title: "Listar clientes y productos",
      description: "Busca clientes de Ecoase y muestra los productos habilitados para cada uno. Usalo para saber qué compra o utiliza un cliente.",
      inputSchema: { consulta: z.string().optional().describe("Parte del nombre del cliente. Si se omite, lista todos.") },
      outputSchema: { data: z.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ consulta }) => {
      const needle = normalize(consulta ?? "");
      const clients = (await getClients()).filter((client) => !needle || normalize(client.name).includes(needle)).slice(0, 50);
      const details = await Promise.all(clients.map((client) => getClientDetail(client.id)));
      const data = details.filter((detail) => detail !== null).map((detail) => ({
        id: detail.client.id,
        name: detail.client.name,
        address: detail.client.address,
        department: detail.client.department,
        active: detail.client.active,
        updatedAt: detail.client.updatedAt,
        products: detail.products.filter((product) => product.active).map((product) => ({
          id: product.productId,
          clientProductId: product.id,
          name: product.operationalName ?? product.product.stockName ?? `${product.product.kind} ${product.product.measure ?? ""}`.trim(),
          zetaCode: product.product.zetaCode ?? product.zetaCode,
          requiresTreatment: product.product.requiresTreatment,
          controls: product.controls.filter((control) => control.active).map((control) => control.title),
        })),
      }));
      return textResult(`Encontré ${data.length} cliente(s).`, data);
    },
  );

  server.registerTool(
    "consultar_stock",
    {
      title: "Consultar stock",
      description: "Consulta stock físico, pendiente de HT, listo, reservado y disponible por producto.",
      inputSchema: {
        consulta: z.string().optional().describe("Nombre, medida o código del producto."),
      },
      outputSchema: { data: z.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ consulta }) => {
      const needle = normalize(consulta ?? "");
      const rows = (await getStockSummary()).filter((row) => {
        const searchable = [row.product.id, row.product.stockName, row.product.kind, row.product.measure, row.product.zetaCode].filter(Boolean).join(" ");
        return !needle || normalize(searchable).includes(needle);
      });
      const data = rows.map((row) => ({
        productId: row.product.id,
        product: row.product.stockName ?? `${row.product.kind} ${row.product.measure ?? ""}`.trim(),
        zetaCode: row.product.zetaCode,
        pendingTreatment: row.pending,
        ready: row.ready,
        reserved: row.reserved,
        available: row.available,
        physical: row.physical,
        nextDelivery: row.nextDelivery,
        lastMovementAt: row.lastMovementAt,
      }));
      return textResult(`Encontré ${data.length} producto(s) en stock.`, data);
    },
  );

  registerReadTools(server, context);
  registerOperationTools(server, context);
  registerLogisticsTools(server, context);
  registerAdminTools(server, context);

  return server;
}

