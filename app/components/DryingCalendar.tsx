"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { InternalProductionDefault } from "../capacity";
import type { OperationOrder } from "../data";
import type { TreatmentNotPerformed, TreatmentWeek } from "../treatment";
import { dryingDayMs, dryingQuantityOnDay, parseDryingDay as parseDay, shiftDryingDay as shiftDay } from "../drying";
import { setBoardDragImage } from "./ProductionPlanner";
import { AsyncButton, FieldError, WeekNavigator } from "./ui";

const normalDefault = 1000;
const number = new Intl.NumberFormat("es-UY");
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" });
const shortDate = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("es-UY", { weekday: "short", timeZone: "UTC" });
const dayDifference = (start: string, end: string) => (parseDay(end).valueOf() - parseDay(start).valueOf()) / dryingDayMs;

export function useDryingRule() {
  const [rule, setRule] = useState<InternalProductionDefault | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const today = dayKey.format(new Date());
    fetch(`/api/capacity?from=${today}&to=${today}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { capacity?: { internalDefaults: InternalProductionDefault[] }; error?: string };
        if (!response.ok || !payload.capacity) throw new Error(payload.error ?? "No se pudo cargar la regla de HT.");
        const saved = payload.capacity.internalDefaults.find((entry) => entry.operation === "ht");
        setRule({ operation: "ht", peopleCount: saved?.peopleCount ?? 0, manualCapacity: saved?.manualCapacity || normalDefault });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar la regla de HT.");
      });
    return () => controller.abort();
  }, []);
  return { rule, setRule, normalCapacity: rule?.manualCapacity ?? normalDefault, error };
}

export function DryingRulesView() {
  const { rule, setRule, normalCapacity, error } = useDryingRule();
  const [draft, setDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const units = Number(draft ?? normalCapacity);
  return <section className="module-surface drying-rules" aria-labelledby="drying-rules-title">
    <header className="phase-header"><h2 id="drying-rules-title">Reglas del secadero</h2></header>
    <form className="sheet-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!rule || saving || !Number.isInteger(units) || units < 1 || units > 2_147_483_647) return;
      setSaving(true); setSaveError(""); setSaved(false);
      try {
        const response = await fetch("/api/capacity/internal-production", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...rule, manualCapacity: units }),
        });
        const payload = await response.json() as { entry?: InternalProductionDefault; error?: string };
        if (!response.ok || !payload.entry) throw new Error(payload.error ?? "No se pudo guardar la regla de HT.");
        setRule(payload.entry); setDraft(null); setSaved(true);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "No se pudo guardar la regla de HT.");
      } finally {
        setSaving(false);
      }
    }}>
      <div className="drying-rule-row">
        <label>Capacidad diaria (unidades)<input type="number" min="1" max="2147483647" step="1" required value={draft ?? normalCapacity} disabled={!rule || saving} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} /></label>
        <AsyncButton type="submit" className="primary-button" loading={saving} disabled={!rule || draft === null || units === normalCapacity}>Guardar</AsyncButton>
        {saved && <span role="status" className="drying-rule-saved">Guardado</span>}
      </div>
      <FieldError id="drying-rule-error">{error || saveError}</FieldError>
    </form>
  </section>;
}

export type DryingEntry = { order: OperationOrder; lines: { lineId?: string; product: string; quantity: number; done?: boolean; byDay?: Record<string, number> }[] };

export async function saveDryingPlan(orderId: string, startDate: string, endDate?: string, note?: string, allocations?: Array<{ orderLineId: string; date: string; quantity: number }>) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/drying`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate, endDate, note, allocations }),
  });
  const payload = await response.json() as { order?: OperationOrder; error?: string };
  if (!response.ok || !payload.order) throw new Error(payload.error ?? "No se pudo programar el secado.");
  return payload.order;
}

