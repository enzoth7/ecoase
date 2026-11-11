import { transitionShipment } from "../../../store";
import { auditLoadedShipment } from "../../../logistics-store";
import type { ShipmentStatus } from "../../../../data";

const statuses: ShipmentStatus[] = ["ready", "loaded", "dispatched", "delivered", "cancelled"];
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as Record<string, unknown>;
  if (!statuses.includes(payload.nextStatus as ShipmentStatus)) return Response.json({ error: "Estado de viaje inválido." }, { status: 400 });
  try {
    const shipment = await transitionShipment((await context.params).id, { nextStatus: payload.nextStatus as ShipmentStatus, remittance: typeof payload.remittance === "string" ? payload.remittance : undefined, sharedRemittanceReason: typeof payload.sharedRemittanceReason === "string" ? payload.sharedRemittanceReason : undefined, responsible: typeof payload.responsible === "string" ? payload.responsible : undefined, deliveredLines: Array.isArray(payload.deliveredLines) ? payload.deliveredLines.map((item) => item as Record<string, unknown>).map((item) => ({ shipmentLineId: String(item.shipmentLineId ?? ""), deliveredQuantity: Number(item.deliveredQuantity) })) : [], loadedLines: Array.isArray(payload.loadedLines) ? payload.loadedLines.map((item) => item as Record<string, unknown>).map((item) => ({ shipmentLineId: String(item.shipmentLineId ?? ""), loadedQuantity: Number(item.loadedQuantity) })) : undefined });
    let auditWarning: string | undefined;
    if (shipment && payload.nextStatus === "loaded") {
      try { await auditLoadedShipment(shipment.id); }
      catch (error) { auditWarning = error instanceof Error ? error.message : "No se pudo registrar la auditoría de capacidad."; }
    }
    return shipment ? Response.json({ shipment, ...(auditWarning ? { auditWarning } : {}) })
      : Response.json({ error: "Viaje no encontrado." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo avanzar el viaje." }, { status: 400 }); }
}
