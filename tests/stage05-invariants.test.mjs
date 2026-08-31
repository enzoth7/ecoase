import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { calculateStockBalances, summarizeTreatmentDay } from "../app/treatment.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("el tratamiento traslada unidades sin cambiar el stock físico", () => {
  const movements = [
    { productId: "pallet-1", stockState: "pending_treatment", quantity: 30 },
    { productId: "pallet-1", stockState: "pending_treatment", quantity: -12 },
    { productId: "pallet-1", stockState: "ready", quantity: 12 },
  ];
  const balance = calculateStockBalances(movements).get("pallet-1");
  assert.deepEqual(balance, { pending: 18, ready: 12 });
  assert.equal(balance.pending + balance.ready, 30);
});

test("el resumen separa confirmados, rechazos y reversiones", () => {
  const base = { productId: "pallet-1", productName: "Pallet · 120 × 100", performedAt: "2026-08-29T15:00:00.000Z", responsible: "Operación", createdAt: "", checks: [], movements: [] };
  const batches = [
    { ...base, id: 1, quantity: 10, status: "posted" },
    { ...base, id: 2, quantity: 3, status: "rejected" },
    { ...base, id: 3, quantity: 4, status: "reversal" },
  ];
  const summary = summarizeTreatmentDay("2026-08-29", batches, new Map([["pallet-1", { pending: 24, ready: 6 }]]));
  assert.deepEqual(summary, { date: "2026-08-29", processed: 10, rejected: 3, reversed: 4, pending: 24, ready: 6 });
});

test("la migración crea un libro inmutable y transacciones atómicas", async () => {
  const sql = await read("supabase/migrations/20260829210806_treatment_daily_ledger.sql");
  for (const table of ["treatment_batches", "treatment_control_checks", "stock_movements"]) assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
  assert.match(sql, /prevent_stock_movement_mutation/i);
  assert.match(sql, /raise exception 'Los movimientos de stock son inmutables/i);
  assert.match(sql, /record_treatment_batch_v1/i);
  assert.match(sql, /reverse_treatment_batch_v1/i);
  assert.match(sql, /'treatment_out'[\s\S]*'treatment_in'/i);
  assert.match(sql, /'treatment_reversal_out'[\s\S]*'treatment_reversal_in'/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /grant execute on function public\.record_treatment_batch_v1[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.record_treatment_batch_v1[\s\S]*to anon/i);
});

test("pedidos y productos usan una sola operación canónica", async () => {
  const [migration, correction, allocationFix, view] = await Promise.all([
    read("supabase/migrations/20260829210806_treatment_daily_ledger.sql"),
    read("supabase/migrations/20260829212541_fix_canonical_treatment_order_creation.sql"),
    read("supabase/migrations/20260829213250_create_order_with_draft_treatment_allocation.sql"),
    read("app/TreatmentView.tsx"),
  ]);
  assert.match(migration, /requires_treatment boolean not null default false/i);
  assert.match(migration, /required_operations[\s\S]*array\['assembly','treatment'\]/i);
  assert.match(correction, /p_required_operations <@ array\['assembly','treatment'\]/i);
  assert.match(allocationFix, /create_operation_order_v6/i);
  assert.match(allocationFix, /v_creation_stage := case when p_stage = 'produccion' then 'negociacion'/i);
  assert.match(view, />Marcado</);
  assert.doesNotMatch(view, /Tratamiento HT/);
  assert.doesNotMatch(view, />HT</);
});

test("la pantalla incluye registro en diálogo, controles, evidencia e historial compacto", async () => {
  const view = await read("app/TreatmentView.tsx");
  for (const copy of ["Registrar marcado", "Registros del día", "Puntos de control", "Stock general", "Responsable", "Revertir", "Ver tendencia"]) assert.match(view, new RegExp(copy));
  assert.match(view, /primaryAsset/);
  assert.match(view, /Conforme/);
  assert.match(view, /No conforme/);
  assert.match(view, /stock físico total/i);
  assert.match(view, /treatment-entry-modal/);
  assert.match(view, /treatment-row-menu/);
});
