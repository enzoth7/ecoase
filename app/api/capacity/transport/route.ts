import { getProviders, saveTransportCapacity, saveTransportTripCapacity } from "../../store";
import type { CapacityStatus, TransportSource } from "../../../data";

export async function PUT(request: Request) {
  const payload = await request.json() as { source?: TransportSource; providerId?: string; palletCapacity?: number; tripCapacity?: number; status?: CapacityStatus };
  const usesTripCapacity = payload.tripCapacity !== undefined;
  const capacity = Number(usesTripCapacity ? payload.tripCapacity : payload.palletCapacity);
  const provider = payload.source === "external" ? (await getProviders()).find((item) => item.id === payload.providerId && item.type === "Transporte") : undefined;
  if (!payload.source || !["internal", "external"].includes(payload.source) || (payload.source === "external" && !provider) || !Number.isInteger(capacity) || capacity < 0 || !payload.status || !["estimated", "confirmed"].includes(payload.status)) {
    return Response.json({ error: "Revise el origen, el transportista y la capacidad." }, { status: 400 });
  }
  const status = payload.source === "internal" ? "confirmed" : payload.status;
  const entry = usesTripCapacity
    ? await saveTransportTripCapacity({ source: payload.source, providerId: provider?.id, tripCapacity: capacity, status })
    : await saveTransportCapacity({ source: payload.source, providerId: provider?.id, palletCapacity: capacity, status });
  return Response.json({ entry });
}
