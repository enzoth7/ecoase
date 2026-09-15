"use client";

import { AlertTriangle, CheckCircle2, Factory, Gauge, Pencil, Plus, Save, Settings2, Trash2, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CapacityDay, CapacitySnapshot } from "./capacity";
import type { CapacityStatus, Product, Provider, TransportSource } from "./data";
import type { ProductionAssignmentSummary, ProductionCapacityRule, ProductionLoadStatus, ProductionResource, ProductionResourceDay } from "./production-capacity";
import { AsyncButton, FieldError, LoadingState, ModalShell, WeekNavigator } from "./components/ui";
import ProductionTabs from "./components/ProductionTabs";
import ProductionMatrixTable from "./components/ProductionMatrixTable";

const number = new Intl.NumberFormat("es-UY");
const statusLabels: Record<ProductionLoadStatus, string> = {
  normal: "Dentro de capacidad",
  stretched: "Por encima de lo habitual",
  overloaded: "Capacidad máxima excedida",
  missing_rule: "Sin capacidad configurada",
  unavailable: "Recurso no disponible",
};

const staffingLabels: Partial<Record<ProductionLoadStatus, string>> = {
  stretched: "Revisar dotación o pedir apoyo",
  overloaded: "Requiere ayuda o redistribución",
  unavailable: "Reasignar recurso",
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
function formatWeekday(date: string) { const label = new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(new Date(`${date}T12:00:00`)); return label.replace(".", ""); }
function sameId(left: number | string | undefined, right: number | string | undefined) { return left !== undefined && right !== undefined && String(left) === String(right); }
function displayProductName(value: string) { return value.replace(/tratamiento\s+térmico/giu, "Marcado").replace(/tratamiento/giu, "Marcado").replace(/\bHT\b/gu, "Marcado"); }
function configurationTypeLabel(value?: string) { return value?.replace(/\s*[×x]\s*\d+\s*$/iu, "").trim(); }

function LoadBadge({ status }: { status: ProductionLoadStatus }) {
  const Icon = status === "normal" ? CheckCircle2 : AlertTriangle;
  return <span className={`production-load-badge ${status}`}><Icon size={14} aria-hidden="true" />{statusLabels[status]}</span>;
}

function RuleModal({ capacity, rule, onClose, onSaved }: { capacity: CapacitySnapshot; rule?: ProductionCapacityRule; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const today = dateKey(new Date());
  const activeResources = capacity.production.resources.filter((resource) => resource.active);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/capacity/rules", { method: rule ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: rule?.id, resourceId: form.get("resourceId"), productId: form.get("productId"), peopleCount: form.get("peopleCount"), configurationLabel: form.get("configurationLabel"), normalUnitsPerDay: form.get("normalUnitsPerDay"), maximumUnitsPerDay: form.get("maximumUnitsPerDay"), validFrom: form.get("validFrom"), validTo: form.get("validTo"), source: form.get("source"), note: form.get("note") }) });
    const body = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(body.error ?? "No se pudo guardar la regla."); await onSaved(); onClose();
  };
  return <ModalShell title={rule ? "Editar regla de rendimiento" : "Nueva regla de capacidad"} onClose={onClose}><form onSubmit={submit} className="production-modal-form">
    <p className="modal-context">{rule ? "Modificá los valores de esta regla." : "Define el rendimiento de un producto para un recurso y una configuración. No reemplaza reglas históricas."}</p>
    <label>Recurso<select name="resourceId" required defaultValue={String(rule?.resourceId ?? "")}><option value="" disabled>Seleccionar</option>{activeResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
    <label>Producto<select name="productId" required defaultValue={rule?.productId ?? ""}><option value="" disabled>Seleccionar</option>{capacity.production.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    <label>Personas<input name="peopleCount" type="number" min="1" step="1" placeholder="Si aplica" defaultValue={rule?.peopleCount} /></label>
    <label>Configuración<input name="configurationLabel" required placeholder="Ej. Fábrica ×2" defaultValue={rule?.configurationLabel} /></label>
    <label>Normal por día<input name="normalUnitsPerDay" type="number" min="1" step="1" required defaultValue={rule?.normalUnitsPerDay} /></label>
    <label>Máximo por día<input name="maximumUnitsPerDay" type="number" min="1" step="1" required defaultValue={rule?.maximumUnitsPerDay} /></label>
    <label>Vigente desde<input name="validFrom" type="date" defaultValue={rule?.validFrom ?? today} required /></label>
    <label>Vigente hasta<input name="validTo" type="date" defaultValue={rule?.validTo ?? ""} /></label>
    <label>Fuente<input name="source" defaultValue={rule?.source ?? "manual"} required /></label>
    <label className="field-wide">Observación<textarea name="note" rows={3} placeholder="Referencia de planilla o aclaración" defaultValue={rule?.note ?? ""} /></label>
    <FieldError id="rule-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>{rule ? "Guardar cambios" : "Guardar regla"}</AsyncButton></div>
  </form></ModalShell>;
}

function DeleteRuleModal({ rule, onClose, onDeleted }: { rule: ProductionCapacityRule; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false); const [error, setError] = useState("");
  const remove = async () => {
    setDeleting(true); setError("");
    const response = await fetch(`/api/capacity/rules?id=${encodeURIComponent(String(rule.id))}`, { method: "DELETE" });
    const body = await response.json() as { error?: string };
    setDeleting(false);
    if (!response.ok) return setError(body.error ?? "No se pudo eliminar la regla.");
    await onDeleted(); onClose();
  };
  return <ModalShell title="Eliminar regla de rendimiento" onClose={onClose}>
    <div className="production-delete-rule">
      <p>Se eliminará la regla de <strong>{rule.productName}</strong> para <strong>{rule.configurationLabel}</strong>.</p>
      <p>Esta acción no se puede deshacer.</p>
      <FieldError id="delete-rule-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={deleting}>Cancelar</button><AsyncButton type="button" className="delete-button" loading={deleting} loadingLabel="Eliminando…" onClick={() => void remove()}>Eliminar regla</AsyncButton></div>
    </div>
  </ModalShell>;
}

function ResourceModal({ capacity, providers, onClose, onSaved }: { capacity: CapacitySnapshot; providers: Provider[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [type, setType] = useState<ProductionResource["resourceType"]>("internal_crew");
  const mutate = async (body: unknown) => { setSaving(true); setError(""); const response = await fetch("/api/capacity/resources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo actualizar."); await onSaved(); };
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const providerId = String(form.get("providerId") ?? ""); const response = await fetch("/api/capacity/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), resourceType: type, providerId: type === "external_supplier" ? providerId : undefined, displayOrder: form.get("displayOrder") }) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo crear el recurso."); await onSaved(); };
  return <ModalShell title="Gestionar recursos" onClose={onClose}><div className="production-resource-manager"><div className="production-resource-manager-list">{capacity.production.resources.map((resource) => <div key={resource.id}><div><strong>{resource.name}</strong><small>{resource.resourceType === "internal_factory" ? "Fábrica" : resource.resourceType === "internal_crew" ? "Cuadrilla" : "Proveedor externo"}</small></div><button type="button" className={resource.active ? "resource-active" : ""} disabled={saving} onClick={() => void mutate({ id: resource.id, active: !resource.active })}>{resource.active ? "Activo" : "Inactivo"}</button></div>)}</div><form onSubmit={submit} className="production-modal-form"><h3>Agregar recurso</h3><label>Nombre<input name="name" required /></label><label>Tipo<select value={type} onChange={(event) => setType(event.target.value as ProductionResource["resourceType"])}><option value="internal_crew">Cuadrilla interna</option><option value="internal_factory">Fábrica interna</option><option value="external_supplier">Proveedor externo</option></select></label>{type === "external_supplier" && <label>Proveedor<select name="providerId" required defaultValue=""><option value="" disabled>Seleccionar</option>{providers.filter((provider) => provider.type === "Aserradero").map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}<label>Orden<input name="displayOrder" type="number" min="0" defaultValue="100" required /></label><FieldError id="resource-error">{error}</FieldError><div className="modal-actions"><AsyncButton type="submit" className="primary-button" loading={saving}><Plus size={15} />Agregar</AsyncButton></div></form></div></ModalShell>;
}

function OverrideModal({ date, entry, capacity, onClose, onSaved }: { date: string; entry: ProductionResourceDay; capacity: CapacitySnapshot; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [available, setAvailable] = useState(entry.available); const rules = capacity.production.rules.filter((rule) => sameId(rule.resourceId, entry.resource.id) && rule.validFrom <= date && (!rule.validTo || rule.validTo >= date));
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const ruleId = String(form.get("capacityRuleId") ?? ""); const rule = rules.find((item) => String(item.id) === ruleId); const response = await fetch("/api/capacity/daily-overrides", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, resourceId: entry.resource.id, capacityRuleId: ruleId || undefined, productId: rule?.productId, normalUnitsPerDay: form.get("normalUnitsPerDay"), maximumUnitsPerDay: form.get("maximumUnitsPerDay"), available, externalStatus: entry.resource.resourceType === "external_supplier" ? form.get("externalStatus") : undefined, reason: form.get("reason"), responsible: form.get("responsible") }) }); const body = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(body.error ?? "No se pudo guardar el ajuste."); await onSaved(); onClose(); };
  return <ModalShell title={`Ajustar ${entry.resource.name} · ${formatDate(date)}`} onClose={onClose}><form onSubmit={submit} className="production-modal-form"><label className="production-availability-toggle"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} /><span>Recurso disponible</span></label>{entry.resource.resourceType === "external_supplier" && <label>Estado externo<select name="externalStatus" defaultValue={entry.externalStatus}><option value="estimated">Estimado</option><option value="confirmed">Confirmado</option></select></label>}<label className="field-wide">Regla a ajustar<select name="capacityRuleId" defaultValue=""><option value="">Solo disponibilidad / estado</option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.productName} · {rule.configurationLabel}</option>)}</select></label><label>Normal para este día<input name="normalUnitsPerDay" type="number" min="1" /></label><label>Máximo para este día<input name="maximumUnitsPerDay" type="number" min="1" /></label><label>Motivo<input name="reason" required placeholder="Mantenimiento, clima, ausencia…" /></label><label>Responsable<input name="responsible" required /></label><FieldError id="override-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar ajuste</AsyncButton></div></form></ModalShell>;
}

