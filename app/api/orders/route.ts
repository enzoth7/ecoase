import { createOrder, getOrders, getProviders, type CreateOrderInput } from "../store";
import { isOrderClosed } from "../../data";
import type { CapacityOperation, ProductionSource, TransportSource } from "../../data";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const operations: CapacityOperation[] = ["assembly", "treatment"];

export async function GET() {
  return Response.json({ orders: (await getOrders()).filter((order) => !isOrderClosed(order)) });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<CreateOrderInput> & { clientProductId?: number | string; requested?: number };
  const lines = Array.isArray(payload.lines)
    ? payload.lines.map((line) => ({ clientProductId: line.clientProductId, quantity: Number(line.quantity) })).filter((line) => (typeof line.clientProductId === "number" || typeof line.clientProductId === "string") && Number.isInteger(line.quantity) && line.quantity > 0)
    : (typeof payload.clientProductId === "number" || typeof payload.clientProductId === "string") && Number.isInteger(Number(payload.requested)) && Number(payload.requested) > 0
      ? [{ clientProductId: payload.clientProductId, quantity: Number(payload.requested) }]
      : [];
  const orderDate = typeof payload.orderDate === "string" && isoDate.test(payload.orderDate) ? payload.orderDate : "";
  const requestedDeliveryDate = typeof payload.requestedDeliveryDate === "string" && isoDate.test(payload.requestedDeliveryDate) ? payload.requestedDeliveryDate : "";
  const plannedDate = typeof payload.plannedDate === "string" && isoDate.test(payload.plannedDate) ? payload.plannedDate : "";
  const productionSource = (["internal", "sawmill", "import"] as ProductionSource[]).includes(payload.productionSource as ProductionSource) ? payload.productionSource as ProductionSource : "internal";
  const transportSource = (["internal", "external"] as TransportSource[]).includes(payload.transportSource as TransportSource) ? payload.transportSource as TransportSource : "external";
  const productionDate = typeof payload.productionDate === "string" && isoDate.test(payload.productionDate) ? payload.productionDate : plannedDate || undefined;
  const importArrivalDate = typeof payload.importArrivalDate === "string" && isoDate.test(payload.importArrivalDate) ? payload.importArrivalDate : undefined;
  const requiredOperations: CapacityOperation[] = Array.isArray(payload.requiredOperations) ? payload.requiredOperations.filter((item): item is CapacityOperation => operations.includes(item as CapacityOperation)) : ["assembly"];

  if (!lines.length || !orderDate || !requestedDeliveryDate || !plannedDate || !productionSource || !transportSource || requiredOperations.length === 0) {
    return Response.json({ error: "Cliente, al menos un producto con cantidad, fechas, operaciones y orígenes son obligatorios." }, { status: 400 });
  }
  const providers = await getProviders();
  const producer = providers.find((provider) => provider.id === payload.producerProviderId);
  const transporter = providers.find((provider) => provider.id === payload.transportProviderId) ?? providers.find((provider) => provider.type === "Transporte" && provider.name === payload.transport?.trim());
  if ((productionSource === "internal" || productionSource === "sawmill") && !productionDate) return Response.json({ error: "Indique la fecha de producción." }, { status: 400 });
  if (productionSource === "sawmill" && producer?.type !== "Aserradero") return Response.json({ error: "Seleccione un aserradero registrado." }, { status: 400 });
  if (productionSource === "import" && (producer?.type !== "Importador" || !importArrivalDate)) return Response.json({ error: "Seleccione un importador y la fecha prevista de llegada." }, { status: 400 });
  if (transportSource === "external" && transporter?.type !== "Transporte") return Response.json({ error: "Seleccione un transportista registrado." }, { status: 400 });
  const transport = transportSource === "internal" ? "Interno" : transporter!.name;

  try {
    const order = await createOrder({
      lines,
      orderDate,
      requestedDeliveryDate,
      plannedDate,
      transport,
      stage: "negociacion",
      reference: payload.reference,
      notes: payload.notes,
      productionSource,
      producerProviderId: producer?.id,
      productionDate,
      importArrivalDate,
      requiredOperations,
      transportSource,
      transportProviderId: transporter?.id,
    });
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el pedido." }, { status: 400 });
  }
}
