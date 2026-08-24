import { createClient, getClients, getOrders } from "../store";

export async function GET() {
  const clients = new Map<string, { name: string; address?: string; department?: string; orders: number; requested: number; delivered: number; pending: number; activeOrders: number }>();
  (await getClients()).forEach((client) => clients.set(client.name, { name: client.name, address: client.address, department: client.department, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0 }));
  (await getOrders()).forEach((order) => {
    const client = clients.get(order.client) ?? { name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0 };
    client.orders += 1;
    client.requested += order.requested;
    client.delivered += order.delivered;
    client.pending += order.pending;
    if (order.status !== "completado") client.activeOrders += 1;
    clients.set(order.client, client);
  });

  return Response.json({ clients: [...clients.values()] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; address?: unknown; department?: unknown };
    const client = await createClient({ name: typeof body.name === "string" ? body.name : "", address: typeof body.address === "string" ? body.address : undefined, department: typeof body.department === "string" ? body.department : undefined });
    return Response.json({ client }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el cliente." }, { status: 400 });
  }
}
