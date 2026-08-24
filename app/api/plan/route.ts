import { getOrders } from "../store";
import { getOrderStage } from "../../data";

const statusPriority = { bloqueado: 0, coordinacion: 1, completado: 2 } as const;

export async function GET() {
  const plan = getOrders()
    .filter((order) => order.status !== "completado")
    .map((order) => ({
      ...order,
      stage: getOrderStage(order),
    }))
    .sort((a, b) => statusPriority[a.status] - statusPriority[b.status] || a.client.localeCompare(b.client, "es"));

  return Response.json({ plan });
}
