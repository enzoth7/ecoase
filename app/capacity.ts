import { getOrderPlannedDate, getOrderStage, type CapacityOperation, type CapacityStatus, type OperationOrder, type Provider, type TransportSource } from "./data.ts";

export const capacityOperationLabels: Record<CapacityOperation, string> = { assembly: "Armado", marking: "Marcado", ht: "Tratamiento HT" };

export type CapacityRule = { operation: CapacityOperation; peopleCount: number; palletCapacity: number };
export type InternalProductionDefault = { operation: CapacityOperation; peopleCount: number; manualCapacity?: number };
export type ExternalProductionDefault = { id?: string; providerId: string; operation: CapacityOperation; palletCapacity: number; status: CapacityStatus };
export type TransportCapacityDefault = { id?: string; source: TransportSource; providerId?: string; palletCapacity: number; status: CapacityStatus };
export type CapacityAdjustment = { date: string; resourceType: "internal_production" | "external_production" | "transport"; operation?: CapacityOperation; source?: TransportSource; providerId?: string; palletAdjustment: number };

export type CapacityOperationSummary = { operation: CapacityOperation; peopleCount: number; baseCapacity?: number; adjustment: number; capacity?: number; committed: number; available?: number; overload: number };
export type ExternalCapacitySummary = { providerId: string; providerName: string; operation: CapacityOperation; status: CapacityStatus; baseCapacity?: number; adjustment: number; capacity?: number; committed: number; available?: number; overload: number };
export type TransportCapacitySummary = { source: TransportSource; providerId?: string; providerName: string; status: CapacityStatus; baseCapacity?: number; adjustment: number; capacity?: number; committed: number; available?: number; overload: number };
export type CapacityDay = { date: string; internalProduction: CapacityOperationSummary[]; externalProduction: ExternalCapacitySummary[]; imports: Array<{ orderId: string; client: string; pallets: number }>; productionTotals: { committed: number; capacity?: number; available?: number; missing: number }; transport: TransportCapacitySummary[]; transportTotals: { internal: number; externalConfirmed: number; externalEstimated: number; committed: number; missing: number }; issues: string[] };
export type CapacitySnapshot = { from: string; to: string; rules: CapacityRule[]; internalDefaults: InternalProductionDefault[]; externalDefaults: ExternalProductionDefault[]; transportDefaults: TransportCapacityDefault[]; adjustments: CapacityAdjustment[]; days: CapacityDay[] };

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

