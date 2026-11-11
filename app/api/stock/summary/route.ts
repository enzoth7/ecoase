import { getStockImportReport, getStockSummary } from "../../store";

export async function GET(request: Request) {
  try {
    const includeOrderCommitments = new URL(request.url).searchParams.get("destinos") === "1";
    const [stock, imports] = await Promise.all([getStockSummary(includeOrderCommitments), getStockImportReport()]);
    return Response.json({ stock, imports });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el stock." }, { status: 500 });
  }
}
