import assert from "node:assert/strict";
import test from "node:test";
import { orders, products, providers } from "../app/data.ts";

test("separa los pedidos activos del historial", () => {
  assert.equal(orders.length, 12);
  assert.equal(orders.filter((order) => order.status !== "completado").length, 2);
  assert.equal(orders.filter((order) => order.status === "bloqueado").length, 1);
  assert.equal(orders.filter((order) => order.status === "completado").length, 10);
});

test("distingue proveedores de aserradero y transporte", () => {
  assert.deepEqual(providers.map((provider) => [provider.name, provider.type]), [
    ["Blanc", "Aserradero"],
    ["Mirasol", "Aserradero"],
    ["Linares", "Transporte"],
    ["Milton", "Transporte"],
    ["Matías", "Transporte"],
  ]);
});

test("incluye el catálogo depurado de Palbin y Pamer", () => {
  assert.equal(products.length, 58);
  assert.equal(products.filter((product) => product.catalog === "Palbin" && product.kind === "Pallet").length, 26);
  assert.equal(products.filter((product) => product.catalog === "Palbin" && product.kind === "Bin").length, 8);
  assert.equal(products.filter((product) => product.catalog === "Palbin" && product.kind === "Piso").length, 2);
  assert.equal(products.filter((product) => product.catalog === "Pamer" && product.kind === "Pallet").length, 22);
  assert.ok(products.some((product) => product.name === "Proquimur" && product.measure === "120 × 100"));
  assert.ok(products.some((product) => product.name === "Pallet" && product.measure === "122 × 102"));
  assert.ok(products.some((product) => product.name === "Pallet" && product.measure === "216 × 110" && product.catalog === "Pamer"));
  assert.equal(products.some((product) => product.specification), false);
  assert.equal(products.some((product) => product.name.includes("×")), false);
  assert.equal(products.some((product) => ["Azucarlito", "Reparados", "Granja Pocha punto rojo"].includes(product.name)), false);
});

test("cada pedido reconcilia pedido, entrega y saldo", () => {
  for (const order of orders) {
    assert.equal(order.requested, order.delivered + order.pending, order.id);
    assert.equal(order.requested, order.lines.reduce((total, line) => total + line.quantity, 0), order.id);
    assert.ok(order.supply.length > 0, `${order.id}: abastecimiento`);
    assert.ok(order.preparation.length > 0, `${order.id}: preparación`);
    assert.ok(order.logistics.length > 0, `${order.id}: logística`);
    assert.ok(order.delivery.length > 0, `${order.id}: entrega`);
    assert.ok(order.source.length > 0, `${order.id}: fuente`);
  }
});

test("Pamer 184833 conserva las cinco líneas y el remito 603", () => {
  const order = orders.find((item) => item.id === "pamer-184833");
  assert.ok(order);
  assert.equal(order.requested, 500);
  assert.equal(order.delivered, 500);
  assert.equal(order.pending, 0);
  assert.equal(order.remittance, "603");
  assert.equal(order.lines.length, 5);
  assert.match(order.source, /filas 4–8/);
});

test("Frutura mantiene el bloqueo de 600 pallets", () => {
  const order = orders.find((item) => item.id === "frutura-74");
  assert.ok(order);
  assert.equal(order.status, "bloqueado");
  assert.equal(order.requested, 600);
  assert.equal(order.pending, 600);
  assert.match(order.supply, /no llegaron/i);
  assert.match(order.source, /fila 74/);
});

test("Proquimur separa preparación, stock y transporte", () => {
  const order = orders.find((item) => item.id === "proquimur-63");
  assert.ok(order);
  assert.equal(order.status, "coordinacion");
  assert.deepEqual(order.lines.map((line) => [line.quantity, line.preparation]), [
    [300, "Con HT"],
    [300, "Sin HT"],
  ]);
  assert.match(order.supply, /300 marcados y 300 sin marcar/i);
  assert.equal(order.transport, "Linares");
  assert.match(order.source, /fila 63/);
});

test("el modelo operativo no contiene texto de validación", () => {
  const serialized = JSON.stringify({ orders, providers });
  assert.doesNotMatch(serialized, /piloto|qué falta confirmar|pregunta para|casos para validar|modelo completo|no confirmado/i);
});
