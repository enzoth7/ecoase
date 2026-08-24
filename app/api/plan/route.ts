import { getOrders } from "../store";
import { getOrderStage } from "../../data";

const stagePriority = { negociacion: 0, produccion: 1, logistica: 2, reorganizando: 3, atrasado: 4, pospuesto: 5, cancelado: 6, completado: 7 } as const;

export async function GET() {
  const plan = (await getOrders())
    .filter((order) => getOrderStage(order) !== "completado")
    .map((order) => ({
      ...order,
      stage: getOrderStage(order),
    }))
    .sort((a, b) => stagePriority[getOrderStage(a)] - stagePriority[getOrderStage(b)] || a.client.localeCompare(b.client, "es"));

  return Response.json({ plan });
}
