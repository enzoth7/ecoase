import { getLogisticsSnapshot } from "../../logistics-store";

export async function GET() {
  try {
    const { availability, stock } = await getLogisticsSnapshot();
    return Response.json({ availability, stock });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar la disponibilidad." }, { status: 500 }); }
}
