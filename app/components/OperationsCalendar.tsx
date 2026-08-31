"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  GripVertical,
  MoreVertical,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import type { CapacityDay, CapacitySnapshot } from "../capacity";
import type { CapacityStatus, RescheduleReason, Shipment, ShipmentStatus, TransportSource } from "../data";
import { AsyncButton, FieldError, ModalShell, StatusBadge, WeekNavigator } from "./ui";

type CalendarShipment = Shipment & {
  client: string;
  reference: string;
  requestedDeliveryDate?: string;
  totalQuantity: number;
  productLines: string[];
  productSummary: string;
  treatmentSummary: string;
  stockRisks: Array<{ product: string; level: "red" | "orange" | "yellow"; available: number; daysToBreak?: number }>;
};
type TransporterOption = { id: string; name: string };
type CalendarPayload = { from: string; to: string; calendar: CalendarShipment[]; capacity: CapacitySnapshot; transporters: TransporterOption[] };
type CalendarViewMode = "week" | "month";
type RescheduleSelection = { shipment: CalendarShipment; targetDate?: string; dragged: boolean };

const shipmentLabels: Record<ShipmentStatus, string> = { planned: "Planificado", ready: "Pronto", loaded: "Cargado", dispatched: "En viaje", delivered: "Entregado", cancelled: "Cancelado" };
const reasonLabels: Record<RescheduleReason, string> = { production: "Producción", logistics: "Logística", client: "Cliente", weather: "Clima / lluvia", other: "Otro" };
const nextState: Partial<Record<ShipmentStatus, ShipmentStatus>> = { planned: "ready", ready: "loaded", loaded: "dispatched", dispatched: "delivered" };
const logisticsActionLabels: Partial<Record<ShipmentStatus, string>> = { planned: "Cargar remito y dejar pronto", ready: "Marcar cargado", loaded: "Confirmar salida", dispatched: "Confirmar entrega" };
const number = new Intl.NumberFormat("es-UY");

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function startOfWeek(date: Date) { const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()); value.setDate(value.getDate() - (value.getDay() + 6) % 7); return value; }
function endOfWeek(date: Date) { const value = startOfWeek(date); value.setDate(value.getDate() + 6); return value; }
function startOfMonthGrid(date: Date) { return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1)); }
function endOfMonthGrid(date: Date) { return endOfWeek(new Date(date.getFullYear(), date.getMonth() + 1, 0)); }
function capitalize(value: string) { return value.charAt(0).toLocaleUpperCase("es") + value.slice(1); }
function formatRange(start: Date) { const end = new Date(start); end.setDate(start.getDate() + 6); const format = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" }); return `${format.format(start)} – ${format.format(end)}`; }
function formatMonth(date: Date) { return capitalize(new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(date)); }
function formatShortDate(date: string) { return new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`)); }
function daysBetween(start: Date, end: Date) {
  const days: Array<{ date: Date; key: string }> = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    days.push({ date, key: dateKey(date) });
  }
  return days;
}

function useShipmentRange(start: Date, end: Date) {
  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const from = dateKey(start);
  const to = dateKey(end);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/calendar?from=${from}&to=${to}`);
      const body = await response.json() as CalendarPayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el calendario.");
      setPayload(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el calendario.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { payload, error, loading, load };
}

function useShipmentWeek(weekStart: Date) {
  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  return useShipmentRange(weekStart, weekEnd);
}

function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <StatusBadge label={shipmentLabels[status]} tone={status === "delivered" ? "completado" : status === "dispatched" || status === "loaded" ? "logistica" : status === "ready" ? "produccion" : status === "cancelled" ? "cancelado" : "negociacion"} />;
}

