import { updateOrder } from "../../store";
import type { OrderStatus } from "../../../data";

const validStatuses = new Set<OrderStatus>(["bloqueado", "coordinacion", "completado"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = (await request.json()) as { status?: unknown; transport?: unknown };
  const status = typeof payload.status === "string" && validStatuses.has(payload.status as OrderStatus)
    ? payload.status as OrderStatus
    : undefined;
  const transport = typeof payload.transport === "string" ? payload.transport.trim() : undefined;

  if (!status && !transport) {
    return Response.json({ error: "Indique un estado o transporte válido." }, { status: 400 });
  }

  const order = updateOrder(id, { status, transport });
  if (!order) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });

  return Response.json({ order });
}