function ConfirmModal({ assignment, capacity, onClose, onSaved }: { assignment: ProductionAssignmentSummary; capacity: CapacitySnapshot; onClose: () => void; onSaved: () => Promise<void> }) {
  const rules = capacity.production.rules.filter((rule) => assignment.applicableRuleIds.some((id) => sameId(id, rule.id))); const [ruleId, setRuleId] = useState(String(rules[0]?.id ?? "")); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const rule = rules.find((item) => String(item.id) === ruleId); if (!rule) return setError("No hay una regla vigente para confirmar."); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch(`/api/production-allocations/${assignment.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceId: rule.resourceId, capacityRuleId: rule.id, overloadNote: form.get("overloadNote") }) }); const body = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(body.error ?? "No se pudo confirmar."); await onSaved(); onClose(); };
  return <ModalShell title="Confirmar asignación" onClose={onClose}><form onSubmit={submit} className="production-modal-form"><p className="modal-context"><strong>{assignment.client}</strong> · {assignment.productName} · {number.format(assignment.plannedQuantity)} unidades</p><label className="field-wide">Regla vigente<select value={ruleId} onChange={(event) => setRuleId(event.target.value)} required><option value="" disabled>Seleccionar</option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.configurationLabel} · normal {number.format(rule.normalUnitsPerDay)} / máximo {number.format(rule.maximumUnitsPerDay)}</option>)}</select></label><label className="field-wide">Nota de sobrecarga<textarea name="overloadNote" rows={3} placeholder="Obligatoria si la carga supera el rendimiento normal" /></label>{!rules.length && <p className="form-error" role="alert">Este producto no tiene una regla vigente para el recurso y la fecha.</p>}<FieldError id="confirm-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving} disabled={!rules.length}>Confirmar capacidad</AsyncButton></div></form></ModalShell>;
}

function CompleteModal({ assignment, onClose, onSaved }: { assignment: ProductionAssignmentSummary; onClose: () => void; onSaved: () => Promise<void> }) {
  const [actual, setActual] = useState(assignment.plannedQuantity); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch(`/api/production-allocations/${assignment.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualQuantity: actual, completionNote: form.get("completionNote") }) }); const body = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(body.error ?? "No se pudo registrar la producción."); await onSaved(); onClose(); };
  return <ModalShell title="Registrar producción real" onClose={onClose}><form onSubmit={submit} className="production-modal-form"><p className="modal-context"><strong>{assignment.productName}</strong> · planificadas {number.format(assignment.plannedQuantity)}</p><label>Cantidad real<input type="number" min="0" max={assignment.plannedQuantity} step="1" value={actual} onChange={(event) => setActual(Number(event.target.value))} required /></label><label className="field-wide">Detalle de diferencia<textarea name="completionNote" rows={3} required={actual !== assignment.plannedQuantity} placeholder={actual !== assignment.plannedQuantity ? "Explique por qué queda saldo pendiente" : "Observación opcional"} /></label>{actual < assignment.plannedQuantity && <p className="production-balance-note">Quedarán {number.format(assignment.plannedQuantity - actual)} unidades pendientes para replanificar.</p>}<FieldError id="complete-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar resultado</AsyncButton></div></form></ModalShell>;
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
  return <article className={`day-adjustment-row ${entry.capacity === undefined || entry.overload > 0 ? "danger" : ""}`}><div className="day-adjustment-name"><strong>{entry.providerName}</strong><small>Base: {entry.baseCapacity === undefined ? "sin definir" : `${number.format(entry.baseCapacity)} palets`}</small></div><div className="capacity-metric"><small>Comprometidos</small><strong>{number.format(entry.committed)}</strong></div><div className={`capacity-metric ${entry.overload > 0 ? "danger" : ""}`}><small>{entry.overload > 0 ? "Sobrecarga" : "Capacidad del día"}</small><strong>{entry.capacity === undefined ? "Sin calcular" : number.format(entry.overload > 0 ? entry.overload : entry.capacity)}</strong></div><form onSubmit={submit}><label>Ajuste del día<input type="number" step="1" value={value} onChange={(event) => setValue(event.target.value)} /><small>0 = sin cambio</small></label><AsyncButton type="submit" loading={saving}>Guardar</AsyncButton></form></article>;
}

