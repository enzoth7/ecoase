"use client";

import { AlertTriangle, CheckCircle2, Flame } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getOrderPlannedDate, type OperationOrder, type Product } from "../data";
import { dryingOrderLines, lineNeedsDrying } from "../drying";
import { DryingCalendar, saveDryingPlan, type DryingEntry } from "./DryingCalendar";
import { productionRangeLabel } from "./ProductionPlanner";
import { AsyncButton, EmptyState, FieldError, ModalShell } from "./ui";

const number = new Intl.NumberFormat("es-UY");
function parseDate(key: string) { return new Date(`${key}T12:00:00`); }
function shortDate(key?: string) { return key ? new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" }).format(parseDate(key)) : "—"; }

export function orderNeedsDrying(order: OperationOrder, productsRequiringTreatment: Set<string>) {
  return (order.requiredOperations ?? []).includes("treatment") || order.lines.some((line) => lineNeedsDrying(line, productsRequiringTreatment));
}

/* ---------- Secadero ---------- */

export function DryingPlanModal({ order, products, productsRequiringTreatment, onClose, onSaved, onOpenOrder }: { order: OperationOrder; products: Product[]; productsRequiringTreatment: Set<string>; onClose: () => void; onSaved: (order: OperationOrder) => void; onOpenOrder: (id: string) => void }) {
  const productionEnd = order.productionEndDate ?? order.productionDate;
  const [startDate, setStartDate] = useState(order.dryingStartDate ?? productionEnd ?? "");
  const [endDate, setEndDate] = useState(order.dryingEndDate ?? "");
  const [note, setNote] = useState(order.dryingNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const delivery = getOrderPlannedDate(order);
  const finish = endDate || startDate;
  const lines = dryingOrderLines(order, products, productsRequiringTreatment);
  const warnings = [
    productionEnd && startDate && startDate < productionEnd ? `Empieza antes de terminar la producción (${shortDate(productionEnd)}).` : "",
    finish && finish > delivery ? `Termina después de la entrega (${shortDate(delivery)}).` : "",
  ].filter(Boolean);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      onSaved(await saveDryingPlan(order.id, startDate, endDate || undefined, note));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo programar el secado."); }
    finally { setSaving(false); }
  };
  return <ModalShell title="Programar secado" description={`${order.client} · ${order.reference}`} className="drying-modal" onClose={onClose}>
    <form className="sheet-form" onSubmit={submit}>
      <dl className="sheet-facts"><div><dt>Producción</dt><dd>{productionRangeLabel(order)}</dd></div><div><dt>Entrega</dt><dd>{shortDate(delivery)}</dd></div></dl>
      {lines.some((line) => line.quantity > 0) && <ul className="drying-plan-products" aria-label="Productos para HT">{lines.filter((line) => line.quantity > 0).map((line, index) => <li key={index}><strong>{line.product}</strong><span>{number.format(line.quantity)} u.</span></li>)}</ul>}
      <div className="sheet-fields two">
        <label>Inicio<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
        <label>Fin<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <label className="field-wide">Indicaciones<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Horno, carga, control de HT…" /></label>
      </div>
      {warnings.length > 0 && <div className="wizard-alert"><AlertTriangle size={18} aria-hidden="true" /><div>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>}
      <FieldError id="drying-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { onClose(); onOpenOrder(order.id); }}>Ver pedido</button><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar programación</AsyncButton></div></div>
    </form>
  </ModalShell>;
}

export function SecaderoPlanView({ orders, products, productsRequiringTreatment, onPlan, onSaved, onOpenRegistry }: { orders: OperationOrder[]; products: Product[]; productsRequiringTreatment: Set<string>; onPlan: (order: OperationOrder) => void; onSaved: (order: OperationOrder) => void; onOpenRegistry: () => void }) {
  const [physicalPending, setPhysicalPending] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/treatment/options", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ options: Array<{ pending: number }> }> : Promise.reject(new Error("No se pudo cargar el stock pendiente de HT.")))
      .then((payload) => setPhysicalPending(payload.options.reduce((sum, option) => sum + Math.max(option.pending, 0), 0)))
      .catch(() => { if (!controller.signal.aborted) setPhysicalPending(null); });
    return () => controller.abort();
  }, []);
  const relevant = orders.filter((order) => orderNeedsDrying(order, productsRequiringTreatment)).map((order) => {
    const lines = dryingOrderLines(order, products, productsRequiringTreatment);
    return { order, lines, quantity: lines.reduce((total, line) => total + line.pending, 0) };
  });
  const pending = relevant.filter(({ order, quantity }) => !order.dryingStartDate && quantity > 0).sort((left, right) => getOrderPlannedDate(left.order).localeCompare(getOrderPlannedDate(right.order)));
  const scheduled: DryingEntry[] = relevant.filter(({ order, lines }) => order.dryingStartDate && lines.some((line) => line.quantity > 0));
  const stockGeneralPending = physicalPending === null ? null : Math.max(physicalPending - relevant.reduce((sum, entry) => sum + entry.quantity, 0), 0);
  return <div className="phase-page">
    <div className="metric-row" aria-label="Resumen del secadero">
      <div className="metric-tile" data-kpi="unscheduled"><small>Por programar</small><strong>{number.format(pending.length)}</strong></div>
      <div className="metric-tile" data-kpi="scheduled"><small>Programados</small><strong>{number.format(scheduled.length)}</strong></div>
      <div className="metric-tile" data-kpi="pending-treatment"><small>Palets físicos pendientes de HT</small><strong>{physicalPending === null ? "—" : number.format(physicalPending)}</strong></div>
    </div>
    <section className="module-surface phase-queue drying-queue" aria-labelledby="drying-queue-title">
      <header className="phase-header"><div><h2 id="drying-queue-title">Por programar</h2></div>{pending.length > 0 && <span className="count-pill warning">{pending.length} pendientes</span>}</header>
      {pending.length || stockGeneralPending ? <div className="queue-list">{pending.map(({ order, quantity }) => <article key={order.id} className="queue-card"><div className="queue-card-main"><strong>{order.client}</strong><span>Producción: {productionRangeLabel(order)}</span></div><div className="queue-card-meta"><small>Entrega</small><strong>{shortDate(getOrderPlannedDate(order))}</strong></div><div className="queue-card-meta"><small>Palets para HT</small><strong>{number.format(quantity)}</strong></div><button type="button" className="primary-button" onClick={() => onPlan(order)}><Flame size={16} aria-hidden="true" />Programar</button></article>)}{stockGeneralPending ? <article className="queue-card stock-general-queue-card"><div className="queue-card-main"><strong>Stock general</strong><span>Palets físicos pendientes de HT sin programación de pedido</span></div><div className="queue-card-meta"><small>Palets para HT</small><strong>{number.format(stockGeneralPending)}</strong></div><button type="button" className="secondary-button" onClick={onOpenRegistry}>Registrar HT</button></article> : null}</div> : <EmptyState icon={CheckCircle2} title="No hay secados por programar" />}
    </section>
    <DryingCalendar entries={scheduled} onPlan={onPlan} onSaved={onSaved} />
  </div>;
}

