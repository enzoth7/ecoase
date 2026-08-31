import { getCapacity, getProviders, saveTransportTripAdjustment } from "../../store";
import type { CapacityStatus, TransportSource } from "../../../data";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(request: Request) {
  const payload = await request.json() as { date?: string; source?: TransportSource; providerId?: string; tripCapacity?: number; responsible?: string; status?: CapacityStatus };
  const tripCapacity = Number(payload.tripCapacity);
  const responsible = payload.responsible?.trim() ?? "";
  const status = payload.source === "internal" ? "confirmed" : payload.status;
  const provider = payload.source === "external" ? (await getProviders()).find((item) => item.id === payload.providerId && item.type === "Transporte") : undefined;
  if (!payload.date || !isoDate.test(payload.date) || !payload.source || !["internal", "external"].includes(payload.source) || (payload.source === "external" && !provider) || !Number.isInteger(tripCapacity) || tripCapacity < 0 || !status || !["estimated", "confirmed"].includes(status) || !responsible) {
    return Response.json({ error: "Revise la fecha, el origen, los cupos y el responsable." }, { status: 400 });
  }

  const day = (await getCapacity(payload.date, payload.date)).days[0];
  const current = day?.transport.find((entry) => entry.source === payload.source && (entry.providerId ?? "") === (provider?.id ?? ""));
  const tripAdjustment = tripCapacity - (current?.baseTripCapacity ?? 0);
  const adjustment = await saveTransportTripAdjustment({ date: payload.date, source: payload.source, providerId: provider?.id, tripAdjustment, responsible, status });
  return Response.json({ adjustment });
}
