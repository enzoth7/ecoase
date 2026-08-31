import { createConsumptionRule } from "../../store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = { clientId: typeof body.clientId === "string" ? body.clientId : "", productId: typeof body.productId === "string" ? body.productId : "", dailyConsumption: Number(body.dailyConsumption), workdaysPerWeek: Number(body.workdaysPerWeek), safetyStock: Number(body.safetyStock ?? 0), validFrom: typeof body.validFrom === "string" ? body.validFrom : "", validTo: typeof body.validTo === "string" ? body.validTo : undefined, source: typeof body.source === "string" ? body.source.trim() : "", note: typeof body.note === "string" ? body.note : undefined };
    if (!input.clientId || !input.productId || input.dailyConsumption < 0 || !Number.isInteger(input.workdaysPerWeek) || input.workdaysPerWeek < 1 || input.workdaysPerWeek > 7 || !Number.isInteger(input.safetyStock) || input.safetyStock < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom) || !input.source) return Response.json({ error: "Complete cliente, consumo, días, vigencia y fuente." }, { status: 400 });
    return Response.json({ ruleId: await createConsumptionRule(input) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el consumo." }, { status: 400 });
  }
}
