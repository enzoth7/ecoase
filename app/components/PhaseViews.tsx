"use client";

import { AlertTriangle, CalendarClock, Check, CheckCircle2, Flame, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { getOrderPlannedDate, getOrderRequestedDate, type OperationOrder, type Product } from "../data";
import { dryingLineSplit, dryingOrderLines, lineNeedsDrying } from "../drying";
import { DryingCalendar, saveDryingPlan, useDryingRule, type DryingEntry } from "./DryingCalendar";
import { productionRangeLabel } from "./ProductionPlanner";
import { AsyncButton, EmptyState, FieldError, ModalShell, WeekNavigator } from "./ui";

const number = new Intl.NumberFormat("es-UY");
function parseDate(key: string) { return new Date(`${key}T12:00:00`); }
function shortDate(key?: string) { return key ? new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" }).format(parseDate(key)) : "—"; }

export function orderNeedsDrying(order: OperationOrder, productsRequiringTreatment: Set<string>) {
  return (order.requiredOperations ?? []).includes("treatment") || order.lines.some((line) => lineNeedsDrying(line, productsRequiringTreatment));
}

/* ---------- Secadero ---------- */

const dryingSteps = ["Días", "Cantidades", "Confirmar"];
const weekdayName = (key: string) => { const label = new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(parseDate(key)).replace(".", ""); return label.charAt(0).toLocaleUpperCase("es") + label.slice(1); };
const addDay = (key: string, amount: number) => { const date = parseDate(key); date.setDate(date.getDate() + amount); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const mondayOf = (key: string) => addDay(key, -((parseDate(key).getDay() + 6) % 7));

export function DryingPlanModal({ order, products, productsRequiringTreatment, pendingOnly = false, onClose, onSaved, onOpenOrder }: { order: OperationOrder; products: Product[]; productsRequiringTreatment: Set<string>; pendingOnly?: boolean; onClose: () => void; onSaved: (order: OperationOrder) => void; onOpenOrder: (id: string) => void }) {
  const productionEnd = order.productionEndDate ?? order.productionDate;
  const delivery = getOrderPlannedDate(order);
  const { normalCapacity } = useDryingRule();
  const lines = dryingOrderLines(order, products, productsRequiringTreatment);
  const splitFor = (line: (typeof lines)[number]) => { const orderLine = order.lines.find((item) => item.id === line.lineId); return orderLine ? dryingLineSplit(order, orderLine, line.planned) : { done: {}, pending: {}, unscheduled: 0, legacy: false }; };
  // Lo ya tratado queda donde estaba. "Reprogramar" reparte lo que falta; "Tratar pendientes" solo lo que no tiene día.
  const needed = (line: (typeof lines)[number]) => {
    const split = splitFor(line);
    if (pendingOnly) return split.unscheduled;
    const doneTotal = Object.values(split.done).reduce((sum, value) => sum + value, 0);
    return Math.max(line.planned - doneTotal, 0);
  };
  const initialQuantities = pendingOnly ? {} : Object.fromEntries(lines.flatMap((line) => Object.entries(splitFor(line).pending).map(([day, quantity]) => [`${line.lineId}|${day}`, quantity])));
  const [step, setStep] = useState(0);
  const [selectedDays, setSelectedDays] = useState<string[]>(() => [...new Set(Object.keys(initialQuantities).map((key) => key.split("|")[1]))].sort());
  const [weekStart, setWeekStart] = useState(() => mondayOf(selectedDays[0] ?? order.dryingStartDate ?? productionEnd ?? delivery));
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const days = Array.from({ length: 7 }, (_, index) => addDay(weekStart, index));
  const sortedDays = [...selectedDays].sort();
  const key = (lineId: string, day: string) => `${lineId}|${day}`;
  const assignedFor = (lineId: string) => sortedDays.reduce((sum, day) => sum + (quantities[key(lineId, day)] ?? 0), 0);
  const remainingFor = (line: (typeof lines)[number]) => needed(line) - assignedFor(line.lineId);
  const dayTotal = (day: string) => lines.reduce((sum, line) => sum + (quantities[key(line.lineId, day)] ?? 0), 0);
  const totalAssigned = lines.reduce((sum, line) => sum + assignedFor(line.lineId), 0);
  const overAssigned = lines.some((line) => remainingFor(line) < 0);
  const toggleDay = (day: string) => setSelectedDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
  const canAdvance = step === 0 ? sortedDays.length > 0 : step === 1 ? totalAssigned > 0 && !overAssigned : true;
  const first = sortedDays[0], last = sortedDays.at(-1);
  const warnings = [
    productionEnd && first && first < productionEnd ? `Empieza antes de terminar la producción (${shortDate(productionEnd)}).` : "",
    last && last > delivery ? `Termina después de la entrega (${shortDate(delivery)}).` : "",
    ...sortedDays.filter((day) => dayTotal(day) > normalCapacity).map((day) => `${weekdayName(day)} ${shortDate(day)} supera la capacidad diaria (${number.format(normalCapacity)} u.).`),
  ].filter(Boolean);

  const distribute = () => setQuantities((current) => {
    const next = { ...current };
    for (const line of lines) {
      for (const day of sortedDays) delete next[key(line.lineId, day)];
      const total = needed(line);
      if (!sortedDays.length || total <= 0) continue;
      const base = Math.floor(total / sortedDays.length);
      sortedDays.forEach((day, index) => { const amount = base + (index < total % sortedDays.length ? 1 : 0); if (amount > 0) next[key(line.lineId, day)] = amount; });
    }
    return next;
  });

  const save = async () => {
    setSaving(true); setError("");
    const merged = new Map<string, { orderLineId: string; date: string; quantity: number }>();
    const add = (orderLineId: string, date: string, quantity: number) => {
      if (quantity <= 0) return;
      const id = `${orderLineId}|${date}`;
      merged.set(id, { orderLineId, date, quantity: (merged.get(id)?.quantity ?? 0) + quantity });
    };
    for (const line of lines) {
      const split = splitFor(line);
      for (const [date, quantity] of Object.entries(split.done)) add(line.lineId, date, quantity);
      if (pendingOnly) for (const [date, quantity] of Object.entries(split.pending)) add(line.lineId, date, quantity);
      for (const day of sortedDays) add(line.lineId, day, quantities[key(line.lineId, day)] ?? 0);
    }
    const allocations = [...merged.values()];
    try {
      onSaved(await saveDryingPlan(order.id, allocations.map((item) => item.date).sort()[0], allocations.map((item) => item.date).sort().at(-1), order.dryingNote, allocations));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo programar el secado."); }
    finally { setSaving(false); }
  };

  const pendingTotal = lines.reduce((sum, line) => sum + needed(line), 0);
  return <ModalShell title={pendingOnly ? "Tratar pendientes" : "Programar secado"} description={`${order.client} · ${number.format(pendingTotal)} unidades ${pendingOnly ? "sin programar" : "para HT"} · Entrega ${shortDate(delivery)}`} className="plan-wizard-modal" onClose={onClose} dirty={totalAssigned > 0 && !saving}>
    <ol className="wizard-steps" aria-label="Pasos del secado">{dryingSteps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "done" : ""}><button type="button" onClick={() => index <= step && setStep(index)} disabled={index > step}><span>{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{label}</button></li>)}</ol>
    <div className="wizard-layout">
      <div className="wizard-main">
        {step === 0 && <section className="wizard-section" aria-labelledby="drying-days-title">
          <header><div><h3 id="drying-days-title">¿Qué días se seca?</h3></div><WeekNavigator label={`${shortDate(days[0])} – ${shortDate(days[6])}`} onPrevious={() => setWeekStart(addDay(weekStart, -7))} onNext={() => setWeekStart(addDay(weekStart, 7))} /></header>
          <div className="day-picker">{days.map((day) => { const selected = selectedDays.includes(day); const late = day > delivery; return <button type="button" key={day} className={`${selected ? "selected" : ""} ${late ? "late" : ""}`} aria-pressed={selected} onClick={() => toggleDay(day)}><span>{weekdayName(day)}</span><strong>{parseDate(day).getDate()}</strong>{late && <small>Después de la entrega</small>}</button>; })}</div>
          {sortedDays.length > 0 && <p className="wizard-summary-line">Rango de secado: <strong>{sortedDays.length === 1 ? shortDate(first) : `${shortDate(first)} → ${shortDate(last!)}`}</strong> · {sortedDays.length} {sortedDays.length === 1 ? "día" : "días"}</p>}
        </section>}
        {step === 1 && <section className="wizard-section" aria-labelledby="drying-quantities-title">
          <header><div><h3 id="drying-quantities-title">¿Cuánto por día?</h3></div><button type="button" className="secondary-button" onClick={distribute}>Repartir automáticamente</button></header>
          <div className="quantity-grid-wrap"><table className="quantity-grid" data-column-filters="off"><thead><tr><th scope="col">Producto</th>{sortedDays.map((day) => <th scope="col" key={day}>{weekdayName(day)} {parseDate(day).getDate()}</th>)}</tr></thead><tbody>{lines.filter((line) => needed(line) > 0).map((line) => <tr key={line.lineId}><th scope="row">{line.product}<small>{number.format(Math.max(remainingFor(line), 0))} por asignar</small></th>{sortedDays.map((day) => <td key={day}><input type="number" min="0" step="1" inputMode="numeric" aria-label={`${line.product}, ${weekdayName(day)} ${parseDate(day).getDate()}`} value={quantities[key(line.lineId, day)] || ""} placeholder="0" onChange={(event) => setQuantities((current) => ({ ...current, [key(line.lineId, day)]: Math.max(Number(event.target.value) || 0, 0) }))} /></td>)}</tr>)}</tbody></table></div>
          <div className="line-progress">{lines.filter((line) => needed(line) > 0).map((line) => { const done = assignedFor(line.lineId); return <div key={line.lineId} className={remainingFor(line) < 0 ? "danger" : remainingFor(line) === 0 ? "complete" : ""}><span>{line.product}</span><div role="progressbar" aria-valuemin={0} aria-valuemax={needed(line)} aria-valuenow={done} aria-label={`Asignado de ${line.product}`}><i style={{ width: `${Math.min(done / needed(line) * 100, 100)}%` }} /></div><strong>{number.format(done)} / {number.format(needed(line))}</strong></div>; })}</div>
          {overAssigned && <FieldError id="drying-over">Asignaste más unidades de las que tiene el pedido.</FieldError>}
        </section>}
        {step === 2 && <section className="wizard-section" aria-labelledby="drying-confirm-title">
          <header><div><h3 id="drying-confirm-title">Revisá y confirmá</h3></div></header>
          <ul className="wizard-review">{sortedDays.map((day) => { const entries = lines.map((line) => ({ line, quantity: quantities[key(line.lineId, day)] ?? 0 })).filter((entry) => entry.quantity > 0); if (!entries.length) return null; return <li key={day}><strong>{weekdayName(day)} {shortDate(day)}</strong><div>{entries.map((entry) => <span key={entry.line.lineId}>{entry.line.product} · <b>{number.format(entry.quantity)}</b></span>)}</div></li>; })}</ul>
          {lines.some((line) => remainingFor(line) > 0) && <p className="wizard-note">Quedan unidades sin programar: {lines.filter((line) => remainingFor(line) > 0).map((line) => `${line.product} (${number.format(remainingFor(line))})`).join(", ")}.</p>}
          {warnings.length > 0 && <div className="wizard-alert"><AlertTriangle size={18} aria-hidden="true" /><div>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>}
          <FieldError id="drying-error">{error}</FieldError>
        </section>}
      </div>
      <aside className="wizard-calendar" aria-label="Capacidad del secadero">
        <h4>Capacidad del secadero</h4>
        {!sortedDays.length ? <p className="wizard-calendar-empty">Elegí los días para ver la carga de cada uno.</p> : <ul className="wizard-review">{sortedDays.map((day) => { const total = dayTotal(day); const percent = normalCapacity ? Math.round(total / normalCapacity * 100) : 0; return <li key={day}><strong>{weekdayName(day)} {shortDate(day)}</strong><div><span>{number.format(total)} / {number.format(normalCapacity)} u. · <b>{percent}%</b></span></div></li>; })}</ul>}
      </aside>
    </div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { onClose(); onOpenOrder(order.id); }}>Ver pedido</button><div>
      {step > 0 && <button type="button" className="secondary-button" onClick={() => setStep(step - 1)}>Atrás</button>}
      <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
      {step < 2 ? <button type="button" className="primary-button" disabled={!canAdvance} onClick={() => setStep(step + 1)}>Continuar</button> : <AsyncButton type="button" className="primary-button" loading={saving} onClick={() => void save()} disabled={totalAssigned <= 0}>Guardar programación</AsyncButton>}
    </div></div>
  </ModalShell>;
}

export function SecaderoPlanView({ orders, products, productsRequiringTreatment, onPlan, onPlanPending, onSaved, onOpenRegistry }: { orders: OperationOrder[]; products: Product[]; productsRequiringTreatment: Set<string>; onPlan: (order: OperationOrder) => void; onPlanPending: (order: OperationOrder) => void; onSaved: (order: OperationOrder) => void; onOpenRegistry: () => void }) {
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
  // El calendario muestra lo pendiente (blanco) y lo que ya se trató (verde), día por día.
  const scheduled: DryingEntry[] = relevant.filter(({ order }) => order.dryingStartDate).map(({ order, lines }) => ({
    order,
    lines: lines.flatMap((line): DryingEntry["lines"] => {
      const orderLine = order.lines.find((item) => item.id === line.lineId);
      const split = orderLine ? dryingLineSplit(order, orderLine, line.planned) : undefined;
      if (!split) return [];
      if (split.legacy) {
        const treated = Math.min(orderLine?.treatedQuantity ?? 0, line.planned);
        return [
          ...(line.quantity > 0 ? [{ lineId: line.lineId, product: line.product, quantity: line.quantity }] : []),
          ...(treated > 0 ? [{ lineId: line.lineId, product: line.product, quantity: 0, done: true, byDay: split.done }] : []),
        ];
      }
      return [
        ...(Object.keys(split.pending).length ? [{ lineId: line.lineId, product: line.product, quantity: 0, byDay: split.pending }] : []),
        ...(Object.keys(split.done).length ? [{ lineId: line.lineId, product: line.product, quantity: 0, done: true, byDay: split.done }] : []),
      ];
    }),
  })).filter(({ lines }) => lines.length > 0);
  const programmed = relevant.filter(({ order }) => order.dryingStartDate).map(({ order, lines }) => {
    const total = lines.reduce((sum, line) => sum + line.planned, 0);
    const treated = lines.reduce((sum, line) => sum + Math.min(order.lines.find((item) => item.id === line.lineId)?.treatedQuantity ?? 0, line.planned), 0);
    const unscheduled = lines.reduce((sum, line) => { const orderLine = order.lines.find((item) => item.id === line.lineId); return sum + (orderLine ? dryingLineSplit(order, orderLine, line.planned).unscheduled : 0); }, 0);
    return { order, total, treated, unscheduled };
  }).sort((left, right) => (left.order.dryingStartDate ?? "").localeCompare(right.order.dryingStartDate ?? ""));
  const stockGeneralPending = physicalPending === null ? null : Math.max(physicalPending - relevant.reduce((sum, entry) => sum + entry.quantity, 0), 0);
  return <div className="phase-page">
    <section className="module-surface phase-queue drying-queue" aria-labelledby="drying-queue-title">
      <header className="phase-header"><div><h2 id="drying-queue-title">Por programar</h2></div>{pending.length > 0 && <span className="count-pill warning">{pending.length} pendientes</span>}</header>
      {pending.length || stockGeneralPending ? <div className="queue-list">{pending.map(({ order, quantity }) => <article key={order.id} className="queue-card"><div className="queue-card-main"><strong>{order.client}</strong><span>Producción: {productionRangeLabel(order)}</span></div><div className="queue-card-meta"><small>Entrega</small><strong>{shortDate(getOrderPlannedDate(order))}</strong></div><div className="queue-card-meta"><small>Unidades para HT</small><strong>{number.format(quantity)}</strong></div><button type="button" className="primary-button" onClick={() => onPlan(order)}><Flame size={16} aria-hidden="true" />Programar</button></article>)}{stockGeneralPending ? <article className="queue-card stock-general-queue-card"><div className="queue-card-main"><strong>Stock general</strong><span>Unidades físicas pendientes de HT sin programación de pedido</span></div><div className="queue-card-meta"><small>Unidades para HT</small><strong>{number.format(stockGeneralPending)}</strong></div><button type="button" className="primary-button" onClick={onOpenRegistry}>Registrar HT</button></article> : null}</div> : <EmptyState icon={CheckCircle2} title="No hay secados por programar" />}
    </section>
    <DryingCalendar entries={scheduled} onPlan={onPlan} onSaved={onSaved} />
    {programmed.length > 0 && <section className="module-surface production-planned-section" aria-labelledby="drying-planned-title">
      <header className="phase-header"><div><h2 id="drying-planned-title">Secadero programado</h2></div><span className="count-pill">{programmed.length} {programmed.length === 1 ? "pedido" : "pedidos"}</span></header>
      <div className="production-table-wrap"><table className="production-planned-table" data-column-filters="off">
        <thead><tr><th scope="col">Cliente</th><th scope="col">Secadero</th><th scope="col">Entrega</th><th scope="col" className="num">Con HT</th><th scope="col" className="num">Tratado</th><th scope="col" className="num">Pendiente</th><th scope="col">Avance</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{programmed.map(({ order, total, treated, unscheduled }) => {
          const pendingQuantity = Math.max(total - treated, 0);
          const percent = total ? Math.min(Math.round(treated / total * 100), 100) : 0;
          const done = total > 0 && pendingQuantity === 0;
          const started = treated > 0;
          return <tr key={order.id}>
            <th scope="row">{order.client}</th>
            <td>{order.dryingEndDate && order.dryingEndDate !== order.dryingStartDate ? `${shortDate(order.dryingStartDate)} → ${shortDate(order.dryingEndDate)}` : shortDate(order.dryingStartDate)}</td>
            <td>{shortDate(getOrderRequestedDate(order))}</td>
            <td className="num">{number.format(total)}</td>
            <td className="num">{number.format(treated)}</td>
            <td className="num">{number.format(pendingQuantity)}</td>
            <td><div className="planned-progress" role="img" aria-label={`${percent}% tratado`}><i style={{ width: `${percent}%` }} /><span>{percent}%</span></div></td>
            <td><span className={`status-badge ${done ? "shipped" : started ? "produced" : "planned"}`}>{done ? "Completado" : started ? "En secadero" : "Programado"}</span></td>
            <td className="planned-actions">{unscheduled > 0 && <button type="button" className="od-icon-button" onClick={() => onPlanPending(order)} aria-label={`Tratar los ${number.format(unscheduled)} pendientes de ${order.client}`} title={`Tratar ${number.format(unscheduled)} pendientes`}><Plus size={18} aria-hidden="true" /></button>}<button type="button" className="od-icon-button" onClick={() => onPlan(order)} aria-label={`Reprogramar secadero de ${order.client}`} title="Reprogramar"><CalendarClock size={18} aria-hidden="true" /></button></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>}
  </div>;
}

