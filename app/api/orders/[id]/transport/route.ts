import { assignOrderTransport } from "../../../store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await request.json() as { source?: unknown; providerId?: unknown; newProviderName?: unknown };
  const source = payload.source === "internal" || payload.source === "external" ? payload.source : undefined;
  const providerId = typeof payload.providerId === "string" ? payload.providerId : undefined;
  const newProviderName = typeof payload.newProviderName === "string" ? payload.newProviderName : undefined;
  if (!source || (!providerId && !newProviderName?.trim())) return Response.json({ error: "Elegí un transporte interno o un transportista externo." }, { status: 400 });
  try {
    const order = await assignOrderTransport((await params).id, { source, providerId, newProviderName });
    return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo asignar el transporte." }, { status: 400 });
  }
}
