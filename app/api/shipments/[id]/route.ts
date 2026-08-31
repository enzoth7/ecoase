import { updatePlannedShipment } from "../../store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as Record<string, unknown>;
  const lines = Array.isArray(payload.lines) ? payload.lines.map((item) => item as Record<string, unknown>).map((item) => ({ orderLineId: String(item.orderLineId ?? ""), plannedQuantity: Number(item.plannedQuantity) })) : [];
  if (typeof payload.plannedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate) || !lines.length) return Response.json({ error: "Indique fecha y líneas válidas." }, { status: 400 });
  try {
    const shipment = await updatePlannedShipment((await context.params).id, { plannedDate: payload.plannedDate, transportSource: payload.transportSource === "external" ? "external" : "internal", transportProviderId: typeof payload.transportProviderId === "string" ? payload.transportProviderId : undefined, responsible: typeof payload.responsible === "string" ? payload.responsible : undefined, lines });
    return shipment ? Response.json({ shipment }) : Response.json({ error: "Viaje no encontrado." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo editar el viaje." }, { status: 400 }); }
}
