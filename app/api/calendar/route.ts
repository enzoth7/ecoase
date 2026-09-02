import { getCapacity, getOrders, getProviders } from "../store";
import { isOrderClosed } from "../../data";

function iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function productLabel(value: string) { return value.replace(/\s*[·/+|-]?\s*\b(?:Tratamiento\s+)?HT\b/giu, " ").replace(/\s+/g, " ").replace(/[·/+|-]+\s*$/g, "").trim(); }

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
    treatmentSummary: shipment.lines.some((line) => Boolean(line.treatment)) ? "Marcado" : "Sin marcado",
    stockRisks: shipment.lines.flatMap((shipmentLine) => {
      const line = order.lines.find((item) => item.id === shipmentLine.orderLineId);
      return line?.stockRisk && ["red", "orange", "yellow"].includes(line.stockRisk.level) ? [{ product: shipmentLine.product, ...line.stockRisk }] : [];
    }),
  })));
  return Response.json({ from, to, calendar, capacity, transporters: providers.filter((provider) => provider.type === "Transporte").map((provider) => ({ id: provider.id, name: provider.name })) });
}
