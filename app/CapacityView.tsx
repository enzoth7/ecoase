"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Factory, Save, Truck, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { capacityOperationLabels, type CapacityDay, type CapacitySnapshot } from "./capacity";
import type { CapacityOperation, CapacityStatus, Provider, TransportSource } from "./data";

const number = new Intl.NumberFormat("es-UY");
const operations: CapacityOperation[] = ["assembly", "marking", "ht"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function weekDays(week: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(week);
    date.setDate(week.getDate() + index);
    return date;
  });
}

function formatRange(week: Date) {
  const end = new Date(week);
  end.setDate(week.getDate() + 6);
  const format = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" });
  return `${format.format(week)} – ${format.format(end)} de ${end.getFullYear()}`;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

async function put(url: string, body: unknown) {
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la capacidad.");
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return <div className={`capacity-metric ${tone ?? ""}`}><small>{label}</small><strong>{value}</strong></div>;
}

export default function CapacityView({ providers }: { providers: Provider[] }) {
  const today = useMemo(() => new Date(), []);
  const [week, setWeek] = useState(() => startOfWeek(today));
  const days = useMemo(() => weekDays(week), [week]);
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/capacity?from=${dateKey(days[0])}&to=${dateKey(days[6])}`);
      const payload = await response.json() as { capacity?: CapacitySnapshot; error?: string };
      if (!response.ok || !payload.capacity) throw new Error(payload.error ?? "No se pudo cargar la capacidad.");
      setCapacity(payload.capacity);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar la capacidad.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [days]);

  const save = async (url: string, body: unknown) => {
    setError("");
    try { await put(url, body); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); throw reason; }
  };

  const moveWeek = (offset: number) => {
    const next = new Date(week);
    next.setDate(week.getDate() + offset * 7);
    setOpenDate(null);
    setWeek(next);
  };

  const selected = capacity?.days.find((day) => day.date === openDate);
  const sawmills = providers.filter((provider) => provider.type === "Aserradero");
  const transporters = providers.filter((provider) => provider.type === "Transporte");

  return <section className="capacity-page" aria-labelledby="capacity-title">
    <div className="module-surface capacity-week">
      <div className="module-toolbar capacity-toolbar">
        <div><h2 id="capacity-title">Capacidad semanal</h2><small>La capacidad general se aplica todos los días</small></div>
        <div className="calendar-week-controls">
          <button type="button" onClick={() => moveWeek(-1)} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
          <strong>{formatRange(week)}</strong>
          <button type="button" onClick={() => moveWeek(1)} aria-label="Semana siguiente"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="capacity-days" aria-label="Capacidad por día">
        {days.map((day) => {
          const key = dateKey(day);
          const summary = capacity?.days.find((item) => item.date === key);
          const hasIssue = Boolean(summary?.issues.length);
          return <button key={key} type="button" className={`${key === dateKey(today) ? "today" : ""} ${hasIssue ? "issue" : ""}`} onClick={() => setOpenDate(key)} aria-label={`Ajustar ${formatDay(key)}${hasIssue ? `: ${summary?.issues.join(", ")}` : ""}`}>
            <small>{new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(day)}</small>
            <strong>{day.getDate()}</strong>
            <em>{number.format(summary?.transportTotals.committed ?? 0)} palets</em>
            {hasIssue ? <b><AlertTriangle size={12} />Revisar</b> : <b className="ready">Capacidad definida</b>}
          </button>;
        })}
      </div>
    </div>

    {error && <p className="capacity-error" role="alert">{error}</p>}
    {loading && !capacity ? <div className="module-surface capacity-loading">Cargando capacidad…</div> : capacity && <>
      <div className="capacity-general-heading"><div><h2>Capacidad general</h2><p>Estos valores se repiten de lunes a domingo. Los cambios excepcionales se cargan desde cada día.</p></div></div>
      <GeneralInternalProduction capacity={capacity} onSave={save} />
      <GeneralExternalProduction capacity={capacity} providers={sawmills} onSave={save} />
      <GeneralTransport capacity={capacity} providers={transporters} onSave={save} />
    </>}

    {selected && capacity && <DayAdjustmentModal day={selected} onClose={() => setOpenDate(null)} onSave={save} />}
  </section>;
}

function GeneralInternalProduction({ capacity, onSave }: { capacity: CapacitySnapshot; onSave: (url: string, body: unknown) => Promise<void> }) {
  return <section className="module-surface capacity-section" aria-labelledby="internal-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Factory size={20} /></div><div><h2 id="internal-title">Producción interna</h2><small>Dotación y capacidad diaria habitual</small></div></div>
    <div className="capacity-operation-grid">
      {operations.map((operation) => <GeneralInternalOperation key={operation} operation={operation} capacity={capacity} onSave={onSave} />)}
    </div>
  </section>;
}

function GeneralInternalOperation({ operation, capacity, onSave }: { operation: CapacityOperation; capacity: CapacitySnapshot; onSave: (url: string, body: unknown) => Promise<void> }) {
  const defaults = capacity.internalDefaults.find((item) => item.operation === operation);
  const [people, setPeople] = useState(String(defaults?.peopleCount ?? 0));
  const [manual, setManual] = useState(defaults?.manualCapacity === undefined ? "" : String(defaults.manualCapacity));
  const [rulePeople, setRulePeople] = useState("");
  const [ruleCapacity, setRuleCapacity] = useState("");
  const rules = capacity.rules.filter((rule) => rule.operation === operation);
  const exactRule = rules.find((rule) => rule.peopleCount === Number(people));
  const calculated = manual === "" ? exactRule?.palletCapacity : Number(manual);

  return <article className="capacity-operation-card">
    <header><Users size={18} /><h3>{capacityOperationLabels[operation]}</h3></header>
    <Metric label="Capacidad general por día" value={calculated === undefined ? "Sin calcular" : `${number.format(calculated)} palets`} />
    <form className="capacity-inline-form" onSubmit={(event) => { event.preventDefault(); void onSave("/api/capacity/internal-production", { operation, peopleCount: Number(people), manualCapacity: manual === "" ? null : Number(manual) }); }}>
      <label>Personas<input type="number" min="0" step="1" value={people} onChange={(event) => setPeople(event.target.value)} required /></label>
      <label>Capacidad manual<input type="number" min="0" step="1" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Usar regla" /></label>
      <button type="submit" aria-label={`Guardar capacidad general de ${capacityOperationLabels[operation]}`}><Save size={17} /></button>
    </form>
    <details className="capacity-rules"><summary>Reglas por personas ({rules.length})</summary>
      {rules.length > 0 && <ul>{rules.map((rule) => <li key={rule.peopleCount}>{rule.peopleCount} personas → {number.format(rule.palletCapacity)} palets</li>)}</ul>}
      <form onSubmit={(event) => { event.preventDefault(); void onSave("/api/capacity/rules", { operation, peopleCount: Number(rulePeople), palletCapacity: Number(ruleCapacity) }); setRulePeople(""); setRuleCapacity(""); }}>
        <label>Personas<input type="number" min="0" step="1" value={rulePeople} onChange={(event) => setRulePeople(event.target.value)} required /></label>
        <label>Palets/día<input type="number" min="0" step="1" value={ruleCapacity} onChange={(event) => setRuleCapacity(event.target.value)} required /></label>
        <button type="submit">Guardar regla</button>
      </form>
    </details>
  </article>;
}

function GeneralExternalProduction({ capacity, providers, onSave }: { capacity: CapacitySnapshot; providers: Provider[]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSave("/api/capacity/external-production", { providerId: form.get("providerId"), operation: form.get("operation"), palletCapacity: Number(form.get("palletCapacity")), status: form.get("status") });
  };
  return <section className="module-surface capacity-section" aria-labelledby="external-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Factory size={20} /></div><div><h2 id="external-title">Producción externa</h2><small>Capacidad diaria habitual por aserradero</small></div></div>
    {capacity.externalDefaults.length > 0 ? <div className="capacity-table"><div className="capacity-table-heading general"><div>Aserradero</div><div>Operación</div><div>Estado</div><div>Capacidad diaria</div></div>{capacity.externalDefaults.map((entry) => <div className="capacity-table-row general" key={`${entry.providerId}-${entry.operation}`}><strong>{providers.find((provider) => provider.id === entry.providerId)?.name ?? "Proveedor"}</strong><div>{capacityOperationLabels[entry.operation]}</div><div>{entry.status === "confirmed" ? "Confirmada" : "Estimada"}</div><div>{number.format(entry.palletCapacity)} palets</div></div>)}</div> : <p className="capacity-empty">Todavía no hay capacidad general de aserraderos.</p>}
    <form className="capacity-add-form" onSubmit={submit}>
      <label>Aserradero<select name="providerId" required defaultValue=""><option value="" disabled>Seleccionar</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
      <label>Operación<select name="operation" defaultValue="assembly">{operations.map((operation) => <option key={operation} value={operation}>{capacityOperationLabels[operation]}</option>)}</select></label>
      <label>Palets por día<input name="palletCapacity" type="number" min="0" step="1" required /></label>
      <label>Estado<select name="status" defaultValue="estimated"><option value="estimated">Estimada</option><option value="confirmed">Confirmada</option></select></label>
      <button type="submit" className="primary-button">Guardar capacidad</button>
    </form>
  </section>;
}

function GeneralTransport({ capacity, providers, onSave }: { capacity: CapacitySnapshot; providers: Provider[]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [source, setSource] = useState<TransportSource>("internal");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSave("/api/capacity/transport", { source, providerId: source === "external" ? form.get("providerId") : undefined, palletCapacity: Number(form.get("palletCapacity")), status: source === "internal" ? "confirmed" : form.get("status") as CapacityStatus });
  };
  return <section className="module-surface capacity-section" aria-labelledby="transport-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Truck size={20} /></div><div><h2 id="transport-title">Transporte</h2><small>Capacidad diaria habitual en palets</small></div></div>
    {capacity.transportDefaults.length > 0 ? <div className="capacity-table"><div className="capacity-table-heading general"><div>Origen</div><div>Estado</div><div>Capacidad diaria</div><div>Tipo</div></div>{capacity.transportDefaults.map((entry) => <div className="capacity-table-row general" key={`${entry.source}-${entry.providerId ?? "internal"}`}><strong>{entry.source === "internal" ? "Transporte interno" : providers.find((provider) => provider.id === entry.providerId)?.name ?? "Transportista"}</strong><div>{entry.status === "confirmed" ? "Confirmada" : "Estimada"}</div><div>{number.format(entry.palletCapacity)} palets</div><div>{entry.source === "internal" ? "Propio" : "Externo"}</div></div>)}</div> : <p className="capacity-empty">Todavía no hay capacidad general de transporte.</p>}
    <form className="capacity-add-form" onSubmit={submit}>
      <label>Origen<select value={source} onChange={(event) => setSource(event.target.value as TransportSource)}><option value="internal">Transporte interno</option><option value="external">Transportista externo</option></select></label>
      {source === "external" && <label>Transportista<select name="providerId" required defaultValue=""><option value="" disabled>Seleccionar</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
      <label>Palets por día<input name="palletCapacity" type="number" min="0" step="1" required /></label>
      {source === "external" && <label>Estado<select name="status" defaultValue="estimated"><option value="estimated">Estimada</option><option value="confirmed">Confirmada</option></select></label>}
      <button type="submit" className="primary-button">Guardar capacidad</button>
    </form>
  </section>;
}

function DayAdjustmentModal({ day, onClose, onSave }: { day: CapacityDay; onClose: () => void; onSave: (url: string, body: unknown) => Promise<void> }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return <div className="modal-backdrop capacity-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="capacity-day-modal" role="dialog" aria-modal="true" aria-labelledby="day-capacity-title">
      <header><div><small>Ajuste excepcional</small><h2 id="day-capacity-title">{formatDay(day.date)}</h2><p>Sumá o restá palets únicamente para este día.</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar ajustes"><X size={21} /></button></header>
      {day.issues.length > 0 && <div className="capacity-day-alert"><AlertTriangle size={19} /><div><strong>Este día necesita revisión</strong><p>{day.issues.join(" · ")}</p></div></div>}

      <section className="day-adjustment-section" aria-labelledby="day-internal-title"><h3 id="day-internal-title"><Factory size={18} />Producción interna</h3>
        {day.internalProduction.map((entry) => <AdjustmentRow key={entry.operation} name={capacityOperationLabels[entry.operation]} baseCapacity={entry.baseCapacity} adjustment={entry.adjustment} committed={entry.committed} capacity={entry.capacity} overload={entry.overload} onSave={(palletAdjustment) => onSave("/api/capacity/adjustments", { date: day.date, resourceType: "internal_production", operation: entry.operation, palletAdjustment })} />)}
      </section>

      {day.externalProduction.length > 0 && <section className="day-adjustment-section" aria-labelledby="day-external-title"><h3 id="day-external-title"><Factory size={18} />Producción externa</h3>
        {day.externalProduction.map((entry) => <AdjustmentRow key={`${entry.providerId}-${entry.operation}`} name={`${entry.providerName} · ${capacityOperationLabels[entry.operation]}`} baseCapacity={entry.baseCapacity} adjustment={entry.adjustment} committed={entry.committed} capacity={entry.capacity} overload={entry.overload} onSave={(palletAdjustment) => onSave("/api/capacity/adjustments", { date: day.date, resourceType: "external_production", providerId: entry.providerId, operation: entry.operation, palletAdjustment })} />)}
      </section>}

      <section className="day-adjustment-section" aria-labelledby="day-transport-title"><h3 id="day-transport-title"><Truck size={18} />Transporte</h3>
        {day.transport.map((entry) => <AdjustmentRow key={`${entry.source}-${entry.providerId ?? "internal"}`} name={entry.providerName} baseCapacity={entry.baseCapacity} adjustment={entry.adjustment} committed={entry.committed} capacity={entry.capacity} overload={entry.overload} onSave={(palletAdjustment) => onSave("/api/capacity/adjustments", { date: day.date, resourceType: "transport", source: entry.source, providerId: entry.providerId, palletAdjustment })} />)}
      </section>

      {day.imports.length > 0 && <section className="day-adjustment-section imports" aria-labelledby="day-imports-title"><h3 id="day-imports-title">Ingresos por importación</h3>{day.imports.map((entry) => <p key={entry.orderId}><strong>{entry.client}</strong> · {number.format(entry.pallets)} palets</p>)}</section>}
    </section>
  </div>;
}

function AdjustmentRow({ name, baseCapacity, adjustment, committed, capacity, overload, onSave }: { name: string; baseCapacity?: number; adjustment: number; committed: number; capacity?: number; overload: number; onSave: (adjustment: number) => Promise<void> }) {
  const [value, setValue] = useState(String(adjustment));
  const [saving, setSaving] = useState(false);
  return <article className={`day-adjustment-row ${capacity === undefined || overload > 0 ? "danger" : ""}`}>
    <div className="day-adjustment-name"><strong>{name}</strong><small>Base: {baseCapacity === undefined ? "sin definir" : `${number.format(baseCapacity)} palets`}</small></div>
    <Metric label="Comprometidos" value={number.format(committed)} />
    <Metric label={overload > 0 ? "Sobrecarga" : "Capacidad del día"} value={capacity === undefined ? "Sin calcular" : overload > 0 ? number.format(overload) : number.format(capacity)} tone={overload > 0 ? "danger" : undefined} />
    <form onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onSave(Number(value)); } finally { setSaving(false); } }}>
      <label>Ajuste en palets<input type="number" step="1" value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Ajuste para ${name}`} /></label>
      <button type="submit" disabled={saving}><Save size={16} />{saving ? "Guardando" : "Guardar"}</button>
    </form>
  </article>;
}
