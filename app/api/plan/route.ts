import { getOrders } from "../store";
import { getOrderOperationalStatus, isOrderClosed, orderOperationalStatusLabels, type OrderOperationalStatus } from "../../data";

const statusPriority: Record<OrderOperationalStatus, number> = { planned: 0, preparation: 1, ready_for_delivery: 2, in_transit: 3, partial_delivery: 4, delivered: 5, cancelled: 6 };

export async function GET() {
  const plan = (await getOrders())
    .filter((order) => !isOrderClosed(order))
    .map((order) => {
      const operationalStatus = getOrderOperationalStatus(order);
      return { ...order, operationalStatus, operationalStatusLabel: orderOperationalStatusLabels[operationalStatus] };
    })
    .sort((a, b) => statusPriority[a.operationalStatus] - statusPriority[b.operationalStatus] || a.client.localeCompare(b.client, "es"));

  return Response.json({ plan });
}
