import { getOrders } from "../store";
import { getOrderPlannedDate, getOrderStage } from "../../data";

export async function GET() {
  const calendar = (await getOrders()).filter((order) => getOrderStage(order) !== "completado").map((order) => ({
    id: order.id, client: order.client, reference: order.reference, dateLabel: order.dateLabel, plannedDate: getOrderPlannedDate(order), requested: order.requested,
  }));
  return Response.json({ calendar });
}
