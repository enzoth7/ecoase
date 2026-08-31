import { getOrderPlannedDate, getOrderStage, type CapacityOperation, type CapacityStatus, type OperationOrder, type Provider, type TransportSource } from "./data.ts";
import {
  buildProductionCapacity,
  type ProductionCapacityRule,
  type ProductionCapacitySnapshot,
  type ProductionDailyOverride,
  type ProductionProduct,
  type ProductionResource,
} from "./production-capacity.ts";

export const capacityOperationLabels: Record<CapacityOperation, string> = {
  assembly: "Armado",
  treatment: "Marcado",
  marking: "Marcado",
  ht: "Marcado",
};

export type CapacityRule = { operation: CapacityOperation; peopleCount: number; palletCapacity: number };
export type InternalProductionDefault = { operation: CapacityOperation; peopleCount: number; manualCapacity?: number };
export type InternalTeamCapacity = { availablePeople?: number };
export type DailyInternalTeam = InternalTeamCapacity & { basePeople: number; additionalPeople: number; assignedPeople: number; freePeople?: number; missingPeople: number };
export type ExternalProductionDefault = { id?: string; providerId: string; operation: CapacityOperation; palletCapacity: number; status: CapacityStatus };
export type TransportCapacityDefault = { id?: string; source: TransportSource; providerId?: string; palletCapacity: number; tripCapacity?: number; status: CapacityStatus };
export type CapacityAdjustment = { date: string; resourceType: "internal_production" | "external_production" | "transport"; operation?: CapacityOperation; source?: TransportSource; providerId?: string; palletAdjustment: number; tripAdjustment?: number; peopleCount?: number; responsible?: string; status?: CapacityStatus };

