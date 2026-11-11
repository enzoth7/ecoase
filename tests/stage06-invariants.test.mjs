import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { orderStockReservations, scopeStockInventory, stockQuantityBreakdown } from "../app/stock.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("separa los artículos de Pamer aunque la ficha antigua haya perdido su asociación", () => {
  const rows = [
    { product: { id: "legacy-pamer", zetaCode: "Z7", stockActive: false, clientNames: [] }, physical: 100 },
    { product: { id: "catalog-pamer", clientNames: ["Pamer"] }, physical: 20 },
    { product: { id: "shared", clientNames: ["Pamer", "Otro cliente"] }, physical: 15 },
    { product: { id: "other", clientNames: [] }, physical: 10 },
  ];
  const orders = [
    { client: "Pamer", lines: [{ productId: "legacy-pamer" }] },
    { client: "Granja Pocha", lines: [{ productId: "other" }] },
  ];
  assert.deepEqual(scopeStockInventory(rows, orders).map((row) => [row.inventoryScope, row.physical]), [
    ["pamer", 100], ["pamer", 20], ["general", 15], ["general", 10],
  ]);
});

test("desglosa los saldos por pedido sin atribuir unidades libres o ya despachadas", () => {
  const product = { id: "pallet", requiresTreatment: true };
  const order = {
    id: "pedido-a", reference: "Pedido A", client: "Cliente A", requested: 20, delivered: 0,
    lines: [{ id: "linea-a", productId: product.id, quantity: 20, treatedQuantity: 7, readyReservedQuantity: 2,
      productionAllocations: [{ status: "completed", actualQuantity: 11 }, { status: "completed", actualQuantity: 6, resultDestination: "stock" }] }],
    shipments: [{ status: "dispatched", lines: [{ orderLineId: "linea-a", plannedQuantity: 4, deliveredQuantity: 0 }] }],
  };
  const assigned = orderStockReservations([order], [product]).get(product.id);
  assert.deepEqual(assigned, { pending: 4, ready: 3, orders: [{ orderId: "pedido-a", reference: "Pedido A", client: "Cliente A", pending: 4, ready: 3 }] });
  const row = { pending: 9, ready: 12, reserved: 8, available: 8, orderCommitments: assigned.orders };
  assert.equal(stockQuantityBreakdown(row, "pending").unassigned, 5);
  assert.equal(stockQuantityBreakdown(row, "reserved").unidentified, 1);
  assert.deepEqual(stockQuantityBreakdown(row, "available"), { entries: [], unassigned: 8, unidentified: 0, exceedsBalance: false });
  assert.equal(stockQuantityBreakdown({ ...row, pending: 2, reserved: 6 }, "pending").exceedsBalance, true);
});

test("la migración deriva balances y reservas", async () => {
  const sql = await read("supabase/migrations/20260829214819_stock_break_risk_refactor.sql");
  for (const table of ["stock_reservations", "stock_import_runs", "stock_import_rows"]) assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
  assert.match(sql, /view public\.stock_balances with \(security_invoker=true\)/i);
  assert.match(sql, /transition_shipment_v2/i);
  assert.match(sql, /movement_type='dispatch'/i);
  assert.match(sql, /status='released'/i);
  assert.match(sql, /stock listo insuficiente/i);
  assert.match(sql, /on conflict\(import_row_id,stock_state\)/i);
});

test("la migración retira las estructuras descartadas y conserva los balances", async () => {
  const sql = await read("supabase/migrations/20261111021125_remove_stock_coverage_feature.sql");
  assert.match(sql, /drop view if exists public\.stock_daily_projection/i);
  assert.match(sql, /drop view if exists public\.stock_risk/i);
  assert.match(sql, /drop table if exists public\.client_product_consumption/i);
  assert.match(sql, /create or replace function public\.delete_catalog_product_v2/i);
  assert.doesNotMatch(sql, /drop view if exists public\.stock_balances/i);
});

test("los comandos de stock quedan reservados al servidor", async () => {
  const sql = await read("supabase/migrations/20260829214819_stock_break_risk_refactor.sql");
  for (const command of ["record_stock_receipt_v1", "record_stock_adjustment_v1", "reverse_stock_movement_v1", "transition_shipment_v2"]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${command}[\\s\\S]*?to service_role`, "i"));
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${command}[^;]*to (anon|authenticated)`, "i"));
  }
});

test("la importación conserva detalle y documenta el total defectuoso de Palbin", async () => {
  const [migration, reconciliation] = await Promise.all([
    read("supabase/migrations/20260829214819_stock_break_risk_refactor.sql"),
    read("supabase/migrations/20260829215512_document_palbin_summary_formula_gap.sql"),
  ]);
  assert.match(migration, /3\.0Control Stock Palbin/i);
  assert.match(migration, /3\.1 Control_Stock_PAMER/i);
  assert.match(migration, /'Palbin','P39'/i);
  assert.match(migration, /'Pamer','P22'/i);
  assert.match(reconciliation, /expected_pending=3199/i);
  assert.match(reconciliation, /source_reported_pending=2150/i);
  assert.match(reconciliation, /omiten? las filas 34:47/i);
});

test("la pantalla expone saldos, filtros y movimientos", async () => {
  const view = await read("app/StockView.tsx");
  for (const copy of ["Stock general", "Stock Pamer", "Registrar entrada", "Saldos del producto", "Movimientos"]) assert.match(view, new RegExp(copy));
  assert.doesNotMatch(view, /Conciliación inicial/);
  assert.match(view, /stock-detail-section/);
});

test("los datos opcionales del cliente no bloquean pedidos", async () => {
  const [migration, store, master, dashboard] = await Promise.all([
    read("supabase/migrations/20260830224533_make_client_details_optional.sql"),
    read("app/api/store.ts"),
    read("app/master-data.ts"),
    read("app/Dashboard.tsx"),
  ]);
  assert.match(migration, /drop constraint if exists clients_active_requires_address/i);
  assert.match(migration, /alter column active set default true/i);
  assert.match(migration, /update public\.clients set active = true/i);
  assert.match(migration, /update public\.client_products set active = true/i);
  assert.doesNotMatch(migration, /Cargue un plano o fotografía principal/);
  assert.doesNotMatch(migration, /ficha de producto está incompleta/i);
  assert.doesNotMatch(store, /La dirección de entrega es obligatoria para activar/);
  assert.doesNotMatch(store, /Para activar, cargue la dirección/);
  assert.match(master, /return Boolean\(\(item\.product\?\.zetaCode \?\? item\.zetaCode\)\.trim\(\)\)/);
  assert.match(dashboard, /selectedClient\?\.address \|\| clientProducts\[0\]\?\.clientAddress \|\| "—"/);
});

