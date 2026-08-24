import { getOrders } from "../store";
import { getOrderStage } from "../../data";

export async function GET() {
  const calendar = (await getOrders()).filter((order) => getOrderStage(order) !== "completado").map(({ id, client, reference, dateLabel, requested }) => ({
    id, client, reference, dateLabel, requested,
  }));
  return Response.json({ calendar });
}
