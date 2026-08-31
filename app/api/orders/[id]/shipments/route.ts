import { createShipment } from "../../../store";
import type { TransportSource } from "../../../../data";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as Record<string, unknown>;
  const lines = Array.isArray(payload.lines) ? payload.lines.map((item) => item as Record<string, unknown>).map((item) => ({ orderLineId: String(item.orderLineId ?? ""), plannedQuantity: Number(item.plannedQuantity) })) : [];
  const transportSource: TransportSource = payload.transportSource === "external" ? "external" : "internal";
  if (typeof payload.plannedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate) || !lines.length || lines.some((line) => !line.orderLineId || !Number.isInteger(line.plannedQuantity) || line.plannedQuantity <= 0)) return Response.json({ error: "Indique fecha y cantidades válidas." }, { status: 400 });
  try {
    const shipment = await createShipment((await context.params).id, { plannedDate: payload.plannedDate, transportSource, transportProviderId: typeof payload.transportProviderId === "string" ? payload.transportProviderId : undefined, responsible: typeof payload.responsible === "string" ? payload.responsible : undefined, lines });
    return shipment ? Response.json({ shipment }, { status: 201 }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el viaje." }, { status: 400 }); }
}
