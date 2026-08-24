import { getOrders } from "../store";

export async function GET() {
  return Response.json({ history: getOrders().filter((order) => order.status === "completado") });
}
