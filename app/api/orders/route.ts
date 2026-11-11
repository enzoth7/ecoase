import { createOrder, getOrders } from "../store";
import { isOrderClosed } from "../../data";
import type { CapacityOperation } from "../../data";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const operations: CapacityOperation[] = ["assembly", "treatment"];

type CreateOrderPayload = {
  lines?: Array<{ clientProductId?: number | string; quantity?: number }>;
  clientProductId?: number | string;
  requested?: number;
  orderDate?: string;
  plannedDate?: string;
  deliveryDateNote?: string;
  notes?: string;
  requiredOperations?: string[];
};

export async function GET() {
  return Response.json({ orders: (await getOrders()).filter((order) => !isOrderClosed(order)) });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as CreateOrderPayload;
  // Compatibilidad: integraciones viejas envían un único producto con clientProductId + requested.
  const rawLines = Array.isArray(payload.lines) ? payload.lines : payload.clientProductId !== undefined ? [{ clientProductId: payload.clientProductId, quantity: payload.requested }] : [];
  const lines = rawLines
    .map((line) => ({ clientProductId: line.clientProductId, quantity: Number(line.quantity) }))
    .filter((line): line is { clientProductId: number | string; quantity: number } => (typeof line.clientProductId === "number" || typeof line.clientProductId === "string") && Number.isInteger(line.quantity) && line.quantity > 0);
  const orderDate = typeof payload.orderDate === "string" && isoDate.test(payload.orderDate) ? payload.orderDate : "";
  const plannedDate = typeof payload.plannedDate === "string" && isoDate.test(payload.plannedDate) ? payload.plannedDate : "";
  const requiredOperations: CapacityOperation[] = Array.isArray(payload.requiredOperations) ? payload.requiredOperations.filter((item): item is CapacityOperation => operations.includes(item as CapacityOperation)) : [];

  if (!lines.length || !orderDate || !plannedDate) {
    return Response.json({ error: "Cliente, al menos un producto con cantidad, fecha del pedido y fecha de entrega son obligatorios." }, { status: 400 });
  }

  try {
    const order = await createOrder({
      lines,
      orderDate,
      plannedDate,
      deliveryDateNote: typeof payload.deliveryDateNote === "string" ? payload.deliveryDateNote : undefined,
      notes: typeof payload.notes === "string" ? payload.notes : undefined,
      requiredOperations: requiredOperations.length ? ["assembly", ...requiredOperations.filter((item) => item !== "assembly")] : ["assembly"],
    });
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el pedido." }, { status: 400 });
  }
}