function HabitualTripCapacityModal({ capacity, transporters, onClose, onSaved }: { capacity: CapacitySnapshot; transporters: TransporterOption[]; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState<TransportSource>("internal");
  const [providerId, setProviderId] = useState("");
  const [tripCapacity, setTripCapacity] = useState("");
  const [status, setStatus] = useState<CapacityStatus>("confirmed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const configured = capacity.transportDefaults.filter((entry) => entry.tripCapacity !== undefined);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/capacity/transport", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, providerId: source === "external" ? providerId : undefined, tripCapacity: Number(tripCapacity), status: source === "internal" ? "confirmed" : status }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron guardar los cupos.");
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron guardar los cupos.");
    } finally {
      setSaving(false);
    }
  };
  return <ModalShell title="Configurar cupos habituales" description="Definí cuántos viajes se pueden realizar por día. No se convierten pallets en viajes." className="logistics-capacity-modal" onClose={onClose}>
    <div className="trip-capacity-current" aria-label="Cupos configurados">
      {configured.length ? configured.map((entry) => <div key={`${entry.source}-${entry.providerId ?? "internal"}`}><span><strong>{entry.source === "internal" ? "Camiones propios" : transporters.find((provider) => provider.id === entry.providerId)?.name ?? "Transportista"}</strong><small>{entry.source === "internal" ? "Propios" : entry.status === "confirmed" ? "Externo confirmado" : "Externo estimado"}</small></span><b>{number.format(entry.tripCapacity!)} {entry.tripCapacity === 1 ? "viaje" : "viajes"}</b></div>) : <p>Los cupos todavía no están configurados.</p>}
    </div>
    <form className="order-operation-form trip-capacity-form" onSubmit={submit}>
      <div className="order-dialog-fields">
        <label><span>Origen</span><select value={source} onChange={(event) => { setSource(event.target.value as TransportSource); setProviderId(""); setStatus(event.target.value === "internal" ? "confirmed" : "estimated"); }}><option value="internal">Camiones propios</option><option value="external">Transportista externo</option></select></label>
        {source === "external" && <label><span>Transportista</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
        <label><span>Cupos de viaje por día</span><input type="number" min="0" step="1" value={tripCapacity} onChange={(event) => setTripCapacity(event.target.value)} placeholder="Ej. 5" required /></label>
        {source === "external" && <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as CapacityStatus)}><option value="confirmed">Confirmado</option><option value="estimated">Estimado</option></select></label>}
      </div>
      <FieldError id="trip-capacity-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar cupos</AsyncButton></div>
    </form>
  </ModalShell>;
}

function DailyTripCapacityModal({ day, transporters, onClose, onSaved }: { day: CapacityDay; transporters: TransporterOption[]; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState<TransportSource>("internal");
  const [providerId, setProviderId] = useState("");
  const internal = day.transport.find((entry) => entry.source === "internal");
  const [tripCapacity, setTripCapacity] = useState(internal?.tripCapacity === undefined ? "" : String(internal.tripCapacity));
  const [status, setStatus] = useState<CapacityStatus>("confirmed");
  const [responsible, setResponsible] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectSource = (next: TransportSource) => {
    setSource(next); setProviderId(""); setStatus(next === "internal" ? "confirmed" : "estimated");
    const entry = day.transport.find((item) => item.source === next && next === "internal");
    setTripCapacity(entry?.tripCapacity === undefined ? "" : String(entry.tripCapacity));
  };
  const selectProvider = (next: string) => {
    setProviderId(next);
    const entry = day.transport.find((item) => item.source === "external" && item.providerId === next);
    setTripCapacity(entry?.tripCapacity === undefined ? "" : String(entry.tripCapacity));
    setStatus(entry?.status ?? "estimated");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/capacity/trip-adjustments", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: day.date, source, providerId: source === "external" ? providerId : undefined, tripCapacity: Number(tripCapacity), responsible, status }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la excepción.");
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la excepción.");
    } finally { setSaving(false); }
  };
  return <ModalShell title={`Cupos del ${formatShortDate(day.date)}`} description="Este cambio afecta solamente al día seleccionado." className="logistics-capacity-modal" onClose={onClose}>
    <div className="trip-day-summary"><div><small>Viajes asignados</small><strong>{number.format(day.transportTotals.tripsCommitted)}</strong></div><div><small>Cupos disponibles</small><strong>{day.transportTotals.tripCapacity === undefined ? "Sin configurar" : number.format(day.transportTotals.tripsAvailable ?? 0)}</strong></div></div>
    <form className="order-operation-form trip-capacity-form" onSubmit={submit}>
      <div className="order-dialog-fields">
        <label><span>Origen</span><select value={source} onChange={(event) => selectSource(event.target.value as TransportSource)}><option value="internal">Camiones propios</option><option value="external">Transportista externo</option></select></label>
        {source === "external" && <label><span>Transportista</span><select value={providerId} onChange={(event) => selectProvider(event.target.value)} required><option value="" disabled>Seleccionar</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
        <label><span>Cupos disponibles ese día</span><input type="number" min="0" step="1" value={tripCapacity} onChange={(event) => setTripCapacity(event.target.value)} required /></label>
        {source === "external" && <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as CapacityStatus)}><option value="confirmed">Confirmado</option><option value="estimated">Estimado</option></select></label>}
        <label className="field-wide"><span>Responsable</span><input value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Quién registra el cambio" required /></label>
      </div>
      <FieldError id="trip-day-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar excepción</AsyncButton></div>
    </form>
  </ModalShell>;
}

