import { getTreatmentBatchDetail } from "../../../store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const batch = await getTreatmentBatchDetail((await context.params).id);
    return batch ? Response.json({ batch }) : Response.json({ error: "Lote no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el lote." }, { status: 500 });
  }
}
