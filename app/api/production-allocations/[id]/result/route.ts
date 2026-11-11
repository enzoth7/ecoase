import { recordProductionResult } from "../../../store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    const actualQuantity = typeof payload.actualQuantity === "number" ? payload.actualQuantity : Number.NaN;
    const actualDate = typeof payload.actualDate === "string" ? payload.actualDate : "";
    const destination = payload.destination === "client" || payload.destination === "stock" ? payload.destination : undefined;
    const note = typeof payload.note === "string" ? payload.note : undefined;
    if (!id) return Response.json({ error: "Asignación no encontrada." }, { status: 400 });
    await recordProductionResult(id, actualQuantity, actualDate, destination, note);
    return Response.json({ recorded: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar la producción." }, { status: 400 });
  }
}
