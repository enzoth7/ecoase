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
  { id: 11, resourceId: 1, productId: "bins-x2", clientProductId: 101, productName: "Bins ×2", peopleCount: 2, configurationLabel: "Fábrica ×2", normalUnitsPerDay: 100, maximumUnitsPerDay: 150, validFrom: "2026-09-01", source: "prueba" },
  { id: 12, resourceId: 1, productId: "bins-x3", clientProductId: 102, productName: "Bins ×3", peopleCount: 2, configurationLabel: "Fábrica ×2", normalUnitsPerDay: 50, maximumUnitsPerDay: 100, validFrom: "2026-09-01", source: "prueba" },
  { id: 21, resourceId: 2, productId: "bins-x2", clientProductId: 101, productName: "Bins ×2", peopleCount: 1, configurationLabel: "Blanc ×1", normalUnitsPerDay: 60, maximumUnitsPerDay: 80, validFrom: "2026-09-01", source: "prueba" },
];

function order(allocations) {
  return { id: "o-1", reference: "Pedido 1", client: "Cliente", product: "Mixto", requested: 200, delivered: 0, pending: 200, dateLabel: "", transport: "", supply: "", preparation: "", logistics: "", delivery: "", action: "", source: "", lines: allocations.map((entry, index) => ({ id: `l-${index}`, product: entry.productName, productId: entry.productId, clientProductId: entry.clientProductId ?? (entry.productId === "bins-x2" ? 101 : 102), quantity: entry.quantity, productionAllocations: [{ id: `a-${index}`, orderLineId: `l-${index}`, productionResourceId: entry.resourceId, capacityRuleId: entry.ruleId, plannedDate: "2026-09-07", plannedQuantity: entry.quantity, actualQuantity: entry.actualQuantity, status: entry.status ?? "draft", createdAt: "", updatedAt: "" }] })) };
}

function snapshot(allocations) {
  return buildProductionCapacity({ from: "2026-09-07", to: "2026-09-07", resources, rules, products: [], orders: [order(allocations)] });
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

test("la capacidad de producción usa solo las reglas de rendimiento", () => {
  const result = snapshot([{ productId: "bins-x2", productName: "Bins ×2", quantity: 40, resourceId: 1, ruleId: 11 }]);
  assert.equal(result.days[0].resources[0].normalLoad, 0.4);
  assert.equal(result.days[0].resources[0].status, "normal");
  assert.equal("overrides" in result, false);
});

test("un producto igual de otro cliente no hereda su rendimiento", () => {
  const result = snapshot([{ productId: "bins-x2", clientProductId: 999, productName: "Bins ×2", quantity: 40, resourceId: 1 }]);
  assert.equal(result.days[0].resources[0].status, "missing_rule");
});

test("usa producción real al cerrar y expone el saldo pendiente", () => {
  const result = snapshot([{ productId: "bins-x2", productName: "Bins ×2", quantity: 100, actualQuantity: 70, resourceId: 1, ruleId: 11, status: "completed" }]);
  const assignment = result.days[0].resources[0].assignments[0];
  assert.equal(result.days[0].resources[0].normalLoad, 0.7);
  assert.equal(assignment.pendingQuantity, 30);
  assert.equal(assignment.peopleCount, 2);
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

test("la migración retira las excepciones del servidor y conserva sus datos históricos", async () => {
  const sql = await read("supabase/migrations/20261105181105_remove_production_daily_overrides.sql");
  assert.match(sql, /drop function if exists public\.upsert_production_daily_override_v1/);
  assert.match(sql, /revoke select on public\.production_daily_overrides/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.match(sql, /drop constraint if exists production_daily_overrides_product_id_fkey/);
  const deleteProduct = sql.split("create or replace function public.delete_catalog_product_v2(")[1]?.split("create or replace function public.confirm_production_allocation_v1(")[0];
  assert.ok(deleteProduct);
  assert.doesNotMatch(deleteProduct, /delete from public\.production_daily_overrides/);
  const confirm = sql.split("create or replace function public.confirm_production_allocation_v1(")[1];
  assert.ok(confirm);
  assert.doesNotMatch(confirm, /production_daily_overrides/);
  assert.match(confirm, /v_normal := v_rule\.normal_units_per_day/);
});

test("la pantalla parte del plan y ofrece un registro simple del resultado", async () => {
  const view = await read("app/CapacityView.tsx");
  const resultModal = await read("app/components/ProductionResultModal.tsx");
  for (const label of ["Producción real", "Planificado", "Real", "Registrar resultado", "de esta asignación"]) assert.match(view, new RegExp(label));
  for (const label of ["Se produjo", "No se produjo", "Unidades producidas", "Stock", "Guardar resultado"]) assert.match(resultModal, new RegExp(label));
  assert.match(resultModal, /\/api\/production-allocations\/\$\{assignment.id\}\/result/);
  assert.match(view, /production-week-summary/);
  assert.match(view, /import ClientProductionRules/);
  assert.match(view, /<ClientProductionRules clients=\{clients\}/);
  assert.doesNotMatch(view, /rulesViewMode|Reglas individuales/);
  assert.doesNotMatch(view, /function ResourceCard/);
});

test("las reglas por cliente se guardan y se validan en el servidor", async () => {
  const [view, clientRules, route, store, migration] = await Promise.all([
    read("app/CapacityView.tsx"),
    read("app/components/ClientProductionRules.tsx"),
    read("app/api/capacity/rules/route.ts"),
    read("app/api/store.ts"),
    read("supabase/migrations/20261105181126_client_product_production_rules.sql"),
  ]);
  assert.match(view, /ClientProductionRules/);
  assert.match(clientRules, /\/api\/capacity\/rules/);
  assert.match(clientRules, /clientProductId/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /clientProductId/);
  assert.match(store, /export async function updateProductionRule/);
  assert.match(store, /export async function deleteProductionRule/);
  assert.match(migration, /production_allocation_client_rule_guard/);
});

test("la pantalla y el cálculo ya no ofrecen excepciones por fecha", async () => {
  const [view, capacity, store] = await Promise.all([
    read("app/CapacityView.tsx"),
    read("app/production-capacity.ts"),
    read("app/api/store.ts"),
  ]);
  assert.doesNotMatch(view, /OverrideModal|daily-overrides|Excepciones por fecha/);
  assert.doesNotMatch(capacity, /ProductionDailyOverride|scopedOverride|productionOverrides/);
  assert.doesNotMatch(store, /saveProductionOverride|\/rest\/v1\/production_daily_overrides/);
});
