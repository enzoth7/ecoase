import { getOrders } from "../store";
import { getOrderStage } from "../../data";

export async function GET() {
  const logistics = (await getOrders()).filter((order) => getOrderStage(order) !== "completado").map(({ id, client, reference, product, dateLabel, transport, logistics, delivery }) => ({
    id, client, reference, product, dateLabel, transport, logistics, delivery,
  }));
  return Response.json({ logistics });
}
