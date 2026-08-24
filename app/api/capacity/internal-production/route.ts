import { saveInternalProduction } from "../../store";
import type { CapacityOperation } from "../../../data";

const operations: CapacityOperation[] = ["assembly", "marking", "ht"];

export async function PUT(request: Request) {
  const payload = await request.json() as { operation?: CapacityOperation; peopleCount?: number; manualCapacity?: number | null };
  const peopleCount = Number(payload.peopleCount);
  const manualCapacity = payload.manualCapacity === null || payload.manualCapacity === undefined || payload.manualCapacity === "" as never ? undefined : Number(payload.manualCapacity);
  if (!payload.operation || !operations.includes(payload.operation) || !Number.isInteger(peopleCount) || peopleCount < 0 || (manualCapacity !== undefined && (!Number.isInteger(manualCapacity) || manualCapacity < 0))) {
    return Response.json({ error: "Revise la operación, la dotación y la capacidad." }, { status: 400 });
  }
  return Response.json({ entry: await saveInternalProduction({ operation: payload.operation, peopleCount, manualCapacity }) });
}