export function DayLogisticsAdjustmentModal({ day, transporters, onClose, onSave }: { day: CapacityDay; transporters: Provider[]; onClose: () => void; onSave: (url: string, body: unknown) => Promise<void> }) {
  const [providerId, setProviderId] = useState(""); const [pallets, setPallets] = useState(""); const [status, setStatus] = useState<CapacityStatus>("confirmed"); const [saving, setSaving] = useState(false); const confirmedCapacity = day.transportTotals.internal + day.transportTotals.externalConfirmed;
  const assign = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const provider = transporters.find((item) => item.id === providerId); if (!provider) return; setSaving(true); try { await onSave("/api/capacity/adjustments", { date: day.date, resourceType: "transport", source: "external", providerId, palletAdjustment: Number(pallets), responsible: provider.name, status }); setPallets(""); } finally { setSaving(false); } };
  return <ModalShell title={`Capacidad logística · ${formatDate(day.date)}`} onClose={onClose}><div className="logistics-adjustment-modal">{day.transportTotals.missing > 0 && <div className="capacity-day-alert"><AlertTriangle size={19} /><div><strong>Este día necesita revisión</strong><p>Faltan {number.format(day.transportTotals.missing)} palets de transporte confirmados.</p></div></div>}<div className="capacity-day-summary"><div className="capacity-metric"><small>Palets a entregar</small><strong>{number.format(day.transportTotals.committed)}</strong></div><div className="capacity-metric"><small>Capacidad confirmada</small><strong>{number.format(confirmedCapacity)}</strong></div><div className={`capacity-metric ${day.transportTotals.missing > 0 ? "danger" : ""}`}><small>{day.transportTotals.missing > 0 ? "Faltan camiones" : "Capacidad libre"}</small><strong>{number.format(day.transportTotals.missing > 0 ? day.transportTotals.missing : Math.max(confirmedCapacity - day.transportTotals.committed, 0))}</strong></div></div><div className="day-adjustment-section day-transport">{day.transport.map((entry) => <TransportAdjustmentRow key={`${entry.source}-${entry.providerId ?? "internal"}`} day={day} entry={entry} onSave={onSave} />)}<form className="day-provider-assignment" onSubmit={assign}><div><strong>Asignar transportista solo para este día</strong><small>No modifica la capacidad general.</small></div><label>Transportista<select value={providerId} onChange={(event) => setProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>Palets asignados<input type="number" min="1" step="1" value={pallets} onChange={(event) => setPallets(event.target.value)} required /></label><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as CapacityStatus)}><option value="confirmed">Confirmada</option><option value="estimated">Estimada</option></select></label><AsyncButton type="submit" loading={saving}>Asignar</AsyncButton></form></div></div></ModalShell>;
}

