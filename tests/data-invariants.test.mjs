import assert from "node:assert/strict";
import test from "node:test";
import { stages, validationCases, validationQuestions } from "../app/data.ts";

test("el recorrido conserva exactamente cinco etapas en orden", () => {
  assert.deepEqual(
    stages.map((stage) => stage.id),
    ["pedido", "plan", "disponibilidad", "preparacion", "entrega"],
  );

  for (const [index, stage] of stages.entries()) {
    assert.equal(stage.number, index + 1);
    assert.ok(stage.question.length > 0, `${stage.id}: pregunta`);
    assert.ok(stage.decision.length > 0, `${stage.id}: decisión`);
    assert.ok(stage.output.length > 0, `${stage.id}: salida`);
    assert.ok(stage.known.length > 0, `${stage.id}: hechos`);
    assert.ok(stage.unknown.length > 0, `${stage.id}: pendientes`);
  }
});

test("el modelo no contiene supuestos de demostración", () => {
  const serialized = JSON.stringify({ stages, validationCases });
  assert.doesNotMatch(serialized, /supuesto de demostración|escenario didáctico|"demo"/i);

  const kinds = new Set([
    ...stages.flatMap((stage) => stage.evidence.map((source) => source.kind)),
    ...validationCases.flatMap((item) => item.evidence.map((source) => source.kind)),
  ]);
  assert.deepEqual([...kinds].sort(), ["excel", "no_confirmado", "regla_relevada"]);
});

test("cada caso conserva evidencia Excel y marca los huecos como no confirmados", () => {
  for (const item of validationCases) {
    assert.ok(item.evidence.some((source) => source.kind === "excel"), `${item.id}: evidencia Excel`);
  }

  for (const item of validationCases.filter((candidate) => candidate.status !== "cerrado")) {
    assert.ok(item.evidence.some((source) => source.kind === "no_confirmado"), `${item.id}: pendiente explícito`);
  }
});

test("Pamer 184833 conserva la reconciliación verificable", () => {
  const pamer = validationCases.find((item) => item.id === "pamer-184833");
  assert.ok(pamer);
  assert.equal(pamer.status, "cerrado");
  assert.deepEqual(pamer.facts, ["5 líneas · 500 unidades", "Remito 603", "Entregado 500 · saldo 0"]);
  assert.ok(pamer.evidence.some((source) => source.reference.includes("PAMER!A4:J8")));
  assert.ok(pamer.evidence.some((source) => source.reference.includes("MOVIMIENTOS!A53:I57")));
});

test("Frutura expone el bloqueo sin inventar una nueva fecha", () => {
  const frutura = validationCases.find((item) => item.id === "frutura-14");
  assert.ok(frutura);
  assert.equal(frutura.status, "bloqueado");
  assert.deepEqual(frutura.facts, ["600 pallets 122 × 102", "El plan dice: no llegaron los pallets"]);
  assert.ok(frutura.evidence.some((source) => source.reference.includes("A74:E74")));
  assert.ok(frutura.evidence.some((source) => source.reference === "Nueva fecha de llegada y entrega"));
});

test("Proquimur separa HT, sin HT y confirmación pendiente", () => {
  const proquimur = validationCases.find((item) => item.id === "proquimur-63");
  assert.ok(proquimur);
  assert.equal(proquimur.status, "por_confirmar");
  assert.deepEqual(proquimur.facts, [
    "300 pallets con HT",
    "300 pallets sin HT",
    "Estado: esperando confirmación",
  ]);
  assert.ok(proquimur.evidence.some((source) => source.reference.includes("A63:E63")));
});

test("el cierre mantiene las tres preguntas para Jony", () => {
  assert.equal(validationQuestions.length, 3);
  assert.match(validationQuestions[0], /cinco etapas/i);
  assert.match(validationQuestions[1], /decisión importante/i);
  assert.match(validationQuestions[2], /variable/i);
});
