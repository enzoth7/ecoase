import { useEffect, useMemo, useState } from "react";
import { getOrderStage, isOrderClosed, type OperationOrder, type Product } from "../data";
import { dryingOrderLines, dryingQuantityOnDay, parseDryingDay, shiftDryingDay } from "../drying";
import type { TreatmentWeek } from "../treatment";
import { FieldError, LoadingState, WeekNavigator } from "./ui";

const number = new Intl.NumberFormat("es-UY");
const shortDay = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" });

export type TreatmentResultTarget = {
  orderId: string;
  lineId: string;
  productId?: string;
  product: string;
  client: string;
  reference: string;
  date: string;
  planned: number;
  actual: number;
  missed: boolean;
};

export default function TreatmentResults({ orders, products, productsRequiringTreatment, date, revision, onDateChange, onRecord }: {
  orders: OperationOrder[];
  products: Product[];
  productsRequiringTreatment: Set<string>;
  date: string;
  revision: number;
  onDateChange: (day: string) => void;
  onRecord: (target: TreatmentResultTarget) => void;
}) {
  const from = shiftDryingDay(date, -((parseDryingDay(date).getUTCDay() + 6) % 7));
  const to = shiftDryingDay(from, 6);
  const today = dateKey.format(new Date());
  const [result, setResult] = useState<{ from: string; revision: number; week?: TreatmentWeek; error?: string } | null>(null);
  const current = result?.from === from && result.revision === revision ? result : null;
  const week = current?.week;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/treatment/results?from=${from}&to=${to}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { week?: TreatmentWeek; error?: string };
        if (!response.ok || !payload.week) throw new Error(payload.error ?? "No se pudieron cargar los resultados de HT.");
        if (!controller.signal.aborted) setResult({ from, revision, week: payload.week });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ from, revision, error: error instanceof Error ? error.message : "No se pudieron cargar los resultados de HT." });
      });
    return () => controller.abort();
  }, [from, to, revision]);

  const plannedOrders = useMemo(() => {
    const recordedLines = new Set([
      ...(week?.batches.map((batch) => batch.orderLineId) ?? []),
      ...(week?.notPerformed.map((item) => item.orderLineId) ?? []),
    ]);
    return orders.filter((order) => order.dryingStartDate && (
      (getOrderStage(order) !== "cancelado" && order.dryingStartDate <= to && (order.dryingEndDate ?? order.dryingStartDate) >= from)
      || order.lines.some((line) => recordedLines.has(line.id))
    )).map((order) => ({ order, lines: dryingOrderLines(order, products, productsRequiringTreatment) }));
  }, [orders, products, productsRequiringTreatment, from, to, week]);
  const dayRows = Array.from({ length: 7 }, (_, index) => {
    const day = shiftDryingDay(from, index);
    const rows = plannedOrders.flatMap(({ order, lines }) => lines.flatMap((line) => {
      const planned = getOrderStage(order) === "cancelado" ? 0 : dryingQuantityOnDay(order, line.planned, day);
      const batches = week?.batches.filter((batch) => batch.orderLineId === line.lineId && dateKey.format(new Date(batch.performedAt)) === day) ?? [];
      const actual = batches.reduce((sum, batch) => sum + (batch.status === "posted" && !batch.reversedByBatchId ? batch.quantity : 0), 0);
      const missed = week?.notPerformed.find((item) => item.orderLineId === line.lineId && item.date === day);
      if (planned === 0 && !actual && !missed && !batches.some((batch) => batch.status === "rejected")) return [];
      return [{
        order, line, planned, actual, missed, rejected: batches.some((batch) => batch.status === "rejected"),
        canRecord: day <= today && !isOrderClosed(order) && actual < planned,
      }];
    }));
    return { day, rows };
  });
  const days = dayRows[6].rows.length ? dayRows : dayRows.slice(0, 6);
  const pending = days.reduce((sum, { rows }) => sum + rows.filter((row) => row.canRecord && !row.missed).length, 0);
  return <section className="module-surface production-weekly-panel treatment-results" aria-labelledby="treatment-results-title">
    <header className="phase-header">
      <div><h3 id="treatment-results-title">Confirmación semanal de HT</h3>{week && <small>{number.format(pending)} pendientes de registrar</small>}</div>
      <WeekNavigator label={`${shortDay.format(parseDryingDay(from))} – ${shortDay.format(parseDryingDay(days.at(-1)!.day))}`}
        onPrevious={() => onDateChange(shiftDryingDay(date, -7))} onNext={() => onDateChange(shiftDryingDay(date, 7))} />
    </header>
    <FieldError id="treatment-week-error">{current?.error}</FieldError>
    {!current && <LoadingState label="Cargando el HT programado" rows={3} />}
    {week && <div className="production-real-days">
      {days.map(({ day, rows }) => <section className="production-real-day" key={day} aria-label={longDay.format(parseDryingDay(day))}>
        <h3>{longDay.format(parseDryingDay(day))}</h3>
        {rows.length ? <div className="production-real-list">
          {rows.map(({ order, line, planned, actual, missed, rejected, canRecord }) => {
            const status = actual > 0 ? actual >= planned ? "HT realizado" : "HT parcial"
              : missed ? "No se hizo" : rejected ? "No conforme" : "Pendiente";
            return <article className="production-real-item" key={line.lineId} data-treatment-status={status}>
              <div className="production-real-main"><strong>{line.product}</strong><span>{order.client}</span><small>{order.reference}</small></div>
              <div className="production-real-quantities">
                <span>Planificado<strong>{planned ? number.format(planned) : "–"}</strong></span>
                <span>Real<strong>{actual || missed || rejected ? number.format(actual) : "–"}</strong></span>
              </div>
              <div className="production-real-outcome">
                <strong>{status}</strong>
                {actual > 0 && actual < planned && <small>Faltan {number.format(planned - actual)} u.</small>}
                {missed && actual === 0 && <small>{[missed.responsible, missed.note].filter(Boolean).join(" · ")}</small>}
                {canRecord && <button type="button" className={missed ? "secondary-button" : "primary-button"} onClick={() => onRecord({
                  orderId: order.id, lineId: line.lineId, productId: line.productId, product: line.product, client: order.client,
                  reference: order.reference, date: day, planned, actual, missed: Boolean(missed),
                })}>{missed || actual > 0 ? "Registrar HT" : "Registrar resultado"}</button>}
              </div>
            </article>;
          })}
        </div> : <p className="production-real-empty">Nada programado para este día.</p>}
      </section>)}
    </div>}
  </section>;
}
