import { reverseStockMovement } from "../../../../store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : "";
    const responsible = typeof body.responsible === "string" ? body.responsible.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (Number.isNaN(Date.parse(occurredAt)) || !responsible || !reason) return Response.json({ error: "Momento, responsable y motivo son obligatorios." }, { status: 400 });
    return Response.json({ movementId: await reverseStockMovement((await params).id, { occurredAt, responsible, reason }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo revertir el movimiento." }, { status: 400 });
  }
}
