import { getTreatmentDashboard } from "../store";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Indique una fecha válida." }, { status: 400 });
  try {
    return Response.json({ treatment: await getTreatmentDashboard(date) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el registro diario." }, { status: 500 });
  }
}
