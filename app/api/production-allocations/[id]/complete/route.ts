import { completeProductionAllocation } from "../../../store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    const actualQuantity = Number(payload.actualQuantity);
    const completionNote = typeof payload.completionNote === "string" ? payload.completionNote : undefined;
    if (!id || !Number.isInteger(actualQuantity) || actualQuantity < 0) return Response.json({ error: "Indique una cantidad real válida." }, { status: 400 });
    await completeProductionAllocation(id, actualQuantity, completionNote);
    return Response.json({ completed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo completar la asignación." }, { status: 400 });
  }
}
