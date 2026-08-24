import { createOrder, getOrders, getProviders, type CreateOrderInput } from "../store";

export async function GET() {
  return Response.json({ orders: (await getOrders()).filter((order) => order.status !== "completado") });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<CreateOrderInput>;
  const client = payload.client?.trim() ?? "";
  const product = payload.product?.trim() ?? "";
  const requested = Number(payload.requested);
  const plannedDate = typeof payload.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate) ? payload.plannedDate : "";
  const transport = payload.transport?.trim() ?? "";

  if (!client || !product || !plannedDate || !transport || !Number.isFinite(requested) || requested <= 0) {
    return Response.json({ error: "Cliente, producto, cantidad, fecha y transporte son obligatorios." }, { status: 400 });
  }
  const validTransports = new Set((await getProviders()).filter((provider) => provider.type === "Transporte").map((provider) => provider.name));
  if (!validTransports.has(transport)) {
    return Response.json({ error: "Seleccione un transportista registrado en Proveedores." }, { status: 400 });
  }

  try {
    const order = await createOrder({ client, product, requested, plannedDate, transport, reference: payload.reference });
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el pedido." }, { status: 400 });
  }
}
