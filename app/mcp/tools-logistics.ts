import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiTool, cantidad, clean, fecha, identificador, momento, RESPONSABLE, type ToolContext } from "./kit";

const enc = (value: string | number) => encodeURIComponent(String(value));
const responsable = z.string().min(1).optional().describe(`Quién lo hace. Si se omite, se registra «${RESPONSABLE}».`);
const lineasViaje = z.array(z.object({
  lineaId: z.string().min(1).describe("ID de la línea del pedido (de detalle_pedido)."),
  cantidad: cantidad("Unidades que van en este viaje."),
})).min(1);

/** Viajes, salidas de transporte y configuración de Logística. */
export function registerLogisticsTools(server: McpServer, context: ToolContext) {
  apiTool(server, context, {
    name: "asignar_transporte_pedido",
    title: "Asignar transporte a un pedido",
    description: "Define si el pedido va con flota propia o con un transportista externo (existente o nuevo). Aplica a los viajes aún planificados.",
    access: "write",
    idempotent: true,
    input: {
      pedidoId: identificador("ID del pedido."),
      origen: z.enum(["internal", "external"]).describe("internal = flota propia; external = transportista."),
      transportistaId: z.string().optional().describe("ID del transportista registrado (listar_proveedores tipo Transporte)."),
      nuevoTransportista: z.string().optional().describe("Nombre de un transportista nuevo para crearlo en el momento."),
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc(args.pedidoId)}/transport`,
      body: clean({ source: args.origen, providerId: args.transportistaId, newProviderName: args.nuevoTransportista }),
    }),
    summary: "Transporte asignado.",
  });

  apiTool(server, context, {
    name: "crear_viaje",
    title: "Crear un viaje de un pedido",
    description: "Crea un viaje con las unidades de cada línea que van ese día. Se pueden hacer varios viajes por pedido. Enviar más de lo que está listo, o más de lo que cabe en el vehículo, es una advertencia y no lo bloquea; lo que se rechaza es superar lo que falta enviar del pedido.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      fecha: fecha("Día del viaje."),
      origenTransporte: z.enum(["internal", "external"]).default("internal").describe("internal = flota propia; external = transportista."),
      transportistaId: z.string().optional().describe("Transportista si el origen es external."),
      lineas: lineasViaje,
      responsable,
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc(args.pedidoId)}/shipments`,
      body: clean({
        plannedDate: args.fecha, transportSource: args.origenTransporte, transportProviderId: args.transportistaId,
        responsible: args.responsable ?? RESPONSABLE, lines: args.lineas.map((line) => ({ orderLineId: line.lineaId, plannedQuantity: line.cantidad })),
      }),
    }),
    summary: "Viaje creado.",
  });

  apiTool(server, context, {
    name: "editar_viaje",
    title: "Editar un viaje planificado",
    description: "Cambia fecha, transporte o cantidades de un viaje que todavía está planificado. Reemplaza las líneas: indicá todas las que quedan.",
    access: "write",
    idempotent: true,
    input: {
      viajeId: identificador("ID del viaje (de detalle_pedido → shipments o calendario)."),
      fecha: fecha("Día del viaje."),
      origenTransporte: z.enum(["internal", "external"]).default("internal"),
      transportistaId: z.string().optional(),
      lineas: lineasViaje,
      responsable,
    },
    request: (args) => ({
      method: "PATCH",
      path: `/api/shipments/${enc(args.viajeId)}`,
      body: clean({
        plannedDate: args.fecha, transportSource: args.origenTransporte, transportProviderId: args.transportistaId,
        responsible: args.responsable ?? RESPONSABLE, lines: args.lineas.map((line) => ({ orderLineId: line.lineaId, plannedQuantity: line.cantidad })),
      }),
    }),
    summary: "Viaje actualizado.",
  });

  apiTool(server, context, {
    name: "avanzar_viaje",
    title: "Avanzar el estado de un viaje",
    description: "Lleva un viaje al paso siguiente: ready (pronto) → loaded (cargado) → dispatched (despachado) → delivered (entregado), o lo cancela con cancelled. Al cargar se pueden informar las unidades realmente cargadas por línea (cargaReal) y al entregar las realmente entregadas (entregaReal). Al despachar se descuenta el stock; si no alcanza queda registrada una incidencia, no se bloquea.",
    access: "write",
    input: {
      viajeId: identificador("ID del viaje."),
      estado: z.enum(["ready", "loaded", "dispatched", "delivered", "cancelled"]).describe("Estado al que pasa."),
      remito: z.string().optional().describe("Número de remito."),
      motivoRemitoCompartido: z.string().optional().describe("Si el remito se comparte con otro viaje, por qué."),
      cargaReal: z.array(z.object({ lineaViajeId: identificador("ID de la línea del viaje."), cantidad: z.number().int().min(0) })).optional().describe("Unidades realmente cargadas (al pasar a loaded)."),
      entregaReal: z.array(z.object({ lineaViajeId: identificador("ID de la línea del viaje."), cantidad: z.number().int().min(0) })).optional().describe("Unidades realmente entregadas (al pasar a delivered)."),
      responsable,
    },
    request: (args) => ({
      method: "POST",
      path: `/api/shipments/${enc(args.viajeId)}/transition`,
      body: clean({
        nextStatus: args.estado, remittance: args.remito, sharedRemittanceReason: args.motivoRemitoCompartido, responsible: args.responsable ?? RESPONSABLE,
        loadedLines: args.cargaReal?.map((line) => ({ shipmentLineId: String(line.lineaViajeId), loadedQuantity: line.cantidad })),
        deliveredLines: args.entregaReal?.map((line) => ({ shipmentLineId: String(line.lineaViajeId), deliveredQuantity: line.cantidad })),
      }),
    }),
    summary: (data) => `Viaje actualizado${(data as { auditWarning?: string })?.auditWarning ? `. Aviso: ${(data as { auditWarning?: string }).auditWarning}` : "."}`,
  });

  apiTool(server, context, {
    name: "reprogramar_viaje",
    title: "Reprogramar un viaje a otro día",
    description: "Mueve un viaje planificado o pronto a otra fecha y deja registrado el motivo.",
    access: "write",
    input: {
      viajeId: identificador("ID del viaje."),
      nuevaFecha: fecha("Nuevo día."),
      motivo: z.enum(["production", "logistics", "client", "weather", "other"]).describe("production = producción; logistics = logística; client = cliente; weather = clima; other = otro."),
      nota: z.string().optional(),
      responsable,
    },
    request: (args) => ({
      method: "POST",
      path: `/api/shipments/${enc(args.viajeId)}/reschedule`,
      body: clean({ newDate: args.nuevaFecha, reason: args.motivo, note: args.nota, responsible: args.responsable ?? RESPONSABLE }),
    }),
    summary: "Viaje reprogramado.",
  });

  apiTool(server, context, {
    name: "guardar_salida",
    title: "Agendar o editar una salida de transporte",
    description: "Agenda la salida de un viaje (vehículo, chofer, horarios y destino) o la edita si pasás salidaId. Modos: delivery (entrega con flota propia o transportista), customer_pickup (retira el cliente), supplier_pickup (retiro en un proveedor). Los solapamientos de vehículo o chofer y las salidas fuera de jornada son advertencias.",
    access: "write",
    input: {
      salidaId: identificador("ID de la salida a editar. Si se omite, se crea una nueva.").optional(),
      modo: z.enum(["delivery", "customer_pickup", "supplier_pickup"]),
      fecha: fecha("Día de la salida."),
      viajeId: identificador("Viaje al que corresponde (delivery y customer_pickup).").optional(),
      proveedorId: z.string().optional().describe("Proveedor a retirar (solo supplier_pickup)."),
      vehiculoId: z.string().optional().describe("ID del vehículo (de logistica_configuracion)."),
      choferId: z.string().optional().describe("ID del chofer. Si se omite, el habitual del vehículo."),
      salida: momento("Hora de salida.").optional(),
      regreso: momento("Hora de regreso.").optional(),
      estado: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
      direccionDestino: z.string().optional(),
      nota: z.string().optional(),
      responsable,
    },
    request: (args) => ({
      method: "POST",
      path: "/api/logistics/runs",
      body: clean({
        id: args.salidaId, mode: args.modo, plannedDate: args.fecha, shipmentId: args.viajeId, providerId: args.proveedorId,
        vehicleId: args.vehiculoId, driverId: args.choferId, plannedStartAt: args.salida, plannedEndAt: args.regreso, status: args.estado,
        destinationAddress: args.direccionDestino, note: args.nota, responsible: args.responsable ?? RESPONSABLE,
      }),
    }),
    summary: "Salida guardada.",
  });

  apiTool(server, context, {
    name: "calcular_ruta_salida",
    title: "Calcular la ruta y la hora de regreso",
    description: "Calcula el recorrido, la distancia, la duración y la hora estimada de regreso del camión de una salida. Necesita dirección de destino y horario de salida.",
    access: "write",
    idempotent: true,
    input: { salidaId: identificador("ID de la salida.") },
    request: ({ salidaId }) => ({ method: "POST", path: `/api/logistics/routes/${enc(salidaId)}` }),
    summary: "Ruta calculada.",
  });

  apiTool(server, context, {
    name: "guardar_configuracion_logistica",
    title: "Guardar configuración de Logística",
    description: [
      "Crea o actualiza un dato de configuración de Logística según `tipo`; `datos` lleva los campos de ese tipo:",
      "• vehicle: id, name, smallCapacity (chicos), largeCapacity (grandes), habitualDriverId, lengthM, widthM, heightM, weightT, active.",
      "• driver: id, name, active.",
      "• settings: originAddress, shiftStart, shiftEnd (HH:MM), breakMinutes, loadMinutes, unloadMinutes, marginMinutes.",
      "• class: productId, palletClass (small | large | unclassified | auto), reason.",
      "• location: entityType (client | provider), entityId, address, latitude, longitude, precision (exact | city | unknown), verified.",
      "• transport_capacity: source (provider | customer_pickup), providerId, smallCapacity, largeCapacity.",
      "• client_limit: clientId, distanceKm, travelHours, handlingMinutes, ordersPerDay.",
    ].join("\n"),
    access: "write",
    idempotent: true,
    input: {
      tipo: z.enum(["settings", "vehicle", "driver", "class", "location", "transport_capacity", "client_limit"]),
      datos: z.record(z.string(), z.unknown()).describe("Campos del tipo elegido."),
    },
    request: ({ tipo, datos }) => ({ method: "PUT", path: "/api/logistics/config", body: { ...datos, kind: tipo } }),
    summary: "Configuración guardada.",
  });
}
