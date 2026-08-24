import { getProviders, saveTransportCapacity } from "../../store";
import type { CapacityStatus, TransportSource } from "../../../data";

export async function PUT(request: Request) {
  const payload = await request.json() as { source?: TransportSource; providerId?: string; palletCapacity?: number; status?: CapacityStatus };
  const palletCapacity = Number(payload.palletCapacity);
  const provider = payload.source === "external" ? (await getProviders()).find((item) => item.id === payload.providerId && item.type === "Transporte") : undefined;
  if (!payload.source || !["internal", "external"].includes(payload.source) || (payload.source === "external" && !provider) || !Number.isInteger(palletCapacity) || palletCapacity < 0 || !payload.status || !["estimated", "confirmed"].includes(payload.status)) {
    return Response.json({ error: "Revise el origen, el transportista y la capacidad." }, { status: 400 });
  }
  return Response.json({ entry: await saveTransportCapacity({ source: payload.source, providerId: provider?.id, palletCapacity, status: payload.source === "internal" ? "confirmed" : payload.status }) });
}
