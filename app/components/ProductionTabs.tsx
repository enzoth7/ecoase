import { Factory, Flame, Settings2 } from "lucide-react";

export type ProductionWorkspaceView = "production" | "marking" | "configuration";

export default function ProductionTabs({ current }: { current: ProductionWorkspaceView }) {
  return <nav className="production-tabs" aria-label="Secciones de producción">
    <a href="/produccion" className={current === "production" ? "active" : ""} aria-current={current === "production" ? "page" : undefined}><Factory size={16} aria-hidden="true" />Producción</a>
    <a href="/produccion?vista=marcado" className={current === "marking" ? "active" : ""} aria-current={current === "marking" ? "page" : undefined}><Flame size={16} aria-hidden="true" />Marcado</a>
    <a href="/produccion?vista=configuracion" className={current === "configuration" ? "active" : ""} aria-current={current === "configuration" ? "page" : undefined}><Settings2 size={16} aria-hidden="true" />Configuración</a>
  </nav>;
}
