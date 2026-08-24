import { recordOrderUpdate, type RecordOrderUpdateInput } from "../../../store";

type RouteContext = { params: Promise<{ id: string }> };

const updateKinds = new Set<RecordOrderUpdateInput["kind"]>(["entrega", "direccion", "despacho", "incidencia"]);

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const payload = (await request.json()) as Partial<RecordOrderUpdateInput>;
  const kind = payload.kind;

  if (!kind || !updateKinds.has(kind)) {
    return Response.json({ error: "Seleccione el tipo de actualización." }, { status: 400 });
  }

  const deliveredQuantity = payload.deliveredQuantity === undefined ? undefined : Number(payload.deliveredQuantity);
  const dispatchedAt = typeof payload.dispatchedAt === "string" && payload.dispatchedAt ? payload.dispatchedAt : undefined;
  const deliveredAt = typeof payload.deliveredAt === "string" && payload.deliveredAt ? payload.deliveredAt : undefined;
  if (kind === "entrega" && (deliveredQuantity === undefined || !Number.isInteger(deliveredQuantity) || deliveredQuantity <= 0)) {
    return Response.json({ error: "Indique una cantidad entregada mayor a cero." }, { status: 400 });
  }
  if (kind === "direccion" && !payload.deliveryAddress?.trim()) {
    return Response.json({ error: "Indique la dirección de entrega." }, { status: 400 });
  }
  if (kind === "incidencia" && !payload.note?.trim()) {
    return Response.json({ error: "Describa la incidencia." }, { status: 400 });
  }

  try {
    const result = await recordOrderUpdate(id, {
      kind,
      deliveredQuantity,
      deliveryAddress: payload.deliveryAddress,
      remittance: payload.remittance,
      dispatchedAt,
      deliveredAt,
      note: payload.note,
    });
    if (!result) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la actualización." }, { status: 400 });
  }
}
