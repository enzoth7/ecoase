import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiErrorMessage, callApi } from "./bridge";
import { apiTool, clean, done, fail, fecha, identificador, momento, RESPONSABLE, todayKey, tool, type ToolContext } from "./kit";

const enc = (value: string | number) => encodeURIComponent(String(value));
const responsable = z.string().min(1).optional().describe(`Quién lo hace. Si se omite, se registra «${RESPONSABLE}».`);
const estadoStock = z.enum(["pending_treatment", "ready"]).describe("pending_treatment = pendiente de HT; ready = listo.");
const tiposProducto = z.enum(["Pallet", "Piso", "Bin"]);

/** Stock, capacidad, clientes, productos y proveedores. */
export function registerAdminTools(server: McpServer, context: ToolContext) {
  // ---- Stock ---------------------------------------------------------------------------------------------------
  apiTool(server, context, {
    name: "registrar_entrada_stock",
    title: "Registrar una entrada de stock",
    description: "Suma unidades al stock: producción interna, recepción de un proveedor o devolución. Elegí si entran como pendientes de HT o listas.",
    access: "write",
    input: {
      productoId: identificador("ID del producto."),
      tipo: z.enum(["internal_production", "supplier_receipt", "return"]).describe("internal_production = producción propia; supplier_receipt = recepción de proveedor; return = devolución."),
      estado: estadoStock,
      cantidad: z.number().int().positive(),
      momento: momento("Cuándo entró. Si se omite, ahora.").optional(),
      proveedorId: z.string().optional().describe("Proveedor de origen."),
      referencia: z.string().optional().describe("Remito o referencia de origen."),
      nota: z.string().optional(),
      responsable,
    },
    request: (args) => ({
      method: "POST",
      path: "/api/stock/movements/receipts",
      body: clean({
        productId: String(args.productoId), movementType: args.tipo, stockState: args.estado, quantity: args.cantidad,
        occurredAt: args.momento ?? new Date().toISOString(), providerId: args.proveedorId, sourceReference: args.referencia, note: args.nota,
        responsible: args.responsable ?? RESPONSABLE,
      }),
    }),
    summary: "Entrada de stock registrada.",
  });

  apiTool(server, context, {
    name: "ajustar_stock",
    title: "Ajustar el stock por diferencia",
    description: "Corrige el stock de un producto sumando o restando unidades (diferencia positiva o negativa). Exige el motivo y no puede dejar el stock negativo. Queda en el historial: pedí confirmación.",
    access: "write",
    destructive: true,
    input: {
      productoId: identificador("ID del producto."),
      estado: estadoStock,
      diferencia: z.number().int().refine((value) => value !== 0, "La diferencia no puede ser cero.").describe("Unidades a sumar (+) o restar (-)."),
      motivo: z.string().min(1).describe("Por qué se ajusta."),
      momento: momento("Cuándo. Si se omite, ahora.").optional(),
      responsable,
    },
    request: (args) => ({
      method: "POST",
      path: "/api/stock/movements/adjustments",
      body: { productId: String(args.productoId), stockState: args.estado, quantityDelta: args.diferencia, reason: args.motivo, occurredAt: args.momento ?? new Date().toISOString(), responsible: args.responsable ?? RESPONSABLE },
    }),
    summary: "Ajuste de stock registrado.",
  });

  apiTool(server, context, {
    name: "revertir_movimiento_stock",
    title: "Revertir un movimiento de stock",
    description: "Anula un movimiento de stock con un movimiento inverso y deja el motivo. No se revierte dos veces ni si dejaría el stock negativo. Pedí confirmación.",
    access: "write",
    destructive: true,
    input: { movimientoId: identificador("ID del movimiento (de stock_producto)."), motivo: z.string().min(1), momento: momento("Cuándo. Si se omite, ahora.").optional(), responsable },
    request: (args) => ({
      method: "POST",
      path: `/api/stock/movements/${enc(args.movimientoId)}/reverse`,
      body: { reason: args.motivo, occurredAt: args.momento ?? new Date().toISOString(), responsible: args.responsable ?? RESPONSABLE },
    }),
    summary: "Movimiento revertido.",
  });

  // ---- Capacidad y recursos ------------------------------------------------------------------------------------
  tool(server, context, {
    name: "guardar_recurso_produccion",
    title: "Crear o editar un recurso de producción",
    description: "Crea un recurso (fábrica interna, cuadrilla interna o aserradero externo) o edita uno existente si pasás recursoId. `produce` limita qué tipos de producto fabrica; si se omite o están los tres, produce todos.",
    access: "write",
    input: {
      recursoId: identificador("ID del recurso a editar. Si se omite, se crea uno nuevo.").optional(),
      nombre: z.string().min(1).optional(),
      tipo: z.enum(["internal_factory", "internal_crew", "external_supplier"]).optional().describe("Obligatorio al crear."),
      proveedorId: z.string().optional().describe("Aserradero asociado; obligatorio si el tipo es external_supplier."),
      produce: z.array(tiposProducto).min(1).optional().describe("Tipos de producto que produce."),
      orden: z.number().int().min(0).optional().describe("Orden de aparición."),
      activo: z.boolean().optional().describe("Solo al editar."),
    },
    run: async (args) => {
      if (args.recursoId !== undefined) {
        const response = await callApi({ method: "PATCH", path: "/api/capacity/resources", body: clean({ id: args.recursoId, name: args.nombre, active: args.activo, displayOrder: args.orden, productKinds: args.produce }) });
        return response.ok ? done("Recurso actualizado.", response.data) : fail(apiErrorMessage(response));
      }
      if (!args.nombre || !args.tipo) return fail("Para crear un recurso indicá nombre y tipo.");
      const created = await callApi({ method: "POST", path: "/api/capacity/resources", body: clean({ name: args.nombre, resourceType: args.tipo, providerId: args.proveedorId, displayOrder: args.orden }) });
      if (!created.ok) return fail(apiErrorMessage(created));
      const resource = (created.data as { resource?: { id?: string | number } }).resource;
      if (args.produce && resource?.id !== undefined) {
        const kinds = await callApi({ method: "PATCH", path: "/api/capacity/resources", body: { id: resource.id, productKinds: args.produce } });
        if (!kinds.ok) return fail(`El recurso se creó, pero no se pudo guardar qué produce: ${apiErrorMessage(kinds)}`);
        return done("Recurso creado.", kinds.data);
      }
      return done("Recurso creado.", created.data);
    },
  });

  const reglaCampos = {
    recursoId: identificador("ID del recurso (listar_recursos_produccion)."),
    productoId: z.string().min(1).describe("ID del producto del catálogo."),
    clienteProductoId: identificador("Relación cliente-producto a la que aplica (ver_cliente)."),
    etiqueta: z.string().min(1).describe("Nombre de la configuración, por ejemplo «Fábrica ×2»."),
    normalPorDia: z.number().int().positive().describe("Unidades por día en condiciones normales."),
    maximoPorDia: z.number().int().positive().describe("Unidades por día como máximo (no menor a la normal)."),
    vigenteDesde: fecha("Desde cuándo rige."),
    vigenteHasta: fecha("Hasta cuándo rige. Vacío = sin fin.").optional(),
    personas: z.number().int().min(0).optional().describe("Personas de la cuadrilla, si importa."),
    fuente: z.string().optional().describe("Origen del dato. Por defecto «manual»."),
    nota: z.string().optional(),
  };
  tool(server, context, {
    name: "guardar_regla_rendimiento",
    title: "Crear o editar una regla de rendimiento",
    description: "Define cuántas unidades por día produce un recurso de un producto de un cliente (normal y máximo). Pasá reglaId para editar una existente (se reemplazan todos sus valores). Las reglas alimentan las advertencias de capacidad.",
    access: "write",
    input: { reglaId: identificador("ID de la regla a editar. Si se omite, se crea una nueva.").optional(), ...reglaCampos },
    run: async (args) => {
      const body = clean({
        id: args.reglaId, resourceId: args.recursoId, productId: args.productoId, clientProductId: args.clienteProductoId, configurationLabel: args.etiqueta,
        normalUnitsPerDay: args.normalPorDia, maximumUnitsPerDay: args.maximoPorDia, validFrom: args.vigenteDesde, validTo: args.vigenteHasta,
        peopleCount: args.personas, source: args.fuente, note: args.nota,
      });
      const response = await callApi({ method: args.reglaId === undefined ? "POST" : "PATCH", path: "/api/capacity/rules", body });
      return response.ok ? done(args.reglaId === undefined ? "Regla creada." : "Regla actualizada.", response.data) : fail(apiErrorMessage(response));
    },
  });

  apiTool(server, context, {
    name: "eliminar_regla_rendimiento",
    title: "Eliminar una regla de rendimiento",
    description: "Elimina una regla de rendimiento. Si ya se usó en producción realizada, se rechaza. Pedí confirmación.",
    access: "write",
    destructive: true,
    input: { reglaId: identificador("ID de la regla.") },
    request: ({ reglaId }) => ({ method: "DELETE", path: "/api/capacity/rules", query: { id: String(reglaId) } }),
    summary: "Regla eliminada.",
  });

  tool(server, context, {
    name: "guardar_capacidad_secadero",
    title: "Definir la capacidad diaria del secadero",
    description: "Fija las unidades por día que admite el secadero (la referencia contra la que se muestra el porcentaje de carga). Superarla solo genera una advertencia.",
    access: "write",
    idempotent: true,
    input: { unidadesPorDia: z.number().int().min(1).describe("Capacidad diaria en unidades.") },
    run: async ({ unidadesPorDia }) => {
      const today = todayKey();
      const snapshot = await callApi({ method: "GET", path: "/api/capacity", query: { from: today, to: today } });
      const saved = ((snapshot.data as { capacity?: { internalDefaults?: Array<{ operation: string; peopleCount?: number }> } })?.capacity?.internalDefaults ?? []).find((entry) => entry.operation === "ht");
      const response = await callApi({ method: "PUT", path: "/api/capacity/internal-production", body: { operation: "ht", peopleCount: saved?.peopleCount ?? 0, manualCapacity: unidadesPorDia } });
      return response.ok ? done("Capacidad del secadero guardada.", response.data) : fail(apiErrorMessage(response));
    },
  });

  apiTool(server, context, {
    name: "guardar_capacidad_transporte",
    title: "Definir los cupos de viajes de un transporte",
    description: "Fija cuántos viajes por día admite la flota propia o un transportista externo (valor base, todos los días).",
    access: "write",
    idempotent: true,
    input: {
      origen: z.enum(["internal", "external"]),
      transportistaId: z.string().optional().describe("Obligatorio si el origen es external."),
      viajesPorDia: z.number().int().min(0),
      estado: z.enum(["estimated", "confirmed"]).default("confirmed").describe("estimated = estimado; confirmed = confirmado."),
    },
    request: (args) => ({ method: "PUT", path: "/api/capacity/transport", body: clean({ source: args.origen, providerId: args.transportistaId, tripCapacity: args.viajesPorDia, status: args.estado }) }),
    summary: "Cupos de transporte guardados.",
  });

  apiTool(server, context, {
    name: "guardar_cupos_viajes_dia",
    title: "Excepción de cupos de viajes en un día",
    description: "Cambia los cupos de viajes de un transporte solo para un día (por ejemplo, un camión extra o uno en reparación).",
    access: "write",
    idempotent: true,
    input: {
      fecha: fecha("Día de la excepción."),
      origen: z.enum(["internal", "external"]),
      transportistaId: z.string().optional().describe("Obligatorio si el origen es external."),
      cupos: z.number().int().min(0).describe("Cupos de viajes ese día."),
      responsable: z.string().min(1).describe("Quién aporta o confirma el cupo."),
      estado: z.enum(["estimated", "confirmed"]).default("confirmed"),
    },
    request: (args) => ({ method: "PUT", path: "/api/capacity/trip-adjustments", body: clean({ date: args.fecha, source: args.origen, providerId: args.transportistaId, tripCapacity: args.cupos, responsible: args.responsable, status: args.estado }) }),
    summary: "Excepción guardada.",
  });

  apiTool(server, context, {
    name: "ajustar_capacidad_dia",
    title: "Ajuste de capacidad de un día",
    description: "Suma o resta capacidad (en palets) a un recurso solo para un día: producción interna, producción de un aserradero externo o transporte. Para producción interna se indica la cantidad de personas.",
    access: "write",
    idempotent: true,
    input: {
      fecha: fecha("Día del ajuste."),
      recurso: z.enum(["internal_production", "external_production", "transport"]),
      operacion: z.enum(["assembly", "marking", "ht"]).optional().describe("Obligatoria para producción interna o externa."),
      origen: z.enum(["internal", "external"]).optional().describe("Obligatorio para transport."),
      proveedorId: z.string().optional().describe("Aserradero o transportista externo."),
      ajustePalets: z.number().int().describe("Palets a sumar (+) o restar (-)."),
      personas: z.number().int().min(0).optional().describe("Solo producción interna."),
      responsable: z.string().optional().describe("Quién aporta la capacidad (obligatorio salvo producción interna o ajuste 0)."),
      estado: z.enum(["estimated", "confirmed"]).optional(),
    },
    request: (args) => ({
      method: "PUT",
      path: "/api/capacity/adjustments",
      body: clean({ date: args.fecha, resourceType: args.recurso, operation: args.operacion, source: args.origen, providerId: args.proveedorId, palletAdjustment: args.ajustePalets, peopleCount: args.personas, responsible: args.responsable, status: args.estado }),
    }),
    summary: "Ajuste de capacidad guardado.",
  });

  // ---- Clientes ------------------------------------------------------------------------------------------------
  tool(server, context, {
    name: "guardar_cliente",
    title: "Crear o editar un cliente",
    description: "Crea un cliente o edita uno existente si pasás clienteId. La dirección de entrega es necesaria para despachar sus viajes.",
    access: "write",
    input: {
      clienteId: identificador("ID del cliente a editar. Si se omite, se crea uno nuevo.").optional(),
      nombre: z.string().min(1).optional(),
      direccion: z.string().optional(),
      departamento: z.string().optional(),
      activo: z.boolean().optional().describe("Solo al editar."),
    },
    run: async (args) => {
      const body = clean({ name: args.nombre, address: args.direccion, department: args.departamento, active: args.activo });
      if (args.clienteId === undefined && !args.nombre) return fail("Para crear un cliente indicá el nombre.");
      const response = await callApi({ method: args.clienteId === undefined ? "POST" : "PATCH", path: args.clienteId === undefined ? "/api/clients" : `/api/clients/${enc(args.clienteId)}`, body });
      return response.ok ? done(args.clienteId === undefined ? "Cliente creado." : "Cliente actualizado.", response.data) : fail(apiErrorMessage(response));
    },
  });

  apiTool(server, context, {
    name: "eliminar_cliente",
    title: "Eliminar un cliente",
    description: "Elimina un cliente sin pedidos. Si tiene historial, desactivalo con guardar_cliente (activo=false). Pedí confirmación explícita.",
    access: "write",
    destructive: true,
    input: { clienteId: identificador("ID del cliente.") },
    request: ({ clienteId }) => ({ method: "DELETE", path: `/api/clients/${enc(clienteId)}` }),
    summary: "Cliente eliminado.",
  });

  apiTool(server, context, {
    name: "habilitar_producto_cliente",
    title: "Habilitar un producto para un cliente",
    description: "Asocia un producto del catálogo a un cliente para poder hacerle pedidos. Requiere un primer punto de control.",
    access: "write",
    input: {
      clienteId: identificador("ID del cliente."),
      productoId: z.string().min(1).describe("ID del producto del catálogo."),
      nombreOperativo: z.string().optional().describe("Cómo lo llama el cliente."),
      controlInicial: z.string().min(1).describe("Primer punto de control del producto para este cliente."),
      orden: z.number().int().optional(),
    },
    request: (args) => ({
      method: "POST",
      path: `/api/clients/${enc(args.clienteId)}/products`,
      body: clean({ productId: args.productoId, operationalName: args.nombreOperativo, initialControl: args.controlInicial, displayOrder: args.orden }),
    }),
    summary: "Producto habilitado para el cliente.",
  });

  apiTool(server, context, {
    name: "editar_producto_cliente",
    title: "Editar un producto de un cliente",
    description: "Cambia el nombre operativo, el orden o activa/desactiva un producto habilitado para un cliente. Usá el clienteProductoId de ver_cliente.",
    access: "write",
    idempotent: true,
    input: {
      clienteProductoId: identificador("ID de la relación cliente-producto."),
      nombreOperativo: z.string().optional(),
      activo: z.boolean().optional(),
      orden: z.number().int().optional(),
    },
    request: (args) => ({ method: "PATCH", path: `/api/client-products/${enc(args.clienteProductoId)}`, body: clean({ operationalName: args.nombreOperativo, active: args.activo, displayOrder: args.orden }) }),
    summary: "Producto del cliente actualizado.",
  });

  apiTool(server, context, {
    name: "guardar_controles_producto_cliente",
    title: "Definir los puntos de control de un producto de cliente",
    description: "Reemplaza la lista de puntos de control (los que se revisan al registrar HT) de un producto de un cliente. Incluí todos los que deben quedar.",
    access: "write",
    idempotent: true,
    input: {
      clienteProductoId: identificador("ID de la relación cliente-producto."),
      controles: z.array(z.object({ titulo: z.string().min(1), detalle: z.string().optional(), activo: z.boolean().optional() })),
    },
    request: ({ clienteProductoId, controles }) => ({
      method: "PUT",
      path: `/api/client-products/${enc(clienteProductoId)}/controls`,
      body: { controls: controles.map((control) => clean({ title: control.titulo, detail: control.detalle, active: control.activo })) },
    }),
    summary: "Controles guardados.",
  });

  apiTool(server, context, {
    name: "eliminar_archivo_producto_cliente",
    title: "Quitar un plano o foto",
    description: "Quita un plano o foto de un producto de cliente (queda fuera de uso). Pedí confirmación.",
    access: "write",
    destructive: true,
    input: { archivoId: identificador("ID del archivo.") },
    request: ({ archivoId }) => ({ method: "DELETE", path: `/api/client-product-assets/${enc(archivoId)}` }),
    summary: "Archivo quitado.",
  });

  // ---- Productos -----------------------------------------------------------------------------------------------
  const productoCampos = {
    tipo: tiposProducto.optional().describe("Obligatorio al crear."),
    medida: z.string().optional().describe("Medida, por ejemplo 1200x1000."),
    atributos: z.record(z.string(), z.string()).optional().describe("Valor por nivel de clasificación (ver niveles_producto): clave = id del nivel."),
    alturaCm: z.number().positive().nullable().optional().describe("Altura en cm (máx. dos decimales); null para quitarla."),
    requiereHT: z.boolean().optional(),
    codigoZeta: z.string().optional().describe("Código numérico Zeta. Obligatorio al crear."),
    nombreStock: z.string().optional(),
    clienteIds: z.array(z.string()).optional().describe("Clientes asociados."),
  };
  tool(server, context, {
    name: "guardar_producto",
    title: "Crear o editar un producto del catálogo",
    description: "Crea un producto o edita uno existente si pasás productoId. Si cambia la clasificación y ya existe otro producto igual, se rechaza.",
    access: "write",
    input: { productoId: z.string().optional().describe("ID del producto a editar. Si se omite, se crea uno nuevo."), ...productoCampos },
    run: async (args) => {
      if (args.productoId === undefined && (!args.tipo || !args.codigoZeta)) return fail("Para crear un producto indicá tipo y código Zeta.");
      const body = clean({
        kind: args.tipo, measure: args.medida, attributes: args.atributos, heightCm: args.alturaCm, requiresTreatment: args.requiereHT,
        zetaCode: args.codigoZeta, stockName: args.nombreStock, clientIds: args.clienteIds,
      });
      if (args.productoId !== undefined && !args.tipo) {
        const current = await callApi({ method: "GET", path: "/api/products" });
        const found = ((current.data as { products?: Array<{ id: string; kind: string }> }).products ?? []).find((item) => item.id === args.productoId);
        if (!found) return fail("Producto no encontrado.");
        body.kind = found.kind as typeof body.kind;
      }
      const response = await callApi({ method: args.productoId === undefined ? "POST" : "PATCH", path: args.productoId === undefined ? "/api/products" : `/api/products/${enc(args.productoId)}`, body });
      return response.ok ? done(args.productoId === undefined ? "Producto creado." : "Producto actualizado.", response.data) : fail(apiErrorMessage(response));
    },
  });

  apiTool(server, context, {
    name: "eliminar_producto",
    title: "Eliminar un producto del catálogo",
    description: "Elimina un producto que no figura en pedidos ni tiene stock o movimientos. Pedí confirmación explícita.",
    access: "write",
    destructive: true,
    input: { productoId: z.string().min(1) },
    request: ({ productoId }) => ({ method: "DELETE", path: `/api/products/${enc(productoId)}` }),
    summary: "Producto eliminado.",
  });

  apiTool(server, context, {
    name: "guardar_niveles_producto",
    title: "Guardar los niveles de clasificación",
    description: "Reemplaza la lista de niveles de clasificación de productos y sus opciones. Cuidado: es la estructura del catálogo. Partí siempre de niveles_producto y devolvé la lista completa; «Medida» es siempre el primer nivel y no se puede quitar un nivel que usan productos.",
    access: "write",
    destructive: true,
    idempotent: true,
    input: { niveles: z.array(z.object({ id: z.string().optional(), nombre: z.string().optional(), opciones: z.unknown().optional() })).min(1).describe("Lista completa de niveles, con la forma que devuelve niveles_producto (id, label, options).") },
    request: ({ niveles }) => ({ method: "PUT", path: "/api/product-levels", body: { levels: niveles.map((level) => clean({ id: level.id, label: level.nombre, options: level.opciones })) } }),
    summary: "Niveles guardados.",
  });

  // ---- Proveedores ---------------------------------------------------------------------------------------------
  tool(server, context, {
    name: "guardar_proveedor",
    title: "Crear o editar un proveedor",
    description: "Crea un aserradero, transportista o importador, o edita uno existente si pasás proveedorId.",
    access: "write",
    input: {
      proveedorId: z.string().optional().describe("ID del proveedor a editar. Si se omite, se crea uno nuevo."),
      nombre: z.string().min(1).optional(),
      tipo: z.enum(["Aserradero", "Transporte", "Importador"]).optional().describe("Obligatorio al crear."),
      suministra: z.string().optional().describe("Qué provee (texto libre)."),
    },
    run: async (args) => {
      if (args.proveedorId === undefined && (!args.nombre || !args.tipo)) return fail("Para crear un proveedor indicá nombre y tipo.");
      const body = clean({ name: args.nombre, type: args.tipo, supplies: args.suministra ?? (args.proveedorId === undefined ? args.tipo : undefined) });
      const response = await callApi({ method: args.proveedorId === undefined ? "POST" : "PATCH", path: args.proveedorId === undefined ? "/api/providers" : `/api/providers/${enc(args.proveedorId)}`, body });
      return response.ok ? done(args.proveedorId === undefined ? "Proveedor creado." : "Proveedor actualizado.", response.data) : fail(apiErrorMessage(response));
    },
  });

  apiTool(server, context, {
    name: "eliminar_proveedor",
    title: "Eliminar un proveedor",
    description: "Elimina un proveedor que no está en uso. Pedí confirmación explícita.",
    access: "write",
    destructive: true,
    input: { proveedorId: z.string().min(1) },
    request: ({ proveedorId }) => ({ method: "DELETE", path: `/api/providers/${enc(proveedorId)}` }),
    summary: "Proveedor eliminado.",
  });
}
