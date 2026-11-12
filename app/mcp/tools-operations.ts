import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiTool, cantidad, clean, fecha, identificador, momento, RESPONSABLE, type ToolContext } from "./kit";

const enc = (value: string | number) => encodeURIComponent(String(value));
const responsable = z.string().min(1).optional().describe(`Quién lo hace. Si se omite, se registra «${RESPONSABLE}».`);

/** Pedidos, producción, secadero y HT. */
export function registerOperationTools(server: McpServer, context: ToolContext) {
  // ---- Pedidos -------------------------------------------------------------------------------------------------
  apiTool(server, context, {
    name: "crear_pedido",
    title: "Crear un pedido",
    description: "Crea un pedido de un cliente con uno o más productos. El cliente sale de los productos elegidos: usá el clienteProductoId que devuelve ver_cliente (productosParaPedido[].id). Las fechas pasadas o ajustadas se aceptan.",
    access: "write",
    input: {
      productos: z.array(z.object({
        clienteProductoId: identificador("ID de la relación cliente-producto (ver_cliente → productosParaPedido[].id)."),
        cantidad: cantidad("Unidades pedidas."),
      })).min(1).describe("Líneas del pedido."),
      fechaPedido: fecha("Día en que el cliente hizo el pedido."),
      fechaEntrega: fecha("Día para el que se pide la entrega."),
      notas: z.string().optional().describe("Notas internas del pedido."),
      notaFechaEntrega: z.string().optional().describe("Aclaración sobre la fecha de entrega (por ejemplo, «antes del feriado»)."),
      requiereHT: z.boolean().optional().describe("Marcar si el pedido requiere HT además del armado."),
    },
    request: (args) => ({
      method: "POST",
      path: "/api/orders",
      body: clean({
        lines: args.productos.map((line) => ({ clientProductId: line.clienteProductoId, quantity: line.cantidad })),
        orderDate: args.fechaPedido,
        plannedDate: args.fechaEntrega,
        notes: args.notas,
        deliveryDateNote: args.notaFechaEntrega,
        requiredOperations: args.requiereHT ? ["assembly", "treatment"] : undefined,
      }),
    }),
    summary: "Pedido creado.",
  });

  apiTool(server, context, {
    name: "editar_pedido",
    title: "Editar un pedido",
    description: "Cambia datos de un pedido: fecha de entrega, cantidad total pedida, origen de la producción (interna, aserradero o importación) y transporte. Indicá solo lo que cambia. Para cancelar usá cancelar_pedido.",
    access: "write",
    idempotent: true,
    input: {
      pedidoId: identificador("ID del pedido."),
      fechaEntrega: fecha("Nueva fecha de entrega.").optional(),
      cantidadTotal: z.number().positive().optional().describe("Nueva cantidad total pedida (no puede ser menor a lo ya entregado)."),
      origenProduccion: z.enum(["internal", "sawmill", "import"]).optional().describe("internal = fábrica propia; sawmill = aserradero; import = importación."),
      productorId: z.string().optional().describe("ID del aserradero o importador cuando el origen no es interno."),
      fechaProduccion: fecha("Fecha de producción.").optional(),
      fechaLlegadaImportacion: fecha("Llegada de la importación (obligatoria si el origen es import).").optional(),
      origenTransporte: z.enum(["internal", "external"]).optional().describe("internal = flota propia; external = transportista."),
      transportistaId: z.string().optional().describe("ID del transportista cuando es externo."),
    },
    request: (args) => ({
      method: "PATCH",
      path: `/api/orders/${enc(args.pedidoId)}`,
      body: clean({
        plannedDate: args.fechaEntrega, requested: args.cantidadTotal, productionSource: args.origenProduccion,
        producerProviderId: args.productorId, productionDate: args.fechaProduccion, importArrivalDate: args.fechaLlegadaImportacion,
        transportSource: args.origenTransporte, transportProviderId: args.transportistaId,
      }),
    }),
    summary: "Pedido actualizado.",
  });

  apiTool(server, context, {
    name: "cancelar_pedido",
    title: "Cancelar un pedido",
    description: "Cancela un pedido: queda en el historial como Cancelado y se liberan sus reservas. Pedí confirmación antes de usarla.",
    access: "write",
    destructive: true,
    idempotent: true,
    input: { pedidoId: identificador("ID del pedido.") },
    request: ({ pedidoId }) => ({ method: "PATCH", path: `/api/orders/${enc(pedidoId)}`, body: { cancelled: true } }),
    summary: "Pedido cancelado.",
  });

  apiTool(server, context, {
    name: "eliminar_pedido",
    title: "Eliminar un pedido",
    description: "Elimina definitivamente un pedido que no tiene movimientos de stock ni HT. No se puede deshacer. Si ya tuvo actividad, usá cancelar_pedido. Pedí confirmación explícita.",
    access: "write",
    destructive: true,
    input: { pedidoId: identificador("ID del pedido.") },
    request: ({ pedidoId }) => ({ method: "DELETE", path: `/api/orders/${enc(pedidoId)}` }),
    summary: "Pedido eliminado.",
  });

  apiTool(server, context, {
    name: "registrar_novedad_pedido",
    title: "Registrar una novedad del pedido",
    description: "Registra una entrega parcial, un cambio de dirección, un despacho o una incidencia en el pedido. Para viajes con cargas y remitos preferí crear_viaje y avanzar_viaje.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      tipo: z.enum(["entrega", "direccion", "despacho", "incidencia"]),
      cantidadEntregada: cantidad("Unidades entregadas (solo para «entrega»).").optional(),
      direccion: z.string().optional().describe("Nueva dirección de entrega (solo para «direccion»)."),
      fechaDespacho: momento("Cuándo salió (solo «despacho»).").optional(),
      fechaEntrega: momento("Cuándo se entregó (solo «entrega»).").optional(),
      nota: z.string().optional().describe("Detalle. Obligatorio para «incidencia»."),
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc(args.pedidoId)}/updates`,
      body: clean({ kind: args.tipo, deliveredQuantity: args.cantidadEntregada, deliveryAddress: args.direccion, dispatchedAt: args.fechaDespacho, deliveredAt: args.fechaEntrega, note: args.nota }),
    }),
    summary: "Novedad registrada.",
  });

  // ---- Producción ----------------------------------------------------------------------------------------------
  apiTool(server, context, {
    name: "planificar_produccion",
    title: "Planificar la producción de un pedido",
    description: "Define qué se produce, dónde y cuándo. REEMPLAZA toda la planificación pendiente del pedido: incluí todas las asignaciones que querés conservar. Lo ya producido no se toca. Superar la capacidad de un día no la bloquea (es una advertencia); lo que sí se rechaza es asignar más unidades que las del pedido. Los IDs de línea salen de detalle_pedido y los de recurso de listar_recursos_produccion.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      asignaciones: z.array(z.object({
        lineaId: z.string().min(1).describe("ID de la línea del pedido."),
        recursoId: identificador("ID del recurso de producción."),
        fecha: fecha("Día de producción."),
        cantidad: cantidad("Unidades a producir ese día."),
      })).describe("Lista completa de asignaciones. Vacía = quitar toda la planificación pendiente."),
    },
    request: ({ pedidoId, asignaciones }) => ({
      method: "POST",
      path: `/api/orders/${enc(pedidoId)}/production-plan`,
      body: { allocations: asignaciones.map((item) => ({ orderLineId: item.lineaId, resourceId: String(item.recursoId), plannedDate: item.fecha, plannedQuantity: item.cantidad })) },
    }),
    summary: "Producción planificada.",
  });

  apiTool(server, context, {
    name: "mover_asignacion_produccion",
    title: "Mover una asignación de producción a otro día",
    description: "Cambia el día de una asignación de producción (el ID sale de detalle_pedido → líneas → productionAllocations). Solo asignaciones sin resultado.",
    access: "write",
    idempotent: true,
    input: { asignacionId: identificador("ID de la asignación."), fecha: fecha("Nuevo día de producción.") },
    request: ({ asignacionId, fecha: plannedDate }) => ({ method: "PATCH", path: `/api/production-allocations/${enc(asignacionId)}/move`, body: { plannedDate } }),
    summary: "Asignación movida.",
  });

  apiTool(server, context, {
    name: "registrar_resultado_produccion",
    title: "Registrar lo realmente producido",
    description: "Carga el resultado real de una asignación de producción: cuántas unidades se hicieron y qué día. Si se produjo algo, indicá el destino: «cliente» (queda para el pedido) o «stock». Con 0 unidades queda como no producido. La fecha real no puede ser futura.",
    access: "write",
    input: {
      asignacionId: identificador("ID de la asignación."),
      cantidadReal: z.number().int().min(0).describe("Unidades producidas realmente."),
      fechaReal: fecha("Día en que se produjo."),
      destino: z.enum(["cliente", "stock"]).optional().describe("Obligatorio si cantidadReal > 0."),
      nota: z.string().optional(),
    },
    request: (args) => ({
      method: "POST",
      path: `/api/production-allocations/${enc(args.asignacionId)}/result`,
      body: clean({ actualQuantity: args.cantidadReal, actualDate: args.fechaReal, destination: args.destino === "cliente" ? "client" : args.destino === "stock" ? "stock" : undefined, note: args.nota }),
    }),
    summary: "Resultado de producción registrado.",
  });

  // ---- Secadero y HT -------------------------------------------------------------------------------------------
  apiTool(server, context, {
    name: "programar_secado",
    title: "Programar el secadero de un pedido",
    description: "Programa cuántas unidades con HT entran al secadero cada día. Con `asignaciones` se define día y cantidad por línea (recomendado); sin ellas, solo el rango de fechas. Superar la capacidad diaria del secadero no la bloquea.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      asignaciones: z.array(z.object({
        lineaId: z.string().min(1).describe("ID de la línea del pedido."),
        fecha: fecha("Día de secado."),
        cantidad: cantidad("Unidades que se tratan ese día."),
      })).optional(),
      fechaInicio: fecha("Primer día (si no se detallan asignaciones).").optional(),
      fechaFin: fecha("Último día (si no se detallan asignaciones).").optional(),
      nota: z.string().optional(),
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc(args.pedidoId)}/drying`,
      body: clean({
        startDate: args.fechaInicio, endDate: args.fechaFin, note: args.nota,
        allocations: args.asignaciones?.map((item) => ({ orderLineId: item.lineaId, date: item.fecha, quantity: item.cantidad })),
      }),
    }),
    summary: "Secadero programado.",
  });

  apiTool(server, context, {
    name: "registrar_ht",
    title: "Registrar un tratamiento HT realizado",
    description: "Registra unidades tratadas con HT: pasan de «pendiente de HT» a «listas». Si el stock pendiente no alcanza (producción sin cargar), se guarda igual y el saldo queda negativo como advertencia. Para asociarlo a un pedido indicá lineaPedidoId (de detalle_pedido); sin línea es stock general. Los controles son opcionales.",
    access: "write",
    input: {
      productoId: identificador("ID del producto (de opciones_ht)."),
      cantidad: cantidad("Unidades tratadas."),
      momento: momento("Cuándo se hizo. Si se omite, ahora.").optional(),
      responsable,
      lineaPedidoId: z.string().optional().describe("Línea del pedido a la que corresponde."),
      clienteProductoId: identificador("Relación cliente-producto (se deduce de la línea si se indica).").optional(),
      nota: z.string().optional().describe("Observación. Obligatoria solo si algún control es «No conforme»."),
      controles: z.array(z.object({
        controlId: identificador("ID del punto de control (de opciones_ht)."),
        resultado: z.enum(["pass", "fail"]).describe("pass = conforme; fail = no conforme (exige nota)."),
        nota: z.string().optional(),
      })).optional(),
    },
    request: (args) => ({
      method: "POST",
      path: "/api/treatment/batches",
      body: clean({
        productId: String(args.productoId), quantity: args.cantidad, performedAt: args.momento ?? new Date().toISOString(),
        responsible: args.responsable ?? RESPONSABLE, orderLineId: args.lineaPedidoId, clientProductId: args.clienteProductoId, note: args.nota,
        controls: args.controles?.map((control) => ({ controlId: control.controlId, result: control.resultado, note: control.nota })) ?? [],
      }),
    }),
    summary: "HT registrado.",
  });

  apiTool(server, context, {
    name: "registrar_ht_no_realizado",
    title: "Registrar que el HT programado no se hizo",
    description: "Marca que lo programado en el secadero para un día no se realizó (queda en rojo en el calendario y vuelve a quedar pendiente). La fecha no puede ser futura.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      lineaId: z.string().min(1).describe("ID de la línea del pedido."),
      fecha: fecha("Día programado que no se cumplió."),
      responsable,
      nota: z.string().optional().describe("Motivo."),
    },
    request: (args) => ({
      method: "POST",
      path: "/api/treatment/results",
      body: clean({ orderId: String(args.pedidoId), orderLineId: args.lineaId, date: args.fecha, responsible: args.responsable ?? RESPONSABLE, note: args.nota }),
    }),
    summary: "Registrado como no realizado.",
  });

  apiTool(server, context, {
    name: "revertir_lote_ht",
    title: "Revertir un lote de HT",
    description: "Anula un lote de HT: las unidades vuelven a «pendiente de HT». Queda registrado el motivo. Solo se revierte una vez. Pedí confirmación.",
    access: "write",
    destructive: true,
    input: {
      loteId: identificador("ID del lote."),
      motivo: z.string().min(1).describe("Por qué se revierte."),
      responsable,
      momento: momento("Cuándo se revierte. Si se omite, ahora.").optional(),
    },
    request: (args) => ({
      method: "POST",
      path: `/api/treatment/batches/${enc(args.loteId)}/reverse`,
      body: { note: args.motivo, responsible: args.responsable ?? RESPONSABLE, performedAt: args.momento ?? new Date().toISOString() },
    }),
    summary: "Lote revertido.",
  });
}
