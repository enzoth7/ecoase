import { moveProductionAllocation } from "../../../store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as { plannedDate?: unknown };
    const orderId = await moveProductionAllocation(id, typeof payload.plannedDate === "string" ? payload.plannedDate : "");
    return orderId ? Response.json({ orderId }) : Response.json({ error: "Asignación no encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo mover la asignación." }, { status: 400 });
  }
}
