import assert from "node:assert/strict";
import test from "node:test";
import {
  alerts,
  compatibilityRule,
  deliveries,
  orders,
  stock,
  stockTotals,
  transformationChecks,
} from "../app/data.ts";

test("cada pedido y cada línea conservan el saldo", () => {
  for (const order of orders) {
    assert.equal(order.requested, order.delivered + order.pending, order.id);
    assert.equal(order.requested, order.lines.reduce((sum, line) => sum + line.requested, 0), `${order.id}: líneas solicitadas`);
    assert.equal(order.delivered, order.lines.reduce((sum, line) => sum + line.delivered, 0), `${order.id}: líneas entregadas`);
    for (const line of order.lines) assert.equal(line.requested, line.delivered + line.pending, line.id);
  }
});

test("la orden Pamer 184833 reconcilia cinco líneas, 500 unidades, remito 603 y saldo cero", () => {
  const order = orders.find((item) => item.orderNumber === "184833");
  assert.ok(order);
  assert.equal(order.lines.length, 5);
  assert.equal(order.requested, 500);
  assert.equal(order.delivered, 500);
  assert.equal(order.pending, 0);
  assert.equal(order.remittance, "603");
  assert.equal(deliveries.find((item) => item.remittance === "603")?.quantity, 500);
});

test("marcado y HT transfieren stock con efecto físico neto cero", () => {
  for (const movement of transformationChecks) assert.equal(movement.fromDelta + movement.toDelta, 0, movement.id);
});

test("los totales físicos coinciden con pendiente más listo", () => {
  assert.equal(stockTotals.palbin.total, stockTotals.palbin.pending + stockTotals.palbin.ready);
  assert.equal(stockTotals.pamer.total, stockTotals.pamer.pending + stockTotals.pamer.ready);
  for (const item of stock) assert.equal(item.total, item.pendingPreparation + item.ready, item.id);
});

test("la entrega parcial conserva saldo y próximo paso", () => {
  const partial = orders.find((item) => item.status === "parcial");
  assert.ok(partial);
  assert.ok(partial.pending > 0);
  assert.ok(partial.nextDecision.length > 0);
});

test("la cobertura sin consumo se muestra como no calculable", () => {
  assert.ok(stock.some((item) => item.coverageDays === null));
});

test("la compatibilidad es explícitamente no simétrica", () => {
  assert.match(compatibilityRule.allowed, /MSJ.*Cousa/);
  assert.match(compatibilityRule.blocked, /Cousa.*no puede.*MSJ/);
});

test("la alerta HT registra el margen relevado de 3–4 horas", () => {
  const ht = alerts.find((item) => item.id === "alert-samifruit-ht");
  assert.ok(ht);
  assert.equal(ht.level, "critico");
  assert.ok(ht.evidence.some((source) => `${source.reference} ${source.note ?? ""}`.includes("3–4")));
});
