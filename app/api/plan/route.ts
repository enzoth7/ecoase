import { getOrders } from "../store";

const statusPriority = { bloqueado: 0, coordinacion: 1, completado: 2 } as const;

export async function GET() {
  const plan = getOrders()
    .map(({ id, reference, client, product, dateLabel, supply, preparation, transport, logistics, action, status, statusLabel }) => ({
      id,
      reference,
      client,
      product,
      dateLabel,
      supply,
      preparation,
      transport,
      logistics,
      action,
      status,
      statusLabel,
    }))
    .sort((a, b) => statusPriority[a.status] - statusPriority[b.status] || a.client.localeCompare(b.client, "es"));

  return Response.json({ plan });
}
