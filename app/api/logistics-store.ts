import { calculateLineAvailability, classifyPallet, loadWarnings, tripWarnings, type LogisticsClientDeliveryLimit, type LogisticsDriver, type LogisticsLocation, type LogisticsRun, type LogisticsSettings, type LogisticsTransportCapacity, type LogisticsVehicle, type PalletClass, type RouteStatus } from "../logistics";
import { getClients, getLogisticsTreatmentProgress, getOrders, getProducts, getProviders, getStockMovements, getStockSummary } from "./store";
import { supabaseServerRequest } from "../lib/supabase";

const memory = process.env.ECOASE_DATA_BACKEND === "memory";
const defaultDrivers: LogisticsDriver[] = [{ id: "susalla", name: "Susalla", active: true }, { id: "giossa", name: "Giossa", active: true }];
const defaultVehicles: LogisticsVehicle[] = [
  { id: "howo", name: "HOWO grande", smallCapacity: 638, largeCapacity: 273, active: true },
  { id: "vw_camion", name: "Volkswagen camión", smallCapacity: 638, largeCapacity: 273, habitualDriverId: "susalla", active: true },
  { id: "vw_tractor", name: "Volkswagen tractor", smallCapacity: 560, largeCapacity: 251, habitualDriverId: "giossa", active: true },
  { id: "internacional", name: "Internacional", smallCapacity: 638, largeCapacity: 273, active: true },
];
const defaultSettings: LogisticsSettings = { originAddress: "Paysandú, Uruguay", originPrecision: "city" };
const memoryDrivers = structuredClone(defaultDrivers);
const memoryVehicles = structuredClone(defaultVehicles);
let memorySettings = { ...defaultSettings };
const memoryClasses = new Map<string, PalletClass>();
const memoryLocations: LogisticsLocation[] = [];
const memoryTransportCapacities: LogisticsTransportCapacity[] = [];
const memoryClientLimits: LogisticsClientDeliveryLimit[] = [];
const memoryRuns: LogisticsRun[] = [];

