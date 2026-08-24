import { saveInternalProduction } from "../../store";
import type { CapacityOperation } from "../../../data";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const operations: CapacityOperation[] = ["assembly", "marking", "ht"];

export async function PUT(request: Request) {
  const payload = await request.json() as { date?: string; operation?: CapacityOperation; peopleCount?: number; manualCapacity?: number | null };
  const peopleCount = Number(payload.peopleCount);
  const manualCapacity = payload.manualCapacity === null || payload.manualCapacity === undefined || payload.manualCapacity === "" as never ? undefined : Number(payload.manualCapacity);
  if (!payload.date || !isoDate.test(payload.date) || !payload.operation || !operations.includes(payload.operation) || !Number.isInteger(peopleCount) || peopleCount < 0 || (manualCapacity !== undefined && (!Number.isInteger(manualCapacity) || manualCapacity < 0))) {
    return Response.json({ error: "Revise la fecha, la operación y las capacidades." }, { status: 400 });
  }
  return Response.json({ entry: await saveInternalProduction({ date: payload.date, operation: payload.operation, peopleCount, manualCapacity }) });
}
