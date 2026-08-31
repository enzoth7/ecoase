import { recordStockAdjustment } from "../../../store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const quantityDelta = Number(body.quantityDelta);
    const stockState = body.stockState === "ready" ? "ready" : body.stockState === "pending_treatment" ? "pending_treatment" : null;
    const input = { productId: typeof body.productId === "string" ? body.productId : "", stockState, quantityDelta, occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : "", responsible: typeof body.responsible === "string" ? body.responsible.trim() : "", reason: typeof body.reason === "string" ? body.reason.trim() : "" };
    if (!input.productId || !stockState || !Number.isInteger(quantityDelta) || quantityDelta === 0 || Number.isNaN(Date.parse(input.occurredAt)) || !input.responsible || !input.reason) return Response.json({ error: "Complete estado, diferencia, momento, responsable y motivo." }, { status: 400 });
    return Response.json({ movementId: await recordStockAdjustment({ productId: input.productId, stockState, quantityDelta, occurredAt: input.occurredAt, responsible: input.responsible, reason: input.reason }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el ajuste." }, { status: 400 });
  }
}
