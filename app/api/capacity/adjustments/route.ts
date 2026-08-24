import { getProviders, saveCapacityAdjustment } from "../../store";
import type { CapacityOperation, TransportSource } from "../../../data";
import type { CapacityAdjustment } from "../../../capacity";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const operations: CapacityOperation[] = ["assembly", "marking", "ht"];

export async function PUT(request: Request) {
  const payload = await request.json() as Partial<CapacityAdjustment>;
  const adjustment = Number(payload.palletAdjustment);
  const peopleCount = payload.peopleCount === undefined ? undefined : Number(payload.peopleCount);
  const responsible = payload.responsible?.trim() ?? "";
  const validDate = Boolean(payload.date && isoDate.test(payload.date));
  const validAmount = Number.isInteger(adjustment);
  const validPeople = payload.resourceType === "internal_production"
    ? peopleCount !== undefined && Number.isInteger(peopleCount) && peopleCount >= 0
    : peopleCount === undefined;
  const providers = await getProviders();
  const validResource =
    (payload.resourceType === "internal_production" && Boolean(payload.operation && operations.includes(payload.operation)) && !payload.providerId && !payload.source) ||
    (payload.resourceType === "external_production" && Boolean(payload.operation && operations.includes(payload.operation)) && providers.some((provider) => provider.id === payload.providerId && provider.type === "Aserradero") && !payload.source) ||
    (payload.resourceType === "transport" && Boolean(payload.source && (["internal", "external"] as TransportSource[]).includes(payload.source)) && !payload.operation && (payload.source === "internal" ? !payload.providerId : providers.some((provider) => provider.id === payload.providerId && provider.type === "Transporte")));

  const requiresResponsible = payload.resourceType !== "internal_production" && adjustment !== 0;
  if (!validDate || !validAmount || !validPeople || !validResource || (requiresResponsible && !responsible)) {
    return Response.json({ error: "Indique las personas asignadas o el recurso que aporta la capacidad para ese día." }, { status: 400 });
  }

  return Response.json({ adjustment: await saveCapacityAdjustment({
    date: payload.date!,
    resourceType: payload.resourceType!,
    operation: payload.operation,
    source: payload.source,
    providerId: payload.providerId,
    palletAdjustment: adjustment,
    peopleCount,
    responsible: responsible || undefined,
    status: payload.status,
  }) });
}
