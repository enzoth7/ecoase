import { getOrders } from "../store";

export async function GET() {
  const calendar = getOrders().filter((order) => order.status !== "completado").map(({ id, client, reference, dateLabel, requested, status, statusLabel }) => ({
    id, client, reference, dateLabel, requested, status, statusLabel,
  }));
  return Response.json({ calendar });
}
