import { getTreatmentWeek, recordTreatmentNotPerformed } from "../../store";
import { parseDryingDay, shiftDryingDay } from "../../../drying";

function validDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parseDryingDay(value).valueOf()) && shiftDryingDay(value, 0) === value;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const from = query.get("from");
  const to = query.get("to");
  if (!validDay(from) || !validDay(to) || to < from || to > shiftDryingDay(from, 6)) {
    return Response.json({ error: "Indique un rango de hasta siete días." }, { status: 400 });
  }
  try {
    return Response.json({ week: await getTreatmentWeek(from, to) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar los resultados de HT." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { orderId, orderLineId, date } = body;
    const responsible = typeof body.responsible === "string" ? body.responsible.replace(/\s+/g, " ").trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : undefined;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date());
    if (typeof orderId !== "string" || !orderId || typeof orderLineId !== "string" || !orderLineId || !validDay(date) || date > today || !responsible) {
      return Response.json({ error: "Revise el pedido, la fecha y el responsable." }, { status: 400 });
    }
    await recordTreatmentNotPerformed({ orderId, orderLineId, date, responsible, note });
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el resultado." }, { status: 400 });
  }
}
