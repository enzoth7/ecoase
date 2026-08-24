import { deleteCapacityRule, saveCapacityRule } from "../../store";
import type { CapacityOperation } from "../../../data";

const operations: CapacityOperation[] = ["assembly", "marking", "ht"];

export async function PUT(request: Request) {
  const payload = await request.json() as { operation?: CapacityOperation; peopleCount?: number; palletCapacity?: number };
  const peopleCount = Number(payload.peopleCount);
  const palletCapacity = Number(payload.palletCapacity);
  if (!payload.operation || !operations.includes(payload.operation) || !Number.isInteger(peopleCount) || peopleCount < 0 || !Number.isInteger(palletCapacity) || palletCapacity < 0) {
    return Response.json({ error: "Operación, personas y capacidad deben ser valores válidos." }, { status: 400 });
  }
  return Response.json({ rule: await saveCapacityRule({ operation: payload.operation, peopleCount, palletCapacity }) });
}

export async function DELETE(request: Request) {
  const payload = await request.json() as { operation?: CapacityOperation; peopleCount?: number };
  const peopleCount = Number(payload.peopleCount);
  if (!payload.operation || !operations.includes(payload.operation) || !Number.isInteger(peopleCount) || peopleCount < 0) {
    return Response.json({ error: "Indique una operación y cantidad de personas válidas." }, { status: 400 });
  }
  const deleted = await deleteCapacityRule(payload.operation, peopleCount);
  if (!deleted) return Response.json({ error: "La regla no existe." }, { status: 404 });
  return Response.json({ deleted: true });
}
