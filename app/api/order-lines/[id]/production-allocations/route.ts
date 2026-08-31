import { replaceProductionAllocations, type AllocationInput } from "../../../store";
import type { ProductionAllocationStatus } from "../../../../data";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const statuses: ProductionAllocationStatus[] = ["draft"];

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as { allocations?: Partial<AllocationInput>[] };
  const allocations = Array.isArray(payload.allocations) ? payload.allocations.map((item) => ({ resourceId: typeof item.resourceId === "string" ? item.resourceId : undefined, plannedDate: typeof item.plannedDate === "string" ? item.plannedDate : "", plannedQuantity: Number(item.plannedQuantity), status: statuses.includes(item.status as ProductionAllocationStatus) ? item.status as ProductionAllocationStatus : "draft", note: typeof item.note === "string" ? item.note : undefined })) : [];
  if (allocations.some((item) => !isoDate.test(item.plannedDate) || !Number.isInteger(item.plannedQuantity) || item.plannedQuantity <= 0)) return Response.json({ error: "Revise fechas y cantidades." }, { status: 400 });
  try {
    const line = await replaceProductionAllocations((await context.params).id, allocations);
    return line ? Response.json({ line }) : Response.json({ error: "Línea no encontrada." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la producción." }, { status: 400 }); }
}
