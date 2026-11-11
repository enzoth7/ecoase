"use client";

import { useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import type { Provider } from "../data";
import { estimatedTransportVolumeM3, estimateDailyClientOrders, isOutsidePaysanduCity, type LogisticsClientDeliveryLimit, type LogisticsLocation, type LogisticsTransportCapacity, type LogisticsVehicle } from "../logistics";

type LimitsSnapshot = {
  vehicles: LogisticsVehicle[];
  providers: Provider[];
  clients: Array<{ id: string; name: string; address?: string; department?: string }>;
  locations: LogisticsLocation[];
  transportCapacities: LogisticsTransportCapacity[];
  clientLimits: LogisticsClientDeliveryLimit[];
  limitsSchemaReady: boolean;
};
type CapacityDraft = { large: string; small: string };
type ClientDraft = { distance: string; hours: string; handling: string };
type TransportRow = {
  key: string; name: string; category: string; source: "vehicle" | "provider" | "customer_pickup";
  vehicle?: LogisticsVehicle; providerId?: string; large?: number; small?: number;
};

function optionalInteger(value: string) { return value.trim() === "" ? undefined : Number(value); }
function volumeRangeLabel(small?: number, large?: number) {
  const volume = estimatedTransportVolumeM3(small, large);
  if (!volume) return "Sin estimación";
  const format = (value: number) => value.toLocaleString("es-UY", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return volume.upper - volume.lower < 0.05 ? `${format(volume.lower)} m³` : `${format(volume.lower)} a ${format(volume.upper)} m³`;
}
const DEFAULT_HANDLING_MINUTES = 60;

export default function LogisticsLimitsView({ snapshot, reload }: { snapshot: LimitsSnapshot; reload: () => Promise<void> }) {
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, CapacityDraft>>({});
  const [clientDrafts, setClientDrafts] = useState<Record<string, ClientDraft>>({});
  const [editingCapacityKey, setEditingCapacityKey] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const save = async (key: string, body: Record<string, unknown>, success: string) => {
    setError(""); setMessage(""); setSavingKey(key);
    try {
      const response = await fetch("/api/logistics/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      await reload();
      setMessage(success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
      return false;
    } finally { setSavingKey(""); }
  };

  const rows: TransportRow[] = [
    ...snapshot.vehicles.map((vehicle) => ({ key: `vehicle:${vehicle.id}`, name: vehicle.name, category: vehicle.active ? "Propio" : "Propio, inactivo",
      source: "vehicle" as const, vehicle, large: vehicle.largeCapacity, small: vehicle.smallCapacity })),
    ...snapshot.providers.filter((provider) => provider.type === "Transporte" && !provider.internalTransport).map((provider) => {
      const capacity = snapshot.transportCapacities.find((item) => item.id === `provider:${provider.id}`);
      return { key: `provider:${provider.id}`, name: provider.name, category: "Tercerizado", source: "provider" as const,
        providerId: provider.id, large: capacity?.largeCapacity, small: capacity?.smallCapacity };
    }),
    { key: "customer_pickup", name: "Retira cliente", category: "Del cliente", source: "customer_pickup",
      large: snapshot.transportCapacities.find((item) => item.id === "customer_pickup")?.largeCapacity,
      small: snapshot.transportCapacities.find((item) => item.id === "customer_pickup")?.smallCapacity },
  ];
  const visibleRows = rows;
  const visibleClients = snapshot.clients.filter((client) => isOutsidePaysanduCity(client,
    snapshot.locations.find((location) => location.entityType === "client" && location.entityId === client.id)))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const saveCapacity = async (row: TransportRow, draft: CapacityDraft) => {
    const large = optionalInteger(draft.large); const small = optionalInteger(draft.small);
    if ([large, small].some((value) => value !== undefined && (!Number.isInteger(value) || value < 0))) {
      setError("Las capacidades deben ser cantidades enteras no negativas."); return;
    }
    const body = row.vehicle
      ? { kind: "vehicle", ...row.vehicle, largeCapacity: large, smallCapacity: small }
      : { kind: "transport_capacity", source: row.source, providerId: row.providerId, largeCapacity: large, smallCapacity: small };
    if (await save(row.key, body, `Capacidad de ${row.name} guardada.`)) {
      setCapacityDrafts((current) => { const next = { ...current }; delete next[row.key]; return next; });
      setEditingCapacityKey(null);
    }
  };
  const saveClient = async (clientId: string, clientName: string, draft: ClientDraft) => {
    const distanceKm = draft.distance.trim() === "" ? undefined : Number(draft.distance);
    const travelHours = draft.hours.trim() === "" ? undefined : Number(draft.hours);
    const handlingMinutes = draft.handling.trim() === "" ? undefined : Number(draft.handling);
    const ordersPerDay = estimateDailyClientOrders(travelHours, handlingMinutes);
    if (distanceKm !== undefined && (!Number.isFinite(distanceKm) || distanceKm < 0)) { setError("La distancia debe ser un número no negativo."); return; }
    if (travelHours !== undefined && (!Number.isFinite(travelHours) || travelHours < 0)) { setError("Las horas de viaje deben ser un número no negativo."); return; }
    if (handlingMinutes === undefined) { setError("Indicá el tiempo de carga y descarga por pedido."); return; }
    if (handlingMinutes !== undefined && (!Number.isInteger(handlingMinutes) || handlingMinutes < 0)) { setError("La carga y descarga debe indicarse en minutos enteros no negativos."); return; }
    if (await save(`client:${clientId}`, { kind: "client_limit", clientId, distanceKm, travelHours, handlingMinutes, ordersPerDay }, `Distancia de ${clientName} guardada.`)) {
      setClientDrafts((current) => { const next = { ...current }; delete next[clientId]; return next; });
      setEditingClientId(null);
    }
  };

  return <section className="logistics-panel logistics-limits-view">
    <header><h2>Límites de logística</h2></header>
    <div className="logistics-limits-sections">
      <section className="logistics-limit-card" aria-labelledby="transport-capacity-title">
        <div className="logistics-config-heading"><div><h3 id="transport-capacity-title">Capacidad por transporte</h3><small>Máximos por viaje. Volumen orientativo con palets de referencia de 120 × 100 cm y 220 × 117 cm, ambos de 10 cm de alto. No contempla peso ni apilado.</small></div></div>
        <table className="logistics-config-table logistics-transport-table" data-column-filters="off"><thead><tr><th scope="col">Transporte</th><th scope="col">Tipo</th><th scope="col">Volumen orientativo (m³)</th><th scope="col">Palets grandes por viaje</th><th scope="col">Palets chicos por viaje</th><th scope="col">Acciones</th></tr></thead><tbody>
          {visibleRows.map((row) => { const draft = capacityDrafts[row.key] ?? { large: row.large?.toString() ?? "", small: row.small?.toString() ?? "" }; const unavailable = !snapshot.limitsSchemaReady && row.source !== "vehicle"; const editing = editingCapacityKey === row.key; return <tr key={row.key}>
            <td data-label="Transporte"><strong>{row.name}</strong></td>
            <td data-label="Tipo">{row.category}</td>
            <td data-label="Volumen orientativo (m³)"><output className="logistics-volume-value">{volumeRangeLabel(editing ? optionalInteger(draft.small) : row.small, editing ? optionalInteger(draft.large) : row.large)}</output></td>
            <td data-label="Palets grandes por viaje">{editing ? <input type="number" min="0" step="1" aria-label={`${row.name}, palets grandes por viaje`} value={draft.large} onChange={(event) => setCapacityDrafts((current) => ({ ...current, [row.key]: { ...draft, large: event.target.value } }))} /> : <output>{row.large ?? "Sin definir"}</output>}</td>
            <td data-label="Palets chicos por viaje">{editing ? <input type="number" min="0" step="1" aria-label={`${row.name}, palets chicos por viaje`} value={draft.small} onChange={(event) => setCapacityDrafts((current) => ({ ...current, [row.key]: { ...draft, small: event.target.value } }))} /> : <output>{row.small ?? "Sin definir"}</output>}</td>
            <td data-label="Acciones"><div className="logistics-row-actions">{editing ? <>
              <button type="button" className="logistics-icon-action" aria-label={`Guardar capacidad de ${row.name}`} title="Guardar" disabled={Boolean(savingKey)} onClick={() => void saveCapacity(row, draft)}><Save size={18} aria-hidden="true" /></button>
              <button type="button" className="logistics-icon-action" aria-label={`Cancelar edición de ${row.name}`} title="Cancelar" disabled={Boolean(savingKey)} onClick={() => { setEditingCapacityKey(null); setCapacityDrafts((current) => { const next = { ...current }; delete next[row.key]; return next; }); }}><X size={18} aria-hidden="true" /></button>
            </> : <button type="button" className="logistics-icon-action" aria-label={`Editar capacidad de ${row.name}`} title="Editar" disabled={unavailable || Boolean(savingKey)} onClick={() => { setError(""); setEditingCapacityKey(row.key); setCapacityDrafts((current) => ({ ...current, [row.key]: { large: row.large?.toString() ?? "", small: row.small?.toString() ?? "" } })); }}><Pencil size={18} aria-hidden="true" /></button>}</div></td>
          </tr>; })}
          {!visibleRows.length && <tr><td colSpan={6}>No hay transportes configurados.</td></tr>}
        </tbody></table>
      </section>
      <section className="logistics-limit-card logistics-distance-card" aria-labelledby="client-delivery-title">
        <div className="logistics-config-heading"><div><h3 id="client-delivery-title">Distancia</h3><small>Estimación en 24 h: ida por pedido, vuelta entre pedidos y 60 min iniciales de carga y descarga por cada uno. Podés ajustar ese tiempo por cliente.</small></div></div>
        <table className="logistics-config-table" data-column-filters="off"><thead><tr><th scope="col">Cliente</th><th scope="col">Distancia (km)</th><th scope="col">Horas de ida</th><th scope="col">Carga y descarga (min/pedido)</th><th scope="col">Pedidos por día</th><th scope="col">Acciones</th></tr></thead><tbody>
          {visibleClients.map((client) => { const limit = snapshot.clientLimits.find((item) => item.clientId === client.id); const editing = editingClientId === client.id; const draft = clientDrafts[client.id] ?? { distance: limit?.distanceKm?.toString() ?? "", hours: limit?.travelHours?.toString() ?? "", handling: (limit?.handlingMinutes ?? DEFAULT_HANDLING_MINUTES).toString() }; const travelHours = editing ? draft.hours.trim() === "" ? undefined : Number(draft.hours) : limit?.travelHours; const handlingMinutes = editing ? draft.handling.trim() === "" ? undefined : Number(draft.handling) : limit?.handlingMinutes ?? DEFAULT_HANDLING_MINUTES; const estimatedOrders = estimateDailyClientOrders(travelHours, handlingMinutes); return <tr key={client.id}>
            <td data-label="Cliente"><strong>{client.name}</strong></td>
            <td data-label="Distancia">{editing ? <input type="number" min="0" step="0.1" aria-label={`${client.name}, distancia en kilómetros`} value={draft.distance} onChange={(event) => setClientDrafts((current) => ({ ...current, [client.id]: { ...draft, distance: event.target.value } }))} /> : <output>{limit?.distanceKm === undefined ? "Sin dato" : limit.distanceKm.toLocaleString("es-UY", { maximumFractionDigits: 1 })}</output>}</td>
            <td data-label="Horas de ida">{editing ? <input type="number" min="0" step="0.01" aria-label={`${client.name}, horas de ida`} value={draft.hours} onChange={(event) => setClientDrafts((current) => ({ ...current, [client.id]: { ...draft, hours: event.target.value } }))} /> : <output>{limit?.travelHours === undefined ? "Sin dato" : limit.travelHours.toLocaleString("es-UY", { maximumFractionDigits: 2 })}</output>}</td>
            <td data-label="Carga y descarga">{editing ? <input type="number" min="0" step="1" aria-label={`${client.name}, minutos de carga y descarga por pedido`} value={draft.handling} onChange={(event) => setClientDrafts((current) => ({ ...current, [client.id]: { ...draft, handling: event.target.value } }))} /> : <output className="logistics-handling-value">{limit?.handlingMinutes ?? DEFAULT_HANDLING_MINUTES} min</output>}</td>
            <td data-label="Pedidos por día"><output className="logistics-daily-orders" aria-label={`${client.name}, pedidos posibles por día`}>{estimatedOrders === undefined ? "Sin estimación" : `${estimatedOrders} aprox.`}</output></td>
            <td data-label="Acciones"><div className="logistics-row-actions">{editing ? <>
              <button type="button" className="logistics-icon-action" aria-label={`Guardar distancia de ${client.name}`} title="Guardar" disabled={Boolean(savingKey)} onClick={() => void saveClient(client.id, client.name, draft)}><Save size={18} aria-hidden="true" /></button>
              <button type="button" className="logistics-icon-action" aria-label={`Cancelar edición de ${client.name}`} title="Cancelar" disabled={Boolean(savingKey)} onClick={() => { setEditingClientId(null); setClientDrafts((current) => { const next = { ...current }; delete next[client.id]; return next; }); }}><X size={18} aria-hidden="true" /></button>
            </> : <button type="button" className="logistics-icon-action" aria-label={`Editar distancia de ${client.name}`} title="Editar" disabled={!snapshot.limitsSchemaReady || Boolean(savingKey)} onClick={() => { setError(""); setEditingClientId(client.id); setClientDrafts((current) => ({ ...current, [client.id]: { distance: limit?.distanceKm?.toString() ?? "", hours: limit?.travelHours?.toString() ?? "", handling: (limit?.handlingMinutes ?? DEFAULT_HANDLING_MINUTES).toString() } })); }}><Pencil size={18} aria-hidden="true" /></button>}</div></td>
          </tr>; })}
          {!visibleClients.length && <tr><td colSpan={6}>No hay clientes fuera de la ciudad con ubicación registrada.</td></tr>}
        </tbody></table>
      </section>
    </div>
    {!snapshot.limitsSchemaReady && <div className="logistics-config-notice" role="status">La nueva configuración de transportistas y clientes requiere aplicar la migración de base de datos para poder guardarse.</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {message && <div className="logistics-form-message" role="status">{message}</div>}
  </section>;
}