function RescheduleModal({ shipment, suggestedDate, dragged, onClose, onSaved }: { shipment: CalendarShipment; suggestedDate?: string; dragged?: boolean; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState<RescheduleReason>(dragged ? "logistics" : "production");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const targetDate = suggestedDate ?? shipment.plannedDate;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/shipments/${shipment.id}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newDate: form.get("newDate"), reason, note: form.get("note"), responsible: dragged ? "Calendario · arrastre" : "Calendario operativo" }),
    });
    const body = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "No se pudo reprogramar.");
    onSaved();
  };
  return <ModalShell
    title={dragged ? "Confirmar cambio de fecha" : "Reprogramar entrega"}
    description={dragged ? "Revisá el nuevo día y registrá por qué cambia la entrega." : "Elegí la nueva fecha y dejá registrado el motivo del cambio."}
    className="reschedule-modal"
    onClose={onClose}
  ><form className="reschedule-form" onSubmit={submit}>
    <div className="modal-context reschedule-summary">
      <div className="reschedule-shipment">
        <span className="reschedule-summary-icon" aria-hidden="true"><CalendarClock size={18} /></span>
        <span><strong>{shipment.client}</strong><small>{number.format(shipment.totalQuantity)} palets</small></span>
      </div>
      {dragged && suggestedDate ? <div className="reschedule-date-change"><small>Cambio de entrega</small><strong>{formatShortDate(shipment.plannedDate)} <span aria-hidden="true">→</span> {formatShortDate(suggestedDate)}</strong></div> : <div className="reschedule-date-change"><small>Fecha actual</small><strong>{formatShortDate(shipment.plannedDate)}</strong></div>}
    </div>
    <label><span>Nueva fecha</span><input name="newDate" type="date" defaultValue={targetDate} required /></label>
    <label><span>Motivo</span><select value={reason} onChange={(event) => setReason(event.target.value as RescheduleReason)}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="field-wide"><span>Detalle <small>{reason === "other" ? "Obligatorio" : "Opcional"}</small></span><textarea name="note" rows={3} required={reason === "other"} placeholder={reason === "other" ? "Contanos brevemente el motivo" : "Agregá una observación si hace falta"} /></label>
    <FieldError id="reschedule-error">{error}</FieldError>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar nueva fecha</AsyncButton></div>
  </form></ModalShell>;
}

