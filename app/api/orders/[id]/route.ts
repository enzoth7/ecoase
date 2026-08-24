import { updateOrder } from "../../store";
import { providers, type OrderStatus, type OperationStage } from "../../../data";

const validStatuses = new Set<OrderStatus>(["bloqueado", "coordinacion", "completado"]);
const validStages = new Set<OperationStage>(["negociacion", "produccion", "logistica", "completado"]);
const validTransports = new Set(providers.filter((provider) => provider.type === "Transporte").map((provider) => provider.name));

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = (await request.json()) as { status?: unknown; transport?: unknown; plannedDate?: unknown; requested?: unknown; stage?: unknown };
  const status = typeof payload.status === "string" && validStatuses.has(payload.status as OrderStatus)
    ? payload.status as OrderStatus
    : undefined;
  const transportCandidate = typeof payload.transport === "string" ? payload.transport.trim() : undefined;
  const transport = transportCandidate && validTransports.has(transportCandidate) ? transportCandidate : undefined;
  const plannedDate = typeof payload.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate)
    ? payload.plannedDate
    : undefined;
  const requested = typeof payload.requested === "number" && Number.isFinite(payload.requested) && payload.requested > 0
    ? payload.requested
    : undefined;
  const stage = typeof payload.stage === "string" && validStages.has(payload.stage as OperationStage)
    ? payload.stage as OperationStage
    : undefined;

  if (!status && !transport && !plannedDate && !requested && !stage) {
    return Response.json({ error: "Indique al menos un cambio válido." }, { status: 400 });
  }

  try {
    const result = updateOrder(id, { status, transport, plannedDate, requested, stage });
    if (!result) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el pedido." }, { status: 400 });
  }
}
