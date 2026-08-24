import { getOrders } from "../store";
import { getOrderStage } from "../../data";

export async function GET() {
  return Response.json({ history: (await getOrders()).filter((order) => getOrderStage(order) === "completado") });
}
