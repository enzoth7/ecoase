import { recordStockReceipt } from "../../../store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const quantity = Number(body.quantity);
    const productId = typeof body.productId === "string" ? body.productId : "";
    const stockState = body.stockState === "ready" ? "ready" : body.stockState === "pending_treatment" ? "pending_treatment" : null;
    const movementType = ["internal_production", "supplier_receipt", "return"].includes(String(body.movementType)) ? body.movementType as "internal_production" | "supplier_receipt" | "return" : null;
    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : "";
    const responsible = typeof body.responsible === "string" ? body.responsible.trim() : "";
    if (!productId || !stockState || !movementType || !Number.isInteger(quantity) || quantity <= 0 || Number.isNaN(Date.parse(occurredAt)) || !responsible) return Response.json({ error: "Complete producto, estado, cantidad, momento y responsable." }, { status: 400 });
    const movementId = await recordStockReceipt({ productId, stockState, quantity, movementType, providerId: typeof body.providerId === "string" ? body.providerId : undefined, sourceReference: typeof body.sourceReference === "string" ? body.sourceReference : undefined, occurredAt, responsible, note: typeof body.note === "string" ? body.note : undefined });
    return Response.json({ movementId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar la entrada." }, { status: 400 });
  }
}
