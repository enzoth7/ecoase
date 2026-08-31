import { confirmProductionAllocation } from "../../../store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    const resourceId = typeof payload.resourceId === "string" || typeof payload.resourceId === "number" ? payload.resourceId : "";
    const capacityRuleId = typeof payload.capacityRuleId === "string" || typeof payload.capacityRuleId === "number" ? payload.capacityRuleId : "";
    const overloadNote = typeof payload.overloadNote === "string" ? payload.overloadNote : undefined;
    if (!id || !resourceId || !capacityRuleId) return Response.json({ error: "Seleccione recurso y regla de capacidad." }, { status: 400 });
    await confirmProductionAllocation(id, resourceId, capacityRuleId, overloadNote);
    return Response.json({ confirmed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo confirmar la asignación." }, { status: 400 });
  }
}
