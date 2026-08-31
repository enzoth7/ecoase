import { createProductionRule, deleteProductionRule, updateProductionRule, type ProductionRuleInput } from "../../store";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function parseRule(payload: Record<string, unknown>): ProductionRuleInput | null {
  const resourceId = typeof payload.resourceId === "string" || typeof payload.resourceId === "number" ? payload.resourceId : "";
  const productId = typeof payload.productId === "string" ? payload.productId.trim() : "";
  const peopleCount = payload.peopleCount === "" || payload.peopleCount === null || payload.peopleCount === undefined ? undefined : Number(payload.peopleCount);
  const configurationLabel = typeof payload.configurationLabel === "string" ? payload.configurationLabel.trim() : "";
  const normalUnitsPerDay = Number(payload.normalUnitsPerDay);
  const maximumUnitsPerDay = Number(payload.maximumUnitsPerDay);
  const validFrom = typeof payload.validFrom === "string" ? payload.validFrom : "";
  const validTo = typeof payload.validTo === "string" && payload.validTo ? payload.validTo : undefined;
  const source = typeof payload.source === "string" ? payload.source.trim() : "manual";
  const note = typeof payload.note === "string" ? payload.note.trim() || undefined : undefined;
  if (!resourceId || !productId || !configurationLabel || !source || !Number.isInteger(normalUnitsPerDay) || normalUnitsPerDay <= 0 || !Number.isInteger(maximumUnitsPerDay) || maximumUnitsPerDay < normalUnitsPerDay || peopleCount !== undefined && (!Number.isInteger(peopleCount) || peopleCount <= 0) || !isoDate.test(validFrom) || validTo !== undefined && (!isoDate.test(validTo) || validTo < validFrom)) return null;
  return { resourceId, productId, peopleCount, configurationLabel, normalUnitsPerDay, maximumUnitsPerDay, validFrom, validTo, source, note };
}

export async function POST(request: Request) {
  try {
    const input = parseRule(await request.json() as Record<string, unknown>);
    if (!input) return Response.json({ error: "Revise recurso, producto, configuración, capacidades y vigencia." }, { status: 400 });
    return Response.json({ rule: await createProductionRule(input) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la regla." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = typeof payload.id === "string" || typeof payload.id === "number" ? payload.id : "";
    const input = parseRule(payload);
    if (!id || !input) return Response.json({ error: "Revise la regla y todos sus valores." }, { status: 400 });
    const rule = await updateProductionRule(id, input);
    return rule ? Response.json({ rule }) : Response.json({ error: "Regla no encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo editar la regla." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "Indique la regla que desea eliminar." }, { status: 400 });
    const deleted = await deleteProductionRule(id);
    return deleted ? Response.json({ deleted: true }) : Response.json({ error: "Regla no encontrada." }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar la regla.";
    return Response.json({ error: message }, { status: message.includes("está siendo utilizada") ? 409 : 400 });
  }
}
