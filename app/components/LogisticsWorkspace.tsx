"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { OperationOrder, Product, Provider, Shipment, ShipmentStatus } from "../data";
import { classifyPallet, estimatedTransportVolumeM3, isOutsidePaysanduCity, loadWarnings, palletVolumeM3, tripWarnings, type LineAvailability, type LogisticsClientDeliveryLimit, type LogisticsDriver, type LogisticsLocation, type LogisticsRun, type LogisticsSettings, type LogisticsTransportCapacity, type LogisticsVehicle, type PalletClass } from "../logistics";
import { AsyncButton, ModalShell } from "./ui";
import { UruguayTravelMap, routeColors, travelBands, travelTimes, type ClientTravelPoint, type MapRoute } from "./LogisticsMap";
import LogisticsLimitsView from "./LogisticsLimitsView";

type Snapshot = {
  orders: OperationOrder[]; products: Product[]; providers: Provider[];
  clients: Array<{ id: string; name: string; address?: string; department?: string }>;
  vehicles: LogisticsVehicle[]; drivers: LogisticsDriver[]; settings: LogisticsSettings;
  transportCapacities: LogisticsTransportCapacity[]; clientLimits: LogisticsClientDeliveryLimit[]; limitsSchemaReady: boolean;
  classes: Record<string, PalletClass>; locations: LogisticsLocation[];
  runs: LogisticsRun[]; availability: LineAvailability[];
  stock: Array<{ productId: string; ready: number; pending: number; available: number; reserved: number }>;
};
type View = "transport" | "trips" | "map" | "limits";
const number = new Intl.NumberFormat("es-UY");
const volumeNumber = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const statusLabel: Record<ShipmentStatus, string> = { planned: "Planificado", ready: "Pronto", loaded: "Cargado", dispatched: "En viaje", delivered: "Entregado", cancelled: "Cancelado" };
const routeLabel = { viable: "Viable", tight: "Ajustado", not_viable: "No viable", no_data: "Sin datos" };
const displayProduct = (name: string) => name.replace(/\s*\u00b7\s*/g, ", ");
function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function addDays(key: string, amount: number) { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + amount); return dateKey(date); }
function firstDay(key: string) { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return dateKey(date); }
function shortDate(key: string) { return new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" }).format(new Date(`${key}T12:00:00`)); }
function timeValue(iso?: string) { return iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : ""; }
function toIso(date: string, time: string) { return time ? new Date(`${date}T${time}:00-03:00`).toISOString() : undefined; }
function shiftSchedule(iso: string | undefined, from: string, to: string) {
  if (!iso) return undefined;
  const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000;
  return new Date(Date.parse(iso) + days * 86400000).toISOString();
}
function titleForRun(run: LogisticsRun, snapshot: Snapshot) {
  if (run.mode === "supplier_pickup") return `Retiro: ${snapshot.providers.find((provider) => provider.id === run.providerId)?.name ?? "Proveedor"}`;
  const order = snapshot.orders.find((item) => item.id === run.orderId);
  return `${run.mode === "customer_pickup" ? "Retira cliente: " : ""}${order?.client ?? "Pedido"}`;
}
function ShipmentLoad({ shipment, order, snapshot }: { shipment: Shipment; order: OperationOrder; snapshot: Snapshot }) {
  const counts = { small: 0, large: 0, unclassified: 0 };
  for (const line of shipment.lines) {
    const productId = order.lines.find((item) => item.id === line.orderLineId)?.productId;
    const product = snapshot.products.find((item) => item.id === productId);
    const kind = product ? classifyPallet(product, snapshot.classes[product.id]) : "unclassified";
    counts[kind] += line.plannedQuantity;
  }
  const total = counts.small + counts.large + counts.unclassified;
  return <small className="logistics-card-load">Total: {number.format(total)} | Chicos: {number.format(counts.small)} | Grandes: {number.format(counts.large)}{counts.unclassified > 0 && ` | Sin clasificar: ${number.format(counts.unclassified)}`}</small>;
}
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "No se pudo completar la operación.");
  return result;
}
function Notice({ children }: { children: React.ReactNode }) { return <p className="logistics-notice"><AlertTriangle size={16} aria-hidden="true" />{children}</p>; }

function isUnassignedShipment(shipment: Shipment, snapshot: Snapshot) {
  return shipment.status === "planned" && shipment.events.length === 1 && shipment.events[0]?.responsible === "Sistema"
    && !snapshot.runs.some((run) => String(run.shipmentId) === String(shipment.id));
}


function readyToPlan(order: OperationOrder, lineId: string, snapshot: Snapshot, exceptShipmentId?: string) {
  const balance = snapshot.availability.find((item) => item.orderId === order.id && item.orderLineId === lineId);
  if (!balance) return 0;
  const committed = (order.shipments ?? []).filter((shipment) => ["planned", "ready", "loaded"].includes(shipment.status) && !isUnassignedShipment(shipment, snapshot) && String(shipment.id) !== exceptShipmentId)
    .flatMap((shipment) => shipment.lines).filter((line) => line.orderLineId === lineId)
    .reduce((sum, line) => sum + (line.loadedQuantity ?? line.plannedQuantity), 0);
  return Math.max(Math.min(balance.pending, balance.readyAttributed + balance.generalAssignable - committed), 0);
}

