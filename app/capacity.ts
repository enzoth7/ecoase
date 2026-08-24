import { getOrderPlannedDate, getOrderStage, type CapacityOperation, type CapacityStatus, type OperationOrder, type Provider, type TransportSource } from "./data.ts";

export const capacityOperationLabels: Record<CapacityOperation, string> = {
  assembly: "Armado",
  marking: "Marcado",
  ht: "Tratamiento HT",
};

export type CapacityRule = {
  operation: CapacityOperation;
  peopleCount: number;
  palletCapacity: number;
};

export type InternalProductionEntry = {
  date: string;
  operation: CapacityOperation;
  peopleCount: number;
  manualCapacity?: number;
};

export type ExternalProductionEntry = {
  id?: string;
  date: string;
  providerId: string;
  operation: CapacityOperation;
  palletCapacity: number;
  status: CapacityStatus;
};

export type TransportCapacityEntry = {
  id?: string;
  date: string;
  source: TransportSource;
  providerId?: string;
  palletCapacity: number;
  status: CapacityStatus;
};

export type CapacityOperationSummary = {
  operation: CapacityOperation;
  peopleCount: number;
  capacity?: number;
  committed: number;
  available?: number;
  overload: number;
};

export type ExternalCapacitySummary = Omit<ExternalProductionEntry, "palletCapacity"> & {
  palletCapacity?: number;
  providerName: string;
  committed: number;
  available?: number;
  overload: number;
};

export type TransportCapacitySummary = TransportCapacityEntry & {
  providerName: string;
  committed: number;
  available: number;
  overload: number;
};

export type CapacityDay = {
  date: string;
  internalProduction: CapacityOperationSummary[];
  externalProduction: ExternalCapacitySummary[];
  imports: Array<{ orderId: string; client: string; pallets: number }>;
  transport: TransportCapacitySummary[];
  transportTotals: { internal: number; externalConfirmed: number; externalEstimated: number; committed: number; missing: number };
};

export type CapacitySnapshot = {
  from: string;
  to: string;
  rules: CapacityRule[];
  internalEntries: InternalProductionEntry[];
  externalEntries: ExternalProductionEntry[];
  transportEntries: TransportCapacityEntry[];
  days: CapacityDay[];
};

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const current = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function reservesCapacity(order: OperationOrder) {
  const stage = getOrderStage(order);
  return stage !== "cancelado" && stage !== "completado";
}

export function buildCapacitySnapshot(input: {
  from: string;
  to: string;
  rules: CapacityRule[];
  internalEntries: InternalProductionEntry[];
  externalEntries: ExternalProductionEntry[];
  transportEntries: TransportCapacityEntry[];
  orders: OperationOrder[];
  providers: Provider[];
}): CapacitySnapshot {
  const providerNames = new Map(input.providers.map((provider) => [provider.id, provider.name]));
  const activeOrders = input.orders.filter(reservesCapacity);
  const days = datesBetween(input.from, input.to).map<CapacityDay>((date) => {
    const productionOrders = activeOrders.filter((order) => order.productionDate === date);
    const deliveryOrders = activeOrders.filter((order) => getOrderPlannedDate(order) === date);
    const internalProduction = (["assembly", "marking", "ht"] as CapacityOperation[]).map((operation) => {
      const entry = input.internalEntries.find((item) => item.date === date && item.operation === operation);
      const rule = entry ? input.rules.find((item) => item.operation === operation && item.peopleCount === entry.peopleCount) : undefined;
      const capacity = entry?.manualCapacity ?? rule?.palletCapacity;
      const committed = productionOrders
        .filter((order) => (order.productionSource ?? "internal") === "internal" && (order.requiredOperations ?? ["assembly"]).includes(operation))
        .reduce((sum, order) => sum + order.requested, 0);
      return { operation, peopleCount: entry?.peopleCount ?? 0, capacity, committed, available: capacity === undefined ? undefined : Math.max(capacity - committed, 0), overload: capacity === undefined ? 0 : Math.max(committed - capacity, 0) };
    });

    const configuredExternal = input.externalEntries.filter((entry) => entry.date === date);
    const externalKeys = new Set(configuredExternal.map((entry) => `${entry.providerId}|${entry.operation}`));
    for (const order of productionOrders.filter((item) => item.productionSource === "sawmill" && item.producerProviderId)) {
      for (const operation of order.requiredOperations ?? ["assembly"]) externalKeys.add(`${order.producerProviderId}|${operation}`);
    }
    const externalProduction = [...externalKeys].map((key) => {
      const [providerId, operation] = key.split("|") as [string, CapacityOperation];
      const entry = configuredExternal.find((item) => item.providerId === providerId && item.operation === operation);
      const committed = productionOrders.filter((order) => order.productionSource === "sawmill" && order.producerProviderId === providerId && (order.requiredOperations ?? ["assembly"]).includes(operation)).reduce((sum, order) => sum + order.requested, 0);
      const palletCapacity = entry?.palletCapacity;
      return { id: entry?.id, date, providerId, operation, status: entry?.status ?? "estimated", palletCapacity, providerName: providerNames.get(providerId) ?? "Proveedor", committed, available: palletCapacity === undefined ? undefined : Math.max(palletCapacity - committed, 0), overload: palletCapacity === undefined ? 0 : Math.max(committed - palletCapacity, 0) };
    });

    const imports = activeOrders.filter((order) => order.productionSource === "import" && order.importArrivalDate === date).map((order) => ({ orderId: order.id, client: order.client, pallets: order.requested }));
    const transport = input.transportEntries.filter((entry) => entry.date === date).map((entry) => {
      const committed = deliveryOrders.filter((order) => (order.transportSource ?? "external") === entry.source && (entry.source === "internal" || order.transportProviderId === entry.providerId)).reduce((sum, order) => sum + order.requested, 0);
      return { ...entry, providerName: entry.source === "internal" ? "Transporte interno" : providerNames.get(entry.providerId ?? "") ?? "Transportista", committed, available: Math.max(entry.palletCapacity - committed, 0), overload: Math.max(committed - entry.palletCapacity, 0) };
    });
    const internal = transport.filter((entry) => entry.source === "internal").reduce((sum, entry) => sum + entry.palletCapacity, 0);
    const externalConfirmed = transport.filter((entry) => entry.source === "external" && entry.status === "confirmed").reduce((sum, entry) => sum + entry.palletCapacity, 0);
    const externalEstimated = transport.filter((entry) => entry.source === "external" && entry.status === "estimated").reduce((sum, entry) => sum + entry.palletCapacity, 0);
    const committed = deliveryOrders.reduce((sum, order) => sum + order.requested, 0);
    return { date, internalProduction, externalProduction, imports, transport, transportTotals: { internal, externalConfirmed, externalEstimated, committed, missing: Math.max(committed - internal - externalConfirmed, 0) } };
  });
  return { from: input.from, to: input.to, rules: input.rules, internalEntries: input.internalEntries, externalEntries: input.externalEntries, transportEntries: input.transportEntries, days };
}
