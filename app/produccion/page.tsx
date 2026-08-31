import Dashboard from "../Dashboard";
import type { ProductionWorkspaceView } from "../components/ProductionTabs";

export default async function ProductionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedView = Array.isArray(params.vista) ? params.vista[0] : params.vista;
  const view: ProductionWorkspaceView = requestedView === "marcado" ? "marking" : requestedView === "configuracion" ? "configuration" : "production";
  const requestedDate = Array.isArray(params.fecha) ? params.fecha[0] : params.fecha;
  return <Dashboard initialSection="produccion" initialProductionView={view} initialProductionDate={requestedDate} />;
}
