import Dashboard from "../Dashboard";

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedRisk = Array.isArray(params.riesgo) ? params.riesgo[0] : params.riesgo;
  return <Dashboard initialSection="stock" initialStockRiskFilter={requestedRisk === "alerta" ? "alert" : undefined} />;
}