export default function CapacityView({ providers, products = [], view = "production", initialDate }: { providers: Provider[]; products?: Product[]; view?: "production" | "configuration"; initialDate?: string }) {
  const validInitialDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : undefined;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(validInitialDate ? new Date(`${validInitialDate}T12:00:00`) : new Date())); const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null); const [selectedDate, setSelectedDate] = useState(() => validInitialDate ?? dateKey(new Date())); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [ruleModal, setRuleModal] = useState<ProductionCapacityRule | "new" | null>(null); const [deletingRule, setDeletingRule] = useState<ProductionCapacityRule | null>(null); const [resourceModal, setResourceModal] = useState(false); const [overrideEntry, setOverrideEntry] = useState<ProductionResourceDay | null>(null); const [confirming, setConfirming] = useState<ProductionAssignmentSummary | null>(null); const [completing, setCompleting] = useState<ProductionAssignmentSummary | null>(null);
  const [rulesViewMode, setRulesViewMode] = useState<"matrix" | "individual">("matrix");
  const [ruleResourceFilter, setRuleResourceFilter] = useState(""); const [ruleProductFilter, setRuleProductFilter] = useState(""); const [ruleConfigurationFilter, setRuleConfigurationFilter] = useState("");
  const from = dateKey(weekStart); const weekEnd = useMemo(() => { const value = new Date(weekStart); value.setDate(value.getDate() + 6); return value; }, [weekStart]); const to = dateKey(weekEnd);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch(`/api/capacity?from=${from}&to=${to}`); const body = await response.json() as { capacity?: CapacitySnapshot; error?: string }; if (!response.ok || !body.capacity) throw new Error(body.error ?? "No se pudo cargar la capacidad."); setCapacity(body.capacity); setSelectedDate((current) => current >= from && current <= to ? current : from); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar la capacidad."); } finally { setLoading(false); } }, [from, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const selected = capacity?.production.days.find((day) => day.date === selectedDate);
  const exceptionCounts = useMemo(() => { const counts = new Map<string, number>(); capacity?.production.overrides.forEach((entry) => counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1)); return counts; }, [capacity]);
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
  const pendingConfirmation = rows.filter((row) => row.assignment.status === "draft").length;
  const capacityAlerts = rows.filter((row) => !row.entry || row.entry.status !== "normal").length;
  const staffingAlerts = rows.filter((row) => row.entry?.resource.resourceType !== "external_supplier" && (row.entry?.status === "stretched" || row.entry?.status === "overloaded" || row.entry?.status === "unavailable")).length;
  const ruleFilterOptions = useMemo(() => {
    const rules = capacity?.production.rules ?? [];
    const resourceNames = new Map((capacity?.production.resources ?? []).map((resource) => [String(resource.id), resource.name]));
    const resources = Array.from(new Map(rules.map((rule) => [String(rule.resourceId), resourceNames.get(String(rule.resourceId)) ?? "Recurso"])).entries()).sort((left, right) => left[1].localeCompare(right[1], "es"));
    const products = Array.from(new Map(rules.map((rule) => [rule.productId, rule.productName])).entries()).sort((left, right) => left[1].localeCompare(right[1], "es"));
    const configurations = Array.from(new Set(rules.map((rule) => configurationTypeLabel(rule.configurationLabel)).filter((label): label is string => Boolean(label)))).sort((left, right) => left.localeCompare(right, "es"));
    return { resources, products, configurations };
  }, [capacity]);
  const visibleRules = useMemo(() => (capacity?.production.rules ?? []).filter((rule) => (!ruleResourceFilter || String(rule.resourceId) === ruleResourceFilter) && (!ruleProductFilter || rule.productId === ruleProductFilter) && (!ruleConfigurationFilter || configurationTypeLabel(rule.configurationLabel) === ruleConfigurationFilter)), [capacity, ruleConfigurationFilter, ruleProductFilter, ruleResourceFilter]);
  const moveWeek = (amount: number) => setWeekStart((current) => { const value = new Date(current); value.setDate(value.getDate() + amount * 7); return value; });
  return <section className="production-capacity-page" aria-labelledby="capacity-title">
    <ProductionTabs current={view === "configuration" ? "configuration" : "production"} />
    {error && <p className="capacity-error" role="alert">{error}</p>}{loading && !capacity && <div className="module-surface capacity-loading"><LoadingState label="Cargando producción" rows={5} /></div>}
    {capacity && view === "production" && <section className="module-surface production-weekly-panel" aria-labelledby="capacity-title">
      <div className="module-toolbar production-weekly-toolbar"><div><h2 id="capacity-title">Producción semanal</h2><p className="production-week-summary"><span><strong>{rows.length}</strong> asignaciones</span><span><strong>{pendingConfirmation}</strong> sin confirmar</span><span className={capacityAlerts ? "danger" : ""}><strong>{capacityAlerts}</strong> alertas de capacidad</span><span className={staffingAlerts ? "danger" : ""}><strong>{staffingAlerts}</strong> requieren apoyo</span></p></div><WeekNavigator label={formatRange(weekStart)} onPrevious={() => moveWeek(-1)} onNext={() => moveWeek(1)} /></div>
      <div className="production-weekly-table-wrap"><table className="production-weekly-table"><thead><tr><th>Fecha</th><th>Origen / recurso</th><th>Cliente / pedido</th><th>Producto</th><th>Palets planificados</th><th>Personas</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rows.map((row) => {
        const loadStatus = row.entry?.status;
        const needsRule = row.assignment.status === "draft" && row.assignment.applicableRuleIds.length === 0;
        const origin = row.entry?.resource.resourceType === "external_supplier" ? "Externa" : row.entry ? "Interna" : "Sin asignar";
        const staffingCopy = loadStatus && row.entry?.resource.resourceType !== "external_supplier" ? staffingLabels[loadStatus] : undefined;
        return <tr key={`${row.date}-${row.assignment.id}`} className={!row.entry || (loadStatus && loadStatus !== "normal") ? "has-alert" : ""}><td><strong>{formatDate(row.date)}</strong></td><td><strong>{row.entry?.resource.name ?? "Sin recurso"}</strong><small>{origin}</small></td><td><strong>{row.assignment.client}</strong><small>{row.assignment.orderReference || `Pedido ${row.assignment.orderId}`}</small></td><td>{displayProductName(row.assignment.productName)}</td><td className="numeric-cell"><strong>{number.format(row.assignment.actualQuantity ?? row.assignment.plannedQuantity)}</strong>{row.assignment.actualQuantity !== undefined && <small>de {number.format(row.assignment.plannedQuantity)}</small>}</td><td className="production-people-cell"><strong>{row.assignment.peopleCount ? number.format(row.assignment.peopleCount) : "—"}</strong><small>{configurationTypeLabel(row.assignment.configurationLabel) ?? (row.assignment.status === "draft" ? "A confirmar" : "Sin regla")}</small></td><td>{!row.entry ? <span className="production-load-badge missing_rule"><AlertTriangle size={14} />Sin asignar</span> : <LoadBadge status={loadStatus!} />}{staffingCopy && <small className="production-staffing-alert">{staffingCopy}</small>}{row.assignment.status === "completed" && <small className="production-row-state">Completada</small>}</td><td className="production-table-action">{row.assignment.status === "draft" && !needsRule && row.entry ? <button type="button" className="secondary-button" onClick={() => setConfirming(row.assignment)}>Confirmar</button> : row.assignment.status === "draft" && needsRule ? <a className="secondary-button" href="/produccion?vista=configuracion">Configurar</a> : row.assignment.status === "confirmed" ? <button type="button" className="secondary-button" onClick={() => setCompleting(row.assignment)}>Registrar producción</button> : row.assignment.status === "completed" && row.assignment.pendingQuantity > 0 ? <small>Saldo {number.format(row.assignment.pendingQuantity)}</small> : <span aria-hidden="true">—</span>}</td></tr>;
      })}</tbody></table>{!rows.length && <div className="production-table-empty"><Factory size={24} /><strong>No hay producción asignada esta semana</strong></div>}</div>
    </section>}
    {capacity && view === "configuration" && <div className="production-configuration" aria-labelledby="capacity-title">
      <section className="module-surface production-config-section"><header><div><h2 id="capacity-title">Recursos</h2><small>Fábrica, cuadrillas y proveedores externos.</small></div><button type="button" className="secondary-button" onClick={() => setResourceModal(true)}><Settings2 size={16} />Gestionar recursos</button></header><div className="production-config-table-wrap"><table><thead><tr><th>Recurso</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>{capacity.production.resources.map((resource) => <tr key={resource.id}><td><strong>{resource.name}</strong></td><td>{resource.resourceType === "internal_factory" ? "Fábrica interna" : resource.resourceType === "internal_crew" ? "Cuadrilla interna" : "Proveedor externo"}</td><td><span className={`production-resource-state ${resource.active ? "active" : ""}`}>{resource.active ? "Activo" : "Inactivo"}</span></td></tr>)}</tbody></table></div></section>
      <section className="module-surface production-config-section">
        <header>
          <div>
            <h2>Reglas de rendimiento</h2>
            <small>Capacidad normal y máxima por recurso, producto y configuración.</small>
          </div>
          <div className="production-config-header-actions">
            <div className="matrix-view-toggle" role="group" aria-label="Modo de vista de reglas">
              <button
                type="button"
                className={`matrix-toggle-btn ${rulesViewMode === "matrix" ? "active" : ""}`}
                onClick={() => setRulesViewMode("matrix")}
              >
                Planilla
              </button>
              <button
                type="button"
                className={`matrix-toggle-btn ${rulesViewMode === "individual" ? "active" : ""}`}
                onClick={() => setRulesViewMode("individual")}
              >
                Reglas individuales
              </button>
            </div>
            {rulesViewMode === "individual" ? (
              <button type="button" className="primary-button" onClick={() => setRuleModal("new")}><Plus size={16} />Nueva regla</button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={() => window.dispatchEvent(new CustomEvent("ecoase:save-matrix-rules"))}
              >
                <Save size={16} />
                Guardar reglas
              </button>
            )}
          </div>
        </header>
        {rulesViewMode === "matrix" ? (
          <ProductionMatrixTable products={products} onSaved={load} />
        ) : (
          <div className="production-config-table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="production-rule-filter-cell"><label className="production-rule-filter"><span className="sr-only">Filtrar reglas por recurso</span><select aria-label="Filtrar reglas por recurso" value={ruleResourceFilter} onChange={(event) => setRuleResourceFilter(event.target.value)}><option value="">Recurso</option>{ruleFilterOptions.resources.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label></th>
                  <th className="production-rule-filter-cell"><label className="production-rule-filter"><span className="sr-only">Filtrar reglas por producto</span><select aria-label="Filtrar reglas por producto" value={ruleProductFilter} onChange={(event) => setRuleProductFilter(event.target.value)}><option value="">Producto</option>{ruleFilterOptions.products.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label></th>
                  <th className="production-rule-filter-cell"><label className="production-rule-filter"><span className="sr-only">Filtrar reglas por configuración</span><select aria-label="Filtrar reglas por configuración" value={ruleConfigurationFilter} onChange={(event) => setRuleConfigurationFilter(event.target.value)}><option value="">Configuración</option>{ruleFilterOptions.configurations.map((configuration) => <option value={configuration} key={configuration}>{configuration}</option>)}</select></label></th>
                  <th className="production-rule-people-heading">Personas</th>
                  <th>Normal</th>
                  <th>Máximo</th>
                  <th>Vigencia</th>
                  <th className="production-rule-actions-heading">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleRules.map((rule) => <tr key={rule.id}><td>{capacity.production.resources.find((resource) => sameId(resource.id, rule.resourceId))?.name ?? "Recurso"}</td><td><strong>{rule.productName}</strong></td><td>{configurationTypeLabel(rule.configurationLabel) || "—"}</td><td className="production-rule-people-cell"><strong>{rule.peopleCount ? number.format(rule.peopleCount) : "—"}</strong></td><td>{number.format(rule.normalUnitsPerDay)}</td><td>{number.format(rule.maximumUnitsPerDay)}</td><td>{formatDate(rule.validFrom)}{rule.validTo ? ` – ${formatDate(rule.validTo)}` : " – vigente"}</td><td><div className="production-rule-actions"><button type="button" className="production-rule-edit" aria-label={`Editar regla de ${rule.productName}`} title="Editar regla" onClick={() => setRuleModal(rule)}><Pencil size={18} aria-hidden="true" /></button><button type="button" className="production-rule-delete" aria-label={`Eliminar regla de ${rule.productName}`} title="Eliminar regla" onClick={() => setDeletingRule(rule)}><Trash2 size={18} aria-hidden="true" /></button></div></td></tr>)}
              </tbody>
            </table>
            {!visibleRules.length && <div className="production-table-empty"><Gauge size={24} /><strong>{capacity.production.rules.length ? "No hay reglas para esos filtros" : "No hay reglas cargadas"}</strong></div>}
          </div>
        )}
      </section>
      <section className="module-surface production-config-section production-exceptions-section">
        <header><div><h2>Excepciones por fecha</h2><small>Cambios puntuales de disponibilidad o capacidad que reemplazan la configuración habitual solamente ese día.</small></div><WeekNavigator label={formatRange(weekStart)} onPrevious={() => moveWeek(-1)} onNext={() => moveWeek(1)} /></header>
        <div className="production-exception-week-wrap">
          <div className="production-exception-week" role="tablist" aria-label="Excepciones de la semana">
            {capacity.production.days.map((day) => {
              const count = exceptionCounts.get(day.date) ?? 0;
              const active = day.date === selectedDate;
              return <button key={day.date} type="button" role="tab" aria-selected={active} aria-controls="production-exception-detail" className={`${active ? "selected" : ""} ${count ? "has-exceptions" : ""}`} onClick={() => setSelectedDate(day.date)}><span>{formatWeekday(day.date)}</span><strong>{new Date(`${day.date}T12:00:00`).getDate()}</strong><small>{count ? `${count} ${count === 1 ? "excepción" : "excepciones"}` : "Sin excepciones"}</small></button>;
            })}
          </div>
        </div>
        <div id="production-exception-detail" className="production-exception-detail" role="tabpanel">
          <div className="production-config-table-wrap"><table><thead><tr><th>Recurso</th><th>Disponibilidad</th><th>Excepción</th><th>Responsable</th><th>Acción</th></tr></thead><tbody>{selected?.resources.map((entry) => <tr key={entry.resource.id}><td><strong>{entry.resource.name}</strong></td><td>{entry.available ? "Disponible" : "No disponible"}</td><td>{entry.override?.reason ?? "Sin excepción"}</td><td>{entry.override?.responsible ?? "—"}</td><td><button type="button" className="secondary-button" onClick={() => setOverrideEntry(entry)}>Ajustar</button></td></tr>)}</tbody></table></div>
        </div>
      </section>
    </div>}
    {ruleModal && capacity && <RuleModal capacity={capacity} rule={ruleModal === "new" ? undefined : ruleModal} onClose={() => setRuleModal(null)} onSaved={load} />}{deletingRule && <DeleteRuleModal rule={deletingRule} onClose={() => setDeletingRule(null)} onDeleted={load} />}{resourceModal && capacity && <ResourceModal capacity={capacity} providers={providers} onClose={() => setResourceModal(false)} onSaved={load} />}{overrideEntry && capacity && <OverrideModal date={selectedDate} entry={overrideEntry} capacity={capacity} onClose={() => setOverrideEntry(null)} onSaved={load} />}{confirming && capacity && <ConfirmModal assignment={confirming} capacity={capacity} onClose={() => setConfirming(null)} onSaved={load} />}{completing && <CompleteModal assignment={completing} onClose={() => setCompleting(null)} onSaved={load} />}
  </section>;
}
