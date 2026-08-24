import { getOrders } from "../store";

export async function GET() {
  return Response.json({ history: (await getOrders()).filter((order) => order.status === "completado") });
}