export type CapacityOperationSummary = { operation: CapacityOperation; peopleCount: number; peopleAdditional: number; peopleAssigned: number; baseCapacity?: number; adjustment: number; adjustmentResponsible?: string; capacity?: number; committed: number; available?: number; overload: number };
export type ExternalCapacitySummary = { providerId: string; providerName: string; operation: CapacityOperation; status: CapacityStatus; baseCapacity?: number; adjustment: number; adjustmentResponsible?: string; capacity?: number; committed: number; available?: number; overload: number };
export type TransportCapacitySummary = { source: TransportSource; providerId?: string; providerName: string; status: CapacityStatus; baseCapacity?: number; adjustment: number; adjustmentResponsible?: string; capacity?: number; committed: number; available?: number; overload: number; baseTripCapacity?: number; tripAdjustment: number; tripCapacity?: number; tripsCommitted: number; tripsAvailable?: number; tripsOverload: number };
export type CapacityDay = { date: string; internalProduction: CapacityOperationSummary[]; internalTeam: DailyInternalTeam; externalProduction: ExternalCapacitySummary[]; imports: Array<{ orderId: string; client: string; pallets: number }>; productionTotals: { committed: number; capacity?: number; available?: number; missing: number }; transport: TransportCapacitySummary[]; transportTotals: { internal: number; externalConfirmed: number; externalEstimated: number; committed: number; missing: number; tripCapacity?: number; tripsCommitted: number; tripsAvailable?: number; tripsMissing: number; internalTripCapacity?: number; internalTripsCommitted: number; externalTripCapacity?: number; externalTripsCommitted: number }; issues: string[] };
export type CapacitySnapshot = { from: string; to: string; rules: CapacityRule[]; internalDefaults: InternalProductionDefault[]; internalTeam: InternalTeamCapacity; externalDefaults: ExternalProductionDefault[]; transportDefaults: TransportCapacityDefault[]; adjustments: CapacityAdjustment[]; days: CapacityDay[]; production: ProductionCapacitySnapshot };

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const current = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (current <= end) {
    dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function adjustedCapacity(base: number | undefined, adjustment: number) {
  if (base === undefined && adjustment === 0) return undefined;
  return Math.max((base ?? 0) + adjustment, 0);
}

export function buildCapacitySnapshot(input: { from: string; to: string; rules: CapacityRule[]; internalDefaults: InternalProductionDefault[]; availablePeople?: number; externalDefaults: ExternalProductionDefault[]; transportDefaults: TransportCapacityDefault[]; adjustments: CapacityAdjustment[]; orders: OperationOrder[]; providers: Provider[]; productionResources?: ProductionResource[]; productionRules?: ProductionCapacityRule[]; productionOverrides?: ProductionDailyOverride[]; productionProducts?: ProductionProduct[] }): CapacitySnapshot {
  const providerNames = new Map(input.providers.map((provider) => [provider.id, provider.name]));
  const activeOrders = input.orders.filter((order) => !["cancelado", "completado"].includes(getOrderStage(order)));
  const logisticsOrders = input.orders.filter((order) => getOrderStage(order) !== "cancelado");
  const internalTeam: InternalTeamCapacity = { availablePeople: input.availablePeople };
  const days = datesBetween(input.from, input.to).map<CapacityDay>((date) => {
    const productionCommitments = activeOrders.flatMap((order) => {
      const allocations = order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled" && item.plannedDate === date).map((item) => ({ order, quantity: item.plannedQuantity, resourceId: item.resourceId })));
      return allocations.length ? allocations : order.productionDate === date ? [{ order, quantity: order.requested, resourceId: order.producerProviderId ?? (order.productionSource === "internal" ? "internal" : undefined) }] : [];
    });
    const deliveryShipments = activeOrders.flatMap((order) => (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && shipment.plannedDate === date).map((shipment) => ({ order, shipment, quantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0) })));
    const deliveryOrders = activeOrders.filter((order) => !(order.shipments?.length) && getOrderPlannedDate(order) === date);
    const tripShipments = logisticsOrders.flatMap((order) => (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && shipment.plannedDate === date).map((shipment) => ({ order, shipment })));
    const tripOrders = logisticsOrders.filter((order) => !(order.shipments?.length) && getOrderPlannedDate(order) === date);
    const internalProduction = (["assembly", "marking", "ht"] as CapacityOperation[]).map((operation) => {
      const defaults = input.internalDefaults.find((item) => item.operation === operation);
      const rule = defaults ? input.rules.find((item) => item.operation === operation && item.peopleCount === defaults.peopleCount) : undefined;
      const baseCapacity = defaults?.manualCapacity ?? rule?.palletCapacity;
      const adjustmentEntry = input.adjustments.find((item) => item.date === date && item.resourceType === "internal_production" && item.operation === operation);
      const adjustment = adjustmentEntry?.palletAdjustment ?? 0;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const committed = productionCommitments.filter((entry) => (entry.order.productionSource ?? "internal") === "internal" && (entry.order.requiredOperations ?? ["assembly"]).includes(operation)).reduce((sum, entry) => sum + entry.quantity, 0);
      const peopleCount = defaults?.peopleCount ?? 0;
      const peopleAdditional = adjustmentEntry?.peopleCount ?? 0;
      return { operation, peopleCount, peopleAdditional, peopleAssigned: peopleCount + peopleAdditional, baseCapacity, adjustment, adjustmentResponsible: adjustmentEntry?.responsible, capacity, committed, available: capacity === undefined ? undefined : Math.max(capacity - committed, 0), overload: capacity === undefined ? 0 : Math.max(committed - capacity, 0) };
    });
    const basePeople = internalProduction.reduce((sum, entry) => sum + entry.peopleCount, 0);
    const additionalPeople = internalProduction.reduce((sum, entry) => sum + entry.peopleAdditional, 0);
    const peopleAssigned = basePeople + additionalPeople;
    const dayInternalTeam: DailyInternalTeam = { availablePeople: input.availablePeople, basePeople, additionalPeople, assignedPeople: peopleAssigned, freePeople: input.availablePeople === undefined ? undefined : Math.max(input.availablePeople - peopleAssigned, 0), missingPeople: input.availablePeople === undefined ? 0 : Math.max(peopleAssigned - input.availablePeople, 0) };

    const externalKeys = new Set(input.externalDefaults.map((item) => `${item.providerId}|${item.operation}`));
    for (const entry of productionCommitments.filter((item) => item.order.productionSource === "sawmill" && (item.resourceId || item.order.producerProviderId))) for (const operation of entry.order.requiredOperations ?? ["assembly"]) externalKeys.add(`${entry.resourceId ?? entry.order.producerProviderId}|${operation}`);
    for (const adjustment of input.adjustments.filter((item) => item.date === date && item.resourceType === "external_production" && item.providerId && item.operation)) externalKeys.add(`${adjustment.providerId}|${adjustment.operation}`);
    const externalProduction = [...externalKeys].map((key) => {
      const [providerId, operation] = key.split("|") as [string, CapacityOperation];
      const defaults = input.externalDefaults.find((item) => item.providerId === providerId && item.operation === operation);
      const adjustmentEntry = input.adjustments.find((item) => item.date === date && item.resourceType === "external_production" && item.providerId === providerId && item.operation === operation);
      const adjustment = adjustmentEntry?.palletAdjustment ?? 0;
      const baseCapacity = defaults?.palletCapacity;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const committed = productionCommitments.filter((entry) => entry.order.productionSource === "sawmill" && (entry.resourceId ?? entry.order.producerProviderId) === providerId && (entry.order.requiredOperations ?? ["assembly"]).includes(operation)).reduce((sum, entry) => sum + entry.quantity, 0);
      return { providerId, providerName: providerNames.get(providerId) ?? "Proveedor", operation, status: adjustmentEntry?.status ?? defaults?.status ?? "estimated", baseCapacity, adjustment, adjustmentResponsible: adjustmentEntry?.responsible, capacity, committed, available: capacity === undefined ? undefined : Math.max(capacity - committed, 0), overload: capacity === undefined ? 0 : Math.max(committed - capacity, 0) };
    });

    const imports = activeOrders.filter((order) => order.productionSource === "import" && order.importArrivalDate === date).map((order) => ({ orderId: order.id, client: order.client, pallets: order.requested }));
    const productionCommitted = productionCommitments.filter((entry) => entry.order.productionSource !== "import").reduce((sum, entry) => sum + entry.quantity, 0);
    const internalAssembly = internalProduction.find((entry) => entry.operation === "assembly");
    const confirmedExternalAssembly = externalProduction.filter((entry) => entry.operation === "assembly" && entry.status === "confirmed");
    const knownProductionCapacity = (internalAssembly?.capacity ?? 0) + confirmedExternalAssembly.reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const hasProductionCapacity = internalAssembly?.capacity !== undefined || confirmedExternalAssembly.some((entry) => entry.capacity !== undefined);
    const productionAvailable = hasProductionCapacity
      ? (internalAssembly?.available ?? 0) + confirmedExternalAssembly.reduce((sum, entry) => sum + (entry.available ?? 0), 0)
      : undefined;
    const productionMissing = !internalAssembly
      ? 0
      : internalAssembly.committed > 0 && internalAssembly.capacity === undefined
        ? internalAssembly.committed
        : internalAssembly.overload;
    const externalProductionMissing = externalProduction.filter((entry) => entry.operation === "assembly").reduce((sum, entry) => {
      if (entry.committed === 0) return sum;
      if (entry.status !== "confirmed" || entry.capacity === undefined) return sum + entry.committed;
      return sum + entry.overload;
    }, 0);
    const productionTotals = { committed: productionCommitted, capacity: hasProductionCapacity ? knownProductionCapacity : undefined, available: productionAvailable, missing: productionMissing + externalProductionMissing };
    const transportKeys = new Set(["internal|internal", ...input.transportDefaults.map((item) => `${item.source}|${item.providerId ?? "internal"}`)]);
    for (const { shipment } of tripShipments) transportKeys.add(`${shipment.transportSource}|${shipment.transportProviderId ?? "internal"}`);
    for (const order of deliveryOrders) transportKeys.add(`${order.transportSource ?? "external"}|${order.transportProviderId ?? "internal"}`);
    for (const adjustment of input.adjustments.filter((item) => item.date === date && item.resourceType === "transport" && item.source)) transportKeys.add(`${adjustment.source}|${adjustment.providerId ?? "internal"}`);
    const transport = [...transportKeys].map((key) => {
      const [source, providerKey] = key.split("|") as [TransportSource, string];
      const providerId = source === "external" && providerKey !== "internal" ? providerKey : undefined;
      const defaults = input.transportDefaults.find((item) => item.source === source && (item.providerId ?? "") === (providerId ?? ""));
      const adjustmentEntry = input.adjustments.find((item) => item.date === date && item.resourceType === "transport" && item.source === source && (item.providerId ?? "") === (providerId ?? ""));
      const adjustment = adjustmentEntry?.palletAdjustment ?? 0;
      const baseCapacity = defaults?.palletCapacity;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const tripAdjustment = adjustmentEntry?.tripAdjustment ?? 0;
      const baseTripCapacity = defaults?.tripCapacity;
      const tripCapacity = adjustedCapacity(baseTripCapacity, tripAdjustment);
      const shipmentCommitted = deliveryShipments.filter(({ shipment }) => shipment.transportSource === source && (source === "internal" || shipment.transportProviderId === providerId)).reduce((sum, entry) => sum + entry.quantity, 0);
      const legacyCommitted = deliveryOrders.filter((order) => (order.transportSource ?? "external") === source && (source === "internal" || order.transportProviderId === providerId)).reduce((sum, order) => sum + order.requested, 0);
      const committed = shipmentCommitted + legacyCommitted;
      const tripsCommitted = tripShipments.filter(({ shipment }) => shipment.transportSource === source && (source === "internal" || shipment.transportProviderId === providerId)).length + tripOrders.filter((order) => (order.transportSource ?? "external") === source && (source === "internal" || order.transportProviderId === providerId)).length;
      return { source, providerId, providerName: source === "internal" ? "Transporte interno" : providerNames.get(providerId ?? "") ?? "Transportista", status: adjustmentEntry?.status ?? defaults?.status ?? (source === "internal" ? "confirmed" : "estimated"), baseCapacity, adjustment, adjustmentResponsible: adjustmentEntry?.responsible, capacity, committed, available: capacity === undefined ? undefined : Math.max(capacity - committed, 0), overload: capacity === undefined ? 0 : Math.max(committed - capacity, 0), baseTripCapacity, tripAdjustment, tripCapacity, tripsCommitted, tripsAvailable: tripCapacity === undefined ? undefined : Math.max(tripCapacity - tripsCommitted, 0), tripsOverload: tripCapacity === undefined ? 0 : Math.max(tripsCommitted - tripCapacity, 0) };
    });
    const internal = transport.filter((entry) => entry.source === "internal").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const externalConfirmed = transport.filter((entry) => entry.source === "external" && entry.status === "confirmed").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const externalEstimated = transport.filter((entry) => entry.source === "external" && entry.status === "estimated").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const committed = deliveryShipments.reduce((sum, entry) => sum + entry.quantity, 0) + deliveryOrders.reduce((sum, order) => sum + order.requested, 0);
    const missing = Math.max(committed - internal - externalConfirmed, 0);
    const confirmedTripEntries = transport.filter((entry) => entry.status === "confirmed" && entry.tripCapacity !== undefined);
    const configuredTripCapacity = confirmedTripEntries.reduce((sum, entry) => sum + (entry.tripCapacity ?? 0), 0);
    const hasTripCapacity = confirmedTripEntries.length > 0;
    const tripsCommitted = tripShipments.length + tripOrders.length;
    const tripsMissing = hasTripCapacity ? Math.max(tripsCommitted - configuredTripCapacity, 0) : 0;
    const internalTripEntries = confirmedTripEntries.filter((entry) => entry.source === "internal");
    const externalTripEntries = confirmedTripEntries.filter((entry) => entry.source === "external");
    const internalTripCapacity = internalTripEntries.length ? internalTripEntries.reduce((sum, entry) => sum + (entry.tripCapacity ?? 0), 0) : undefined;
    const externalTripCapacity = externalTripEntries.length ? externalTripEntries.reduce((sum, entry) => sum + (entry.tripCapacity ?? 0), 0) : undefined;
    const internalTripsCommitted = tripShipments.filter(({ shipment }) => shipment.transportSource === "internal").length + tripOrders.filter((order) => (order.transportSource ?? "external") === "internal").length;
    const externalTripsCommitted = tripsCommitted - internalTripsCommitted;
    const issues: string[] = [];
    if (dayInternalTeam.missingPeople > 0) issues.push("Faltan personas");
    if (internalProduction.some((entry) => entry.capacity === undefined)) issues.push("Producción sin definir");
    if (productionTotals.missing > 0 || internalProduction.some((entry) => entry.operation !== "assembly" && entry.committed > 0 && (entry.capacity === undefined || entry.overload > 0)) || externalProduction.some((entry) => entry.operation !== "assembly" && entry.committed > 0 && (entry.capacity === undefined || entry.overload > 0))) issues.push("Falta producción");
    if (!hasTripCapacity) issues.push("Cupos de viaje sin configurar");
    if (tripsMissing > 0) issues.push("Faltan cupos de viaje");
    return { date, internalProduction, internalTeam: dayInternalTeam, externalProduction, imports, productionTotals, transport, transportTotals: { internal, externalConfirmed, externalEstimated, committed, missing, tripCapacity: hasTripCapacity ? configuredTripCapacity : undefined, tripsCommitted, tripsAvailable: hasTripCapacity ? Math.max(configuredTripCapacity - tripsCommitted, 0) : undefined, tripsMissing, internalTripCapacity, internalTripsCommitted, externalTripCapacity, externalTripsCommitted }, issues: [...new Set(issues)] };
  });
  const production = buildProductionCapacity({
    from: input.from,
    to: input.to,
    resources: input.productionResources ?? [],
    rules: input.productionRules ?? [],
    overrides: input.productionOverrides ?? [],
    products: input.productionProducts ?? [],
    orders: input.orders,
  });
  return { from: input.from, to: input.to, rules: input.rules, internalDefaults: input.internalDefaults, internalTeam, externalDefaults: input.externalDefaults, transportDefaults: input.transportDefaults, adjustments: input.adjustments, days, production };
}
