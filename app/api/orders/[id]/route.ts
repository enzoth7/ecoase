import { getOrderDetail, getProviders, updateOrder } from "../../store";
import type { CapacityOperation, ProductionSource, TransportSource } from "../../../data";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const order = await getOrderDetail((await context.params).id);
  return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = (await request.json()) as Record<string, unknown>;
  const transportCandidate = typeof payload.transport === "string" ? payload.transport.trim() : undefined;
  const plannedDate = typeof payload.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate)
    ? payload.plannedDate
    : undefined;
  const requested = typeof payload.requested === "number" && Number.isFinite(payload.requested) && payload.requested > 0
    ? payload.requested
    : undefined;
  const cancelled = payload.cancelled === true;
  const providers = await getProviders();
  const productionSource = typeof payload.productionSource === "string" && ["internal", "sawmill", "import"].includes(payload.productionSource) ? payload.productionSource as ProductionSource : undefined;
  const transportSource = typeof payload.transportSource === "string" && ["internal", "external"].includes(payload.transportSource) ? payload.transportSource as TransportSource : transportCandidate ? "external" : undefined;
  const producerProviderId = typeof payload.producerProviderId === "string" ? payload.producerProviderId : undefined;
  const transportProviderId = typeof payload.transportProviderId === "string" ? payload.transportProviderId : undefined;
  const productionDate = typeof payload.productionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.productionDate) ? payload.productionDate : undefined;
  const importArrivalDate = typeof payload.importArrivalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.importArrivalDate) ? payload.importArrivalDate : undefined;
  const requiredOperations = Array.isArray(payload.requiredOperations) ? payload.requiredOperations.filter((value): value is CapacityOperation => ["assembly", "treatment"].includes(String(value))) : undefined;
  const transporter = providers.find((provider) => provider.id === transportProviderId) ?? providers.find((provider) => provider.type === "Transporte" && provider.name === transportCandidate);
  const producer = providers.find((provider) => provider.id === producerProviderId);
  if (productionSource === "sawmill" && producer?.type !== "Aserradero") return Response.json({ error: "Seleccione un aserradero registrado." }, { status: 400 });
  if (productionSource === "import" && (producer?.type !== "Importador" || !importArrivalDate)) return Response.json({ error: "Seleccione un importador y su fecha de llegada." }, { status: 400 });
  if (transportSource === "external" && transporter?.type !== "Transporte") return Response.json({ error: "Seleccione un transportista registrado." }, { status: 400 });
  const transport = transportSource === "internal" ? "Interno" : transporter?.name;

  if (!transport && !plannedDate && !requested && !cancelled && !productionSource && !productionDate && !importArrivalDate && !requiredOperations && !transportSource) {
    return Response.json({ error: "Indique al menos un cambio válido." }, { status: 400 });
  }

  try {
    const result = await updateOrder(id, { transport, plannedDate, requested, stage: cancelled ? "cancelado" : undefined, productionSource, producerProviderId, productionDate, importArrivalDate, requiredOperations, transportSource, transportProviderId: transporter?.id });
    if (!result) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el pedido." }, { status: 400 });
  }
}
