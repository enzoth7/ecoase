import { getOrders } from "../store";
import { isOrderClosed } from "../../data";

export async function GET() {
  const logistics = (await getOrders()).filter((order) => !isOrderClosed(order)).map(({ id, client, reference, product, dateLabel, transport, logistics, delivery }) => ({
    id, client, reference, product, dateLabel, transport, logistics, delivery,
  }));
  return Response.json({ logistics });
}
