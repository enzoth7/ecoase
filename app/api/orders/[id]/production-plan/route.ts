import { planOrderProduction, type ProductionPlanInput } from "../../../store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as { allocations?: Array<Partial<ProductionPlanInput[number]>> };
  const allocations: ProductionPlanInput = Array.isArray(payload.allocations)
    ? payload.allocations.map((item) => ({ orderLineId: String(item.orderLineId ?? ""), resourceId: String(item.resourceId ?? ""), plannedDate: String(item.plannedDate ?? ""), plannedQuantity: Number(item.plannedQuantity) }))
    : [];
  try {
    const order = await planOrderProduction((await params).id, allocations);
    return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la planificación." }, { status: 400 });
  }
}
