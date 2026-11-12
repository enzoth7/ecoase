"use client";

import { AlertTriangle, Factory, Pencil, Plus, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CapacityDay, CapacitySnapshot } from "./capacity";
import type { CapacityStatus, Product, Provider, TransportSource } from "./data";
import type { ProductionAssignmentSummary, ProductionResource, ProductionResourceDay } from "./production-capacity";
import { AsyncButton, FieldError, LoadingState, ModalShell, WeekNavigator } from "./components/ui";
import ClientProductionRules from "./components/ClientProductionRules";
import { canProduceProductKind } from "./production-resource-applicability";
import ProductionResultModal, { type RecordedProductionResult } from "./components/ProductionResultModal";
import { canonicalProductName } from "./classification";

const number = new Intl.NumberFormat("es-UY");
const kindOptions: Array<{ value: "Pallet" | "Bin" | "Piso"; label: string }> = [{ value: "Pallet", label: "Pallets" }, { value: "Bin", label: "Bins" }, { value: "Piso", label: "Pisos" }];
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

function ResourceModal({ resource, providers, onClose, onSaved }: { resource?: ProductionResource; providers: Provider[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [type, setType] = useState<ProductionResource["resourceType"]>(resource?.resourceType ?? "internal_crew");
  const [name, setName] = useState(resource?.name ?? "");
  const [active, setActive] = useState(resource?.active ?? true);
  const [order, setOrder] = useState(String(resource?.displayOrder ?? 100));
  const [providerId, setProviderId] = useState(resource?.providerId ?? "");
  const [kinds, setKinds] = useState<Array<"Pallet" | "Bin" | "Piso">>(() => kindOptions.filter((item) => resource ? canProduceProductKind(resource, item.value) : true).map((item) => item.value));
  const toggleKind = (value: "Pallet" | "Bin" | "Piso") => setKinds((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const call = async (method: "POST" | "PATCH", body: unknown) => {
    const response = await fetch("/api/capacity/resources", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { error?: string; resource?: ProductionResource };
    if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");
    return payload.resource;
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!kinds.length) { setError("Elegí al menos un tipo de producto."); return; }
    setSaving(true); setError("");
    try {
      if (resource) await call("PATCH", { id: resource.id, name, active, displayOrder: Number(order), productKinds: kinds });
      else {
        const created = await call("POST", { name, resourceType: type, providerId: type === "external_supplier" ? providerId : undefined, displayOrder: Number(order) });
        if (created && kinds.length < kindOptions.length) await call("PATCH", { id: created.id, productKinds: kinds });
      }
      await onSaved(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  };
  return <ModalShell title={resource ? "Editar recurso" : "Agregar recurso"} onClose={onClose}>
    <form className="production-result-form" onSubmit={submit}>
      <label>Nombre<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      {!resource && <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as ProductionResource["resourceType"])}><option value="internal_crew">Cuadrilla interna</option><option value="internal_factory">Fábrica interna</option><option value="external_supplier">Proveedor externo</option></select></label>}
      {!resource && type === "external_supplier" && <label>Proveedor<select required value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="" disabled>Seleccionar</option>{providers.filter((provider) => provider.type === "Aserradero").map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
      <fieldset className="resource-kind-picker resource-kind-fieldset"><legend>Producen</legend>{kindOptions.map((item) => <label key={item.value}><input type="checkbox" checked={kinds.includes(item.value)} onChange={() => toggleKind(item.value)} />{item.label}</label>)}</fieldset>
      <label>Orden<input type="number" min="0" required value={order} onChange={(event) => setOrder(event.target.value)} /></label>
      {resource && <label className="resource-kind-picker"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Activo</label>}
      <FieldError id="resource-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar</AsyncButton></div>
    </form>
  </ModalShell>;
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
  const [resourceModal, setResourceModal] = useState<ProductionResource | "new" | null>(null); const [recording, setRecording] = useState<ProductionAssignmentSummary | null>(null);
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
    {capacity && view === "production" && <section className="module-surface production-weekly-panel logistics-panel" aria-labelledby="capacity-title">
      <header><div><h2 id="capacity-title">Producción real</h2><p className="production-week-summary"><span><strong>{pendingResults}</strong> pendientes de registrar</span></p></div><WeekNavigator label={formatRange(weekStart)} onPrevious={() => moveWeek(-1)} onNext={() => moveWeek(1)} /></header>
      {rows.length > 0 && <div className="logistics-real-table production-real-board"><table aria-label="Resultados de producción" data-column-filters="off"><thead><tr><th scope="col">Fecha prevista</th><th scope="col">Producto</th><th scope="col">Cliente</th><th scope="col">Quién produce</th><th scope="col">Planificado</th><th scope="col">Real</th><th scope="col">Estado</th><th scope="col">Resultado</th></tr></thead><tbody>
        {rows.map((row) => {
          const assignment = row.assignment;
          const completed = assignment.status === "completed";
          return <tr key={assignment.id}>
            <td><time dateTime={row.date}>{formatDate(row.date)}</time></td>
            <td><strong>{displayProductName(assignment.productName)}</strong></td>
            <td>{assignment.client}</td>
            <td>{row.entry?.resource.name ?? "Sin productor asignado"}</td>
            <td>{number.format(assignment.plannedQuantity)}</td>
            <td>{completed ? number.format(assignment.actualQuantity ?? 0) : "Pendiente"}</td>
            <td><span className={`logistics-status ${!completed ? "yellow" : assignment.actualQuantity === 0 ? "red" : assignment.resultDestination === "stock" ? "yellow" : "green"}`}>{completed ? (assignment.actualQuantity === 0 ? "No se produjo" : assignment.resultDestination === "stock" ? "Stock" : "Producido") : "Planificado"}</span></td>
            <td>{completed ? <span>Registrado{assignment.actualDate && <small>{formatDate(assignment.actualDate)}</small>}{assignment.pendingQuantity > 0 && <small>Faltaron {number.format(assignment.pendingQuantity)} u. de esta asignación</small>}</span> : <button type="button" className="secondary-button" onClick={() => assignment.resourceId ? setRecording(assignment) : onPlan?.(assignment.orderId)}>{assignment.resourceId ? "Registrar resultado" : "Asignar productor"}</button>}</td>
          </tr>;
        })}
      </tbody></table></div>}
      {!rows.length && <div className="production-table-empty"><Factory size={24} /><strong>No hay producción asignada esta semana</strong></div>}
    </section>}
    {capacity && view !== "production" && <div className="production-configuration" aria-labelledby="capacity-title">
      {view === "resources" && <section className="module-surface production-config-section"><header><div><h2 id="capacity-title">Recursos</h2><small>Fábrica, cuadrillas y proveedores externos.</small></div><button type="button" className="primary-button resource-add-button" onClick={() => setResourceModal("new")}><Plus size={16} aria-hidden="true" />Agregar recurso</button></header><div className="production-config-table-wrap"><table data-column-filters="off"><thead><tr><th>Recurso</th><th>Tipo</th><th>Producen</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{capacity.production.resources.map((resource) => { const produces = kindOptions.filter((item) => canProduceProductKind(resource, item.value)); return <tr key={resource.id}><td><strong>{resource.name}</strong></td><td><span className={`production-resource-type ${resource.resourceType}`}>{resourceTypeLabels[resource.resourceType]}</span></td><td><span className="production-resource-kinds">{produces.length === kindOptions.length ? "Todos" : produces.map((item) => item.label).join(" · ")}</span></td><td><span className={`production-resource-state ${resource.active ? "active" : ""}`}>{resource.active ? "Activo" : "Inactivo"}</span></td><td className="planned-actions"><button type="button" className="od-icon-button" onClick={() => setResourceModal(resource)} aria-label={`Editar ${resource.name}`} title="Editar"><Pencil size={17} aria-hidden="true" /></button></td></tr>; })}</tbody></table></div></section>}
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
    {resourceModal && capacity && <ResourceModal resource={resourceModal === "new" ? undefined : resourceModal} providers={providers} onClose={() => setResourceModal(null)} onSaved={load} />}
    {recording && <ProductionResultModal assignment={recording} onClose={() => setRecording(null)} onSaved={(result) => { onResultSaved?.(recording, result); return load(); }} />}
  </section>;
}