function ClassLoadMeter({ label, count, capacity }: { label: "Chicos" | "Grandes"; count: number; capacity?: number }) {
  const hasReference = capacity !== undefined && capacity > 0;
  return <div className="logistics-class-meter">
    <div className="logistics-class-meter-heading"><span>{label}</span><strong>{number.format(count)}{capacity === undefined ? "" : ` / ${number.format(capacity)}`}</strong></div>
    {hasReference && <div className="logistics-class-meter-bar" role="progressbar" aria-label={`Palets ${label.toLowerCase()}`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={Math.min(count, capacity)} aria-valuetext={`${number.format(count)} de ${number.format(capacity)} palets ${label.toLowerCase()}`}>
      <span style={{ transform: `scaleX(${Math.min(Math.max(count / capacity, 0), 1)})` }} />
    </div>}
  </div>;
}

function PlanModal({ order, snapshot, onClose, onSaved, onError, initialShipmentId, initialDate }: { order: OperationOrder; snapshot: Snapshot; onClose: () => void; onSaved: () => Promise<void>; onError: (message: string) => void; initialShipmentId?: string; initialDate?: string }) {
  const placeholder = (order.shipments ?? []).find((shipment) => isUnassignedShipment(shipment, snapshot));
  const availableShipments = (order.shipments ?? []).filter((shipment) => shipment.status === "planned" && !isUnassignedShipment(shipment, snapshot));
  const [shipmentId, setShipmentId] = useState(initialShipmentId === "new" ? "new" : String(availableShipments.find((shipment) => String(shipment.id) === initialShipmentId)?.id ?? availableShipments[0]?.id ?? "new"));
  const shipment = availableShipments.find((item) => String(item.id) === shipmentId) ?? (shipmentId === "new" ? placeholder : undefined);
  const existingRun = snapshot.runs.find((run) => String(run.shipmentId) === shipmentId);
  const [mode, setMode] = useState<"internal" | "external" | "customer_pickup">(existingRun?.mode === "customer_pickup" ? "customer_pickup" : shipmentId === "new" ? order.transportSource ?? "internal" : shipment?.transportSource ?? order.transportSource ?? "internal");
  const [providerId, setProviderId] = useState(shipmentId === "new" ? order.transportProviderId ?? "" : shipment?.transportProviderId ?? order.transportProviderId ?? "");
  const [vehicleId, setVehicleId] = useState(existingRun?.vehicleId ?? "");
  const [driverId, setDriverId] = useState(existingRun?.driverId ?? "");
  const [manualCapacity, setManualCapacity] = useState(shipmentId !== "new" && shipment ? String(shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0)) : "");
  const [date, setDate] = useState(initialDate ?? shipment?.plannedDate ?? dateKey());
  const [start, setStart] = useState(timeValue(existingRun?.plannedStartAt));
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((line) =>
    [line.id, shipmentId === "new" ? 0 : shipment?.lines.find((item) => item.orderLineId === line.id)?.plannedQuantity ?? 0])));
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const vehicle = snapshot.vehicles.find((item) => item.id === vehicleId);
  const counts = { small: 0, large: 0, unclassified: 0 };
  for (const line of order.lines) {
    const product = snapshot.products.find((item) => item.id === line.productId);
    const kind = product ? classifyPallet(product, snapshot.classes[product.id]) : "unclassified";
    counts[kind] += quantities[line.id] || 0;
  }
  const warnings = loadWarnings(counts);
  if (mode === "external" && !providerId) warnings.push("Todavía no se asignó un transportista.");
  const maxFor = (lineId: string) => {
    const line = order.lines.find((item) => item.id === lineId);
    if (!line) return 0;
    const other = (order.shipments ?? []).filter((item) => item.status !== "cancelled" && !isUnassignedShipment(item, snapshot) && String(item.id) !== String(shipment?.id ?? shipmentId))
      .flatMap((item) => item.lines).filter((item) => item.orderLineId === lineId)
      .reduce((sum, item) => sum + (item.loadedQuantity ?? item.plannedQuantity), 0);
    return Math.max(line.quantity - other, 0);
  };
  const availableFor = (lineId: string) => Math.min(maxFor(lineId), readyToPlan(order, lineId, snapshot, String(shipment?.id ?? shipmentId)));
  const selectedQuantity = Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0);
  const transportProfile = mode === "external" ? snapshot.transportCapacities.find((item) => item.id === `provider:${providerId}`)
    : mode === "customer_pickup" ? snapshot.transportCapacities.find((item) => item.id === "customer_pickup") : undefined;
  const classCapacity = mode === "internal" ? vehicle : transportProfile;
  const volumeReference = estimatedTransportVolumeM3(classCapacity?.smallCapacity, classCapacity?.largeCapacity);
  const selectedLineVolumes = order.lines.filter((line) => (quantities[line.id] || 0) > 0).map((line) => {
    const product = snapshot.products.find((item) => item.id === line.productId);
    const volumeM3 = product ? palletVolumeM3(product) : undefined;
    return volumeM3 === undefined ? undefined : volumeM3 * quantities[line.id];
  });
  const selectedVolumeM3 = selectedLineVolumes.some((volume) => volume === undefined)
    ? undefined : selectedLineVolumes.reduce<number>((sum, volume) => sum + (volume ?? 0), 0);
  const readyQuantity = order.lines.reduce((sum, line) => sum + availableFor(line.id), 0);
  const exceedsReady = order.lines.some((line) => (quantities[line.id] || 0) > availableFor(line.id));
  const confirmedCapacity = Number.isInteger(Number(manualCapacity)) && Number(manualCapacity) > 0 ? Number(manualCapacity) : undefined;
  const capacityLimit = mode !== "internal" ? confirmedCapacity : undefined;
  const capacityRemaining = capacityLimit === undefined ? undefined : capacityLimit - selectedQuantity;
  const capacityError = mode === "external" && transportProfile && counts.large === 0 && transportProfile.smallCapacity !== undefined && counts.small > transportProfile.smallCapacity
    || mode === "external" && transportProfile && counts.small === 0 && transportProfile.largeCapacity !== undefined && counts.large > transportProfile.largeCapacity
    ? "La carga supera la capacidad configurada del transportista." : mode !== "internal" && selectedQuantity > Number(manualCapacity || 0) ? "La carga supera la capacidad indicada." : "";
  const validCapacity = Number.isInteger(Number(manualCapacity)) && Number(manualCapacity) > 0;
  const transportSelected = mode === "internal" ? Boolean(vehicle) : mode === "external" ? snapshot.providers.some((provider) => provider.id === providerId && provider.type === "Transporte" && !provider.internalTransport) && validCapacity : validCapacity;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    let shipmentSaved = false;
    try {
      const lines = order.lines.map((line) => ({ orderLineId: line.id, plannedQuantity: quantities[line.id] || 0 }))
        .filter((line) => line.plannedQuantity > 0);
      if (!transportSelected) throw new Error("Elegí un transporte antes de guardar.");
      if (!lines.length) throw new Error("Indicá al menos una cantidad para el viaje.");
      if (lines.some((line) => !Number.isInteger(line.plannedQuantity) || line.plannedQuantity > availableFor(line.orderLineId))) throw new Error("La carga supera las unidades listas para planificar.");
      if (capacityError) throw new Error(capacityError);
      const source = mode === "external" ? "external" : "internal";
      const saved = await api<{ shipment: Shipment }>(shipment ? `/api/shipments/${shipment.id}` : `/api/orders/${order.id}/shipments`,
        shipment ? "PATCH" : "POST", { plannedDate: date, transportSource: source,
          transportProviderId: source === "external" ? providerId || undefined : undefined, lines, responsible: "Plan de carga" });
      shipmentSaved = true;
      await api("/api/logistics/runs", existingRun ? "PATCH" : "POST", {
        id: existingRun?.id, mode: mode === "customer_pickup" ? "customer_pickup" : "delivery",
        shipmentId: saved.shipment.id, vehicleId: mode === "internal" ? vehicleId || undefined : undefined,
        driverId: mode === "internal" ? driverId || undefined : undefined,
        plannedDate: date, plannedStartAt: toIso(date, start),
        responsible: "Plan de carga",
      });
      await onSaved(); onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo guardar el plan.";
      if (shipmentSaved) {
        await onSaved(); onError(`${message} El viaje quedó guardado. Revisá la salida en el calendario antes de volver a intentar.`); onClose();
      } else setError(message);
    }
    finally { setSaving(false); }
  };
  const continueStep = () => {
    setError("");
    if (step === 0 && !transportSelected) { setError("Elegí el transporte para continuar."); return; }
    if (step === 1) {
      if (!selectedQuantity) { setError("Indicá cuántos palets listos vas a enviar."); return; }
      if (order.lines.some((line) => !Number.isInteger(quantities[line.id] || 0) || (quantities[line.id] || 0) > availableFor(line.id))) { setError("La carga supera las unidades listas para planificar."); return; }
      if (capacityError) { setError(capacityError); return; }
    }
    setStep((step + 1) as 1 | 2);
  };
  return <ModalShell title="Asignar transporte" onClose={onClose} className="logistics-plan-modal">
    <form className="logistics-form" onSubmit={submit}>
      <nav className="logistics-steps" aria-label="Pasos para asignar transporte">{["Transporte", "Carga", "Revisión"].map((label, index) => <button key={label} type="button" className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined} disabled={index > step} onClick={() => setStep(index as 0 | 1 | 2)}><span>{index + 1}</span>{label}</button>)}</nav>
      <div className="logistics-wizard-layout"><div className="logistics-wizard-main">
      {step === 0 && <><div className="logistics-step-heading"><h3>¿Cómo lo vas a transportar?</h3></div>
      {availableShipments.length > 0 && <label className="logistics-trip-select">Salida<select value={shipmentId} onChange={(event) => { const next = event.target.value; setShipmentId(next); const selected = availableShipments.find((item) => String(item.id) === next); const selectedRun = snapshot.runs.find((item) => String(item.shipmentId) === next); setMode(selectedRun?.mode === "customer_pickup" ? "customer_pickup" : selected?.transportSource ?? order.transportSource ?? "internal"); setProviderId(selected?.transportProviderId ?? order.transportProviderId ?? ""); setVehicleId(selectedRun?.vehicleId ?? ""); setDriverId(selectedRun?.driverId ?? ""); setManualCapacity(selected ? String(selected.lines.reduce((sum, line) => sum + line.plannedQuantity, 0)) : ""); setDate(selected?.plannedDate ?? dateKey()); setStart(timeValue(selectedRun?.plannedStartAt)); setQuantities(Object.fromEntries(order.lines.map((line) => [line.id, selected?.lines.find((item) => item.orderLineId === line.id)?.plannedQuantity ?? 0]))); }}>
          {availableShipments.map((item) => <option key={item.id} value={String(item.id)}>Editar salida del {shortDate(item.plannedDate)}</option>)}<option value="new">Crear otra salida</option></select></label>}
      <div className="logistics-fields">
        <label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label>Modalidad<select value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setManualCapacity(""); }}><option value="internal">Flota propia</option><option value="external">Transportista</option><option value="customer_pickup">Retira cliente</option></select></label>
        {mode === "external" && <label>Transportista<select aria-label="Transportista" value={providerId} onChange={(event) => { setProviderId(event.target.value); setManualCapacity(""); }}><option value="">Seleccionar</option>{snapshot.providers.filter((item) => item.type === "Transporte" && !item.internalTransport).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {mode === "internal" && <><label>Vehículo<select value={vehicleId} onChange={(event) => { const id = event.target.value; setVehicleId(id); setDriverId(snapshot.vehicles.find((item) => item.id === id)?.habitualDriverId ?? ""); }}><option value="">Sin asignar</option>{snapshot.vehicles.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Chofer<select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">Sin asignar</option>{snapshot.drivers.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
        {mode !== "customer_pickup" && <><label>Salida<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label></>}
        {mode !== "internal" && <label>Capacidad de esta salida<input type="number" min="1" step="1" value={manualCapacity} onChange={(event) => setManualCapacity(event.target.value)} required /></label>}
      </div></>}
      {step === 1 && <><div className="logistics-step-heading"><h3>¿Cuántos palets listos enviás?</h3></div>
      <div className="logistics-lines"><div className="logistics-lines-head"><span>Nombre del producto</span><span>Tamaño</span><span>Cantidad</span></div>{order.lines.filter((line) => availableFor(line.id) > 0 || (quantities[line.id] || 0) > 0).map((line) => {
        const product = snapshot.products.find((item) => item.id === line.productId);
        const kind = product ? classifyPallet(product, snapshot.classes[product.id]) : "unclassified";
        const available = availableFor(line.id);
        return <div key={line.id} className="logistics-line">
          <strong className="logistics-line-product">{displayProduct(line.product)}</strong>
          <span className="logistics-line-size">{kind === "small" ? "Chico" : kind === "large" ? "Grande" : "Sin clasificar"}</span>
          <div className="logistics-line-quantity"><input aria-label={`Cantidad a enviar de ${displayProduct(line.product)}, ${number.format(available)} listos`} type="number" min="0" max={available} step="1" value={quantities[line.id] || ""} onChange={(event) => setQuantities((value) => ({ ...value, [line.id]: Number(event.target.value) }))} /><small>de {number.format(available)}</small></div>
        </div>;
      })}</div>
      </>}
      {step === 2 && <><div className="logistics-step-heading"><h3>Revisá la salida</h3></div>
        <div className="logistics-review-summary"><div><small>Fecha</small><strong>{shortDate(date)}</strong></div><div><small>Modalidad</small><strong>{mode === "internal" ? "Flota propia" : mode === "external" ? "Transportista" : "Retira cliente"}</strong></div><div><small>Vehículo</small><strong>{mode === "internal" ? vehicle?.name ?? "Sin asignar" : "No aplica"}</strong></div><div><small>Horario</small><strong>{start || "Sin hora"}</strong></div></div>
        <div className="logistics-review-lines">{order.lines.filter((line) => (quantities[line.id] || 0) > 0).map((line) => <div key={line.id}><span>{displayProduct(line.product)}</span><strong>{number.format(quantities[line.id])}</strong></div>)}{!Object.values(quantities).some((value) => value > 0) && <p>Falta indicar una cantidad.</p>}</div>
        {order.lines.some((line) => (quantities[line.id] || 0) > maxFor(line.id)) && <Notice>El plan supera el saldo del pedido. Se guardará la diferencia para conciliarla.</Notice>}
        {warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
      </>}
      </div><aside className="logistics-load-panel" aria-label="Carga y volumen">
        <h4>Carga y volumen</h4>
        <strong className="logistics-load-source">{mode === "internal" ? vehicle?.name ?? "Vehículo sin elegir" : mode === "external" ? snapshot.providers.find((provider) => provider.id === providerId)?.name ?? "Transportista sin elegir" : "Retira cliente"}</strong>
        <div className="logistics-load-stats"><div><span>Carga elegida</span><strong>{number.format(selectedQuantity)}</strong></div><div><span>Listos para enviar</span><strong>{number.format(readyQuantity)}</strong></div></div>
        <div className="logistics-load-classes"><ClassLoadMeter label="Chicos" count={counts.small} capacity={classCapacity?.smallCapacity} /><ClassLoadMeter label="Grandes" count={counts.large} capacity={classCapacity?.largeCapacity} />{counts.unclassified > 0 && <div className="logistics-load-unclassified"><span>Sin clasificar</span><strong>{number.format(counts.unclassified)}</strong></div>}</div>
        {selectedQuantity > 0 && <div className="logistics-load-volume"><div><span>Volumen de la carga</span><strong>{selectedVolumeM3 === undefined ? "Sin estimación" : `${volumeNumber.format(selectedVolumeM3)} m³ aprox.`}</strong></div><div><span>Referencia del transporte</span><strong>{volumeReference ? `Hasta ${volumeNumber.format(volumeReference.upper)} m³ aprox.` : "Sin estimación"}</strong></div><small>Estimación según las medidas y alturas de los pallets.</small></div>}
        {mode === "internal" && selectedVolumeM3 !== undefined && volumeReference && volumeReference.upper > 0 && selectedQuantity > 0 && <div className="logistics-load-bar" role="progressbar" aria-label="Volumen orientativo ocupado" aria-valuemin={0} aria-valuemax={volumeReference.upper} aria-valuenow={Math.min(selectedVolumeM3, volumeReference.upper)} aria-valuetext={`${volumeNumber.format(selectedVolumeM3)} de ${volumeNumber.format(volumeReference.upper)} metros cúbicos aproximados`}><span style={{ width: `${Math.min(selectedVolumeM3 / volumeReference.upper * 100, 100)}%` }} /></div>}
        {capacityLimit !== undefined && mode !== "internal" && <div className="logistics-load-limit"><span>Capacidad indicada</span><strong>{number.format(capacityLimit)}</strong></div>}
        {(exceedsReady || selectedQuantity > 0 && capacityError || mode === "internal" && !vehicle || mode !== "internal" && capacityLimit === undefined || mode !== "internal" && selectedQuantity > 0 && capacityRemaining !== undefined) && <p className={`logistics-load-status${exceedsReady || selectedQuantity > 0 && capacityError ? " is-over" : ""}`} role="status">{exceedsReady ? "La carga supera los palets listos para enviar." : selectedQuantity > 0 && capacityError ? capacityError : mode === "internal" && !vehicle ? "Elegí un vehículo para ver el volumen orientativo." : capacityRemaining === undefined ? "Indicá la capacidad de esta salida." : capacityRemaining === 0 ? "Capacidad completa." : `Quedan ${number.format(capacityRemaining)} lugares disponibles.`}</p>}
      </aside></div>
      {error && <p className="logistics-form-message" role="status">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={step === 0 ? onClose : () => setStep((step - 1) as 0 | 1)}>{step === 0 ? "Cancelar" : "Volver"}</button>{step < 2 ? <button type="button" className="primary-button" onClick={continueStep}>Continuar</button> : <AsyncButton type="submit" className="primary-button" loading={saving}>Guardar planificación</AsyncButton>}</div>
    </form>
  </ModalShell>;
}

function TransportResultModal({ shipment, order, run, onClose, onSaved, onError }: { shipment: Shipment; order: OperationOrder; run?: LogisticsRun; onClose: () => void; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [transported, setTransported] = useState(true);
  const [actualDate, setActualDate] = useState(dateKey());
  const [remittance, setRemittance] = useState(shipment.remittance ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(shipment.lines.map((line) => [String(line.id), line.loadedQuantity ?? line.plannedQuantity])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canCancel = ["planned", "ready", "loaded"].includes(shipment.status);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSaving(true);
    let advanced = false;
    try {
      if (actualDate > dateKey()) throw new Error("La fecha real no puede ser futura.");
      if (!transported) {
        if (!canCancel) throw new Error("Una salida despachada no se puede marcar como no realizada.");
        await api(`/api/shipments/${shipment.id}/transition`, "POST", { nextStatus: "cancelled", responsible: "Transporte real" });
        advanced = true;
        if (run) await api("/api/logistics/runs", "PATCH", { ...run, status: "cancelled", note: `No se transportó el ${actualDate}.`, responsible: "Transporte real" });
      } else {
        const actual = shipment.lines.map((line) => ({ shipmentLineId: line.id, quantity: quantities[String(line.id)] ?? 0, limit: line.loadedQuantity ?? line.plannedQuantity }));
        if (actual.some((line) => !Number.isInteger(line.quantity) || line.quantity < 0 || line.quantity > line.limit) || !actual.some((line) => line.quantity > 0)) throw new Error("Indicá cantidades transportadas válidas.");
        const statuses: ShipmentStatus[] = ["ready", "loaded", "dispatched", "delivered"];
        for (const nextStatus of statuses.slice(Math.max(statuses.indexOf(shipment.status as ShipmentStatus) + 1, 0))) {
          await api(`/api/shipments/${shipment.id}/transition`, "POST", {
            nextStatus, remittance, responsible: "Transporte real",
            loadedLines: nextStatus === "loaded" ? actual.map((line) => ({ shipmentLineId: line.shipmentLineId, loadedQuantity: line.quantity })) : undefined,
            deliveredLines: nextStatus === "delivered" ? actual.map((line) => ({ shipmentLineId: line.shipmentLineId, deliveredQuantity: line.quantity })) : undefined,
          });
          advanced = true;
        }
        if (run) await api("/api/logistics/runs", "PATCH", { ...run, status: "completed", note: `Transporte confirmado el ${actualDate}.`, responsible: "Transporte real" });
      }
      await onSaved(); onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo confirmar el transporte.";
      if (advanced) {
        await onSaved(); onError(`${message} El estado de la salida se actualizó. Revisalo antes de volver a confirmar.`); onClose();
      } else setError(message);
    }
    finally { setSaving(false); }
  };
  return <ModalShell title="Confirmar transporte real" description={`${order.client}: salida prevista para el ${shortDate(shipment.plannedDate)}`} onClose={onClose}>
    <form className="production-result-form" onSubmit={submit}>
      <fieldset className="production-result-choice"><legend>¿Qué ocurrió?</legend><button type="button" className={transported ? "selected" : ""} aria-pressed={transported} onClick={() => setTransported(true)}>Se transportó</button>{canCancel && <button type="button" className={!transported ? "selected" : ""} aria-pressed={!transported} onClick={() => setTransported(false)}>No se transportó</button>}</fieldset>
      <label>Fecha real<input type="date" max={dateKey()} value={actualDate} onChange={(event) => setActualDate(event.target.value)} required /></label>
      {transported && <><label>Remito<input value={remittance} onChange={(event) => setRemittance(event.target.value)} /></label>{shipment.lines.map((line) => <label key={line.id}>{displayProduct(line.product)}<input type="number" min="0" max={line.loadedQuantity ?? line.plannedQuantity} step="1" value={quantities[String(line.id)] ?? 0} disabled={["loaded", "dispatched"].includes(shipment.status)} onChange={(event) => setQuantities((current) => ({ ...current, [String(line.id)]: Number(event.target.value) }))} /></label>)}</>}
      {!transported && <p>La salida se cancelará y los palets listos volverán a estar disponibles para planificar.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar resultado</AsyncButton></div>
    </form>
  </ModalShell>;
}

function RealTransportView({ snapshot, reload, onOpenOrder, onChanged }: { snapshot: Snapshot; reload: () => Promise<void>; onOpenOrder: (id: string) => void; onChanged?: (id: string) => Promise<void> }) {
  const [selected, setSelected] = useState<{ order: OperationOrder; shipment: Shipment; run?: LogisticsRun } | null>(null);
  const [error, setError] = useState("");
  const rows = snapshot.orders.flatMap((order) => (order.shipments ?? []).filter((shipment) => !isUnassignedShipment(shipment, snapshot)).map((shipment) => ({ order, shipment, run: snapshot.runs.find((run) => String(run.shipmentId) === String(shipment.id)) })))
    .sort((a, b) => b.shipment.plannedDate.localeCompare(a.shipment.plannedDate));
  return <><section className="logistics-panel logistics-real"><header><h2>Transporte real</h2></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {rows.length ? <div className="logistics-real-table"><table aria-label="Resultados de transporte" data-column-filters="off"><thead><tr><th scope="col">Fecha prevista</th><th scope="col">Cliente</th><th scope="col">Transporte</th><th scope="col">Previstos</th><th scope="col">Transportados</th><th scope="col">Estado</th><th scope="col">Resultado</th></tr></thead><tbody>
      {rows.map(({ order, shipment, run }) => <tr key={shipment.id}><td><time dateTime={shipment.plannedDate}>{shortDate(shipment.plannedDate)}</time></td><td><button type="button" className="row-link" onClick={() => onOpenOrder(order.id)}>{order.client}</button></td><td>{shipment.transportLabel ?? (shipment.transportSource === "external" ? "Externo" : "Interno")}{run?.vehicleId && <small>{snapshot.vehicles.find((vehicle) => vehicle.id === run.vehicleId)?.name}</small>}</td><td>{number.format(shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0))}</td><td>{shipment.status === "delivered" ? number.format(shipment.lines.reduce((sum, line) => sum + line.deliveredQuantity, 0)) : shipment.status === "cancelled" ? "0" : "Pendiente"}</td><td><span className="logistics-status">{shipment.status === "delivered" ? "Se transportó" : shipment.status === "cancelled" ? "No se transportó" : statusLabel[shipment.status]}</span></td><td>{["planned", "ready", "loaded", "dispatched"].includes(shipment.status) ? <button type="button" className="secondary-button" onClick={() => { setError(""); setSelected({ order, shipment, run }); }}>Confirmar</button> : <span>Registrado</span>}</td></tr>)}
    </tbody></table></div> : <p className="logistics-empty">Todavía no hay salidas planificadas para confirmar.</p>}
    {selected && <TransportResultModal shipment={selected.shipment} order={selected.order} run={selected.run} onClose={() => setSelected(null)} onSaved={async () => { await reload(); await onChanged?.(selected.order.id); }} onError={setError} />}
  </section></>;
}

function CalendarView({ snapshot, reload, onOpenOrder, onChanged }: { snapshot: Snapshot; reload: () => Promise<void>; onOpenOrder: (id: string) => void; onChanged?: (id: string) => Promise<void> }) {
  const [anchor, setAnchor] = useState(dateKey());
  const [queueSelection, setQueueSelection] = useState<{ order: OperationOrder; shipmentId: string } | null>(null);
  const orderFromUrl = new URLSearchParams(window.location.search).get("pedido");
  const [calendarOrder, setCalendarOrder] = useState<OperationOrder | null>(() => snapshot.orders.find((order) => order.id === orderFromUrl) ?? null);
  const lastUrlOrderId = useRef(orderFromUrl);
  useEffect(() => {
    if (orderFromUrl === lastUrlOrderId.current) return;
    lastUrlOrderId.current = orderFromUrl;
    setCalendarOrder(orderFromUrl ? snapshot.orders.find((order) => order.id === orderFromUrl) ?? null : null);
  }, [orderFromUrl, snapshot.orders]);
  const closeCalendarOrder = () => {
    setCalendarOrder(null);
    if (orderFromUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete("pedido");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    }
  };
  const [reschedule, setReschedule] = useState<{ run?: LogisticsRun; shipment?: Shipment; date: string } | null>(null);
  const [reason, setReason] = useState(""); const [error, setError] = useState("");
  const [dragging, setDragging] = useState("");
  const [draggingLane, setDraggingLane] = useState("");
  const [dropDay, setDropDay] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveMessage, setMoveMessage] = useState("");
  const start = firstDay(anchor);
  const end = addDays(start, 6);
  const days: string[] = []; for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  const shipmentRuns = new Set(snapshot.runs.map((run) => String(run.shipmentId)));
  const legacy = snapshot.orders.flatMap((order) => (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && !isUnassignedShipment(shipment, snapshot) && !shipmentRuns.has(String(shipment.id)))
    .map((shipment) => ({ shipment, order })));
  const lanes = [...snapshot.vehicles.filter((item) => item.active).map((vehicle) => ({ id: vehicle.id, name: vehicle.name })),
    { id: "external", name: "Terceros" }, { id: "pickup", name: "Retira cliente" }, { id: "supplier", name: "Retiro a proveedor" }];
  const pendingTransport = snapshot.orders.filter((order) => order.pending > 0 && order.stage !== "cancelado")
    .map((order) => ({ order, ready: order.lines.reduce((sum, line) => sum + readyToPlan(order, line.id, snapshot), 0) }))
    .filter((item) => item.ready > 0)
    .sort((a, b) => (a.order.plannedDate ?? "").localeCompare(b.order.plannedDate ?? ""));
  const recentlyPlanned = snapshot.orders.flatMap((order) => {
    const shipments = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && !isUnassignedShipment(shipment, snapshot));
    if (!shipments.length) return [];
    const latest = [...shipments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const editable = [...shipments].filter((shipment) => shipment.status === "planned").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const ready = order.lines.reduce((sum, line) => sum + readyToPlan(order, line.id, snapshot), 0);
    const inTransit = shipments.some((shipment) => ["loaded", "dispatched"].includes(shipment.status));
    const complete = order.pending === 0;
    return [{ order, shipments, latest, editable, ready, inTransit, complete }];
  }).sort((a, b) => b.latest.updatedAt.localeCompare(a.latest.updatedAt)).slice(0, 12);
  const inTransitCount = recentlyPlanned.filter((item) => item.inTransit).length;
  const readyForAnotherTripCount = recentlyPlanned.filter((item) => item.ready > 0).length;
  const deliveredCount = recentlyPlanned.filter((item) => item.complete).length;
  const saveReschedule = async (event: FormEvent) => {
    event.preventDefault(); if (!reschedule) return; setError("");
    try {
      if (reschedule.shipment) await api(`/api/shipments/${reschedule.shipment.id}/reschedule`, "POST",
        { newDate: reschedule.date, reason: "logistics", note: reason, responsible: "Calendario de Logística" });
      if (reschedule.run) await api("/api/logistics/runs", "PATCH", { ...reschedule.run, plannedDate: reschedule.date,
        plannedStartAt: shiftSchedule(reschedule.run.plannedStartAt, reschedule.run.plannedDate, reschedule.date),
        plannedEndAt: shiftSchedule(reschedule.run.plannedEndAt, reschedule.run.plannedDate, reschedule.date),
        note: `Reprogramado: ${reason}`, responsible: "Calendario de Logística" });
      await reload(); setReschedule(null); setReason("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo reprogramar."); }
  };
  const runsForLane = (laneId: string, day: string) => snapshot.runs.filter((run) => run.plannedDate === day && run.status !== "cancelled" && (
    laneId === "pickup" ? run.mode === "customer_pickup" : laneId === "supplier" ? run.mode === "supplier_pickup" :
    laneId === "external" ? run.mode === "delivery" && !run.vehicleId && snapshot.orders.find((order) => order.id === run.orderId)?.shipments?.find((shipment) => String(shipment.id) === String(run.shipmentId))?.transportSource === "external" :
    run.vehicleId === laneId));
  const legacyForLane = (laneId: string, day: string) => laneId === "external" ? legacy.filter((item) =>
    item.shipment.plannedDate === day && item.shipment.transportSource === "external") : [];
  const moveToDay = async (day: string, key: string) => {
    if (moving) return;
    const [kind, id] = key.split(":", 2);
    const run = kind === "run" ? snapshot.runs.find((item) => String(item.id) === id) : undefined;
    const shipment = kind === "shipment" ? legacy.find((item) => String(item.shipment.id) === id)?.shipment : snapshot.orders.flatMap((order) => order.shipments ?? []).find((item) => String(item.id) === String(run?.shipmentId));
    const from = run?.plannedDate ?? shipment?.plannedDate;
    if (!from || from === day || shipment && !["planned", "ready"].includes(shipment.status) || run && run.status !== "planned") return;
    setMoving(true); setError(""); setMoveMessage("");
    try {
      if (shipment) await api(`/api/shipments/${shipment.id}/reschedule`, "POST", { newDate: day, reason: "logistics", responsible: "Calendario de Logística" });
      if (run) await api("/api/logistics/runs", "PATCH", { ...run, plannedDate: day,
        plannedStartAt: shiftSchedule(run.plannedStartAt, from, day),
        plannedEndAt: shiftSchedule(run.plannedEndAt, from, day), responsible: "Calendario de Logística" });
      await reload();
      setMoveMessage(`Salida movida al ${shortDate(day)}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo mover la salida."); await reload(); }
    finally { setMoving(false); setDragging(""); setDraggingLane(""); setDropDay(""); }
  };
  const boardDays = days;
  const countForDay = (day: string) => snapshot.runs.filter((run) => run.plannedDate === day && run.status !== "cancelled" && (run.mode !== "delivery" || Boolean(run.vehicleId) || snapshot.orders.find((order) => order.id === run.orderId)?.shipments?.find((shipment) => String(shipment.id) === String(run.shipmentId))?.transportSource === "external")).length + legacy.filter((item) => item.shipment.plannedDate === day && item.shipment.transportSource === "external").length;
  const dropOnDay = (day: string, raw: string) => { if (raw && raw === dragging) void moveToDay(day, raw); else { setDragging(""); setDraggingLane(""); setDropDay(""); } };
  const draggedRun = dragging.startsWith("run:") ? snapshot.runs.find((item) => String(item.id) === dragging.slice(4)) : undefined;
  const draggedLegacy = dragging.startsWith("shipment:") ? legacy.find((item) => String(item.shipment.id) === dragging.slice(9)) : undefined;
  const draggedDay = draggedRun?.plannedDate ?? draggedLegacy?.shipment.plannedDate;
  const renderRun = (run: LogisticsRun, laneId: string) => {
    const warnings = tripWarnings(run, snapshot.runs, snapshot.settings);
    const id = String(run.id);
    const dragKey = `run:${id}`;
    const shipment = snapshot.orders.flatMap((order) => order.shipments ?? []).find((item) => String(item.id) === String(run.shipmentId));
    const order = snapshot.orders.find((item) => item.id === run.orderId);
    const canMove = run.status === "planned" && (!shipment || ["planned", "ready"].includes(shipment.status));
    const openCard = () => { if (moving || dragging) return; if (order && shipment) setQueueSelection({ order, shipmentId: String(shipment.id) }); else setReschedule({ run, shipment, date: run.plannedDate }); };
    return <article key={id} role="button" tabIndex={0} aria-label={`Abrir salida de ${titleForRun(run, snapshot)}`} onClick={openCard} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCard(); } }} draggable={canMove && !moving} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", dragKey); setDragging(dragKey); setDraggingLane(laneId); }} onDragEnd={() => { if (!moving) { setDragging(""); setDraggingLane(""); setDropDay(""); } }} className={`logistics-calendar-card ${dragging === dragKey ? "is-dragging" : ""}`}>
      <strong>{titleForRun(run, snapshot)}</strong>
      <small>{timeValue(run.plannedStartAt) || "Sin hora"}{run.plannedEndAt ? ` a ${timeValue(run.plannedEndAt)}` : ""}</small>
      {run.driverId && <small className="logistics-card-driver">Chofer: {snapshot.drivers.find((item) => String(item.id) === String(run.driverId))?.name ?? "Sin asignar"}</small>}
      {shipment && order && <ShipmentLoad shipment={shipment} order={order} snapshot={snapshot} />}
      {warnings.map((warning) => <small key={warning} className="logistics-warning-text">{warning}</small>)}
      {run.mode === "supplier_pickup" && run.status === "planned" && <div className="logistics-card-footer"><button type="button" className="text-button" onClick={async (event) => { event.stopPropagation(); await api("/api/logistics/runs", "PATCH", { ...run, status: "completed" }); await reload(); }}>Marcar retiro realizado</button></div>}
    </article>;
  };
  const renderLegacy = ({ shipment, order }: { shipment: Shipment; order: OperationOrder }, laneId: string) => { const dragKey = `shipment:${shipment.id}`; const openCard = () => { if (!moving && !dragging) setQueueSelection({ order, shipmentId: String(shipment.id) }); }; return <article key={shipment.id} role="button" tabIndex={0} aria-label={`Abrir salida de ${order.client}`} onClick={openCard} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCard(); } }} draggable={["planned", "ready"].includes(shipment.status) && !moving} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", dragKey); setDragging(dragKey); setDraggingLane(laneId); }} onDragEnd={() => { if (!moving) { setDragging(""); setDraggingLane(""); setDropDay(""); } }} className={`logistics-calendar-card logistics-legacy-card ${dragging === dragKey ? "is-dragging" : ""}`}><strong>{order.client}</strong><ShipmentLoad shipment={shipment} order={order} snapshot={snapshot} /><small>{statusLabel[shipment.status]}, viaje histórico</small><span className="logistics-route-status no_data">Transporte tercero</span></article>; };
  return <><section className="module-surface phase-queue logistics-transport-queue" aria-labelledby="transport-queue-title"><header className="phase-header"><h2 id="transport-queue-title">Transporte a planificar</h2>{pendingTransport.length > 0 && <span className="count-pill warning">{pendingTransport.length} {pendingTransport.length === 1 ? "pedido" : "pedidos"}</span>}</header>
    {pendingTransport.length > 0 ? <div className="queue-list logistics-queue-table" role="table" aria-label="Pedidos con transporte a planificar">
      <div className="logistics-queue-head" role="row"><div role="columnheader">Cliente</div><div role="columnheader">Listo para enviar</div><div role="columnheader">Total</div><div role="columnheader">Entrega</div><div role="columnheader" aria-label="Acciones" /></div>
      {pendingTransport.map(({ order, ready }) => <div key={order.id} className="queue-card logistics-queue-row" role="row"><div className="logistics-queue-cell logistics-queue-client" role="cell" data-label="Cliente"><strong>{order.client}</strong></div><div className="logistics-queue-cell" role="cell" data-label="Listo para enviar"><strong>{number.format(ready)}</strong></div><div className="logistics-queue-cell" role="cell" data-label="Total"><strong>{number.format(order.requested)}</strong></div><div className="logistics-queue-cell" role="cell" data-label="Entrega"><strong>{order.plannedDate ? shortDate(order.plannedDate) : "Sin fecha"}</strong></div><div className="queue-card-actions" role="cell"><button type="button" className="primary-button" onClick={() => setCalendarOrder(order)}>Asignar transporte</button><button type="button" className="secondary-button" onClick={() => onOpenOrder(order.id)}>Ver pedido</button></div></div>)}
    </div> : <p className="logistics-empty">No hay palets listos sin planificar.</p>}
    {recentlyPlanned.length > 0 && <details className="queue-planned logistics-recent-plans"><summary><span className="queue-planned-label">Planificados recientemente ({recentlyPlanned.length})</span><span className="queue-planned-summary-statuses">{inTransitCount > 0 && <span className="queue-progress-badge in-progress">{inTransitCount} en tránsito</span>}{readyForAnotherTripCount > 0 && <span className="queue-progress-badge pending">{readyForAnotherTripCount} con palets listos para otra salida</span>}{deliveredCount > 0 && <span className="queue-progress-badge completed">{deliveredCount} entregados</span>}</span><ChevronDown size={17} aria-hidden="true" /></summary><div className="queue-list compact">{recentlyPlanned.map(({ order, shipments, editable, ready, inTransit, complete }) => { const dates = shipments.map((shipment) => shipment.plannedDate).sort(); return <article key={order.id} className="queue-card"><div className="queue-card-main"><strong>{order.client}</strong><span>{shortDate(dates[0])}{dates[0] !== dates.at(-1) && ` a ${shortDate(dates.at(-1)!)}`} | {shipments.length} {shipments.length === 1 ? "salida" : "salidas"}</span><div className="queue-card-statuses"><span className={`queue-progress-badge ${complete ? "completed" : "in-progress"}`}>{complete ? "Entregado" : inTransit ? "En tránsito" : "Planificado"}</span></div>{ready > 0 && <small>{number.format(ready)} palets listos para otra salida</small>}</div><div className="queue-card-meta"><small>Entrega</small><strong>{order.plannedDate ? shortDate(order.plannedDate) : "Sin fecha"}</strong></div><div className="queue-card-actions">{ready > 0 && <button type="button" className="primary-button" onClick={() => setCalendarOrder(order)}>Planificar pendientes</button>}{editable ? <button type="button" className="secondary-button" onClick={() => setQueueSelection({ order, shipmentId: String(editable.id) })}>Replanificar</button> : <button type="button" className="secondary-button" onClick={() => onOpenOrder(order.id)}>Ver pedido</button>}</div></article>; })}</div></details>}
  </section><section className="logistics-panel logistics-planning"><header><h2>Planificación</h2><div className="logistics-header-actions"><div className="calendar-week-controls" aria-label="Navegación semanal"><button type="button" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Semana anterior"><ChevronLeft size={18} aria-hidden="true" /></button><strong aria-live="polite">{shortDate(start)} al {shortDate(end)}</strong><button type="button" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Semana siguiente"><ChevronRight size={18} aria-hidden="true" /></button></div></div></header>
    {moveMessage && <p className="board-saving" role="status">{moveMessage}</p>}
    {moving && <p className="board-saving" role="status">Moviendo salida...</p>}
    <div className="logistics-planning-board-wrap"><table className="logistics-planning-board" data-column-filters="off"><thead><tr><th scope="col" className="logistics-board-corner">Vehículo o modalidad</th>{boardDays.map((day) => <th scope="col" key={day} className={`${day === dateKey() ? "today" : ""} ${dropDay === day ? "board-day-target" : ""}`}><span>{new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(new Date(`${day}T12:00:00`))}</span><strong>{day.slice(-2)}</strong></th>)}</tr></thead>
      <tbody>{lanes.map((lane) => <tr key={lane.id}><th scope="row"><strong>{lane.name}</strong></th>{boardDays.map((day) => { const runs = runsForLane(lane.id, day).sort((a, b) => (a.plannedStartAt ?? "").localeCompare(b.plannedStartAt ?? "")); const older = legacyForLane(lane.id, day); return <td key={day} data-day={day} data-column-label={`${new Intl.DateTimeFormat("es-UY", { weekday: "long" }).format(new Date(`${day}T12:00:00`))} ${day.slice(-2)}`} className={`${day === dateKey() ? "today" : ""} ${dropDay === day && draggingLane === lane.id ? "board-drop-target" : ""}`} onDragOver={(event) => { if (!dragging || draggingLane !== lane.id || draggedDay === day || moving) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dropDay !== day) setDropDay(day); }} onDragLeave={() => { if (dropDay === day) setDropDay(""); }} onDrop={(event) => { event.preventDefault(); if (draggingLane === lane.id) dropOnDay(day, event.dataTransfer.getData("text/plain")); }}><div className="logistics-board-cell">{runs.map((run) => renderRun(run, lane.id))}{older.map((item) => renderLegacy(item, lane.id))}{dropDay === day && draggingLane === lane.id && dragging && <div className="logistics-drop-preview" aria-hidden="true"><strong>{draggedRun ? titleForRun(draggedRun, snapshot) : draggedLegacy?.order.client}</strong><small>{draggedRun ? timeValue(draggedRun.plannedStartAt) || "Sin hora" : "Viaje planificado"}</small>{draggedRun && tripWarnings(draggedRun, snapshot.runs, snapshot.settings).map((warning) => <small key={warning}>{warning}</small>)}</div>}</div></td>; })}</tr>)}</tbody>
      <tfoot><tr><th scope="row">Total de salidas</th>{boardDays.map((day) => <td key={day} data-day={day} data-column-label={`${shortDate(day)}`}><strong>{countForDay(day)}</strong></td>)}</tr></tfoot></table></div>{error && <p className="form-error" role="alert">{error}</p>}
    {calendarOrder && <PlanModal key={calendarOrder.id} order={calendarOrder} snapshot={snapshot} initialShipmentId="new" initialDate={anchor} onClose={closeCalendarOrder} onSaved={async () => { await reload(); await onChanged?.(calendarOrder.id); }} onError={setError} />}
    {queueSelection && <PlanModal key={queueSelection.shipmentId} order={queueSelection.order} snapshot={snapshot} initialShipmentId={queueSelection.shipmentId} onClose={() => setQueueSelection(null)} onSaved={async () => { await reload(); await onChanged?.(queueSelection.order.id); }} onError={setError} />}
    {reschedule && <ModalShell title="Reprogramar salida" description="Conserva el horario y registra el motivo." onClose={() => setReschedule(null)}><form className="logistics-form" onSubmit={saveReschedule}><label>Nuevo día<input type="date" value={reschedule.date} onChange={(event) => setReschedule({ ...reschedule, date: event.target.value })} /></label><label>Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setReschedule(null)}>Cancelar</button><button type="submit" className="primary-button">Guardar</button></div></form></ModalShell>}
  </section></>;
}

function formatDuration(seconds: number) { const minutes = Math.round(seconds / 60); const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours} h ${String(rest).padStart(2, "0")} min` : `${rest} min`; }
function MapView({ snapshot, reload }: { snapshot: Snapshot; reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(snapshot.runs.filter((item) => item.status !== "cancelled").length > 1 ? "all" : String(snapshot.runs[0]?.id ?? ""));
  const [selectedClientId, setSelectedClientId] = useState("");
  const [editDestination, setEditDestination] = useState(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const activeRuns = snapshot.runs.filter((item) => item.status !== "cancelled");
  const showAll = selectedId === "all" && activeRuns.length > 1;
  const run = showAll ? undefined : activeRuns.find((item) => String(item.id) === selectedId) ?? activeRuns[0];
  const routes = useMemo<MapRoute[]>(() => activeRuns.flatMap((item, index) => (showAll || item === run)
    ? [{ run: item, title: titleForRun(item, snapshot), color: routeColors[index % routeColors.length] }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [snapshot, selectedId, showAll]);
  const [address, setAddress] = useState(run?.destinationAddress ?? "");
  const evaluate = async () => { if (!run) return; setSaving(true); setError(""); try { await api(`/api/logistics/routes/${run.id}`, "POST"); await reload(); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo evaluar."); } finally { setSaving(false); } };
  const saveDestination = async (latitude?: number, longitude?: number) => {
    if (!run) return; setSaving(true); setError(""); try { await api("/api/logistics/runs", "PATCH", { ...run,
      destinationAddress: address, destinationLatitude: latitude ?? run.destinationLatitude,
      destinationLongitude: longitude ?? run.destinationLongitude,
      destinationPrecision: latitude !== undefined ? "exact" : run.destinationPrecision, responsible: "Mapa de Logística" });
      await reload(); setEditDestination(false); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el destino."); } finally { setSaving(false); }
  };
  const clientTravel = useMemo<ClientTravelPoint[]>(() => snapshot.clients.flatMap((client) => {
    const location = snapshot.locations.find((item) => item.entityType === "client" && item.entityId === client.id);
    const limit = snapshot.clientLimits.find((item) => item.clientId === client.id);
    if (!location || location.latitude === undefined || location.longitude === undefined
      || limit?.distanceKm === undefined || limit.travelHours === undefined
      || !isOutsidePaysanduCity(client, location)) return [];
    return [{ id: client.id, name: client.name, address: location.address,
      latitude: location.latitude, longitude: location.longitude, distanceKm: limit.distanceKm,
      travelHours: limit.travelHours, precision: location.precision }];
  }).sort((a, b) => a.travelHours - b.travelHours || a.name.localeCompare(b.name, "es")),
  [snapshot.clients, snapshot.locations, snapshot.clientLimits]);
  const calculatedAt = new Date(travelTimes.calculatedAt).toLocaleDateString("es-UY", { day: "2-digit", month: "long", year: "numeric" });
  return <section className="logistics-panel logistics-travel-panel"><header><h2>Mapa de tiempos desde Paysandú</h2></header>
    <div className="travel-map-intro"><span>Consulta: {calculatedAt}</span></div>
    <div className="travel-map-layout">
      <UruguayTravelMap clients={clientTravel} selectedClientId={selectedClientId} routes={routes} editDestination={editDestination && !showAll}
        onDestinationClick={(latitude, longitude) => void saveDestination(latitude, longitude)} />
      <aside className="travel-map-sidebar" aria-label="Tiempos por zona">
        <h3>Alcance desde Paysandú</h3>
        <ul className="travel-map-legend">{travelBands.map((band) => <li key={band.label}><i style={{ background: band.color }} aria-hidden="true" /><span>{band.label}</span></li>)}</ul>
        <h3>Clientes fuera de Paysandú</h3>
        {clientTravel.length ? <div className="travel-map-cities">{clientTravel.map((client) => <button key={client.id} type="button" aria-pressed={selectedClientId === client.id} className={selectedClientId === client.id ? "selected" : ""} onClick={() => setSelectedClientId(client.id)}><span>{client.name}<small>{client.precision === "exact" ? client.address : `${client.address} (zona aproximada)`}</small></span><strong>{client.distanceKm.toLocaleString("es-UY", { maximumFractionDigits: 1 })} km<br />{client.travelHours.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} h</strong></button>)}</div>
          : <p className="travel-map-no-clients">Todavía no hay recorridos de clientes fuera de Paysandú registrados en Distancia.</p>}
      </aside>
    </div>
    <p className="travel-map-source">Estimación regional para automóvil. Los tiempos de cada salida con camión se evalúan por separado. Cartografía: <a href="https://sit.mvot.gub.uy/arcgis/rest/services/07_EXTERNO/LIMITES_ADMINISTRATIVOS/MapServer/3" target="_blank" rel="noreferrer">IGM</a> y <a href="https://sit.mvot.gub.uy/arcgis/rest/services/06_PROY/Sistema_Urbano_Nacional/MapServer/9" target="_blank" rel="noreferrer">MVOT</a>. Rutas: <a href="https://project-osrm.org/" target="_blank" rel="noreferrer">OSRM</a>, datos de OpenStreetMap.</p>
    <section className="route-panel" aria-labelledby="route-panel-title">
      <header className="route-panel-head"><h3 id="route-panel-title">Rutas de salidas planificadas{activeRuns.length ? ` (${activeRuns.length})` : ""}</h3>
        {activeRuns.length > 0 && <label className="route-select"><span className="sr-only">Salida</span><select value={showAll ? "all" : String(run?.id ?? "")} onChange={(event) => { const id = event.target.value; const selected = snapshot.runs.find((item) => String(item.id) === id); setSelectedId(id); setEditDestination(false); setAddress(selected?.destinationAddress ?? ""); }}>{activeRuns.length > 1 && <option value="all">Ver todas las rutas</option>}{activeRuns.map((item) => <option key={item.id} value={String(item.id)}>{shortDate(item.plannedDate)}: {titleForRun(item, snapshot)}</option>)}</select></label>}
      </header>
      {showAll ? <ul className="route-legend" aria-label="Rutas de todas las salidas">{routes.map(({ run: item, title, color }) => <li key={item.id}>
        <i style={{ background: color }} aria-hidden="true" />
        <div><strong>{title}</strong><small>{shortDate(item.plannedDate)}{item.destinationAddress ? `, ${item.destinationAddress}` : ""}</small></div>
        <dl><div><dt>Distancia</dt><dd>{item.routeDistanceM !== undefined ? `${(item.routeDistanceM / 1000).toLocaleString("es-UY", { maximumFractionDigits: 0 })} km` : "Sin calcular"}</dd></div>
          <div><dt>Conducción</dt><dd>{item.routeDurationS !== undefined ? formatDuration(item.routeDurationS) : "Sin calcular"}</dd></div>
          <div><dt>Salida y regreso</dt><dd>{timeValue(item.plannedStartAt) || "Sin hora"}{item.plannedEndAt ? ` a ${timeValue(item.plannedEndAt)}` : ""}</dd></div></dl>
        <button type="button" className="secondary-button" onClick={() => { setSelectedId(String(item.id)); setAddress(item.destinationAddress ?? ""); }}>Ver detalle</button>
      </li>)}</ul>
      : !run ? <p className="route-empty">Cuando se planifique una salida, su ruta se podrá consultar acá.</p> : <div className="route-panel-grid">
        <section className="route-card" aria-labelledby="route-result-title"><h4 id="route-result-title">Recorrido del camión</h4>
          <dl className="route-stats">
            <div><dt>Distancia, ida y vuelta</dt><dd>{run.routeDistanceM !== undefined ? `${(run.routeDistanceM / 1000).toLocaleString("es-UY", { maximumFractionDigits: 0 })} km` : "Sin calcular"}</dd></div>
            <div><dt>Conducción</dt><dd>{run.routeDurationS !== undefined ? formatDuration(run.routeDurationS) : "Sin calcular"}</dd></div>
            <div><dt>Regreso calculado</dt><dd>{timeValue(run.plannedEndAt) || "Sin calcular"}</dd></div>
          </dl>
          <p className="route-reason"><span className={`logistics-route-badge ${run.routeStatus ?? "no_data"}`}>{run.routeStatus ? routeLabel[run.routeStatus] : "Sin datos"}</span>{run.routeReason ?? "Esta salida todavía no tiene una evaluación de ruta."}</p>
          {run.routeCheckedAt && <small className="route-checked">Última consulta: {new Date(run.routeCheckedAt).toLocaleString("es-UY")}</small>}
          <button type="button" className="primary-button" onClick={() => void evaluate()} disabled={saving}>{run.routeCheckedAt ? "Recalcular ruta del camión" : "Calcular ruta del camión"}</button>
          {tripWarnings(run, snapshot.runs, snapshot.settings).map((warning) => <Notice key={warning}>{warning}</Notice>)}
        </section>
        <section className="route-card" aria-labelledby="route-edit-title"><h4 id="route-edit-title">Corregir destino</h4>
          <div className="route-field"><label htmlFor="route-address">Dirección de destino</label><div className="route-field-row"><input id="route-address" value={address} onChange={(event) => setAddress(event.target.value)} /><button type="button" className="secondary-button" onClick={() => void saveDestination()} disabled={saving}>Guardar dirección</button></div></div>
          <div className="route-field"><span className="route-field-label">Destino en el mapa</span><button type="button" className="secondary-button" aria-pressed={editDestination} onClick={() => setEditDestination((current) => !current)}>{editDestination ? "Cancelar elección en el mapa" : "Elegir destino en el mapa"}</button>{editDestination && <small>Hacé clic en el mapa para fijar el destino de esta salida.</small>}</div>
        </section>
      </div>}
      {error && <p className="form-error">{error}</p>}
    </section>
  </section>;
}

export default function LogisticsWorkspace({ view, onOpenOrder, onChanged }: { view: View; onOpenOrder: (id: string) => void; onChanged?: (id: string) => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => { setLoading(true); try { const data = await api<Snapshot>("/api/logistics/snapshot"); setSnapshot(data); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar Logística."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void reload(); }, 0); return () => window.clearTimeout(timer); }, [reload]);
  const content = useMemo(() => { if (!snapshot) return null; if (view === "trips") return <CalendarView snapshot={snapshot} reload={reload} onOpenOrder={onOpenOrder} onChanged={onChanged} />; if (view === "map") return <MapView snapshot={snapshot} reload={reload} />; if (view === "limits") return <LogisticsLimitsView snapshot={snapshot} reload={reload} />; return <RealTransportView snapshot={snapshot} reload={reload} onOpenOrder={onOpenOrder} onChanged={onChanged} />; }, [snapshot, view, reload, onChanged, onOpenOrder]);
  return <div className="logistics-workspace">{loading && !snapshot && <p>Cargando Logística...</p>}{error && <p className="form-error">{error}</p>}{content}</div>;
}
