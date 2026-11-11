import { getLogisticsSnapshot } from "../../logistics-store";

export async function GET() {
  try { return Response.json(await getLogisticsSnapshot()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar Logística." }, { status: 500 }); }
}
