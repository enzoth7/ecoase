"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Factory, Save, Trash2, Truck, Users, X } from "lucide-react";
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
  const remove = async (url: string, body: unknown) => {
    if (!window.confirm("¿Eliminar esta regla? La capacidad dejará de calcularse para esa cantidad de personas.")) return;
    setError("");
    try {
      const response = await fetch(url, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo eliminar la regla.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo eliminar."); }
  };

  const moveWeek = (offset: number) => {
    const next = new Date(week);
    next.setDate(week.getDate() + offset * 7);
    setOpenDate(null);
    setWeek(next);
  };

  const selected = capacity?.days.find((day) => day.date === openDate);
  const todayTeam = capacity?.days.find((day) => day.date === dateKey(today))?.internalTeam;
  const sawmills = providers.filter((provider) => provider.type === "Aserradero");

  return <section className="capacity-page" aria-labelledby="capacity-title">
    <div className="module-surface capacity-week">
      <div className="module-toolbar capacity-toolbar">
        <div><h2 id="capacity-title">Cap. Producción semanal</h2><small>La capacidad general se aplica todos los días</small></div>
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
            <div className="capacity-day-production">
              <em><strong>{number.format(summary?.productionTotals.committed ?? 0)}</strong> a producir</em>
              {summary?.productionTotals.missing ? <em className="missing"><strong>{number.format(summary.productionTotals.missing)}</strong> faltan</em> : <em><strong>{summary?.productionTotals.available === undefined ? "—" : number.format(summary.productionTotals.available)}</strong> libres</em>}
            </div>
            {hasIssue && <b><AlertTriangle size={12} />Revisar</b>}
          </button>;
        })}
      </div>
    </div>

    {error && <p className="capacity-error" role="alert">{error}</p>}
    {loading && !capacity ? <div className="module-surface capacity-loading">Cargando capacidad…</div> : capacity && <>
      <div className="capacity-general-heading"><div><h2>Cap. Producción general</h2><p>Estos valores se repiten de lunes a domingo. Los cambios excepcionales se cargan desde cada día.</p></div></div>
      <InternalPeopleCapacity team={capacity.internalTeam} todayTeam={todayTeam} onSave={save} />
      <GeneralInternalProduction capacity={capacity} onSave={save} onDelete={remove} />
      <GeneralExternalProduction capacity={capacity} providers={sawmills} onSave={save} />
    </>}

    {selected && capacity && <DayAdjustmentModal day={selected} sawmills={sawmills} onClose={() => setOpenDate(null)} onSave={save} />}
  </section>;
}

function InternalPeopleCapacity({ team, todayTeam, onSave }: { team: CapacitySnapshot["internalTeam"]; todayTeam?: CapacityDay["internalTeam"]; onSave: (url: string, body: unknown) => Promise<void> }) {
  return <section className="module-surface capacity-people" aria-labelledby="team-capacity-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Users size={20} /></div><div><h2 id="team-capacity-title">Personas disponibles</h2><small>Dotación general para producción interna</small></div></div>
    <div className="capacity-people-content">
      <div className="capacity-people-metrics">
        <Metric label="Disponibles" value={team.availablePeople === undefined ? "Sin definir" : `${number.format(team.availablePeople)} personas`} />
        <Metric label={todayTeam ? "Asignadas hoy" : "Asignación diaria"} value={todayTeam ? `${number.format(todayTeam.assignedPeople)} personas` : "Abrí un día"} />
        <Metric label={team.availablePeople === undefined ? "Sin calcular" : todayTeam?.missingPeople ? "Faltan personas" : "Personas libres hoy"} value={team.availablePeople === undefined || !todayTeam ? "—" : `${number.format(todayTeam.missingPeople > 0 ? todayTeam.missingPeople : todayTeam.freePeople ?? 0)} personas`} tone={todayTeam?.missingPeople ? "danger" : undefined} />
      </div>
      <form className="capacity-team-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSave("/api/capacity/team", { availablePeople: Number(form.get("availablePeople")) }); }}>
        <label>Personas disponibles<input name="availablePeople" type="number" min="0" step="1" defaultValue={team.availablePeople ?? ""} required /></label>
        <button type="submit"><Save size={17} />Guardar dotación</button>
      </form>
    </div>
    <p className="capacity-people-note">La dotación habitual de Armado, Marcado y Tratamiento HT se descuenta todos los días. Al abrir un día, podés sumar personas adicionales solo para esa fecha.</p>
  </section>;
}

