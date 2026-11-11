import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = JSON.parse(readFileSync(new URL("../app/product-catalog-source.json", import.meta.url), "utf8"));
const migration = readFileSync(new URL("../supabase/migrations/20261104202515_sync_product_tree_eight_levels.sql", import.meta.url), "utf8");
const catalog = JSON.parse(migration.match(/\$catalog\$\s*([\s\S]*?)\s*\$catalog\$/)?.[1] ?? "null");
const levels = JSON.parse(migration.match(/\$levels\$\s*([\s\S]*?)\s*\$levels\$/)?.[1] ?? "null");
const columns = ["modelo", "taco", "refuerzo", "identificacion", "corteEsquina", "terminacion", "tratamiento"];
const keys = ["modelo", "taco", "refuerzo", "identificacion", "corte-esquina", "terminacion", "tratamiento"];

function attributes(row) {
  return Object.fromEntries(columns.flatMap((column, index) => row[column] ? [[keys[index], row[column]]] : []));
}

function identity(measure, attrs) {
  return JSON.stringify([measure, ...keys.map((key) => attrs[key] ?? "")]);
}

test("las 74 filas del árbol coinciden con los 57 productos sincronizados", () => {
  assert.equal(source.rows.length, 74);
  assert.equal(catalog.length, 57);
  assert.equal(levels.length, 8);
  assert.deepEqual(levels.map((level) => level.id), ["medida", ...keys]);

  const rowsByProduct = new Map();
  for (const row of source.rows) {
    assert.ok(!Object.hasOwn(row, "exportacion") && !Object.hasOwn(row, "espesor"));
    const attrs = attributes(row);
    const key = identity(row.measure, attrs);
    rowsByProduct.set(key, [...(rowsByProduct.get(key) ?? []), row.client]);
    for (const [levelId, value] of Object.entries(attrs)) {
      assert.ok(levels.find((level) => level.id === levelId)?.options.includes(value), `${levelId}: ${value}`);
    }
  }
  assert.equal(rowsByProduct.size, 57);
  assert.equal([...rowsByProduct.values()].reduce((total, clients) => total + clients.length, 0), 74);

  for (const product of catalog) {
    const clients = rowsByProduct.get(identity(product.measure, product.attributes));
    assert.ok(clients, `Código ${product.code} sin fila en la hoja`);
    assert.equal(product.stock_name, ["Pallet", product.measure, ...keys.map((key) => product.attributes[key]).filter(Boolean)].join(" · "));
    rowsByProduct.delete(identity(product.measure, product.attributes));
  }
  assert.equal(rowsByProduct.size, 0);
});
