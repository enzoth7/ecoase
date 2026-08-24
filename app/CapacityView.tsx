"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Factory, Save, Truck, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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

async function put(url: string, body: unknown) {
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la capacidad.");
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return <div className={`capacity-metric ${tone ?? ""}`}><small>{label}</small><strong>{value}</strong></div>;
}

export default function CapacityView({ providers }: { providers: Provider[] }) {
  const today = useMemo(() => new Date(), []);
  const [week, setWeek] = useState(() => startOfWeek(today));
  const days = useMemo(() => weekDays(week), [week]);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today));
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const from = dateKey(days[0]);
      const to = dateKey(days[6]);
      const response = await fetch(`/api/capacity?from=${from}&to=${to}`);
      const payload = await response.json() as { capacity?: CapacitySnapshot; error?: string };
      if (!response.ok || !payload.capacity) throw new Error(payload.error ?? "No se pudo cargar la capacidad.");
      setCapacity(payload.capacity);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar la capacidad.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const from = dateKey(days[0]);
    const to = dateKey(days[6]);
    let active = true;
    fetch(`/api/capacity?from=${from}&to=${to}`).then((response) => response.json()).then((payload: { capacity?: CapacitySnapshot; error?: string }) => {
      if (!active) return;
      if (!payload.capacity) throw new Error(payload.error ?? "No se pudo cargar la capacidad.");
      setCapacity(payload.capacity);
      setError("");
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo cargar la capacidad."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const selected = capacity?.days.find((day) => day.date === selectedDate);
  const sawmills = providers.filter((provider) => provider.type === "Aserradero");
  const transporters = providers.filter((provider) => provider.type === "Transporte");

  const save = async (url: string, body: unknown) => {
    setError("");
    try { await put(url, body); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
  };

  const moveWeek = (offset: number) => {
    const next = new Date(week);
    next.setDate(week.getDate() + offset * 7);
    setLoading(true);
    setWeek(next);
    setSelectedDate(dateKey(next));
  };

  return <section className="capacity-page" aria-labelledby="capacity-title">
    <div className="module-surface capacity-week">
      <div className="module-toolbar capacity-toolbar">
        <div><h2 id="capacity-title">Capacidad semanal</h2><small>Producción y transporte en palets</small></div>
        <div className="calendar-week-controls">
          <button type="button" onClick={() => moveWeek(-1)} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
          <strong>{formatRange(week)}</strong>
          <button type="button" onClick={() => moveWeek(1)} aria-label="Semana siguiente"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="capacity-days" role="tablist" aria-label="Seleccionar día">
        {days.map((day) => {
          const key = dateKey(day);
          const summary = capacity?.days.find((item) => item.date === key);
          const committed = summary?.transportTotals.committed ?? 0;
          return <button key={key} type="button" role="tab" aria-selected={selectedDate === key} className={`${selectedDate === key ? "selected" : ""} ${key === dateKey(today) ? "today" : ""}`} onClick={() => setSelectedDate(key)}>
            <small>{new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(day)}</small>
            <strong>{day.getDate()}</strong>
            <em>{number.format(committed)} palets</em>
          </button>;
        })}
      </div>
    </div>

    {error && <p className="capacity-error" role="alert">{error}</p>}
    {loading && !capacity ? <div className="module-surface capacity-loading">Cargando capacidad…</div> : selected && <>
      <InternalProduction day={selected} rules={capacity?.rules ?? []} onSave={save} />
      <ExternalProduction day={selected} providers={sawmills} onSave={save} />
      <TransportCapacity day={selected} providers={transporters} onSave={save} />
    </>}
  </section>;
}

function InternalProduction({ day, rules, onSave }: { day: CapacityDay; rules: CapacitySnapshot["rules"]; onSave: (url: string, body: unknown) => Promise<void> }) {
  return <section className="module-surface capacity-section" aria-labelledby="internal-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Factory size={20} /></div><div><h2 id="internal-title">Producción interna</h2><small>Dotación, reglas y carga comprometida</small></div></div>
    <div className="capacity-operation-grid">
      {day.internalProduction.map((summary) => <InternalOperation key={`${day.date}-${summary.operation}`} date={day.date} summary={summary} rules={rules.filter((rule) => rule.operation === summary.operation)} onSave={onSave} />)}
    </div>
  </section>;
}

function InternalOperation({ date, summary, rules, onSave }: { date: string; summary: CapacityDay["internalProduction"][number]; rules: CapacitySnapshot["rules"]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [people, setPeople] = useState(String(summary.peopleCount));
  const [manual, setManual] = useState("");
  const [rulePeople, setRulePeople] = useState("");
  const [ruleCapacity, setRuleCapacity] = useState("");
  const hasCapacity = summary.capacity !== undefined;
  return <article className="capacity-operation-card">
    <header><Users size={18} /><h3>{capacityOperationLabels[summary.operation]}</h3></header>
    <div className="capacity-metrics">
      <Metric label="Capacidad" value={hasCapacity ? number.format(summary.capacity!) : "Sin calcular"} />
      <Metric label="Comprometidos" value={number.format(summary.committed)} />
      <Metric label={summary.overload > 0 ? "Sobrecarga" : "Disponibles"} value={number.format(summary.overload > 0 ? summary.overload : summary.available ?? 0)} tone={summary.overload > 0 ? "danger" : undefined} />
    </div>
    {!hasCapacity && summary.committed > 0 && <p className="capacity-warning"><AlertTriangle size={16} />Hay pedidos asignados y la capacidad aún no está calculada.</p>}
    <form className="capacity-inline-form" onSubmit={(event) => { event.preventDefault(); void onSave("/api/capacity/internal-production", { date, operation: summary.operation, peopleCount: Number(people), manualCapacity: manual === "" ? null : Number(manual) }); }}>
      <label>Personas<input type="number" min="0" step="1" value={people} onChange={(event) => setPeople(event.target.value)} required /></label>
      <label>Ajuste del día<input type="number" min="0" step="1" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Opcional" /></label>
      <button type="submit" aria-label={`Guardar ${capacityOperationLabels[summary.operation]}`}><Save size={17} /></button>
    </form>
    <details className="capacity-rules"><summary>Reglas por personas ({rules.length})</summary>
      {rules.length > 0 && <ul>{rules.map((rule) => <li key={rule.peopleCount}>{rule.peopleCount} personas → {number.format(rule.palletCapacity)} palets</li>)}</ul>}
      <form onSubmit={(event) => { event.preventDefault(); void onSave("/api/capacity/rules", { operation: summary.operation, peopleCount: Number(rulePeople), palletCapacity: Number(ruleCapacity) }); setRulePeople(""); setRuleCapacity(""); }}>
        <label>Personas<input type="number" min="0" step="1" value={rulePeople} onChange={(event) => setRulePeople(event.target.value)} required /></label>
        <label>Palets/día<input type="number" min="0" step="1" value={ruleCapacity} onChange={(event) => setRuleCapacity(event.target.value)} required /></label>
        <button type="submit">Guardar regla</button>
      </form>
    </details>
  </article>;
}

function ExternalProduction({ day, providers, onSave }: { day: CapacityDay; providers: Provider[]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void onSave("/api/capacity/external-production", { date: day.date, providerId: form.get("providerId"), operation: form.get("operation"), palletCapacity: Number(form.get("palletCapacity")), status: form.get("status") });
  };
  return <section className="module-surface capacity-section" aria-labelledby="external-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Factory size={20} /></div><div><h2 id="external-title">Producción externa</h2><small>Capacidad por aserradero y operación</small></div></div>
    {day.externalProduction.length > 0 ? <div className="capacity-table"><div className="capacity-table-heading"><div>Aserradero</div><div>Operación</div><div>Estado</div><div>Capacidad</div><div>Comprometidos</div><div>Saldo</div></div>{day.externalProduction.map((entry) => <div className="capacity-table-row" key={`${entry.providerId}-${entry.operation}`}><strong>{entry.providerName}</strong><div>{capacityOperationLabels[entry.operation]}</div><div>{entry.palletCapacity === undefined ? "Sin cargar" : entry.status === "confirmed" ? "Confirmada" : "Estimada"}</div><div>{entry.palletCapacity === undefined ? "Sin cargar" : number.format(entry.palletCapacity)}</div><div>{number.format(entry.committed)}</div><div className={entry.overload > 0 ? "overload" : ""}>{entry.palletCapacity === undefined ? "Sin calcular" : entry.overload > 0 ? `-${number.format(entry.overload)}` : number.format(entry.available ?? 0)}</div></div>)}</div> : <p className="capacity-empty">No hay capacidad externa cargada para este día.</p>}
    {day.imports.length > 0 && <div className="capacity-imports"><strong>Ingresos previstos por importación</strong>{day.imports.map((entry) => <article key={entry.orderId}><div><small>Cliente</small><b>{entry.client}</b></div><div><small>Palets</small><b>{number.format(entry.pallets)}</b></div></article>)}</div>}
    <form className="capacity-add-form" onSubmit={submit}>
      <label>Aserradero<select name="providerId" required defaultValue=""><option value="" disabled>Seleccionar</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
      <label>Operación<select name="operation" defaultValue="assembly">{operations.map((operation) => <option key={operation} value={operation}>{capacityOperationLabels[operation]}</option>)}</select></label>
      <label>Capacidad<input name="palletCapacity" type="number" min="0" step="1" required /></label>
      <label>Estado<select name="status" defaultValue="estimated"><option value="estimated">Estimada</option><option value="confirmed">Confirmada</option></select></label>
      <button type="submit" className="primary-button">Guardar capacidad</button>
    </form>
  </section>;
}

function TransportCapacity({ day, providers, onSave }: { day: CapacityDay; providers: Provider[]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [source, setSource] = useState<TransportSource>("internal");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void onSave("/api/capacity/transport", { date: day.date, source, providerId: source === "external" ? form.get("providerId") : undefined, palletCapacity: Number(form.get("palletCapacity")), status: source === "internal" ? "confirmed" : form.get("status") as CapacityStatus });
  };
  return <section className="module-surface capacity-section" aria-labelledby="transport-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Truck size={20} /></div><div><h2 id="transport-title">Transporte</h2><small>Capacidad disponible para las entregas del día</small></div></div>
    <div className="capacity-summary-strip">
      <Metric label="Palets a entregar" value={number.format(day.transportTotals.committed)} />
      <Metric label="Capacidad interna" value={number.format(day.transportTotals.internal)} />
      <Metric label="Externa confirmada" value={number.format(day.transportTotals.externalConfirmed)} />
      <Metric label="Externa estimada" value={number.format(day.transportTotals.externalEstimated)} />
      <Metric label="Faltante" value={number.format(day.transportTotals.missing)} tone={day.transportTotals.missing > 0 ? "danger" : undefined} />
    </div>
    {day.transport.length > 0 && <div className="transport-cards">{day.transport.map((entry) => <article key={`${entry.source}-${entry.providerId ?? "internal"}`}><Truck size={18} /><div><small>{entry.status === "confirmed" ? "Confirmada" : "Estimada"}</small><strong>{entry.providerName}</strong><p>{number.format(entry.committed)} asignados de {number.format(entry.palletCapacity)}</p></div><b className={entry.overload > 0 ? "overload" : ""}>{entry.overload > 0 ? `${number.format(entry.overload)} sobre` : `${number.format(entry.available)} libres`}</b></article>)}</div>}
    <form className="capacity-add-form" onSubmit={submit}>
      <label>Origen<select value={source} onChange={(event) => setSource(event.target.value as TransportSource)}><option value="internal">Transporte interno</option><option value="external">Transportista externo</option></select></label>
      {source === "external" && <label>Transportista<select name="providerId" required defaultValue=""><option value="" disabled>Seleccionar</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
      <label>Capacidad<input name="palletCapacity" type="number" min="0" step="1" required /></label>
      {source === "external" && <label>Estado<select name="status" defaultValue="estimated"><option value="estimated">Estimada</option><option value="confirmed">Confirmada</option></select></label>}
      <button type="submit" className="primary-button">Guardar capacidad</button>
    </form>
  </section>;
}
