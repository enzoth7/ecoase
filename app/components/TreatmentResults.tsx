import { useEffect, useMemo, useState } from "react";
import { getOrderStage, isOrderClosed, type OperationOrder, type Product } from "../data";
import { dryingOrderLines, dryingPlannedOnDay, parseDryingDay, shiftDryingDay } from "../drying";
import type { TreatmentWeek } from "../treatment";
import { Plus } from "lucide-react";
import { FieldError, LoadingState, WeekNavigator } from "./ui";

const number = new Intl.NumberFormat("es-UY");
const shortDay = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", timeZone: "UTC" });
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

export default function TreatmentResults({ orders, products, productsRequiringTreatment, date, revision, onDateChange, onRecord, onOpenEntry }: {
  orders: OperationOrder[];
  products: Product[];
  productsRequiringTreatment: Set<string>;
  date: string;
  revision: number;
  onDateChange: (day: string) => void;
  onRecord: (target: TreatmentResultTarget) => void;
  onOpenEntry: () => void;
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
      const planned = getOrderStage(order) === "cancelado" ? 0 : dryingPlannedOnDay(order, order.lines.find((item) => item.id === line.lineId) ?? order.lines[0], line.planned, day);
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
  const tableRows = days.flatMap(({ day, rows }) => rows.map((row) => ({ day, ...row })));
  return <section className="module-surface production-weekly-panel logistics-panel treatment-results" aria-labelledby="treatment-results-title">
    <header>
      <div><h2 id="treatment-results-title">Registro de HT</h2>{week && <small className="logistics-real-summary"><strong>{number.format(pending)}</strong> pendientes de registrar</small>}</div>
      <div className="treatment-header-actions">
        <button type="button" className="primary-button" onClick={onOpenEntry}><Plus size={16} aria-hidden="true" />Registrar HT</button>
        <WeekNavigator label={`${shortDay.format(parseDryingDay(from))} – ${shortDay.format(parseDryingDay(days.at(-1)!.day))}`}
          onPrevious={() => onDateChange(shiftDryingDay(date, -7))} onNext={() => onDateChange(shiftDryingDay(date, 7))} />
      </div>
    </header>
    <FieldError id="treatment-week-error">{current?.error}</FieldError>
    {!current && <LoadingState label="Cargando el HT programado" rows={3} />}
    {week && (tableRows.length ? <div className="logistics-real-table treatment-real-board"><table aria-label="Resultados de HT" data-column-filters="off"><thead><tr><th scope="col">Fecha prevista</th><th scope="col">Producto</th><th scope="col">Cliente</th><th scope="col">Planificado</th><th scope="col">Real</th><th scope="col">Estado</th><th scope="col">Resultado</th></tr></thead><tbody>
      {tableRows.map(({ day, order, line, planned, actual, missed, rejected, canRecord }) => {
        const status = actual > 0 ? actual >= planned ? "HT realizado" : "HT parcial"
          : missed ? "No se hizo" : rejected ? "No conforme" : "Planificado";
        const tone = status === "HT realizado" ? "green" : status === "No se hizo" || status === "No conforme" ? "red" : "yellow";
        return <tr key={`${day}-${line.lineId}`}>
          <td><time dateTime={day}>{shortDay.format(parseDryingDay(day))}</time></td>
          <td><strong>{line.product}</strong></td>
          <td>{order.client}</td>
          <td>{planned ? number.format(planned) : "–"}</td>
          <td>{actual || missed || rejected ? number.format(actual) : "Pendiente"}</td>
          <td><span className={`logistics-status ${tone}`}>{status}</span></td>
          <td>{canRecord ? <button type="button" className="secondary-button" onClick={() => onRecord({
            orderId: order.id, lineId: line.lineId, productId: line.productId, product: line.product, client: order.client,
            reference: order.reference, date: day, planned, actual, missed: Boolean(missed),
          })}>{missed || actual > 0 ? "Registrar HT" : "Registrar resultado"}</button>
            : <span className="treatment-registered">Registrado{actual > 0 && actual < planned && <small>Faltan {number.format(planned - actual)} u.</small>}{missed && actual === 0 && <small>{[missed.responsible, missed.note].filter(Boolean).join(" · ")}</small>}</span>}
          </td>
        </tr>;
      })}
    </tbody></table></div> : <p className="logistics-empty">Nada programado esta semana.</p>)}
  </section>;
}