export function buildCapacitySnapshot(input: { from: string; to: string; rules: CapacityRule[]; internalDefaults: InternalProductionDefault[]; externalDefaults: ExternalProductionDefault[]; transportDefaults: TransportCapacityDefault[]; adjustments: CapacityAdjustment[]; orders: OperationOrder[]; providers: Provider[] }): CapacitySnapshot {
  const providerNames = new Map(input.providers.map((provider) => [provider.id, provider.name]));
  const activeOrders = input.orders.filter((order) => !["cancelado", "completado"].includes(getOrderStage(order)));
  const days = datesBetween(input.from, input.to).map<CapacityDay>((date) => {
    const productionOrders = activeOrders.filter((order) => order.productionDate === date);
    const deliveryOrders = activeOrders.filter((order) => getOrderPlannedDate(order) === date);
    const internalProduction = (["assembly", "marking", "ht"] as CapacityOperation[]).map((operation) => {
      const defaults = input.internalDefaults.find((item) => item.operation === operation);
      const rule = defaults ? input.rules.find((item) => item.operation === operation && item.peopleCount === defaults.peopleCount) : undefined;
      const baseCapacity = defaults?.manualCapacity ?? rule?.palletCapacity;
      const adjustment = input.adjustments.find((item) => item.date === date && item.resourceType === "internal_production" && item.operation === operation)?.palletAdjustment ?? 0;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const committed = productionOrders.filter((order) => (order.productionSource ?? "internal") === "internal" && (order.requiredOperations ?? ["assembly"]).includes(operation)).reduce((sum, order) => sum + order.requested, 0);
      return { operation, peopleCount: defaults?.peopleCount ?? 0, baseCapacity, adjustment, capacity, committed, available: capacity === undefined ? undefined : Math.max(capacity - committed, 0), overload: capacity === undefined ? 0 : Math.max(committed - capacity, 0) };
    });

    const externalKeys = new Set(input.externalDefaults.map((item) => `${item.providerId}|${item.operation}`));
    for (const order of productionOrders.filter((item) => item.productionSource === "sawmill" && item.producerProviderId)) for (const operation of order.requiredOperations ?? ["assembly"]) externalKeys.add(`${order.producerProviderId}|${operation}`);
    const externalProduction = [...externalKeys].map((key) => {
      const [providerId, operation] = key.split("|") as [string, CapacityOperation];
      const defaults = input.externalDefaults.find((item) => item.providerId === providerId && item.operation === operation);
      const adjustment = input.adjustments.find((item) => item.date === date && item.resourceType === "external_production" && item.providerId === providerId && item.operation === operation)?.palletAdjustment ?? 0;
      const baseCapacity = defaults?.palletCapacity;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const committed = productionOrders.filter((order) => order.productionSource === "sawmill" && order.producerProviderId === providerId && (order.requiredOperations ?? ["assembly"]).includes(operation)).reduce((sum, order) => sum + order.requested, 0);
      return { providerId, providerName: providerNames.get(providerId) ?? "Proveedor", operation, status: defaults?.status ?? "estimated", baseCapacity, adjustment, capacity, committed, available: capacity === undefined ? undefined : Math.max(capacity - committed, 0), overload: capacity === undefined ? 0 : Math.max(committed - capacity, 0) };
    });

    const imports = activeOrders.filter((order) => order.productionSource === "import" && order.importArrivalDate === date).map((order) => ({ orderId: order.id, client: order.client, pallets: order.requested }));
    const productionCommitted = productionOrders.filter((order) => order.productionSource !== "import").reduce((sum, order) => sum + order.requested, 0);
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
    for (const order of deliveryOrders) transportKeys.add(`${order.transportSource ?? "external"}|${order.transportProviderId ?? "internal"}`);
    const transport = [...transportKeys].map((key) => {
      const [source, providerKey] = key.split("|") as [TransportSource, string];
      const providerId = source === "external" && providerKey !== "internal" ? providerKey : undefined;
      const defaults = input.transportDefaults.find((item) => item.source === source && (item.providerId ?? "") === (providerId ?? ""));
      const adjustment = input.adjustments.find((item) => item.date === date && item.resourceType === "transport" && item.source === source && (item.providerId ?? "") === (providerId ?? ""))?.palletAdjustment ?? 0;
      const baseCapacity = defaults?.palletCapacity;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const committed = deliveryOrders.filter((order) => (order.transportSource ?? "external") === source && (source === "internal" || order.transportProviderId === providerId)).reduce((sum, order) => sum + order.requested, 0);
      return { source, providerId, providerName: source === "internal" ? "Transporte interno" : providerNames.get(providerId ?? "") ?? "Transportista", status: defaults?.status ?? (source === "internal" ? "confirmed" : "estimated"), baseCapacity, adjustment, capacity, committed, available: capacity === undefined ? undefined : Math.max(capacity - committed, 0), overload: capacity === undefined ? 0 : Math.max(committed - capacity, 0) };
    });
    const internal = transport.filter((entry) => entry.source === "internal").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const externalConfirmed = transport.filter((entry) => entry.source === "external" && entry.status === "confirmed").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const externalEstimated = transport.filter((entry) => entry.source === "external" && entry.status === "estimated").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const committed = deliveryOrders.reduce((sum, order) => sum + order.requested, 0);
    const missing = Math.max(committed - internal - externalConfirmed, 0);
    const issues: string[] = [];
    if (internalProduction.some((entry) => entry.capacity === undefined)) issues.push("Producción sin definir");
    if (productionTotals.missing > 0 || internalProduction.some((entry) => entry.operation !== "assembly" && entry.committed > 0 && (entry.capacity === undefined || entry.overload > 0)) || externalProduction.some((entry) => entry.operation !== "assembly" && entry.committed > 0 && (entry.capacity === undefined || entry.overload > 0))) issues.push("Falta producción");
    if (input.transportDefaults.length === 0) issues.push("Transporte sin definir");
    if (missing > 0) issues.push("Faltan camiones");
    return { date, internalProduction, externalProduction, imports, productionTotals, transport, transportTotals: { internal, externalConfirmed, externalEstimated, committed, missing }, issues: [...new Set(issues)] };
  });
  return { from: input.from, to: input.to, rules: input.rules, internalDefaults: input.internalDefaults, externalDefaults: input.externalDefaults, transportDefaults: input.transportDefaults, adjustments: input.adjustments, days };
}
