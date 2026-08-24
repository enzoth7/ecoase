import { createOrder, getOrders, type CreateOrderInput } from "../store";
import { providers } from "../../data";

const validTransports = new Set(providers.filter((provider) => provider.type === "Transporte").map((provider) => provider.name));

export async function GET() {
  return Response.json({ orders: getOrders().filter((order) => order.status !== "completado") });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<CreateOrderInput>;
  const client = payload.client?.trim() ?? "";
  const product = payload.product?.trim() ?? "";
  const requested = Number(payload.requested);
  const dateLabel = payload.dateLabel?.trim() ?? "";
  const transport = payload.transport?.trim() ?? "";

  if (!client || !product || !dateLabel || !transport || !Number.isFinite(requested) || requested <= 0) {
    return Response.json({ error: "Cliente, producto, cantidad, fecha y transporte son obligatorios." }, { status: 400 });
  }
  if (!validTransports.has(transport)) {
    return Response.json({ error: "Seleccione un transportista registrado en Proveedores." }, { status: 400 });
  }

  const order = createOrder({ client, product, requested, dateLabel, transport, reference: payload.reference });
  return Response.json({ order }, { status: 201 });
}
