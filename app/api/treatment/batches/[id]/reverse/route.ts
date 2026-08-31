import { reverseTreatmentBatch } from "../../../../store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const performedAt = typeof body.performedAt === "string" ? body.performedAt : "";
    const responsible = typeof body.responsible === "string" ? body.responsible.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!responsible || !note || Number.isNaN(Date.parse(performedAt))) return Response.json({ error: "Momento, responsable y motivo son obligatorios." }, { status: 400 });
    return Response.json({ result: await reverseTreatmentBatch((await context.params).id, { performedAt, responsible, note }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo revertir el lote." }, { status: 400 });
  }
}