export function DryingCalendar({ entries, onPlan, onSaved }: { entries: DryingEntry[]; onPlan: (order: OperationOrder) => void; onSaved: (order: OperationOrder) => void }) {
  const today = dayKey.format(new Date());
  const [start, setStart] = useState(() => shiftDay(today, -((parseDay(today).getUTCDay() + 6) % 7)));
  const { normalCapacity, error: ruleError } = useDryingRule();
  const [dragging, setDragging] = useState<{ order: OperationOrder; day: string; product: string; label: string } | null>(null);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lastDrag = useRef(0);
  const dropInProgress = useRef(false);
  // Lo que se marcó como "No se hizo" en el registro de HT se pinta en rojo.
  const [missed, setMissed] = useState<TreatmentNotPerformed[]>([]);
  const weekFrom = start, weekTo = shiftDay(start, 6);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/treatment/results?from=${weekFrom}&to=${weekTo}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ week?: TreatmentWeek }> : Promise.reject())
      .then((payload) => setMissed(payload.week?.notPerformed ?? []))
      .catch(() => { if (!controller.signal.aborted) setMissed([]); });
    return () => controller.abort();
  }, [weekFrom, weekTo, entries.length]);
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(start, index);
    const date = parseDay(day);
    const dayLabel = `${weekday.format(date).replace(".", "")} ${date.getUTCDate()}`;
    const cards = entries.flatMap(({ order, lines }) => lines.map(({ lineId, product, quantity, done, byDay }, index) => ({
      order, product, index, done: Boolean(done), lineId, quantity: byDay ? byDay[day] ?? 0 : dryingQuantityOnDay(order, quantity, day),
    })).filter(({ quantity }) => quantity > 0));
    const total = cards.reduce((sum, card) => sum + card.quantity, 0);
    return { day, date, dayLabel, cards, total };
  });
  const days = week[6].total ? week : week.slice(0, 6);
  const drop = async (day: string) => {
    if (!dragging?.order.dryingStartDate || dragging.day === day || dropInProgress.current) return;
    const { order } = dragging;
    const startDate = dragging.order.dryingStartDate;
    const delta = dayDifference(dragging.day, day);
    dropInProgress.current = true;
    setSaving(true); setTarget(day); setError("");
    try {
      const shifted = order.lines.flatMap((line) => (line.dryingAllocations ?? []).map((item) => ({ orderLineId: line.id, date: shiftDay(item.date, delta), quantity: item.quantity })));
      onSaved(await saveDryingPlan(order.id, shiftDay(startDate, delta), shiftDay(order.dryingEndDate ?? startDate, delta), order.dryingNote, shifted.length ? shifted : undefined));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo mover la programación.");
    } finally {
      dropInProgress.current = false;
      setSaving(false); setDragging(null); setTarget("");
    }
  };
  return <section className="module-surface" aria-labelledby="drying-week-title">
    <header className="phase-header">
      <h2 id="drying-week-title">Calendario del secadero</h2>
      <WeekNavigator label={`${shortDate.format(days[0].date)} – ${shortDate.format(days.at(-1)!.date)}`} onPrevious={() => setStart(shiftDay(start, -7))} onNext={() => setStart(shiftDay(start, 7))} />
    </header>
    <FieldError id="drying-calendar-error">{error || ruleError}</FieldError>
    <div className="production-board-wrap">
      <table className="production-board drying-board" data-column-filters="off">
        <thead><tr><th className="production-board-corner" scope="col">Tratamiento</th>{days.map(({ day, date }) => <th key={day} scope="col" className={day === today ? "today" : ""}><span>{weekday.format(date).replace(".", "")}</span><strong>{date.getUTCDate()}</strong></th>)}</tr></thead>
        <tbody><tr>
          <th scope="row"><strong>Secadero</strong><small>{number.format(normalCapacity)} u. por día</small></th>
          {days.map(({ day, dayLabel, cards, total }) => {
            const over = total > normalCapacity;
            const percent = over ? Math.max(101, Math.round(total / normalCapacity * 100)) : Math.round(total / normalCapacity * 100);
            const loadState = over ? "over" : percent === 100 ? "full" : "normal";
            const style = { "--load-hue": Math.round(140 * (1 - Math.min(percent, 100) / 100)) } as CSSProperties;
            return <td key={day} data-day={day} data-load-percent={percent} data-column-label={dayLabel} style={style} className={`board-utilization board-utilization-${loadState}${target === day ? " board-drop-target" : ""}`} onDragOver={(event) => {
              if (!dragging || dragging.day === day || saving) return;
              event.preventDefault(); event.dataTransfer.dropEffect = "move"; setTarget(day);
            }} onDrop={(event) => {
              event.preventDefault();
              if (dragging?.order.id === event.dataTransfer.getData("text/plain")) void drop(day);
            }}>
              {cards.map(({ order, product, quantity, index, done, lineId }) => {
                const notDone = !done && Boolean(lineId) && missed.some((item) => item.orderLineId === lineId && item.date === day);
                const label = `${number.format(quantity)} u. | ${order.client}`;
                return <button type="button" key={`${order.id}-${index}`} data-order-id={order.id} draggable={!saving} className={`board-chip${done ? " board-chip-result-client" : ""}${notDone ? " board-chip-result-not-produced" : ""}${dragging?.order.id === order.id ? " board-chip-dragging" : ""}`} onClick={() => { if (!saving && Date.now() - lastDrag.current > 500) onPlan(order); }} onDragStart={(event) => {
                  lastDrag.current = Date.now();
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", order.id);
                  setBoardDragImage(event, product, label);
                  setDragging({ order, day, product, label }); setTarget("");
                }} onDragEnd={() => {
                  lastDrag.current = Date.now();
                  if (!dropInProgress.current) { setDragging(null); setTarget(""); }
                }}><strong>{product}</strong><span>{label}</span></button>;
              })}
              {target === day && dragging && <div className="board-chip-preview" aria-hidden="true"><strong>{dragging.product}</strong><span>{dragging.label}</span>{saving && <small>Guardando…</small>}</div>}
              <span className="board-load" aria-label={over ? `${percent}% de la capacidad normal, capacidad superada` : `${percent}% de la capacidad normal`}>{percent}%</span>
            </td>;
          })}
        </tr></tbody>
        <tfoot><tr className="board-total-row"><th scope="row">Total para HT</th>{days.map(({ day, dayLabel, total }) => <td key={day} data-day={day} data-total={total} data-column-label={dayLabel}><strong>{number.format(total)}</strong><small>u.</small></td>)}</tr></tfoot>
      </table>
    </div>
  </section>;
}