type Row = Record<string, unknown>;
function str(value: unknown) { return typeof value === "string" ? value : undefined; }
function num(value: unknown) { return typeof value === "number" ? value : undefined; }
function validCount(value: unknown) { return value === undefined || value === null || Number.isInteger(value) && Number(value) >= 0; }
function runFromRow(row: Row): LogisticsRun {
  return {
    id: row.id as number, mode: row.mode as LogisticsRun["mode"], shipmentId: num(row.shipment_id),
    providerId: str(row.provider_id), orderId: str(row.order_id), vehicleId: str(row.vehicle_id), driverId: str(row.driver_id),
    plannedDate: String(row.planned_date), plannedStartAt: str(row.planned_start_at), plannedEndAt: str(row.planned_end_at),
    endTimeSource: row.end_time_source as LogisticsRun["endTimeSource"],
    destinationAddress: str(row.destination_address), destinationLatitude: num(row.destination_latitude),
    destinationLongitude: num(row.destination_longitude), destinationPrecision: row.destination_precision as LogisticsRun["destinationPrecision"],
    routeDistanceM: num(row.route_distance_m), routeDurationS: num(row.route_duration_s),
    routeGeometry: row.route_geometry as LogisticsRun["routeGeometry"], routeCheckedAt: str(row.route_checked_at),
    routeStatus: row.route_status as RouteStatus | undefined, routeReason: str(row.route_reason),
    status: row.status as LogisticsRun["status"], note: str(row.note), responsible: String(row.responsible ?? "Operación"),
  };
}
function vehicleFromRow(row: Row): LogisticsVehicle {
  return { id: String(row.id), name: String(row.name), smallCapacity: num(row.small_capacity), largeCapacity: num(row.large_capacity),
    habitualDriverId: str(row.habitual_driver_id), lengthM: num(row.length_m), widthM: num(row.width_m),
    heightM: num(row.height_m), weightT: num(row.weight_t), active: row.active !== false };
}
function transportCapacityFromRow(row: Row): LogisticsTransportCapacity {
  return { id: String(row.id), kind: row.kind as LogisticsTransportCapacity["kind"],
    providerId: str(row.provider_id), largeCapacity: num(row.large_capacity), smallCapacity: num(row.small_capacity) };
}
function clientLimitFromRow(row: Row): LogisticsClientDeliveryLimit {
  return { clientId: String(row.client_id), distanceKm: num(row.distance_km), travelHours: num(row.travel_hours),
    handlingMinutes: num(row.handling_minutes), routeCheckedAt: str(row.route_checked_at), ordersPerDay: num(row.orders_per_day) };
}
function settingsFromRow(row?: Row): LogisticsSettings {
  return row ? { originAddress: String(row.origin_address ?? "Paysandú, Uruguay"),
    originLatitude: num(row.origin_latitude), originLongitude: num(row.origin_longitude),
    originPrecision: (row.origin_precision as LogisticsSettings["originPrecision"]) ?? "city",
    shiftStart: str(row.shift_start), shiftEnd: str(row.shift_end), breakMinutes: num(row.break_minutes),
    loadMinutes: num(row.load_minutes), unloadMinutes: num(row.unload_minutes), marginMinutes: num(row.margin_minutes) } : defaultSettings;
}
function locationFromRow(row: Row): LogisticsLocation {
  return { entityType: row.entity_type as LogisticsLocation["entityType"], entityId: String(row.entity_id),
    address: String(row.address), latitude: num(row.latitude), longitude: num(row.longitude),
    precision: row.precision as LogisticsLocation["precision"], verified: row.verified === true };
}
async function listConfiguration() {
  if (memory) return { vehicles: memoryVehicles, drivers: memoryDrivers, settings: memorySettings,
    classes: Object.fromEntries(memoryClasses), locations: memoryLocations,
    transportCapacities: memoryTransportCapacities, clientLimits: memoryClientLimits, limitsSchemaReady: true, runs: memoryRuns };
  const optionalRows = async (table: string) => {
    try { return { rows: await supabaseServerRequest<Row[]>(`/rest/v1/${table}?select=*`), available: true }; }
    catch (error) { if ((error as Error & { code?: string }).code === "PGRST205") return { rows: [], available: false }; throw error; }
  };
  const [vehicles, drivers, settings, classes, locations, runs, transportCapacities, clientLimits] = await Promise.all([
    supabaseServerRequest<Row[]>("/rest/v1/logistics_vehicles?select=*&order=name.asc"),
    supabaseServerRequest<Row[]>("/rest/v1/logistics_drivers?select=*&order=name.asc"),
    supabaseServerRequest<Row[]>("/rest/v1/logistics_settings?select=*&id=eq.1"),
    supabaseServerRequest<Row[]>("/rest/v1/logistics_product_classes?select=*"),
    supabaseServerRequest<Row[]>("/rest/v1/logistics_locations?select=*"),
    supabaseServerRequest<Row[]>("/rest/v1/logistics_runs?select=*&order=planned_date.asc,planned_start_at.asc"),
    optionalRows("logistics_transport_capacities"), optionalRows("logistics_client_delivery_limits"),
  ]);
  return { vehicles: vehicles.map(vehicleFromRow), drivers: drivers.map((row) => ({ id: String(row.id), name: String(row.name), active: row.active !== false })),
    settings: settingsFromRow(settings[0]), classes: Object.fromEntries(classes.map((row) => [String(row.product_id), row.pallet_class as PalletClass])),
    locations: locations.map(locationFromRow), transportCapacities: transportCapacities.rows.map(transportCapacityFromRow),
    clientLimits: clientLimits.rows.map(clientLimitFromRow), limitsSchemaReady: transportCapacities.available && clientLimits.available,
    runs: runs.map(runFromRow) };
}

export async function getLogisticsRuns(orderId?: string) {
  const { runs } = await listConfiguration();
  return orderId ? runs.filter((run) => run.orderId === orderId) : runs;
}

export async function getTransportRuns(from: string, to: string) {
  const { runs, vehicles } = await listConfiguration();
  return runs.filter((run) => run.status !== "cancelled" && run.plannedDate >= from && run.plannedDate <= to)
    .map((run) => ({ ...run, vehicleName: vehicles.find((vehicle) => vehicle.id === run.vehicleId)?.name }));
}

