import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const uiPath = new URL("../app/components/ui.tsx", import.meta.url);
const navigationPath = new URL("../app/navigation.ts", import.meta.url);
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

test("la navegación sigue el orden del pedido, sin emojis ni rótulos de fase", async () => {
  const source = await readFile(navigationPath, "utf8");
  const areas = [...source.matchAll(/icon: "[a-z]+", name: "([^"]+)"/g)].map(([, name]) => name);
  assert.deepEqual(areas, ["Inicio", "Pedidos", "Productos", "Producción", "Stock", "Secadero", "Logística"]);
  assert.match(source, /href: "\/", label: "Resumen operativo"/);
  assert.match(source, /href: "\/calendario", label: "Calendario"/);
  for (const href of ["/produccion", "/stock", "/secadero", "/logistica", "/clientes", "/productos"]) assert.match(source, new RegExp(`href: "${href}"`));
  assert.doesNotMatch(source, /emoji|Fase \d/);
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}]/u);
  assert.doesNotMatch(source, /href: "\/tratamiento"/);
  assert.doesNotMatch(source, /href: "\/plan"/);
});

test("clientes elige uno de los 19 departamentos de Uruguay", async () => {
  const source = await readFile(departmentsPath, "utf8");
  const departments = [...source.matchAll(/^ {2}"(.+)",$/gm)].map(([, department]) => department);
  assert.equal(departments.length, 19);
  for (const department of ["Artigas", "Montevideo", "San José", "Treinta y Tres"]) assert.ok(departments.includes(department));
});

test("Control Operativo usa una identidad y una hoja visual consolidada", async () => {
  const [styles, main, logo] = await Promise.all([
    readFile(stylesPath, "utf8"),
    readFile(new URL("../app/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/operaciones-mark.svg", import.meta.url), "utf8"),
  ]);
  for (const [token, color] of [
    ["brand-white", "#ffffff"],
    ["brand-gray", "#f4f6f8"],
    ["brand-slate", "#41515e"],
    ["brand-yellow", "#ffca08"],
    ["brand-black", "#26343e"],
  ]) assert.match(styles, new RegExp(`--${token}:\\s*${color}`, "i"), token);
  assert.match(styles, /--nav-bg:\s*var\(--brand-gray\)/i);
  assert.match(styles, /\.area-rail\.control-sidebar/);
  assert.match(styles, /\.home-metrics/);
  assert.match(main, /@fontsource-variable\/archivo\/wght\.css/);
  assert.doesNotMatch(main, /apple\.css/);
  assert.match(logo, /#FFCA08/);
  assert.match(logo, /Sierra y tablón/);
});

test("stock deja la información secundaria en el detalle", async () => {
  const source = await readFile(stockPath, "utf8");
  const mainTable = source.slice(source.indexOf('<table className="stock-table">'));
  assert.match(mainTable, /<th>Artículo<\/th>[\s\S]*?<th>Código<\/th>[\s\S]*?<th>Medida<\/th>/);
  assert.match(mainTable, /row\.product\.zetaCode \?\? row\.product\.sourceCode/);
  assert.doesNotMatch(mainTable, /<small>\{row\.product\.sourceCode\}/);
  assert.doesNotMatch(mainTable, /<th>Próxima entrega<\/th>/);
  assert.match(source, /<strong>Movimientos<\/strong>/);
  assert.match(source, /stock-detail-section/);
  assert.match(source, /aria-pressed=\{summaryFilter === field\}/);
  assert.match(source, /row\[summaryFilter\] > 0/);
});

test("los indicadores de pedidos funcionan como filtros accesibles", async () => {
  const source = await readFile(dashboardPath, "utf8");
  assert.match(source, /aria-label="Filtros rápidos de pedidos"/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "planned"\}/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "produced"\}/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "ht"\}/);
  assert.match(source, /aria-pressed=\{orderKpiFilter === "shipped"\}/);
  assert.match(source, /isOrderInPeriod\(order, kpiPeriod, today\)/);
  assert.match(source, /setSelectedId\(""\)/);
});

test("los pedidos muestran un estado automático y no solicitan una etapa manual", async () => {
  const source = await readFile(dashboardPath, "utf8");
  assert.match(source, /getOrderOperationalStatus\(order\)/);
  assert.match(source, /OrderStatusBadge order=\{order\}/);
  assert.match(source, /Listo para entregar|orderOperationalStatusLabels/);
  assert.doesNotMatch(source, /name="stage"/);
  assert.doesNotMatch(source, /<label>Etapa/);
  assert.match(source, /Cancelar pedido/);
});