function TransitionModal({ shipment, onClose, onSaved }: { shipment: CalendarShipment; onClose: () => void; onSaved: () => void }) {
  const status = nextState[shipment.status];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!status) return null;
  const title = status === "ready" ? "Cargar remito" : status === "loaded" ? "Marcar viaje como cargado" : status === "dispatched" ? "Confirmar salida" : "Confirmar entrega";
  const description = status === "ready" ? "Ingresá el número de remito para dejar el viaje pronto para cargar." : status === "loaded" ? "Confirmá que la mercadería ya está cargada en el transporte." : status === "dispatched" ? "Confirmá que el viaje salió hacia el cliente." : "Registrá las cantidades aceptadas por el cliente.";
  const submitLabel = status === "ready" ? "Guardar remito y dejar pronto" : status === "loaded" ? "Marcar cargado" : status === "dispatched" ? "Confirmar salida" : "Confirmar entrega";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const deliveredLines = status === "delivered" ? shipment.lines.map((line) => ({ shipmentLineId: line.id, deliveredQuantity: Number(form.get(`delivered-${line.id}`)) })) : [];
    const response = await fetch(`/api/shipments/${shipment.id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nextStatus: status, remittance: form.get("remittance"), sharedRemittanceReason: form.get("sharedReason"), deliveredLines, responsible: "Calendario operativo" }) });
    const body = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "No se pudo avanzar el viaje.");
    onSaved();
  };
  return <ModalShell title={title} description={description} className="order-operation-modal shipment-transition-modal" onClose={onClose}><form className="order-operation-form shipment-transition-form" onSubmit={submit}>
    <div className="modal-context shipment-transition-summary">
      <span className="shipment-transition-summary-icon" aria-hidden="true"><FileText size={19} /></span>
      <span className="shipment-transition-client"><strong>{shipment.client}</strong><small>{formatShortDate(shipment.plannedDate)} · {number.format(shipment.totalQuantity)} palets</small></span>
      <span className="shipment-transition-state"><small>Cambio de estado</small><strong>{shipmentLabels[shipment.status]} <span aria-hidden="true">→</span> {shipmentLabels[status]}</strong></span>
    </div>
    <div className="order-dialog-fields shipment-transition-fields">
      <label className="field-wide"><span>Número de remito <small>Obligatorio</small></span><input name="remittance" defaultValue={shipment.remittance ?? ""} required placeholder="Ej. 0001-00000603" autoComplete="off" /></label>
      <label className="field-wide"><span>Motivo si el remito se comparte <small>Opcional</small></span><input name="sharedReason" defaultValue={shipment.sharedRemittanceReason ?? ""} placeholder="Completá este campo únicamente si otro viaje usa el mismo remito" /></label>
    </div>
    {status === "delivered" && <fieldset className="order-dialog-section delivered-lines"><legend>Cantidad aceptada por producto</legend>{shipment.lines.map((line) => <label key={line.id}><span><strong>{line.product}</strong><small>{number.format(line.plannedQuantity)} planificados</small></span><input aria-label={`Cantidad aceptada de ${line.product}`} name={`delivered-${line.id}`} type="number" min="0" max={line.plannedQuantity} defaultValue={line.plannedQuantity} required /></label>)}</fieldset>}
    <FieldError id="transition-error">{error}</FieldError>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>{submitLabel}</AsyncButton></div>
  </form></ModalShell>;
}

function ShipmentCard({ shipment, compact = false, onOpen, onReschedule, onAdvance, onDragStart, onDragEnd }: { shipment: CalendarShipment; compact?: boolean; onOpen: (id: string) => void; onReschedule: () => void; onAdvance: () => void; onDragStart?: (event: DragEvent<HTMLElement>) => void; onDragEnd?: () => void }) {
  const movable = ["planned", "ready"].includes(shipment.status);
  const dragDescriptionId = `shipment-drag-${shipment.id}`;
  const treatmentText = shipment.treatmentSummary.trim();
  const remittanceText = shipment.remittance?.trim() ?? "";
  const remittanceIsPlaceholder = remittanceText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").includes("historico no informado");
  const advanceLabel = shipment.status === "planned" ? "Marcar pronto" : nextState[shipment.status] ? `Marcar ${shipmentLabels[nextState[shipment.status]!].toLocaleLowerCase("es")}` : "Avanzar estado";
  return <article className={`shipment-card ${compact ? "compact" : ""} ${movable ? "movable" : "locked"}`} draggable={movable} onDragStart={movable ? onDragStart : undefined} onDragEnd={movable ? onDragEnd : undefined} aria-describedby={movable ? dragDescriptionId : undefined}>
    {movable && <span id={dragDescriptionId} className="sr-only">Se puede arrastrar a otro día. También puede usar el botón Reprogramar.</span>}
    <header>{movable && <span className="shipment-drag-handle" aria-hidden="true" title="Arrastrar a otro día"><GripVertical size={16} /></span>}</header>
    <div className="shipment-client-row"><strong className="shipment-client">{shipment.client}</strong><ShipmentStatusBadge status={shipment.status} /></div>
    {!compact && <div className="shipment-product">{shipment.productLines.map((product, index) => <span key={`${shipment.id}-${index}`}>{product}</span>)}</div>}
    <div className="shipment-facts"><span><Package size={14} />{number.format(shipment.totalQuantity)} palets</span>{compact ? <span><Truck size={14} />{shipment.transportLabel}</span> : <>{treatmentText.toLocaleLowerCase("es") !== "sin marcado" && <span><CheckCircle2 size={14} />{treatmentText}</span>}<span><Truck size={14} />{shipment.transportLabel}</span>{remittanceText && !remittanceIsPlaceholder && <span><FileText size={14} />Remito {remittanceText}</span>}</>}</div>
    {shipment.stockRisks?.length > 0 && <a className="shipment-stock-alert" href="/stock?riesgo=alerta" aria-label="Ver productos con alerta de stock"><AlertTriangle size={14} aria-hidden="true" /><span>Alerta de stock</span></a>}
    <div className="shipment-actions" aria-label="Acciones de la entrega"><button type="button" className="shipment-icon-action" onClick={() => onOpen(shipment.orderId)} aria-label={`Ver pedido de ${shipment.client}`} title="Ver pedido"><Search size={18} aria-hidden="true" /></button>{movable && <button type="button" className="shipment-icon-action" onClick={onReschedule} aria-label={`Reprogramar entrega de ${shipment.client}`} title="Reprogramar"><CalendarClock size={18} aria-hidden="true" /></button>}{!compact && nextState[shipment.status] && <button type="button" className="shipment-icon-action shipment-primary-action" onClick={onAdvance} aria-label={`${advanceLabel}: ${shipment.client}`} title={advanceLabel}><CheckCircle2 size={19} aria-hidden="true" /></button>}</div>
  </article>;
}

export function OperationsCalendarView({ onOpen, onAdd, onChanged }: { onOpen: (id: string) => void; onAdd: (date: string) => void; onChanged?: (id: string) => void }) {
  const [view, setView] = useState<CalendarViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [rescheduling, setRescheduling] = useState<RescheduleSelection | null>(null);
  const [advancing, setAdvancing] = useState<CalendarShipment | null>(null);
  const [draggedShipmentId, setDraggedShipmentId] = useState<string | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const today = dateKey(new Date());
  const range = useMemo(() => view === "week" ? { start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) } : { start: startOfMonthGrid(anchorDate), end: endOfMonthGrid(anchorDate) }, [anchorDate, view]);
  const days = useMemo(() => daysBetween(range.start, range.end), [range.start, range.end]);
  const { payload, error, loading, load } = useShipmentRange(range.start, range.end);
  const periodLabel = view === "week" ? formatRange(range.start) : formatMonth(anchorDate);
  const finish = async (orderId: string) => { setRescheduling(null); setAdvancing(null); await load(); onChanged?.(orderId); };
  const movePeriod = (direction: -1 | 1) => setAnchorDate((current) => { const next = new Date(current); if (view === "week") next.setDate(next.getDate() + direction * 7); else { next.setDate(1); next.setMonth(next.getMonth() + direction); } return next; });
  const dropShipment = (targetDate: string, transferredId?: string) => {
    const shipmentId = transferredId || draggedShipmentId;
    const shipment = payload?.calendar.find((item) => String(item.id) === shipmentId);
    setDraggedShipmentId(null);
    setDropTargetDate(null);
    if (!shipment || shipment.plannedDate === targetDate || !["planned", "ready"].includes(shipment.status)) return;
    setRescheduling({ shipment, targetDate, dragged: true });
  };

  return <>
    <section className={`module-surface operations-calendar ${view}-view`} aria-labelledby="calendar-page-title">
      <div className="module-toolbar calendar-toolbar operations-calendar-toolbar">
        <div><h1 id="calendar-page-title">Entregas y capacidad logística</h1><span className="sr-only">Arrastrá una tarjeta para cambiar su fecha. El motivo queda registrado.</span></div>
        <div className="calendar-toolbar-controls"><WeekNavigator label={periodLabel} onPrevious={() => movePeriod(-1)} onNext={() => movePeriod(1)} /><div className="calendar-view-toggle" role="group" aria-label="Vista del calendario"><button type="button" className={view === "week" ? "active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>Semana</button><button type="button" className={view === "month" ? "active" : ""} aria-pressed={view === "month"} onClick={() => setView("month")}>Mes</button></div></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && !payload && <div className="calendar-loading" role="status">Cargando entregas…</div>}
      <div className="operations-calendar-board" aria-label={`${view === "week" ? "Semana" : "Mes"} ${periodLabel}`}>
        {days.map((day) => {
          const shipments = payload?.calendar.filter((item) => item.plannedDate === day.key) ?? [];
          const capacity = payload?.capacity.days.find((item) => item.date === day.key)?.transportTotals;
          const overload = capacity?.tripsMissing ?? 0;
          const configured = capacity?.tripCapacity !== undefined;
          const capacityLabel = !payload
            ? "Cargando…"
            : configured
              ? `${shipments.length} de ${capacity!.tripCapacity} viajes`
              : "Cupos sin configurar";
          const weekday = capitalize(new Intl.DateTimeFormat("es-UY", { weekday: view === "month" ? "narrow" : "short" }).format(day.date));
          const outsideMonth = view === "month" && day.date.getMonth() !== anchorDate.getMonth();
          const isDropTarget = dropTargetDate === day.key;
          return <section key={day.key} className={`operations-calendar-day ${day.key === today ? "today" : ""} ${overload > 0 ? "overload" : ""} ${outsideMonth ? "outside-month" : ""} ${isDropTarget ? "drop-target" : ""}`} aria-label={`${weekday} ${day.date.getDate()}, ${shipments.length} ${shipments.length === 1 ? "viaje" : "viajes"}`} onDragOver={(event) => { if (!draggedShipmentId && !event.dataTransfer.types.includes("text/plain")) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTargetDate(day.key); }} onDrop={(event) => { event.preventDefault(); dropShipment(day.key, event.dataTransfer.getData("text/plain")); }}>
            <header><div><small>{weekday}</small><strong>{day.date.getDate()}</strong></div><div className={`day-capacity ${overload > 0 ? "negative" : "positive"}`}><span className={`day-trip-count ${payload && !configured ? "unavailable" : ""}`}>{capacityLabel}</span></div></header>
            <div className="operations-day-shipments">{shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} compact={view === "month"} onOpen={onOpen} onReschedule={() => setRescheduling({ shipment, dragged: false })} onAdvance={() => setAdvancing(shipment)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(shipment.id)); setDraggedShipmentId(String(shipment.id)); }} onDragEnd={() => { setDraggedShipmentId(null); setDropTargetDate(null); }} />)}{isDropTarget && !shipments.length && <p>Soltar aquí</p>}<button type="button" className="calendar-add-order-button" onClick={() => onAdd(day.key)}><Plus size={15} aria-hidden="true" />Agregar pedidos</button></div>
          </section>;
        })}
      </div>
    </section>
    {rescheduling && <RescheduleModal shipment={rescheduling.shipment} suggestedDate={rescheduling.targetDate} dragged={rescheduling.dragged} onClose={() => setRescheduling(null)} onSaved={() => void finish(rescheduling.shipment.orderId)} />}
    {advancing && <TransitionModal shipment={advancing} onClose={() => setAdvancing(null)} onSaved={() => void finish(advancing.orderId)} />}
  </>;
}

export function OperationsLogisticsView({ onOpen, onChanged }: { onOpen: (id: string) => void; onChanged?: (id: string) => void }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const { payload, error, load } = useShipmentWeek(weekStart);
  const [rescheduling, setRescheduling] = useState<CalendarShipment | null>(null);
  const [advancing, setAdvancing] = useState<CalendarShipment | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [adjustingDay, setAdjustingDay] = useState<CapacityDay | null>(null);
  const today = dateKey(new Date());
  const rows = [...(payload?.calendar ?? [])].sort((a, b) => {
    const priority = (shipment: CalendarShipment) => shipment.status === "delivered" ? 2 : shipment.plannedDate <= today ? 0 : 1;
    return priority(a) - priority(b) || a.plannedDate.localeCompare(b.plannedDate) || a.client.localeCompare(b.client, "es");
  });
  const finish = async (orderId: string) => { setRescheduling(null); setAdvancing(null); await load(); onChanged?.(orderId); };
  return <><section className="module-surface operations-logistics" aria-labelledby="logistics-page-title"><div className="module-toolbar calendar-toolbar"><div><h2 id="logistics-page-title">Logística</h2></div><div className="module-toolbar-actions"><button type="button" className="secondary-button" onClick={() => setConfiguring(true)}><SlidersHorizontal size={17} aria-hidden="true" />Configurar cupos</button><WeekNavigator label={formatRange(weekStart)} onPrevious={() => setWeekStart((current) => { const next = new Date(current); next.setDate(current.getDate() - 7); return next; })} onNext={() => setWeekStart((current) => { const next = new Date(current); next.setDate(current.getDate() + 7); return next; })} /></div></div>{error && <p className="form-error">{error}</p>}{payload && <div className="logistics-capacity-strip" aria-label="Cupos de viaje de la semana">{payload.capacity.days.map((day) => { const totals = day.transportTotals; const issue = totals.tripCapacity === undefined || totals.tripsMissing > 0; return <button key={day.date} type="button" className={`${day.date === today ? "today" : ""} ${issue ? "issue" : ""}`} onClick={() => setAdjustingDay(day)} aria-label={`${formatShortDate(day.date)}: ${totals.tripsCommitted} viajes. ${totals.tripCapacity === undefined ? "Cupos sin configurar" : `${totals.tripsAvailable ?? 0} cupos libres`}`}><small>{capitalize(new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(new Date(`${day.date}T12:00:00`)))}</small><strong>{new Date(`${day.date}T12:00:00`).getDate()}</strong><div><em><b>{totals.tripsCommitted}</b> {totals.tripsCommitted === 1 ? "viaje asignado" : "viajes asignados"}</em>{totals.tripCapacity === undefined ? <mark><AlertTriangle size={13} aria-hidden="true" />Cupos sin configurar</mark> : totals.tripsMissing > 0 ? <em className="missing"><b>{totals.tripsMissing}</b> cupos faltantes</em> : <em><b>{totals.tripsAvailable ?? 0}</b> cupos libres</em>}</div></button>; })}</div>}<div className="shipment-table logistics-queue"><div className="shipment-table-heading"><span>Entrega</span><span>Cliente / productos</span><span>Cantidad</span><span>Transporte / remito</span><span>Estado</span><span>Próxima acción</span></div>{rows.map((shipment) => <article key={shipment.id} className={`shipment-table-row ${shipment.plannedDate < today && shipment.status !== "delivered" ? "overdue" : ""}`}><div><strong>{formatShortDate(shipment.plannedDate)}</strong>{shipment.plannedDate < today && shipment.status !== "delivered" && <small className="logistics-warning">Atrasado</small>}</div><div><strong>{shipment.client}</strong><small>{shipment.productSummary}</small></div><strong>{number.format(shipment.totalQuantity)}</strong><div><strong>{shipment.transportLabel}</strong><small className={!shipment.remittance ? "logistics-warning" : ""}>{shipment.remittance ? `Remito ${shipment.remittance}` : "Remito pendiente"}</small></div><ShipmentStatusBadge status={shipment.status} /><div className="shipment-row-actions logistics-actions">{logisticsActionLabels[shipment.status] && <button type="button" className="primary-button" onClick={() => setAdvancing(shipment)}>{logisticsActionLabels[shipment.status]}</button>}<details><summary aria-label={`Más acciones para ${shipment.client}`}><MoreVertical size={18} /></summary><button type="button" onClick={() => onOpen(shipment.orderId)}><ChevronRight size={15} />Ver pedido</button>{["planned", "ready"].includes(shipment.status) && <button type="button" onClick={() => setRescheduling(shipment)}><CalendarClock size={15} />Reprogramar</button>}</details></div></article>)}{!rows.length && <div className="shipment-table-empty"><Truck size={28} /><strong>No hay viajes esta semana</strong></div>}</div></section>{rescheduling && <RescheduleModal shipment={rescheduling} onClose={() => setRescheduling(null)} onSaved={() => void finish(rescheduling.orderId)} />}{advancing && <TransitionModal shipment={advancing} onClose={() => setAdvancing(null)} onSaved={() => void finish(advancing.orderId)} />}{configuring && payload && <HabitualTripCapacityModal capacity={payload.capacity} transporters={payload.transporters ?? []} onClose={() => setConfiguring(false)} onSaved={() => { setConfiguring(false); void load(); }} />}{adjustingDay && payload && <DailyTripCapacityModal day={adjustingDay} transporters={payload.transporters ?? []} onClose={() => setAdjustingDay(null)} onSaved={() => { setAdjustingDay(null); void load(); }} />}</>;
}
