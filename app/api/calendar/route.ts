import { getCapacity, getOrders, getProviders } from "../store";
import { getTransportRuns } from "../logistics-store";
import { getOrderOperationalStatus, getOrderRequestedDate, isOrderClosed } from "../../data";
import { canonicalProductName, productHeatTreatmentLabel } from "../../classification";

function iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function productLabel(value: string) { return canonicalProductName(value).trim(); }

function treatmentSummary(lines: Array<{ product: string }>) {
  const labels = new Set(lines.map((line) => productHeatTreatmentLabel(line.product)).filter(Boolean));
  return (["Con HT", "Sin HT"] as const).filter((label) => labels.has(label)).join(" y ");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hasRange = url.searchParams.has("from") || url.searchParams.has("to");
  const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : iso(monday);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : iso(sunday);
  if (from > to) return Response.json({ error: "El rango de fechas no es válido." }, { status: 400 });
  const [orders, capacity, providers] = await Promise.all([getOrders(), getCapacity(from, to), getProviders()]);
  const calendar = orders.filter((order) => hasRange || !isOrderClosed(order)).flatMap((order) => (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && (!hasRange || shipment.plannedDate >= from && shipment.plannedDate <= to)).map((shipment) => ({
    ...shipment,
    orderId: order.id,
    client: order.client,
    reference: order.reference,
    requestedDeliveryDate: order.requestedDeliveryDate,
    totalQuantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0),
    productLines: shipment.lines.map((line) => `${productLabel(line.product)} (${line.plannedQuantity})`),
    productSummary: shipment.lines.map((line) => `${productLabel(line.product)} (${line.plannedQuantity})`).join(" · "),
    treatmentSummary: treatmentSummary(shipment.lines),
  })));
  const inRange = (date?: string) => Boolean(date && date >= from && date <= to);
  const production = orders.filter((order) => getOrderOperationalStatus(order) !== "cancelled").flatMap((order) => {
    const byDay = new Map<string, number>();
    for (const line of order.lines) for (const allocation of line.productionAllocations ?? []) {
      if (allocation.status === "cancelled" || !inRange(allocation.plannedDate)) continue;
      byDay.set(allocation.plannedDate, (byDay.get(allocation.plannedDate) ?? 0) + allocation.plannedQuantity);
    }
    return Array.from(byDay, ([date, quantity]) => ({ id: `${order.id}-${date}`, orderId: order.id, client: order.client, date, quantity }));
  });
  const deliveries = orders.filter((order) => getOrderOperationalStatus(order) !== "cancelled").flatMap((order) => {
    const date = getOrderRequestedDate(order);
    return inRange(date) ? [{ id: `${order.id}-entrega`, orderId: order.id, client: order.client, date, quantity: order.requested }] : [];
  });
  const runs = await getTransportRuns(from, to);
  const time = (value?: string) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
  const transport = runs.flatMap((run) => {
    const order = orders.find((item) => item.id === run.orderId);
    const shipment = order?.shipments?.find((item) => String(item.id) === String(run.shipmentId));
    if (run.mode !== "supplier_pickup" && !order) return [];
    const quantity = shipment?.lines.reduce((sum, line) => sum + (line.loadedQuantity ?? line.plannedQuantity), 0);
    const start = time(run.plannedStartAt), end = time(run.plannedEndAt);
    const detail = run.mode === "customer_pickup" ? "Retira el cliente" : run.vehicleName ?? shipment?.transportLabel ?? "Transporte tercero";
    return [{ id: `run-${run.id}`, orderId: order?.id, client: run.mode === "supplier_pickup" ? "Retiro de proveedor" : order!.client, date: run.plannedDate, quantity,
      detail, time: [start, end].filter(Boolean).join(" a ") || undefined, done: run.status === "completed" || shipment?.status === "delivered" }];
  });
  return Response.json({ from, to, calendar, transport, production, deliveries, capacity, transporters: providers.filter((provider) => provider.type === "Transporte").map((provider) => ({ id: provider.id, name: provider.name })) });
}
