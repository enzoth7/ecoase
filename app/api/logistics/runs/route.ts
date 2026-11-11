import { getLogisticsRuns, saveLogisticsRun } from "../../logistics-store";

export async function GET(request: Request) {
  try { return Response.json({ runs: await getLogisticsRuns(new URL(request.url).searchParams.get("orderId") ?? undefined) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar las salidas." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try { return Response.json({ run: await saveLogisticsRun(await request.json() as Record<string, unknown>) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la salida." }, { status: 400 }); }
}
export async function PATCH(request: Request) { return POST(request); }
