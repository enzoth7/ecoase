"use client";

import { AlertTriangle, Factory, Plus, Settings2, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CapacityDay, CapacitySnapshot } from "./capacity";
import type { CapacityStatus, Product, Provider, TransportSource } from "./data";
import type { ProductionAssignmentSummary, ProductionResource, ProductionResourceDay } from "./production-capacity";
import { AsyncButton, FieldError, LoadingState, ModalShell, WeekNavigator } from "./components/ui";
import ClientProductionRules from "./components/ClientProductionRules";
import ProductionResultModal, { type RecordedProductionResult } from "./components/ProductionResultModal";
import { canonicalProductName } from "./classification";

const number = new Intl.NumberFormat("es-UY");
const resourceTypeLabels: Record<ProductionResource["resourceType"], string> = {
  external_supplier: "Proveedor externo",
  internal_crew: "Cuadrilla interna",
  internal_factory: "Fábrica interna",
};

type ProductionTableRow = {
  date: string;
  entry?: ProductionResourceDay;
  assignment: ProductionAssignmentSummary;
};

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function startOfWeek(date: Date) { const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()); value.setDate(value.getDate() - (value.getDay() + 6) % 7); return value; }
function formatRange(start: Date) { const end = new Date(start); end.setDate(start.getDate() + 6); const format = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" }); return `${format.format(start)} – ${format.format(end)}`; }
function formatDate(date: string, long = false) { return new Intl.DateTimeFormat("es-UY", long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`)); }
function displayProductName(value: string) { return canonicalProductName(value); }

function ResourceModal({ capacity, providers, onClose, onSaved }: { capacity: CapacitySnapshot; providers: Provider[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [type, setType] = useState<ProductionResource["resourceType"]>("internal_crew");
  const mutate = async (body: unknown) => { setSaving(true); setError(""); const response = await fetch("/api/capacity/resources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo actualizar."); await onSaved(); };
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const providerId = String(form.get("providerId") ?? ""); const response = await fetch("/api/capacity/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), resourceType: type, providerId: type === "external_supplier" ? providerId : undefined, displayOrder: form.get("displayOrder") }) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo crear el recurso."); await onSaved(); };
  return <ModalShell title="Gestionar recursos" onClose={onClose}><div className="production-resource-manager"><div className="production-resource-manager-list">{capacity.production.resources.map((resource) => <div key={resource.id}><div><strong>{resource.name}</strong><small>{resource.resourceType === "internal_factory" ? "Fábrica" : resource.resourceType === "internal_crew" ? "Cuadrilla" : "Proveedor externo"}</small></div><button type="button" className={resource.active ? "resource-active" : ""} disabled={saving} onClick={() => void mutate({ id: resource.id, active: !resource.active })}>{resource.active ? "Activo" : "Inactivo"}</button></div>)}</div><form onSubmit={submit} className="production-modal-form"><h3>Agregar recurso</h3><label>Nombre<input name="name" required /></label><label>Tipo<select value={type} onChange={(event) => setType(event.target.value as ProductionResource["resourceType"])}><option value="internal_crew">Cuadrilla interna</option><option value="internal_factory">Fábrica interna</option><option value="external_supplier">Proveedor externo</option></select></label>{type === "external_supplier" && <label>Proveedor<select name="providerId" required defaultValue=""><option value="" disabled>Seleccionar</option>{providers.filter((provider) => provider.type === "Aserradero").map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}<label>Orden<input name="displayOrder" type="number" min="0" defaultValue="100" required /></label><FieldError id="resource-error">{error}</FieldError><div className="modal-actions"><AsyncButton type="submit" className="primary-button" loading={saving}><Plus size={15} />Agregar</AsyncButton></div></form></div></ModalShell>;
}

export function GeneralTransport({ capacity, providers, onSave }: { capacity: CapacitySnapshot; providers: Provider[]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [source, setSource] = useState<TransportSource>("internal"); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); try { await onSave("/api/capacity/transport", { source, providerId: source === "external" ? form.get("providerId") : undefined, tripCapacity: Number(form.get("tripCapacity")), status: source === "internal" ? "confirmed" : form.get("status") as CapacityStatus }); } finally { setSaving(false); } };
  const configured = capacity.transportDefaults.filter((entry) => entry.tripCapacity !== undefined);
  return <section className="module-surface capacity-section capacity-transport" aria-labelledby="transport-title"><div className="capacity-section-heading"><div className="capacity-icon"><Truck size={20} /></div><div><h2 id="transport-title">Transporte</h2><small>Cupos de viaje habituales por día</small></div></div>{configured.length ? <div className="capacity-table"><div className="capacity-table-heading general"><div>Origen</div><div>Estado</div><div>Cupos diarios</div><div>Tipo</div></div>{configured.map((entry) => <div className="capacity-table-row general" key={`${entry.source}-${entry.providerId ?? "internal"}`}><strong>{entry.source === "internal" ? "Camiones propios" : providers.find((provider) => provider.id === entry.providerId)?.name ?? "Transportista"}</strong><div>{entry.status === "confirmed" ? "Confirmado" : "Estimado"}</div><div>{number.format(entry.tripCapacity!)} viajes</div><div>{entry.source === "internal" ? "Propio" : "Externo"}</div></div>)}</div> : <p className="capacity-empty">Todavía no hay cupos de viaje configurados.</p>}<form className="capacity-add-form" onSubmit={submit}><label>Origen<select value={source} onChange={(event) => setSource(event.target.value as TransportSource)}><option value="internal">Camiones propios</option><option value="external">Transportista externo</option></select></label>{source === "external" && <label>Transportista<select name="providerId" required defaultValue=""><option value="" disabled>Seleccionar</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}<label>Cupos por día<input name="tripCapacity" type="number" min="0" step="1" required /></label>{source === "external" && <label>Estado<select name="status" defaultValue="estimated"><option value="estimated">Estimado</option><option value="confirmed">Confirmado</option></select></label>}<AsyncButton type="submit" className="primary-button" loading={saving}>Guardar cupos</AsyncButton></form></section>;
}

function TransportAdjustmentRow({ day, entry, onSave }: { day: CapacityDay; entry: CapacityDay["transport"][number]; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [value, setValue] = useState(String(entry.adjustment)); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); try { await onSave("/api/capacity/adjustments", { date: day.date, resourceType: "transport", source: entry.source, providerId: entry.providerId, palletAdjustment: Number(value), responsible: entry.providerName, status: entry.status }); } finally { setSaving(false); } };
  return <article className={`day-adjustment-row ${entry.capacity === undefined || entry.overload > 0 ? "danger" : ""}`}><div className="day-adjustment-name"><strong>{entry.providerName}</strong><small>Base: {entry.baseCapacity === undefined ? "sin definir" : `${number.format(entry.baseCapacity)} palets`}</small></div><div className="capacity-metric" data-kpi="committed"><small>Comprometidos</small><strong>{number.format(entry.committed)}</strong></div><div className={`capacity-metric ${entry.overload > 0 ? "danger" : ""}`} data-kpi={entry.overload > 0 ? "overload" : "day-capacity"}><small>{entry.overload > 0 ? "Sobrecarga" : "Capacidad del día"}</small><strong>{entry.capacity === undefined ? "Sin calcular" : number.format(entry.overload > 0 ? entry.overload : entry.capacity)}</strong></div><form onSubmit={submit}><label>Ajuste del día<input type="number" step="1" value={value} onChange={(event) => setValue(event.target.value)} /><small>0 = sin cambio</small></label><AsyncButton type="submit" loading={saving}>Guardar</AsyncButton></form></article>;
}

export function DayLogisticsAdjustmentModal({ day, transporters, onClose, onSave }: { day: CapacityDay; transporters: Provider[]; onClose: () => void; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [providerId, setProviderId] = useState(""); const [pallets, setPallets] = useState(""); const [status, setStatus] = useState<CapacityStatus>("confirmed"); const [saving, setSaving] = useState(false); const confirmedCapacity = day.transportTotals.internal + day.transportTotals.externalConfirmed;
  const assign = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const provider = transporters.find((item) => item.id === providerId); if (!provider) return; setSaving(true); try { await onSave("/api/capacity/adjustments", { date: day.date, resourceType: "transport", source: "external", providerId, palletAdjustment: Number(pallets), responsible: provider.name, status }); setPallets(""); } finally { setSaving(false); } };
  return <ModalShell title={`Capacidad logística · ${formatDate(day.date)}`} onClose={onClose}><div className="logistics-adjustment-modal">{day.transportTotals.missing > 0 && <div className="capacity-day-alert"><AlertTriangle size={19} /><div><strong>Este día necesita revisión</strong><p>Faltan {number.format(day.transportTotals.missing)} palets de transporte confirmados.</p></div></div>}<div className="capacity-day-summary"><div className="capacity-metric" data-kpi="to-deliver"><small>Palets a entregar</small><strong>{number.format(day.transportTotals.committed)}</strong></div><div className="capacity-metric" data-kpi="confirmed-capacity"><small>Capacidad confirmada</small><strong>{number.format(confirmedCapacity)}</strong></div><div className={`capacity-metric ${day.transportTotals.missing > 0 ? "danger" : ""}`} data-kpi={day.transportTotals.missing > 0 ? "missing-vehicles" : "free-capacity"}><small>{day.transportTotals.missing > 0 ? "Faltan camiones" : "Capacidad libre"}</small><strong>{number.format(day.transportTotals.missing > 0 ? day.transportTotals.missing : Math.max(confirmedCapacity - day.transportTotals.committed, 0))}</strong></div></div><div className="day-adjustment-section day-transport">{day.transport.map((entry) => <TransportAdjustmentRow key={`${entry.source}-${entry.providerId ?? "internal"}`} day={day} entry={entry} onSave={onSave} />)}<form className="day-provider-assignment" onSubmit={assign}><div><strong>Asignar transportista solo para este día</strong><small>No modifica la capacidad general.</small></div><label>Transportista<select value={providerId} onChange={(event) => setProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>Palets asignados<input type="number" min="1" step="1" value={pallets} onChange={(event) => setPallets(event.target.value)} required /></label><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as CapacityStatus)}><option value="confirmed">Confirmada</option><option value="estimated">Estimada</option></select></label><AsyncButton type="submit" loading={saving}>Asignar</AsyncButton></form></div></div></ModalShell>;
}

export default function CapacityView({ providers, products, clients, selectedClientId, focusProductIds = [], validFrom, view = "production", initialDate, onPlan, onResultSaved }: { providers: Provider[]; products: Product[]; clients: Array<{ id?: string; name: string }>; selectedClientId?: string; focusProductIds?: string[]; validFrom?: string; view?: "production" | "resources" | "rules"; initialDate?: string; onPlan?: (orderId: string) => void; onResultSaved?: (assignment: ProductionAssignmentSummary, result: RecordedProductionResult) => void }) {
  const validInitialDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : undefined;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(validInitialDate ? new Date(`${validInitialDate}T12:00:00`) : new Date())); const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [resourceModal, setResourceModal] = useState(false); const [recording, setRecording] = useState<ProductionAssignmentSummary | null>(null);
  const from = dateKey(weekStart); const weekEnd = useMemo(() => { const value = new Date(weekStart); value.setDate(value.getDate() + 6); return value; }, [weekStart]); const to = dateKey(weekEnd);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch(`/api/capacity?from=${from}&to=${to}`); const body = await response.json() as { capacity?: CapacitySnapshot; error?: string }; if (!response.ok || !body.capacity) throw new Error(body.error ?? "No se pudo cargar la capacidad."); setCapacity(body.capacity); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar la capacidad."); } finally { setLoading(false); } }, [from, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const rows = useMemo<ProductionTableRow[]>(() => {
    if (!capacity) return [];
    return capacity.production.days.flatMap<ProductionTableRow>((day) => [
      ...day.resources.flatMap((entry) => entry.assignments.map((assignment): ProductionTableRow => ({ date: day.date, entry, assignment }))),
      ...day.unassigned.map((assignment): ProductionTableRow => ({ date: day.date, entry: undefined, assignment })),
    ]).sort((left, right) => left.date.localeCompare(right.date)
      || Number(left.entry?.resource.resourceType === "external_supplier") - Number(right.entry?.resource.resourceType === "external_supplier")
      || (left.entry?.resource.displayOrder ?? 9999) - (right.entry?.resource.displayOrder ?? 9999)
      || left.assignment.client.localeCompare(right.assignment.client, "es"));
  }, [capacity]);
  const pendingResults = rows.filter((row) => row.assignment.status === "draft" || row.assignment.status === "confirmed").length;
  const moveWeek = (amount: number) => setWeekStart((current) => { const value = new Date(current); value.setDate(value.getDate() + amount * 7); return value; });
  return <section className="production-capacity-page" aria-labelledby="capacity-title">
    {error && <p className="capacity-error" role="alert">{error}</p>}{loading && !capacity && <div className="module-surface capacity-loading"><LoadingState label="Cargando producción" rows={5} /></div>}
    {capacity && view === "production" && <section className="module-surface production-weekly-panel" aria-labelledby="capacity-title">
      <div className="module-toolbar production-weekly-toolbar"><div><h2 id="capacity-title">Producción real</h2><p className="production-week-summary"><span><strong>{pendingResults}</strong> pendientes de registrar</span></p></div><WeekNavigator label={formatRange(weekStart)} onPrevious={() => moveWeek(-1)} onNext={() => moveWeek(1)} /></div>
      <div className="production-real-days">{capacity.production.days.map((day) => {
        const dayRows = rows.filter((row) => row.date === day.date);
        return <section className="production-real-day" key={day.date} aria-label={formatDate(day.date, true)}>
          <h3>{formatDate(day.date, true)}</h3>
          {dayRows.length ? <div className="production-real-list">{dayRows.map((row) => {
            const assignment = row.assignment;
            const completed = assignment.status === "completed";
            return <article className="production-real-item" key={assignment.id}>
              <div className="production-real-main"><strong>{displayProductName(assignment.productName)}</strong><span>{assignment.client}</span><small>{row.entry?.resource.name ?? "Sin productor asignado"}</small></div>
              <div className="production-real-quantities"><span>Planificado<strong>{number.format(assignment.plannedQuantity)}</strong></span><span>Real<strong>{completed ? number.format(assignment.actualQuantity ?? 0) : "Pendiente"}</strong></span></div>
              {completed ? <div className="production-real-outcome"><strong>{assignment.actualQuantity === 0 ? "No se produjo" : assignment.resultDestination === "stock" ? "Stock general" : `Para ${assignment.client}`}</strong>{assignment.actualDate && <small>{formatDate(assignment.actualDate)}</small>}{assignment.pendingQuantity > 0 && <small>Faltaron {number.format(assignment.pendingQuantity)} u. de esta asignación</small>}</div> : <button type="button" className="primary-button" onClick={() => assignment.resourceId ? setRecording(assignment) : onPlan?.(assignment.orderId)}>{assignment.resourceId ? "Registrar resultado" : "Asignar productor"}</button>}
            </article>;
          })}</div> : <p className="production-real-empty">Nada planificado para este día.</p>}
        </section>;
      })}</div>
      {!rows.length && <div className="production-table-empty"><Factory size={24} /><strong>No hay producción asignada esta semana</strong></div>}
    </section>}
    {capacity && view !== "production" && <div className="production-configuration" aria-labelledby="capacity-title">
      {view === "resources" && <section className="module-surface production-config-section"><header><div><h2 id="capacity-title">Recursos</h2><small>Fábrica, cuadrillas y proveedores externos.</small></div><button type="button" className="secondary-button" onClick={() => setResourceModal(true)}><Settings2 size={16} />Gestionar recursos</button></header><div className="production-config-table-wrap"><table><thead><tr><th>Recurso</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>{capacity.production.resources.map((resource) => <tr key={resource.id}><td><strong>{resource.name}</strong></td><td><span className={`production-resource-type ${resource.resourceType}`}>{resourceTypeLabels[resource.resourceType]}</span></td><td><span className={`production-resource-state ${resource.active ? "active" : ""}`}>{resource.active ? "Activo" : "Inactivo"}</span></td></tr>)}</tbody></table></div></section>}
      {view === "rules" && <section className="module-surface production-config-section">
        <header>
          <div>
            <h2 id="capacity-title">Reglas de rendimiento</h2>
            <small>Capacidad normal y máxima de cada producto de un cliente, reutilizable en sus próximos pedidos.</small>
          </div>
        </header>
        <ClientProductionRules clients={clients} catalogProducts={products} capacity={capacity} selectedClientId={selectedClientId} focusProductIds={focusProductIds} validFrom={validFrom} onSaved={load} />
       </section>}

    </div>}
    {resourceModal && capacity && <ResourceModal capacity={capacity} providers={providers} onClose={() => setResourceModal(false)} onSaved={load} />}
    {recording && <ProductionResultModal assignment={recording} onClose={() => setRecording(null)} onSaved={(result) => { onResultSaved?.(recording, result); return load(); }} />}
  </section>;
}
