import { evaluateLogisticsRoute } from "../../../logistics-store";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await evaluateLogisticsRoute((await context.params).id)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo calcular la ruta." }, { status: 400 }); }
}
