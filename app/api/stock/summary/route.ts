import { getStockImportReport, getStockSummary } from "../../store";

export async function GET() {
  try {
    const [stock, imports] = await Promise.all([getStockSummary(), getStockImportReport()]);
    return Response.json({ stock, imports });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el stock." }, { status: 500 });
  }
}
