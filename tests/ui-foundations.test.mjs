import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const uiPath = new URL("../app/components/ui.tsx", import.meta.url);
const navigationPath = new URL("../app/components/AppNavigation.tsx", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);
const stockPath = new URL("../app/StockView.tsx", import.meta.url);
const dashboardPath = new URL("../app/Dashboard.tsx", import.meta.url);
const departmentsPath = new URL("../app/uruguay-departments.ts", import.meta.url);

test("expone los componentes visuales compartidos de la etapa 01", async () => {
  const source = await readFile(uiPath, "utf8");
  for (const component of ["ModalShell", "AsyncButton", "FieldError", "EntitySelect", "WeekNavigator", "StatusBadge", "EmptyState", "LoadingState", "ConfirmDialog", "MetricCard", "CapacityMeter"]) {
    assert.match(source, new RegExp(`export function ${component}\\b`), component);
  }
});

test("el modal compartido gestiona foco, Escape, bloqueo y descarte", async () => {
  const [source, styles] = await Promise.all([readFile(uiPath, "utf8"), readFile(stylesPath, "utf8")]);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /returnFocusRef\.current\?\.focus\(\)/);
  assert.match(source, /¿Descartar los cambios\?/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(styles, /\.modal-shell\s*\{[\s\S]*?background-color:\s*#ffffff/i);
  assert.match(styles, /\.modal-shell\s*\{[\s\S]*?opacity:\s*1/i);
  assert.match(styles, /\.modal-shell\s*\{[\s\S]*?box-shadow:/i);
});

test("la navegación mantiene grupos, rutas y habilita stock", async () => {
  const source = await readFile(navigationPath, "utf8");
  for (const group of ["Inicio", "Operación", "Gestión", "Auditoría"]) assert.match(source, new RegExp(group));
  assert.match(source, /label: "Producción"/);
  assert.match(source, /label: "Stock"/);
  assert.match(source, /section: "produccion" as const, href: "\/produccion"/);
  assert.match(source, /section: "stock" as const, href: "\/stock"/);
  assert.doesNotMatch(source, /label: "Tratamiento"/);
  assert.doesNotMatch(source, /href: "\/tratamiento"/);
  assert.doesNotMatch(source, /href: "\/plan"/);
  assert.doesNotMatch(source, /sidebar-week/);
});

test("clientes elige uno de los 19 departamentos de Uruguay", async () => {
  const source = await readFile(departmentsPath, "utf8");
  const departments = [...source.matchAll(/^ {2}"(.+)",$/gm)].map(([, department]) => department);
  assert.equal(departments.length, 19);
  for (const department of ["Artigas", "Montevideo", "San José", "Treinta y Tres"]) assert.ok(departments.includes(department));
});

test("el brand kit define la paleta operativa y un mínimo tipográfico visible", async () => {
  const styles = await readFile(stylesPath, "utf8");
  for (const [token, color] of [
    ["brand-green-dark", "#183d31"],
    ["brand-green-light", "#e8f3ed"],
    ["brand-brown-dark", "#6b3f29"],
    ["brand-brown-light", "#fbf4ee"],
    ["brand-black", "#17221e"],
    ["brand-white", "#ffffff"],
  ]) assert.match(styles, new RegExp(`--${token}:\\s*${color}`, "i"), token);

  assert.doesNotMatch(styles, /font-size:\s*(?:8|9|10|11)px\b/i);
  assert.doesNotMatch(styles, /font-size:\s*\.72rem\b/i);
  assert.match(styles, /\.dashboard-shell\s*\{[^}]*background:\s*var\(--brand-green-dark\)/i);
  assert.match(styles, /\.client-address-editor select,[\s\S]*?appearance:\s*none/i);
  assert.match(styles, /\.client-address-editor select,[\s\S]*?background-image:\s*url\(/i);
  assert.match(styles, /\.operations-calendar\s*\{[^}]*--calendar-wood:\s*var\(--brand-brown-dark\)/i);
  assert.match(styles, /\.operations-calendar\s*\{[^}]*background:\s*var\(--brand-brown-light\)/i);
  assert.match(styles, /\.stock-kpis > button\s*\{[^}]*justify-content:\s*center/i);
  assert.match(styles, /\.stock-kpis strong\s*\{[^}]*font-size:\s*26px/i);
});

test("stock deja la información secundaria en el detalle", async () => {
  const source = await readFile(stockPath, "utf8");
  const mainTable = source.slice(source.indexOf('<table className="stock-table">'));
  assert.match(mainTable, /<th>Artículo<\/th><th>Código Zeta<\/th><th>Medida<\/th>/);
  assert.match(mainTable, /row\.product\.zetaCode \?\? row\.product\.sourceCode/);
  assert.doesNotMatch(mainTable, /<small>\{row\.product\.sourceCode\}/);
  assert.match(mainTable, /Días de stock/);
  assert.doesNotMatch(mainTable, /<th>Consumo\/día<\/th>/);
  assert.doesNotMatch(mainTable, /<th>Próxima entrega<\/th>/);
  assert.match(source, /<strong>Consumo<\/strong>/);
  assert.match(source, /<strong>Proyección<\/strong>/);
  assert.match(source, /stock-detail-section/);
  assert.doesNotMatch(source, /Sin consumo informado: el riesgo queda gris/);
  assert.doesNotMatch(source, /Falta cargar consumo/);
  assert.match(source, /type StockSummaryFilter = "alert" \| "ready" \| "reserved" \| "pending" \| ""/);
  assert.match(source, /aria-pressed=\{summaryFilter === "ready"\}/);
  assert.match(source, /matchesSummaryFilter\(row, summaryFilter\)/);
});

test("los indicadores de pedidos funcionan como filtros accesibles", async () => {
  const source = await readFile(dashboardPath, "utf8");
  assert.match(source, /aria-label="Filtros rápidos de pedidos"/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "in-progress"\}/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "waiting"\}/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "total"\}/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "compliance"\}/);
  assert.match(source, /isOrderInPeriod\(order, kpiPeriod, today\)/);
  assert.match(source, /setSelectedId\(""\)/);
});
