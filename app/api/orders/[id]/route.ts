import { updateOrder } from "../../store";
import type { DateDirection, OrderStatus, OperationStage } from "../../../data";

const validStatuses = new Set<OrderStatus>(["bloqueado", "coordinacion", "completado"]);
const validStages = new Set<OperationStage>(["negociacion", "produccion", "logistica", "completado"]);
const validDateDirections = new Set<DateDirection>(["sin_cambio", "adelanta", "atrasa"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = (await request.json()) as { status?: unknown; transport?: unknown; dateLabel?: unknown; requested?: unknown; stage?: unknown; dateDirection?: unknown };
  const status = typeof payload.status === "string" && validStatuses.has(payload.status as OrderStatus)
    ? payload.status as OrderStatus
    : undefined;
  const transport = typeof payload.transport === "string" ? payload.transport.trim() : undefined;
  const dateLabel = typeof payload.dateLabel === "string" ? payload.dateLabel.trim() : undefined;
  const requested = typeof payload.requested === "number" && Number.isFinite(payload.requested) && payload.requested > 0
    ? payload.requested
    : undefined;
  const stage = typeof payload.stage === "string" && validStages.has(payload.stage as OperationStage)
    ? payload.stage as OperationStage
    : undefined;
  const dateDirection = typeof payload.dateDirection === "string" && validDateDirections.has(payload.dateDirection as DateDirection)
    ? payload.dateDirection as DateDirection
    : undefined;

  if (!status && !transport && !dateLabel && !requested && !stage) {
    return Response.json({ error: "Indique al menos un cambio válido." }, { status: 400 });
  }

  try {
    const result = updateOrder(id, { status, transport, dateLabel, requested, stage, dateDirection });
    if (!result) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el pedido." }, { status: 400 });
  }
}
