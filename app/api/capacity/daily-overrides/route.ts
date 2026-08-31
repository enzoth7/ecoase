import { saveProductionOverride } from "../../store";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const date = typeof payload.date === "string" ? payload.date : "";
    const resourceId = typeof payload.resourceId === "string" || typeof payload.resourceId === "number" ? payload.resourceId : "";
    const capacityRuleId = typeof payload.capacityRuleId === "string" || typeof payload.capacityRuleId === "number" ? payload.capacityRuleId : undefined;
    const productId = typeof payload.productId === "string" && payload.productId ? payload.productId : undefined;
    const normalUnitsPerDay = payload.normalUnitsPerDay === "" || payload.normalUnitsPerDay === null || payload.normalUnitsPerDay === undefined ? undefined : Number(payload.normalUnitsPerDay);
    const maximumUnitsPerDay = payload.maximumUnitsPerDay === "" || payload.maximumUnitsPerDay === null || payload.maximumUnitsPerDay === undefined ? undefined : Number(payload.maximumUnitsPerDay);
    const available = payload.available !== false;
    const externalStatus = payload.externalStatus === "estimated" || payload.externalStatus === "confirmed" ? payload.externalStatus : undefined;
    const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    const responsible = typeof payload.responsible === "string" ? payload.responsible.trim() : "";
    if (!isoDate.test(date) || !resourceId || !reason || !responsible || normalUnitsPerDay !== undefined && (!Number.isInteger(normalUnitsPerDay) || normalUnitsPerDay <= 0) || maximumUnitsPerDay !== undefined && (!Number.isInteger(maximumUnitsPerDay) || maximumUnitsPerDay <= 0) || normalUnitsPerDay !== undefined && maximumUnitsPerDay !== undefined && maximumUnitsPerDay < normalUnitsPerDay) {
      return Response.json({ error: "Revise fecha, capacidades, motivo y responsable." }, { status: 400 });
    }
    const override = await saveProductionOverride({ date, resourceId, capacityRuleId, productId, normalUnitsPerDay, maximumUnitsPerDay, available, externalStatus, reason, responsible });
    return Response.json({ override });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el ajuste diario." }, { status: 400 });
  }
}
