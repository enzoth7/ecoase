import { createClient, getClients, getOrders } from "../store";

export async function GET() {
  const clients = new Map<string, { name: string; orders: number; requested: number; delivered: number; pending: number }>();
  (await getClients()).forEach((client) => clients.set(client.name, { name: client.name, orders: 0, requested: 0, delivered: 0, pending: 0 }));
  (await getOrders()).forEach((order) => {
    const client = clients.get(order.client) ?? { name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0 };
    client.orders += 1;
    client.requested += order.requested;
    client.delivered += order.delivered;
    client.pending += order.pending;
    clients.set(order.client, client);
  });

  return Response.json({ clients: [...clients.values()] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown };
    const client = await createClient({ name: typeof body.name === "string" ? body.name : "" });
    return Response.json({ client }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el cliente." }, { status: 400 });
  }
}
