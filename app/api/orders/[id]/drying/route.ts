import { planOrderDrying } from "../../../store";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as { startDate?: unknown; endDate?: unknown; note?: unknown; allocations?: unknown };
  const startDate = typeof payload.startDate === "string" && isoDate.test(payload.startDate) ? payload.startDate : "";
  const endDate = typeof payload.endDate === "string" && isoDate.test(payload.endDate) ? payload.endDate : undefined;
  const allocations = Array.isArray(payload.allocations) ? payload.allocations.flatMap((item: unknown) => {
    const row = item as { orderLineId?: unknown; date?: unknown; quantity?: unknown };
    return typeof row.orderLineId === "string" && typeof row.date === "string" && isoDate.test(row.date) && typeof row.quantity === "number" && Number.isInteger(row.quantity) && row.quantity > 0
      ? [{ orderLineId: row.orderLineId, date: row.date, quantity: row.quantity }] : [];
  }) : undefined;
  if (!startDate && !allocations?.length) return Response.json({ error: "Indicá la fecha de inicio del secado." }, { status: 400 });
  try {
    const order = await planOrderDrying((await params).id, { startDate, endDate, note: typeof payload.note === "string" ? payload.note : undefined, allocations });
    return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo programar el secado." }, { status: 400 });
  }
}
