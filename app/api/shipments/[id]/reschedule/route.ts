import { rescheduleShipment } from "../../../store";
import type { RescheduleReason } from "../../../../data";

const reasons: RescheduleReason[] = ["production", "logistics", "client", "weather", "other"];
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as Record<string, unknown>;
  if (typeof payload.newDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.newDate) || !reasons.includes(payload.reason as RescheduleReason)) return Response.json({ error: "Fecha y motivo son obligatorios." }, { status: 400 });
  try {
    const shipment = await rescheduleShipment((await context.params).id, { newDate: payload.newDate, reason: payload.reason as RescheduleReason, note: typeof payload.note === "string" ? payload.note : undefined, responsible: typeof payload.responsible === "string" ? payload.responsible : undefined });
    return shipment ? Response.json({ shipment }) : Response.json({ error: "Viaje no encontrado." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo reprogramar." }, { status: 400 }); }
}
