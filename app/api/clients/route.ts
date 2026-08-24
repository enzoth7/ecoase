import { getOrders } from "../store";

export async function GET() {
  const clients = new Map<string, { name: string; orders: number; requested: number; delivered: number; pending: number }>();
  getOrders().forEach((order) => {
    const client = clients.get(order.client) ?? { name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0 };
    client.orders += 1;
    client.requested += order.requested;
    client.delivered += order.delivered;
    client.pending += order.pending;
    clients.set(order.client, client);
  });

  return Response.json({ clients: [...clients.values()] });
}
