import { getTreatmentOptions } from "../../store";

export async function GET() {
  try {
    return Response.json({ options: await getTreatmentOptions() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar las opciones de marcado." }, { status: 500 });
  }
}
