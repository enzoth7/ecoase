import type { DashboardSection, LogisticsWorkspaceView, ProductionWorkspaceView, SecaderoWorkspaceView, StockWorkspaceView } from "./Dashboard";

export type RouteState = {
  href: string;
  initialSection: DashboardSection;
  initialClientId?: string;
  initialProductionView?: ProductionWorkspaceView;
  initialProductionDate?: string;
  initialRulesClientId?: string;
  initialRulesProductIds?: string[];
  initialRulesDate?: string;
  initialStockView?: StockWorkspaceView;
  initialStockProductId?: string;
  initialLogisticsView?: LogisticsWorkspaceView;
  initialSecaderoView?: SecaderoWorkspaceView;
};

const sections = new Set<DashboardSection>(["inicio", "calendario", "pedidos", "historial", "productos", "niveles", "clientes", "proveedores", "produccion", "stock", "secadero", "logistica"]);

const subpages: Record<string, Omit<RouteState, "href">> = {
  "/produccion-real": { initialSection: "produccion", initialProductionView: "weekly" },
  "/recursos": { initialSection: "produccion", initialProductionView: "resources" },
  "/reglas-produccion": { initialSection: "produccion", initialProductionView: "rules" },
  "/stock-pamer": { initialSection: "stock", initialStockView: "pamer" },
  "/movimientos": { initialSection: "stock", initialStockView: "movements" },
  "/registro-ht": { initialSection: "secadero", initialSecaderoView: "registry" },
  "/reglas-secadero": { initialSection: "secadero", initialSecaderoView: "rules" },
  "/viajes": { initialSection: "logistica", initialLogisticsView: "trips" },
  "/mapa-logistica": { initialSection: "logistica", initialLogisticsView: "map" },
  "/limites-logistica": { initialSection: "logistica", initialLogisticsView: "limits" },
};

const legacyViews: Record<string, Record<string, string>> = {
  "/produccion": { semanal: "/produccion-real", recursos: "/recursos", configuracion: "/recursos", excepciones: "/recursos", reglas: "/reglas-produccion", marcado: "/registro-ht" },
  "/stock": { pamer: "/stock-pamer", movimientos: "/movimientos" },
  "/secadero": { registro: "/registro-ht", reglas: "/reglas-secadero" },
  "/logistica": { viajes: "/viajes", mapa: "/mapa-logistica", limites: "/limites-logistica" },
};

export function resolveRoute(address: string): RouteState {
  const url = new URL(address, window.location.origin);
  let path = url.pathname.replace(/\/$/, "") || "/";
  const query = url.searchParams;

  if (path === "/") path = "/inicio";
  if (path === "/plan") path = "/produccion";
  if (path === "/capacidad") path = "/recursos";
  if (path === "/tratamiento") path = "/registro-ht";
  const legacyView = query.get("vista");
  path = legacyViews[path]?.[legacyView ?? ""] ?? path;
  if (path === "/produccion" && !legacyView && query.has("fecha")) path = "/produccion-real";
  query.delete("vista");

  const clientMatch = /^\/clientes\/([^/]+)$/.exec(path);
  const clientId = clientMatch ? decodeURIComponent(clientMatch[1]) : undefined;
  const subpage = subpages[path];
  const section = subpage?.initialSection ?? (clientId ? "clientes" : path.slice(1) as DashboardSection);
  if (!sections.has(section)) path = "/inicio";
  const resolvedSection = sections.has(section) ? section : "inicio";
  const href = `${path === "/inicio" ? "/" : path}${query.size ? `?${query.toString()}` : ""}`;
  return {
    href,
    initialSection: resolvedSection,
    initialClientId: clientId,
    initialProductionView: resolvedSection === "produccion" ? subpage?.initialProductionView ?? "planning" : undefined,
    initialProductionDate: query.get("fecha") ?? undefined,
    initialRulesClientId: path === "/reglas-produccion" ? query.get("cliente") ?? undefined : undefined,
    initialRulesProductIds: path === "/reglas-produccion" ? (query.get("productos") ?? "").split(",").filter(Boolean) : undefined,
    initialRulesDate: path === "/reglas-produccion" && /^\d{4}-\d{2}-\d{2}$/.test(query.get("desde") ?? "") ? query.get("desde") ?? undefined : undefined,
    initialStockView: resolvedSection === "stock" ? subpage?.initialStockView ?? "inventory" : undefined,
    initialStockProductId: resolvedSection === "stock" ? query.get("producto") ?? undefined : undefined,
    initialLogisticsView: subpage?.initialLogisticsView,
    initialSecaderoView: resolvedSection === "secadero" ? subpage?.initialSecaderoView ?? "plan" : undefined,
  };
}
