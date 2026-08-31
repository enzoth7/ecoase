import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildProductionCapacity } from "../app/production-capacity.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const resources = [
  { id: 1, name: "Fábrica", resourceType: "internal_factory", active: true, displayOrder: 10 },
  { id: 2, name: "Blanc", resourceType: "external_supplier", providerId: "blanc", active: true, displayOrder: 20 },
];
const rules = [
  { id: 11, resourceId: 1, productId: "bins-x2", productName: "Bins ×2", peopleCount: 2, configurationLabel: "Fábrica ×2", normalUnitsPerDay: 100, maximumUnitsPerDay: 150, validFrom: "2026-09-01", source: "prueba" },
  { id: 12, resourceId: 1, productId: "bins-x3", productName: "Bins ×3", peopleCount: 2, configurationLabel: "Fábrica ×2", normalUnitsPerDay: 50, maximumUnitsPerDay: 100, validFrom: "2026-09-01", source: "prueba" },
  { id: 21, resourceId: 2, productId: "bins-x2", productName: "Bins ×2", peopleCount: 1, configurationLabel: "Blanc ×1", normalUnitsPerDay: 60, maximumUnitsPerDay: 80, validFrom: "2026-09-01", source: "prueba" },
];

function order(allocations) {
  return { id: "o-1", reference: "Pedido 1", client: "Cliente", product: "Mixto", requested: 200, delivered: 0, pending: 200, dateLabel: "", transport: "", supply: "", preparation: "", logistics: "", delivery: "", action: "", source: "", lines: allocations.map((entry, index) => ({ id: `l-${index}`, product: entry.productName, productId: entry.productId, quantity: entry.quantity, productionAllocations: [{ id: `a-${index}`, orderLineId: `l-${index}`, productionResourceId: entry.resourceId, capacityRuleId: entry.ruleId, plannedDate: "2026-09-07", plannedQuantity: entry.quantity, actualQuantity: entry.actualQuantity, status: entry.status ?? "draft", createdAt: "", updatedAt: "" }] })) };
}

function snapshot(allocations, overrides = []) {
  return buildProductionCapacity({ from: "2026-09-07", to: "2026-09-07", resources, rules, overrides, products: [], orders: [order(allocations)] });
}

test("calcula mezcla de productos como fracciones y no suma unidades crudas", () => {
  const result = snapshot([
    { productId: "bins-x2", productName: "Bins ×2", quantity: 60, resourceId: 1, ruleId: 11 },
    { productId: "bins-x3", productName: "Bins ×3", quantity: 20, resourceId: 1, ruleId: 12 },
  ]);
  const factory = result.days[0].resources[0];
  assert.equal(factory.normalLoad, 1);
  assert.ok(Math.abs(factory.maximumLoad - 0.6) < 1e-9);
  assert.equal(factory.status, "normal");
});

test("distingue capacidad normal, exigida, máxima superada y sin regla", () => {
  assert.equal(snapshot([{ productId: "bins-x2", productName: "Bins ×2", quantity: 120, resourceId: 1, ruleId: 11 }]).days[0].resources[0].status, "stretched");
  assert.equal(snapshot([{ productId: "bins-x2", productName: "Bins ×2", quantity: 151, resourceId: 1, ruleId: 11 }]).days[0].resources[0].status, "overloaded");
  assert.equal(snapshot([{ productId: "sin-regla", productName: "Otro", quantity: 10, resourceId: 1 }]).days[0].resources[0].status, "missing_rule");
});

test("el ajuste diario afecta solo su fecha y puede marcar indisponibilidad", () => {
  const result = buildProductionCapacity({ from: "2026-09-07", to: "2026-09-08", resources, rules, products: [], orders: [order([{ productId: "bins-x2", productName: "Bins ×2", quantity: 40, resourceId: 1, ruleId: 11 }])], overrides: [{ id: 1, date: "2026-09-07", resourceId: 1, available: false, reason: "Mantenimiento", responsible: "Encargado" }] });
  assert.equal(result.days[0].resources[0].status, "unavailable");
  assert.equal(result.days[1].resources[0].status, "normal");
});

test("usa producción real al cerrar y expone el saldo pendiente", () => {
  const result = snapshot([{ productId: "bins-x2", productName: "Bins ×2", quantity: 100, actualQuantity: 70, resourceId: 1, ruleId: 11, status: "completed" }]);
  const assignment = result.days[0].resources[0].assignments[0];
  assert.equal(result.days[0].resources[0].normalLoad, 0.7);
  assert.equal(assignment.pendingQuantity, 30);
});

test("la migración protege vigencias, evidencia y mutaciones de servidor", async () => {
  const sql = await read("supabase/migrations/20260829202035_production_capacity_by_resource_product.sql");
  for (const table of ["production_resources", "production_capacity_rules", "production_daily_overrides"]) assert.match(sql, new RegExp(`create table public\\.${table}`));
  assert.match(sql, /exclude using gist/i);
  assert.match(sql, /production_allocations_capacity_evidence_check/i);
  assert.match(sql, /confirm_production_allocation_v1/i);
  assert.match(sql, /complete_production_allocation_v1/i);
  assert.match(sql, /grant execute on function public\.confirm_production_allocation_v1[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.confirm_production_allocation_v1[\s\S]*to anon/i);
});

test("la pantalla resume la producción semanal en una tabla de acciones", async () => {
  const view = await read("app/CapacityView.tsx");
  for (const column of ["Fecha", "Origen / recurso", "Cliente / pedido", "Producto", "Cantidad", "Estado", "Acción"]) assert.match(view, new RegExp(column));
  for (const action of ["Confirmar", "Registrar producción", "Configurar"]) assert.match(view, new RegExp(action));
  assert.match(view, /Sin asignar/);
  assert.match(view, /production-week-summary/);
  assert.doesNotMatch(view, /function ResourceCard/);
  assert.doesNotMatch(view, /Carga sobre normal/);
  assert.doesNotMatch(view, /Carga sobre máxima/);
  assert.doesNotMatch(view, /Personas disponibles/);
});

test("las reglas de rendimiento se pueden editar y eliminar desde acciones accesibles", async () => {
  const [view, route, store] = await Promise.all([
    read("app/CapacityView.tsx"),
    read("app/api/capacity/rules/route.ts"),
    read("app/api/store.ts"),
  ]);
  for (const text of ["Acciones", "Editar regla", "Eliminar regla", "Guardar cambios"]) assert.match(view, new RegExp(text));
  assert.match(view, /<Pencil/);
  assert.match(view, /<Trash2/);
  assert.match(view, /aria-label={`Editar regla de/);
  assert.match(view, /aria-label={`Eliminar regla de/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(store, /export async function updateProductionRule/);
  assert.match(store, /export async function deleteProductionRule/);
});

test("las excepciones se recorren desde un calendario semanal", async () => {
  const view = await read("app/CapacityView.tsx");
  const styles = await read("app/globals.css");
  assert.match(view, /aria-label="Excepciones de la semana"/);
  assert.match(view, /capacity\.production\.days\.map/);
  assert.match(view, /Sin excepciones/);
  assert.match(view, /aria-selected=\{active\}/);
  assert.doesNotMatch(view, /"Sin excepciones cargadas"/);
  assert.doesNotMatch(view, /<strong>\{formatDate\(selectedDate, true\)\}<\/strong>/);
  assert.doesNotMatch(view, /className="production-config-date"/);
  assert.doesNotMatch(view, /<label>Fecha<input type="date"/);
  assert.match(styles, /\.production-exception-week\s*\{[^}]*grid-template-columns:\s*repeat\(7,/i);
});