function GeneralInternalProduction({ capacity, onSave, onDelete }: { capacity: CapacitySnapshot; onSave: (url: string, body: unknown) => Promise<void>; onDelete: (url: string, body: unknown) => Promise<void> }) {
  return <section className="module-surface capacity-section capacity-internal" aria-labelledby="internal-title">
    <div className="capacity-section-heading"><div className="capacity-icon"><Factory size={20} /></div><div><h2 id="internal-title">Producción interna</h2><small>Dotación y capacidad diaria habitual</small></div></div>
    <div className="capacity-operation-grid">
      {operations.map((operation) => <GeneralInternalOperation key={operation} operation={operation} capacity={capacity} onSave={onSave} onDelete={onDelete} />)}
    </div>
  </section>;
}

function GeneralInternalOperation({ operation, capacity, onSave, onDelete }: { operation: CapacityOperation; capacity: CapacitySnapshot; onSave: (url: string, body: unknown) => Promise<void>; onDelete: (url: string, body: unknown) => Promise<void> }) {
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
      {rules.length > 0 && <ul>{rules.map((rule) => <li key={rule.peopleCount}><p>{rule.peopleCount} personas → {number.format(rule.palletCapacity)} palets</p><button type="button" className="capacity-rule-delete" onClick={() => void onDelete("/api/capacity/rules", { operation, peopleCount: rule.peopleCount })} aria-label={`Eliminar regla de ${rule.peopleCount} personas para ${capacityOperationLabels[operation]}`}><Trash2 size={14} />Eliminar</button></li>)}</ul>}
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
  return <section className="module-surface capacity-section capacity-external" aria-labelledby="external-title">
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

export function GeneralTransport({ capacity, providers, onSave }: { capacity: CapacitySnapshot; providers: Provider[]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [source, setSource] = useState<TransportSource>("internal");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSave("/api/capacity/transport", { source, providerId: source === "external" ? form.get("providerId") : undefined, palletCapacity: Number(form.get("palletCapacity")), status: source === "internal" ? "confirmed" : form.get("status") as CapacityStatus });
  };
  return <section className="module-surface capacity-section capacity-transport" aria-labelledby="transport-title">
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

function DayAdjustmentModal({ day, sawmills, onClose, onSave }: { day: CapacityDay; sawmills: Provider[]; onClose: () => void; onSave: (url: string, body: unknown) => Promise<void> }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return <div className="modal-backdrop capacity-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="capacity-day-modal" role="dialog" aria-modal="true" aria-labelledby="day-capacity-title">
      <header><div><small>Capacidad del día</small><h2 id="day-capacity-title">{formatDay(day.date)}</h2><p>Asigná personas y capacidad adicional solo para este día. No se modifica la capacidad general.</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar ajustes"><X size={21} /></button></header>
      {day.issues.length > 0 && <div className="capacity-day-alert"><AlertTriangle size={19} /><div><strong>Este día necesita revisión</strong><p>{day.issues.join(" · ")}</p></div></div>}
      <div className="capacity-day-summary" aria-label="Resumen productivo del día">
        <Metric label="Producción asignada" value={`${number.format(day.productionTotals.committed)} palets`} />
        <Metric label="Capacidad productiva" value={day.productionTotals.capacity === undefined ? "Sin calcular" : `${number.format(day.productionTotals.capacity)} palets`} />
        <Metric label={day.productionTotals.missing > 0 ? "Faltan producir" : "Capacidad libre"} value={`${number.format(day.productionTotals.missing > 0 ? day.productionTotals.missing : day.productionTotals.available ?? 0)} palets`} tone={day.productionTotals.missing > 0 ? "danger" : undefined} />
      </div>

      <section className="day-adjustment-section day-internal" aria-labelledby="day-internal-title"><h3 id="day-internal-title"><Factory size={18} />Producción interna</h3>
        <DayInternalTeamSummary team={day.internalTeam} />
        {day.internalProduction.map((entry) => <AdjustmentRow key={entry.operation} name={capacityOperationLabels[entry.operation]} sourceName="Ecoase" peopleAdditional={entry.peopleAdditional} maxAdditionalPeople={day.internalTeam.availablePeople === undefined ? undefined : Math.max(day.internalTeam.availablePeople - day.internalTeam.basePeople - (day.internalTeam.additionalPeople - entry.peopleAdditional), 0)} baseCapacity={entry.baseCapacity} adjustment={entry.adjustment} committed={entry.committed} capacity={entry.capacity} overload={entry.overload} onSave={(palletAdjustment, responsible, peopleCount) => onSave("/api/capacity/adjustments", { date: day.date, resourceType: "internal_production", operation: entry.operation, palletAdjustment, peopleCount, responsible, status: "confirmed" })} />)}
      </section>

      <section className="day-adjustment-section day-external" aria-labelledby="day-external-title"><h3 id="day-external-title"><Factory size={18} />Producción externa</h3>
        {day.externalProduction.map((entry) => <AdjustmentRow key={`${entry.providerId}-${entry.operation}`} name={`${entry.providerName} · ${capacityOperationLabels[entry.operation]}`} sourceName={entry.providerName} responsible={entry.adjustmentResponsible} baseCapacity={entry.baseCapacity} adjustment={entry.adjustment} committed={entry.committed} capacity={entry.capacity} overload={entry.overload} onSave={(palletAdjustment, responsible) => onSave("/api/capacity/adjustments", { date: day.date, resourceType: "external_production", providerId: entry.providerId, operation: entry.operation, palletAdjustment, responsible, status: entry.status })} />)}
        <DailyProviderAssignment date={day.date} kind="production" providers={sawmills} onSave={onSave} />
      </section>

      {day.imports.length > 0 && <section className="day-adjustment-section imports" aria-labelledby="day-imports-title"><h3 id="day-imports-title">Ingresos por importación</h3>{day.imports.map((entry) => <p key={entry.orderId}><strong>{entry.client}</strong> · {number.format(entry.pallets)} palets</p>)}</section>}
    </section>
  </div>;
}

export function DayLogisticsAdjustmentModal({ day, transporters, onClose, onSave }: { day: CapacityDay; transporters: Provider[]; onClose: () => void; onSave: (url: string, body: unknown) => Promise<void> }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const transportCapacity = day.transportTotals.internal + day.transportTotals.externalConfirmed;
  const missing = day.transportTotals.missing;
  useEffect(() => {
    closeRef.current?.focus();
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return <div className="modal-backdrop capacity-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="capacity-day-modal" role="dialog" aria-modal="true" aria-labelledby="day-logistics-title">
      <header><div><small>Capacidad logística del día</small><h2 id="day-logistics-title">{formatDay(day.date)}</h2><p>Asigná capacidad de transporte solo para este día. No se modifica la capacidad general.</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar ajustes"><X size={21} /></button></header>
      {missing > 0 && <div className="capacity-day-alert"><AlertTriangle size={19} /><div><strong>Este día necesita revisión</strong><p>Faltan {number.format(missing)} palets de transporte confirmados.</p></div></div>}
      <div className="capacity-day-summary" aria-label="Resumen logístico del día">
        <Metric label="Palets a entregar" value={`${number.format(day.transportTotals.committed)} palets`} />
        <Metric label="Capacidad confirmada" value={`${number.format(transportCapacity)} palets`} />
        <Metric label={missing > 0 ? "Faltan camiones" : "Capacidad libre"} value={`${number.format(missing > 0 ? missing : Math.max(transportCapacity - day.transportTotals.committed, 0))} palets`} tone={missing > 0 ? "danger" : undefined} />
      </div>
      <section className="day-adjustment-section day-transport" aria-labelledby="day-transport-title"><h3 id="day-transport-title"><Truck size={18} />Transporte</h3>
        {day.transport.map((entry) => <AdjustmentRow key={`${entry.source}-${entry.providerId ?? "internal"}`} name={entry.providerName} sourceName={entry.providerName} responsible={entry.adjustmentResponsible} baseCapacity={entry.baseCapacity} adjustment={entry.adjustment} committed={entry.committed} capacity={entry.capacity} overload={entry.overload} onSave={(palletAdjustment, responsible) => onSave("/api/capacity/adjustments", { date: day.date, resourceType: "transport", source: entry.source, providerId: entry.providerId, palletAdjustment, responsible, status: entry.status })} />)}
        <DailyProviderAssignment date={day.date} kind="transport" providers={transporters} onSave={onSave} />
      </section>
    </section>
  </div>;
}

function DailyProviderAssignment({ date, kind, providers, onSave }: { date: string; kind: "production" | "transport"; providers: Provider[]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [providerId, setProviderId] = useState("");
  const [operation, setOperation] = useState<CapacityOperation>("assembly");
  const [pallets, setPallets] = useState("");
  const [status, setStatus] = useState<CapacityStatus>("confirmed");
  const [saving, setSaving] = useState(false);
  const label = kind === "production" ? "Asignar aserradero solo para este día" : "Asignar transportista solo para este día";
  const providerLabel = kind === "production" ? "Aserradero" : "Transportista";
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;
    setSaving(true);
    try {
      await onSave("/api/capacity/adjustments", kind === "production"
        ? { date, resourceType: "external_production", providerId, operation, palletAdjustment: Number(pallets), responsible: provider.name, status }
        : { date, resourceType: "transport", source: "external", providerId, palletAdjustment: Number(pallets), responsible: provider.name, status });
      setPallets("");
    } finally { setSaving(false); }
  };
  return <form className="day-provider-assignment" onSubmit={save}>
    <div><strong>{label}</strong><small>Se guarda como capacidad puntual; no modifica la capacidad general.</small></div>
    <label>{providerLabel}<select value={providerId} onChange={(event) => setProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
    {kind === "production" && <label>Operación<select value={operation} onChange={(event) => setOperation(event.target.value as CapacityOperation)}>{operations.map((item) => <option key={item} value={item}>{capacityOperationLabels[item]}</option>)}</select></label>}
    <label>Palets asignados<input type="number" min="1" step="1" value={pallets} onChange={(event) => setPallets(event.target.value)} required /></label>
    <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as CapacityStatus)}><option value="confirmed">Confirmada</option><option value="estimated">Estimada</option></select></label>
    <button type="submit" disabled={saving}><Save size={16} />{saving ? "Guardando" : "Asignar"}</button>
  </form>;
}

function DayInternalTeamSummary({ team }: { team: CapacityDay["internalTeam"] }) {
  const hasTeam = team.availablePeople !== undefined;
  return <div className="day-internal-team-summary">
    <div><small>Dotación total</small><strong>{hasTeam ? `${number.format(team.availablePeople!)} personas` : "Sin definir"}</strong></div>
    <div><small>Dotación habitual</small><strong>{number.format(team.basePeople)} personas</strong></div>
    <div className={team.missingPeople > 0 ? "danger" : ""}><small>{!hasTeam ? "Sin calcular" : team.missingPeople > 0 ? "Faltan personas" : "Libres para refuerzo"}</small><strong>{hasTeam ? `${number.format(team.missingPeople > 0 ? team.missingPeople : team.freePeople ?? 0)} personas` : "—"}</strong></div>
  </div>;
}

function AdjustmentRow({ name, sourceName, responsible, peopleAdditional, maxAdditionalPeople, baseCapacity, adjustment, committed, capacity, overload, onSave }: { name: string; sourceName: string; responsible?: string; peopleAdditional?: number; maxAdditionalPeople?: number; baseCapacity?: number; adjustment: number; committed: number; capacity?: number; overload: number; onSave: (adjustment: number, responsible: string, peopleCount?: number) => Promise<void> }) {
  const [value, setValue] = useState(String(adjustment));
  const [peopleValue, setPeopleValue] = useState(String(peopleAdditional ?? 0));
  const [saving, setSaving] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const assignsPeople = peopleAdditional !== undefined;
  return <article className={`day-adjustment-row ${capacity === undefined || overload > 0 ? "danger" : ""}`}>
    <div className="day-adjustment-name"><strong>{name}</strong><small>Base: {baseCapacity === undefined ? "sin definir" : `${number.format(baseCapacity)} palets`}</small>{responsible && !assignsPeople && <small>Asignado a: {responsible}</small>}</div>
    <Metric label="Comprometidos" value={number.format(committed)} />
    <Metric label={overload > 0 ? "Sobrecarga" : "Capacidad del día"} value={capacity === undefined ? "Sin calcular" : overload > 0 ? number.format(overload) : number.format(capacity)} tone={overload > 0 ? "danger" : undefined} />
    <form onSubmit={async (event) => { event.preventDefault(); const additional = Number(peopleValue); if (assignsPeople && maxAdditionalPeople !== undefined && additional > maxAdditionalPeople) { setPeopleError(`Solo hay ${maxAdditionalPeople} personas libres para refuerzo.`); return; } setPeopleError(""); setSaving(true); try { await onSave(Number(value), sourceName, assignsPeople ? additional : undefined); } finally { setSaving(false); } }}>
      {assignsPeople ? <label>Personas adicionales hoy<input type="number" min="0" max={maxAdditionalPeople} step="1" value={peopleValue} onChange={(event) => { setPeopleValue(event.target.value); setPeopleError(""); }} required /><small>{maxAdditionalPeople === undefined ? "Se suman a la dotación habitual" : `Máximo disponible: ${maxAdditionalPeople}`}</small>{peopleError && <b className="capacity-input-error" role="alert">{peopleError}</b>}</label> : <p className="adjustment-source"><small>Quién aporta</small><strong>{sourceName}</strong></p>}
      <label>Capacidad adicional hoy<input type="number" step="1" placeholder="+ / − palets" value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Cambio de capacidad para ${name}`} /><small>0 = sin cambio</small></label>
      <button type="submit" disabled={saving}><Save size={16} />{saving ? "Guardando" : "Guardar"}</button>
    </form>
  </article>;
}
