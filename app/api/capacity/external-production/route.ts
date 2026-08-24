import { getProviders, saveExternalProduction } from "../../store";
import type { CapacityOperation, CapacityStatus } from "../../../data";

const operations: CapacityOperation[] = ["assembly", "marking", "ht"];

export async function PUT(request: Request) {
  const payload = await request.json() as { providerId?: string; operation?: CapacityOperation; palletCapacity?: number; status?: CapacityStatus };
  const palletCapacity = Number(payload.palletCapacity);
  const provider = (await getProviders()).find((item) => item.id === payload.providerId && item.type === "Aserradero");
  if (!provider || !payload.operation || !operations.includes(payload.operation) || !Number.isInteger(palletCapacity) || palletCapacity < 0 || !payload.status || !["estimated", "confirmed"].includes(payload.status)) {
    return Response.json({ error: "Revise el aserradero, la operación y la capacidad." }, { status: 400 });
  }
  return Response.json({ entry: await saveExternalProduction({ providerId: provider.id, operation: payload.operation, palletCapacity, status: payload.status }) });
}