export async function getLogisticsSnapshot() {
  const [config, orders, products, clients, providers, stock, movements, batches] = await Promise.all([
    listConfiguration(), getOrders(), getProducts(), getClients(), getProviders(), getStockSummary(), getStockMovements(), getLogisticsTreatmentProgress(),
  ]);
  return { ...config, orders, products, clients: clients.map((client) => ({ id: client.id, name: client.name, address: client.address, department: client.department })),
    providers, availability: calculateLineAvailability(orders, stock, movements, batches),
    stock: stock.map((row) => ({ productId: row.product.id, ready: row.ready, pending: row.pending, available: row.available, reserved: row.reserved })) };
}

async function upsert(table: string, conflict: string, row: Row) {
  return supabaseServerRequest<Row[]>(`/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: JSON.stringify(row),
  });
}
function updateById<T>(items: T[], id: string, replacement: T, key: (item: T) => string) {
  const index = items.findIndex((item) => key(item) === id);
  if (index < 0) items.push(replacement); else items[index] = replacement;
}
export async function saveLogisticsConfig(kind: "settings" | "vehicle" | "driver" | "class" | "location" | "transport_capacity" | "client_limit", payload: Row) {
  if (kind === "settings") {
    if ([payload.breakMinutes, payload.loadMinutes, payload.unloadMinutes, payload.marginMinutes].some((value) => !validCount(value)))
      throw new Error("Los tiempos deben ser minutos enteros no negativos.");
    const settings: LogisticsSettings = { originAddress: str(payload.originAddress)?.trim() || "Paysandú, Uruguay",
      originLatitude: num(payload.originLatitude), originLongitude: num(payload.originLongitude),
      originPrecision: (payload.originPrecision as LogisticsSettings["originPrecision"]) || "city",
      shiftStart: str(payload.shiftStart), shiftEnd: str(payload.shiftEnd), breakMinutes: num(payload.breakMinutes),
      loadMinutes: num(payload.loadMinutes), unloadMinutes: num(payload.unloadMinutes), marginMinutes: num(payload.marginMinutes) };
    if (memory) { memorySettings = settings; return settings; }
    await upsert("logistics_settings", "id", { id: 1, origin_address: settings.originAddress, origin_latitude: settings.originLatitude ?? null,
      origin_longitude: settings.originLongitude ?? null, origin_precision: settings.originPrecision,
      shift_start: settings.shiftStart ?? null, shift_end: settings.shiftEnd ?? null,
      break_minutes: settings.breakMinutes ?? null, load_minutes: settings.loadMinutes ?? null,
      unload_minutes: settings.unloadMinutes ?? null, margin_minutes: settings.marginMinutes ?? null, updated_at: new Date().toISOString() });
    return settings;
  }
  if (kind === "vehicle") {
    const id = str(payload.id)?.trim(); const name = str(payload.name)?.trim();
    if (!id || !name) throw new Error("Vehículo y nombre son obligatorios.");
    if (!validCount(payload.smallCapacity) || !validCount(payload.largeCapacity))
      throw new Error("Los límites deben ser cantidades enteras no negativas.");
    const largeCapacity = num(payload.largeCapacity); const smallCapacity = num(payload.smallCapacity);
    if (largeCapacity !== undefined && smallCapacity !== undefined && largeCapacity > smallCapacity)
      throw new Error("La capacidad mínima no puede superar la máxima.");
    const vehicle: LogisticsVehicle = { id, name, smallCapacity, largeCapacity,
      habitualDriverId: str(payload.habitualDriverId), lengthM: num(payload.lengthM), widthM: num(payload.widthM),
      heightM: num(payload.heightM), weightT: num(payload.weightT), active: payload.active !== false };
    if (memory) { updateById(memoryVehicles, id, vehicle, (item) => item.id); return vehicle; }
    await upsert("logistics_vehicles", "id", { id, name, small_capacity: vehicle.smallCapacity ?? null,
      large_capacity: vehicle.largeCapacity ?? null, habitual_driver_id: vehicle.habitualDriverId ?? null,
      length_m: vehicle.lengthM ?? null, width_m: vehicle.widthM ?? null, height_m: vehicle.heightM ?? null,
      weight_t: vehicle.weightT ?? null, active: vehicle.active });
    return vehicle;
  }
  if (kind === "transport_capacity") {
    const source = payload.source;
    const providerId = str(payload.providerId);
    if (source !== "provider" && source !== "customer_pickup") throw new Error("Tipo de transporte inválido.");
    if (source === "provider" && (!providerId || !(await getProviders()).some((item) => item.id === providerId && item.type === "Transporte" && !item.internalTransport)))
      throw new Error("Transportista no encontrado.");
    if (!validCount(payload.largeCapacity) || !validCount(payload.smallCapacity)) throw new Error("Las capacidades deben ser enteros no negativos.");
    const largeCapacity = num(payload.largeCapacity); const smallCapacity = num(payload.smallCapacity);
    if (largeCapacity !== undefined && smallCapacity !== undefined && largeCapacity > smallCapacity)
      throw new Error("La capacidad mínima no puede superar la máxima.");
    const id = source === "provider" ? `provider:${providerId}` : "customer_pickup";
    const capacity: LogisticsTransportCapacity = { id, kind: source, providerId: source === "provider" ? providerId : undefined, largeCapacity, smallCapacity };
    if (memory) { updateById(memoryTransportCapacities, id, capacity, (item) => item.id); return capacity; }
    await upsert("logistics_transport_capacities", "id", { id, kind: source, provider_id: capacity.providerId ?? null,
      large_capacity: largeCapacity ?? null, small_capacity: smallCapacity ?? null, updated_at: new Date().toISOString() });
    return capacity;
  }
  if (kind === "client_limit") {
    const clientId = str(payload.clientId);
    if (!clientId || !(await getClients()).some((item) => item.id === clientId)) throw new Error("Cliente no encontrado.");
    const distanceKm = num(payload.distanceKm); const travelHours = num(payload.travelHours); const handlingMinutes = num(payload.handlingMinutes);
    const ordersPerDay = num(payload.ordersPerDay);
    if (payload.distanceKm !== undefined && payload.distanceKm !== null && (distanceKm === undefined || !Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 9999999.9))
      throw new Error("La distancia debe ser un número no negativo en kilómetros.");
    if (payload.travelHours !== undefined && payload.travelHours !== null && (travelHours === undefined || !Number.isFinite(travelHours) || travelHours < 0 || travelHours > 999.99))
      throw new Error("Las horas de viaje deben ser un número no negativo.");
    if (payload.handlingMinutes !== undefined && payload.handlingMinutes !== null && (handlingMinutes === undefined || !Number.isInteger(handlingMinutes) || handlingMinutes < 0))
      throw new Error("La carga y descarga debe indicarse en minutos enteros no negativos.");
    if (payload.ordersPerDay !== undefined && payload.ordersPerDay !== null && (ordersPerDay === undefined || !Number.isInteger(ordersPerDay) || ordersPerDay < 0))
      throw new Error("Los pedidos por día deben ser un entero no negativo.");
    const previous = (await listConfiguration()).clientLimits.find((item) => item.clientId === clientId);
    const routeCheckedAt = distanceKm === previous?.distanceKm && travelHours === previous?.travelHours ? previous?.routeCheckedAt : undefined;
    const limit: LogisticsClientDeliveryLimit = { clientId, distanceKm, travelHours, handlingMinutes, routeCheckedAt, ordersPerDay };
    if (memory) { updateById(memoryClientLimits, clientId, limit, (item) => item.clientId); return limit; }
    await upsert("logistics_client_delivery_limits", "client_id", { client_id: clientId, distance_km: distanceKm ?? null,
      travel_hours: travelHours ?? null, handling_minutes: handlingMinutes ?? null, route_checked_at: routeCheckedAt ?? null,
      orders_per_day: ordersPerDay ?? null, updated_at: new Date().toISOString() });
    return limit;
  }
  if (kind === "driver") {
    const id = str(payload.id)?.trim(); const name = str(payload.name)?.trim();
    if (!id || !name) throw new Error("Chofer y nombre son obligatorios.");
    const driver: LogisticsDriver = { id, name, active: payload.active !== false };
    if (memory) { updateById(memoryDrivers, id, driver, (item) => item.id); return driver; }
    await upsert("logistics_drivers", "id", driver); return driver;
  }
  if (kind === "class") {
    const productId = str(payload.productId); const palletClass = payload.palletClass as PalletClass | "auto";
    if (!productId || !["small", "large", "unclassified", "auto"].includes(palletClass)) throw new Error("Clasificación inválida.");
    if (palletClass === "auto") {
      if (memory) memoryClasses.delete(productId);
      else await supabaseServerRequest(`/rest/v1/logistics_product_classes?product_id=eq.${encodeURIComponent(productId)}`, { method: "DELETE" });
      return { productId, palletClass };
    }
    if (memory) { memoryClasses.set(productId, palletClass); return { productId, palletClass }; }
    await upsert("logistics_product_classes", "product_id", { product_id: productId, pallet_class: palletClass,
      reason: str(payload.reason) ?? null, updated_at: new Date().toISOString() });
    return { productId, palletClass };
  }
  const entityType = payload.entityType as LogisticsLocation["entityType"];
  const entityId = str(payload.entityId); const address = str(payload.address)?.trim();
  if (!["client","provider"].includes(entityType) || !entityId || !address) throw new Error("Ubicación inválida.");
  const location: LogisticsLocation = { entityType, entityId, address,
    latitude: num(payload.latitude), longitude: num(payload.longitude),
    precision: (payload.precision as LogisticsLocation["precision"]) || "unknown", verified: payload.verified === true };
  if (memory) { updateById(memoryLocations, `${entityType}:${entityId}`, location, (item) => `${item.entityType}:${item.entityId}`); return location; }
  await upsert("logistics_locations", "entity_type,entity_id", { entity_type: entityType, entity_id: entityId, address,
    latitude: location.latitude ?? null, longitude: location.longitude ?? null,
    precision: location.precision, verified: location.verified, updated_at: new Date().toISOString() });
  return location;
}

export async function saveLogisticsRun(payload: Row) {
  const mode = payload.mode as LogisticsRun["mode"];
  const plannedDate = str(payload.plannedDate);
  if (!["delivery","supplier_pickup","customer_pickup"].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate ?? ""))
    throw new Error("Modalidad y fecha válidas son obligatorias.");
  const shipmentId = payload.shipmentId as number | string | undefined;
  const providerId = str(payload.providerId);
  if (mode === "supplier_pickup" && !providerId || mode !== "supplier_pickup" && !shipmentId)
    throw new Error("Seleccione el viaje o proveedor correspondiente.");
  const config = await listConfiguration();
  const orders = await getOrders();
  const shipmentOrder = orders.find((order) => order.shipments?.some((shipment) => String(shipment.id) === String(shipmentId)));
  if (mode !== "supplier_pickup" && !shipmentOrder) throw new Error("Viaje no encontrado.");
  const vehicleId = mode === "customer_pickup" ? undefined : str(payload.vehicleId);
  const vehicle = config.vehicles.find((item) => item.id === vehicleId);
  const driverId = mode === "customer_pickup" ? undefined : str(payload.driverId) || vehicle?.habitualDriverId;
  if (vehicleId && !vehicle || driverId && !config.drivers.some((item) => item.id === driverId))
    throw new Error("Vehículo o chofer no encontrado.");
  const provider = mode === "supplier_pickup" ? (await getProviders()).find((item) => item.id === providerId) : undefined;
  if (mode === "supplier_pickup" && !provider) throw new Error("Proveedor no encontrado.");
  const destinationLocation = config.locations.find((item) => item.entityType === (mode === "supplier_pickup" ? "provider" : "client")
    && item.entityId === (mode === "supplier_pickup" ? providerId : shipmentOrder?.clientId));
  const previousRun = config.runs.find((item) => String(item.id) === String(payload.id));
  if (payload.id !== undefined && !previousRun) throw new Error("Salida no encontrada.");
  const plannedStartAt = str(payload.plannedStartAt);
  const plannedEndAt = str(payload.plannedEndAt);
  if (plannedStartAt && !Number.isFinite(Date.parse(plannedStartAt)) || plannedEndAt && !Number.isFinite(Date.parse(plannedEndAt))
    || plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt)
    throw new Error("Horario de salida o regreso inválido.");
  const run: LogisticsRun = {
    id: (payload.id as number | string | undefined) ?? `run-${crypto.randomUUID()}`,
    mode, shipmentId: mode === "supplier_pickup" ? undefined : shipmentId, providerId: mode === "supplier_pickup" ? providerId : undefined,
    orderId: shipmentOrder?.id ?? str(payload.orderId), vehicleId, driverId, plannedDate: plannedDate!,
    plannedStartAt, plannedEndAt,
    endTimeSource: str(payload.plannedEndAt) ? (payload.endTimeSource as LogisticsRun["endTimeSource"]) ?? "manual" : undefined,
    destinationAddress: str(payload.destinationAddress)?.trim() || destinationLocation?.address || shipmentOrder?.deliveryAddress,
    destinationLatitude: num(payload.destinationLatitude) ?? destinationLocation?.latitude,
    destinationLongitude: num(payload.destinationLongitude) ?? destinationLocation?.longitude,
    destinationPrecision: (payload.destinationPrecision as LogisticsRun["destinationPrecision"]) ?? destinationLocation?.precision ?? "unknown",
    status: (payload.status as LogisticsRun["status"]) ?? "planned", note: str(payload.note),
    responsible: str(payload.responsible)?.trim() || "Operación",
  };
  const row = { mode: run.mode, shipment_id: run.shipmentId ?? null, provider_id: run.providerId ?? null,
    order_id: run.orderId ?? null, vehicle_id: run.vehicleId ?? null, driver_id: run.driverId ?? null,
    planned_date: run.plannedDate, planned_start_at: run.plannedStartAt ?? null, planned_end_at: run.plannedEndAt ?? null,
    end_time_source: run.endTimeSource ?? null,
    destination_address: run.destinationAddress ?? null, destination_latitude: run.destinationLatitude ?? null,
    destination_longitude: run.destinationLongitude ?? null, destination_precision: run.destinationPrecision ?? "unknown",
    status: run.status, note: run.note ?? null, responsible: run.responsible };
  let saved: LogisticsRun;
  if (memory) {
    saved = { ...previousRun, ...run, routeDistanceM: undefined, routeDurationS: undefined,
      routeGeometry: undefined, routeCheckedAt: undefined, routeStatus: undefined, routeReason: undefined };
    updateById(memoryRuns, String(run.id), saved, (item) => String(item.id)); }
  else if (payload.id !== undefined) {
    const rows = await supabaseServerRequest<Row[]>(`/rest/v1/logistics_runs?id=eq.${encodeURIComponent(String(payload.id))}&select=*`,
      { method: "PATCH", prefer: "return=representation", body: JSON.stringify({ ...row,
        route_distance_m: null, route_duration_s: null, route_geometry: null,
        route_checked_at: null, route_status: null, route_reason: null }) });
    if (!rows.length) throw new Error("Salida no encontrada."); saved = runFromRow(rows[0]);
  } else {
    const rows = await supabaseServerRequest<Row[]>("/rest/v1/logistics_runs?select=*", { method: "POST", prefer: "return=representation", body: JSON.stringify(row) });
    saved = runFromRow(rows[0]);
  }
  // El regreso no se carga a mano: se calcula con la ruta de ida y vuelta apenas hay salida, vehículo y destino.
  if (saved.mode !== "customer_pickup" && saved.status === "planned" && saved.vehicleId && saved.plannedStartAt
    && saved.destinationAddress && process.env.OPENROUTESERVICE_API_KEY) {
    try { await evaluateLogisticsRoute(saved.id); } catch { /* el cálculo se puede reintentar desde Mapa */ }
  }
  return saved;
}

export async function auditLoadedShipment(shipmentId: number | string) {
  const config = await listConfiguration();
  const run = config.runs.find((item) => String(item.shipmentId) === String(shipmentId));
  const vehicle = config.vehicles.find((item) => item.id === run?.vehicleId);
  if (!run || !vehicle) return [];
  const [orders, products] = await Promise.all([getOrders(), getProducts()]);
  const order = orders.find((item) => item.shipments?.some((shipment) => String(shipment.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  const counts = { small: 0, large: 0, unclassified: 0 };
  for (const line of shipment?.lines ?? []) {
    const productId = order?.lines.find((item) => item.id === line.orderLineId)?.productId;
    const product = products.find((item) => item.id === productId);
    const kind = product ? classifyPallet(product, config.classes[product.id]) : "unclassified";
    counts[kind] += line.loadedQuantity ?? line.plannedQuantity;
  }
  const warnings = loadWarnings(counts);
  return warnings;
}

async function geocode(address: string, key: string): Promise<[number, number] | undefined> {
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", key); url.searchParams.set("text", address); url.searchParams.set("size", "1");
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) return undefined;
  const body = await response.json() as { features?: Array<{ geometry?: { coordinates?: number[] } }> };
  const point = body.features?.[0]?.geometry?.coordinates;
  return point?.length === 2 ? [point[0], point[1]] : undefined;
}

export async function evaluateLogisticsRoute(id: number | string) {
  const config = await listConfiguration();
  const run = config.runs.find((item) => String(item.id) === String(id));
  if (!run) throw new Error("Salida no encontrada.");
  const key = process.env.OPENROUTESERVICE_API_KEY;
  const settings = config.settings;
  let status: RouteStatus = "no_data";
  let reason = "Faltan la clave de rutas o ubicaciones para estimar el recorrido.";
  let origin: [number, number] | undefined = settings.originLongitude !== undefined && settings.originLatitude !== undefined
    ? [settings.originLongitude, settings.originLatitude] : undefined;
  let destination: [number, number] | undefined = run.destinationLongitude !== undefined && run.destinationLatitude !== undefined
    ? [run.destinationLongitude, run.destinationLatitude] : undefined;
  let distance: number | undefined; let duration: number | undefined;
  let geometry: LogisticsRun["routeGeometry"];
  if (run.mode === "customer_pickup") { reason = "Retira el cliente: no se calcula un recorrido de la flota."; }
  else if (key && run.destinationAddress) {
    try {
      origin ??= await geocode(settings.originAddress, key);
      destination ??= await geocode(run.destinationAddress, key);
      if (origin && destination) {
        if (settings.originLatitude === undefined && settings.originLongitude === undefined) {
          if (memory) memorySettings = { ...memorySettings, originLatitude: origin[1], originLongitude: origin[0] };
          else await supabaseServerRequest("/rest/v1/logistics_settings?id=eq.1", { method: "PATCH",
            body: JSON.stringify({ origin_latitude: origin[1], origin_longitude: origin[0] }) });
        }
        const vehicle = config.vehicles.find((item) => item.id === run.vehicleId);
        const restrictions = Object.fromEntries([
          ["length", vehicle?.lengthM], ["width", vehicle?.widthM], ["height", vehicle?.heightM], ["weight", vehicle?.weightT],
        ].filter((pair): pair is [string, number] => typeof pair[1] === "number"));
        const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
          method: "POST", headers: { Authorization: key, "Content-Type": "application/json" },
          body: JSON.stringify({ coordinates: [origin, destination, origin],
            options: { vehicle_type: "hgv", ...(Object.keys(restrictions).length ? { profile_params: { restrictions } } : {}) } }),
          signal: AbortSignal.timeout(16000),
        });
        if (!response.ok) throw new Error(`Servicio de rutas: ${response.status}`);
        const body = await response.json() as { features?: Array<{ geometry: LogisticsRun["routeGeometry"]; properties: { summary: { distance: number; duration: number } } }> };
        const route = body.features?.[0];
        if (!route) throw new Error("El servicio no devolvió un recorrido.");
        geometry = route.geometry; distance = Math.round(route.properties.summary.distance); duration = Math.round(route.properties.summary.duration);
        const warnings = tripWarnings({ ...run, destinationLatitude: destination[1], destinationLongitude: destination[0] }, config.runs, settings);
        const dimensionMissing = Boolean(vehicle && [vehicle.lengthM, vehicle.widthM, vehicle.heightM, vehicle.weightT]
          .some((value) => value === undefined));
        const timeMissing = !run.plannedStartAt || !settings.shiftStart || !settings.shiftEnd
          || settings.loadMinutes === undefined || settings.unloadMinutes === undefined
          || settings.marginMinutes === undefined || settings.breakMinutes === undefined || dimensionMissing;
        const handlingMinutes = (settings.loadMinutes ?? 0) + (settings.unloadMinutes ?? 0)
          + (settings.marginMinutes ?? 0) + (settings.breakMinutes ?? 0);
        const estimatedEnd = run.plannedStartAt ? new Date(new Date(run.plannedStartAt).getTime()
          + duration * 1000 + handlingMinutes * 60000).toISOString() : undefined;
        const evaluatedEnd = estimatedEnd;
        const shiftStart = run.plannedDate && settings.shiftStart ? new Date(`${run.plannedDate}T${settings.shiftStart.slice(0,5)}:00-03:00`).toISOString() : undefined;
        const shiftEnd = run.plannedDate && settings.shiftEnd ? new Date(`${run.plannedDate}T${settings.shiftEnd.slice(0,5)}:00-03:00`).toISOString() : undefined;
        const overlap = warnings.some((message) => message.includes("solapa")) || config.runs.some((other) => {
          if (String(other.id) === String(run.id) || other.status === "cancelled" || !other.plannedStartAt || !run.plannedStartAt) return false;
          if (!(run.vehicleId && run.vehicleId === other.vehicleId || run.driverId && run.driverId === other.driverId)) return false;
          const otherEnd = other.plannedEndAt || (other.routeDurationS !== undefined ? new Date(new Date(other.plannedStartAt).getTime()
            + other.routeDurationS * 1000 + handlingMinutes * 60000).toISOString() : undefined);
          return Boolean(otherEnd && run.plannedStartAt < otherEnd && other.plannedStartAt < (evaluatedEnd ?? ""));
        });
        const outsideShift = Boolean(run.plannedStartAt && shiftStart && run.plannedStartAt < shiftStart
          || evaluatedEnd && shiftEnd && evaluatedEnd > shiftEnd);
        status = timeMissing ? "no_data" : overlap || outsideShift ? "not_viable"
          : warnings.length ? "tight" : "viable";
        reason = timeMissing ? dimensionMissing ? "Faltan dimensiones del vehículo para evaluar restricciones de ruta."
          : "Faltan horarios o tiempos de carga, descarga, pausa y margen." : overlap ? "Hay solapamiento de vehículo o chofer."
          : status === "not_viable" ? "La vuelta cae fuera del turno." : warnings.join(" ") || "La vuelta entra en el horario configurado.";
        if (estimatedEnd) { run.plannedEndAt = estimatedEnd; run.endTimeSource = "route"; }
      }
    } catch (error) { reason = error instanceof Error ? error.message : "No se pudo calcular la ruta."; }
  }
  const update = { destination_latitude: destination?.[1] ?? null, destination_longitude: destination?.[0] ?? null,
    route_distance_m: distance ?? null, route_duration_s: duration ?? null, route_geometry: geometry ?? null,
    route_checked_at: new Date().toISOString(), route_status: status, route_reason: reason,
    planned_end_at: run.plannedEndAt ?? null, end_time_source: run.endTimeSource ?? null };
  if (memory) Object.assign(run, { destinationLatitude: destination?.[1], destinationLongitude: destination?.[0],
    routeDistanceM: distance, routeDurationS: duration, routeGeometry: geometry, routeCheckedAt: update.route_checked_at,
    routeStatus: status, routeReason: reason, plannedEndAt: run.plannedEndAt, endTimeSource: run.endTimeSource });
  else await supabaseServerRequest(`/rest/v1/logistics_runs?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", body: JSON.stringify(update) });
  return { status, reason, distanceM: distance, durationS: duration, geometry, origin, destination, checkedAt: update.route_checked_at };
}
