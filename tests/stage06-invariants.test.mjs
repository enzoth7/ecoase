import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { classifyStockRisk } from "../app/stock.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("clasifica los límites exactos de quiebre", () => {
  assert.equal(classifyStockRisk(undefined), "gray");
  assert.equal(classifyStockRisk(0), "red");
  assert.equal(classifyStockRisk(2.99), "red");
  assert.equal(classifyStockRisk(3), "orange");
  assert.equal(classifyStockRisk(7), "yellow");
  assert.equal(classifyStockRisk(14), "green");
});

test("la migración deriva balances, reservas, riesgo y proyección", async () => {
  const sql = await read("supabase/migrations/20260829214819_stock_break_risk_refactor.sql");
  for (const table of ["stock_reservations", "client_product_consumption", "stock_import_runs", "stock_import_rows"]) assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
  for (const view of ["stock_balances", "stock_risk", "stock_daily_projection"]) assert.match(sql, new RegExp(`view public\\.${view} with \\(security_invoker=true\\)`, "i"));
  assert.match(sql, /transition_shipment_v2/i);
  assert.match(sql, /movement_type='dispatch'/i);
  assert.match(sql, /status='released'/i);
  assert.match(sql, /stock listo insuficiente/i);
  assert.match(sql, /exclude using gist/i);
  assert.match(sql, /on conflict\(import_row_id,stock_state\)/i);
});

test("los comandos de stock quedan reservados al servidor", async () => {
  const sql = await read("supabase/migrations/20260829214819_stock_break_risk_refactor.sql");
  for (const command of ["record_stock_receipt_v1", "record_stock_adjustment_v1", "reverse_stock_movement_v1", "upsert_client_product_consumption_v1", "transition_shipment_v2"]) {
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

test("la pantalla expone filtros, proyección y libro sin conciliación inicial", async () => {
  const view = await read("app/StockView.tsx");
  for (const copy of ["Stock", "Registrar entrada", "Proyección", "Consumo", "Movimientos", "Ver tabla de la proyección", "Con alerta", "Días de stock"]) assert.match(view, new RegExp(copy));
  assert.doesNotMatch(view, /Conciliación inicial/);
  assert.match(view, /ResponsiveContainer/);
  assert.match(view, /value="alert"/);
  assert.match(view, /Todos los catálogos/);
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
  assert.match(dashboard, /selectedClientProduct\?\.clientAddress \|\| "—"/);
});

test("el consumo se carga desde Stock o desde el producto del cliente", async () => {
  const [stock, client, shared] = await Promise.all([
    read("app/StockView.tsx"),
    read("app/components/ClientMasterView.tsx"),
    read("app/components/ConsumptionRuleModal.tsx"),
  ]);
  assert.match(stock, /ConsumptionRuleModal/);
  assert.match(client, /Consumo del cliente/);
  assert.match(client, /ConsumptionRuleModal/);
  assert.match(shared, /\/api\/stock\/consumption/);
  assert.match(shared, /se comparte entre Clientes y Stock/i);
});
