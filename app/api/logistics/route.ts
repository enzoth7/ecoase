import { getOrders } from "../store";

export async function GET() {
  const logistics = getOrders().filter((order) => order.status !== "completado").map(({ id, client, reference, product, dateLabel, transport, logistics, delivery, status, statusLabel }) => ({
    id, client, reference, product, dateLabel, transport, logistics, delivery, status, statusLabel,
  }));
  return Response.json({ logistics });
}
