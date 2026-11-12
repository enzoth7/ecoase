import {
  compareProductsByInternalCode,
  formatPlannedDate,
  getOrderPlannedDate,
  getOrderStage,
  isActiveProvider,
  isOrderClosed,
  orders as seededOrders,
  products as seededProducts,
  providers as seededProviders,
  stageLabels,
  type OperationOrder,
  type OperationStage,
  type OrderChange,
  type OrderUpdateKind,
  type Provider,
  type ProviderType,
  type Product,
  type ProductKind,
  type ProductionSource,
  type TransportSource,
  type CapacityOperation,
  type CapacityStatus,
  type ProductionAllocation,
  type ProductionAllocationStatus,
  type RescheduleReason,
  type Shipment,
  type ShipmentStatus,
} from "../data";
import { palletProductionDefaults, PALLET_RULE_START_DATE } from "../production-rule-defaults";
import {
  buildCapacitySnapshot,
  type CapacityAdjustment,
  type CapacityRule,
  type ExternalProductionDefault,
  type InternalProductionDefault,
  type InternalTeamCapacity,
  type TransportCapacityDefault,
} from "../capacity";
import type {
  ProductionCapacityRule,
  ProductionProduct,
  ProductionResource,
  ProductionResourceType,
} from "../production-capacity";
import { MEASURE_LEVEL, TREATMENT_LEVEL, applyLevelRules, attributesFromLegacy, buildProductName, canonicalProductName, cleanAttributes, cleanOptions, defaultProductLevels, levelSlug, levelValue, productHeatTreatmentLabel, productKey, requiresHeatTreatment, type ProductAttributes, type ProductLevel } from "../classification";
import { createPrivateAssetUrl, deletePrivateAsset, supabaseRequest, supabaseServerRequest, uploadPrivateAsset } from "../lib/supabase";
import {
  allowedAssetTypes,
  clientProductReady,
  maximumAssetBytes,
  productLabel,
  type ClientDetail,
  type ClientMaster,
  type ClientProduct,
  type ClientProductAsset,
  type ClientProductOption,
} from "../master-data";
import {
  calculateStockBalances,
  productTreatmentLabel,
  summarizeTreatmentDay,
  type CreateTreatmentBatchInput,
  type StockMovement,
  type TreatmentBatch,
  type TreatmentBatchStatus,
  type TreatmentControlCheck,
  type TreatmentDashboard,
  type TreatmentDestination,
  type TreatmentNotPerformed,
  type TreatmentProductOption,
  type TreatmentRecordResult,
  type TreatmentWeek,
} from "../treatment";
import {
  orderStockReservations,
  type StockDetail,
  type StockSummaryRow,
  scopeStockInventory,
} from "../stock";

export type CreateOrderInput = {
  lines: Array<{ clientProductId: number | string; quantity: number }>;
  orderDate: string;
  plannedDate: string;
  deliveryDateNote?: string;
  notes?: string;
  requiredOperations: CapacityOperation[];
};

export type ProductionPlanInput = Array<{ orderLineId: string; resourceId: string; plannedDate: string; plannedQuantity: number }>;
export type TransportAssignmentInput = { source: TransportSource; providerId?: string; newProviderName?: string };
export type DryingPlanInput = { startDate: string; endDate?: string; note?: string; allocations?: Array<{ orderLineId: string; date: string; quantity: number }> };

export type UpdateOrderInput = Partial<Pick<OperationOrder, "transport" | "requested" | "stage" | "productionSource" | "producerProviderId" | "productionDate" | "importArrivalDate" | "requiredOperations" | "transportSource" | "transportProviderId">> & {
  plannedDate?: string;
};

export type RecordOrderUpdateInput = {
  kind: Exclude<OrderUpdateKind, "cambio">;
  deliveredQuantity?: number;
  deliveryAddress?: string;
  remittance?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  note?: string;
};

export type UpdateProductInput = {
  kind: ProductKind;
  measure?: string;
  heightCm?: number | null;
  attributes?: ProductAttributes;
  /** Sólo para clientes viejos de la API que no mandan el nivel Tratamiento. */
  requiresTreatment?: boolean;
  stockName?: string;
  zetaCode?: string;
  clientId?: string;
  clientIds?: string[];
};

export type CreateProductInput = Omit<UpdateProductInput, "clientId"> & { clientIds?: string[] };
export type CreateClientInput = { name: string; address?: string; department?: string };

type DbLine = { id: string; product: string; product_id: string | null; client_product_id: number | null; quantity: number; requested_quantity?: number; preparation: string | null; position: number };
type DbOrder = {
  id: string;
  reference: string;
  client: string;
  product: string;
  requested: number;
  delivered: number;
  pending: number;
  stage: OperationStage;
  order_date: string | null;
  requested_delivery_date: string | null;
  zeta_code: string | null;
  planned_date: string;
  original_planned_date: string | null;
  transport: string;
  supply: string;
  preparation: string;
  logistics: string;
  delivery: string;
  action: string;
  remittance: string | null;
  delivery_address: string | null;
  notes: string | null;
  delivery_status: OperationOrder["deliveryStatus"] | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  source: string;
  production_source: ProductionSource | null;
  producer_provider_id: string | null;
  production_date: string | null;
  import_arrival_date: string | null;
  required_operations: CapacityOperation[] | null;
  transport_source: TransportSource | null;
  transport_provider_id: string | null;
  delivery_date_note?: string | null;
  production_defined?: boolean | null;
  production_end_date?: string | null;
  transport_defined?: boolean | null;
  drying_start_date?: string | null;
  drying_end_date?: string | null;
  drying_note?: string | null;
  order_lines: DbLine[];
};
type DbChange = {
  id: string;
  changed_at: string;
  kind: OrderUpdateKind;
  note: string | null;
  order_change_items: Array<{ field: string; from_value: string; to_value: string; position: number }>;
};

const useMemoryStore = process.env.ECOASE_DATA_BACKEND === "memory";
const memoryOrders: OperationOrder[] = structuredClone(seededOrders);
const memoryHistory = new Map<string, OrderChange[]>();
const memoryProducts: Product[] = structuredClone(seededProducts);
const memoryProductLevels: ProductLevel[] = structuredClone(defaultProductLevels);
const memoryProviders: Provider[] = structuredClone(seededProviders);
const memoryClients: ClientMaster[] = [...new Set(seededOrders.map((order) => order.client))].map((name, index) => {
  const address = seededOrders.find((order) => order.client === name)?.deliveryAddress;
  return { id: `cliente-${index + 1}`, name, address, active: Boolean(address), updatedAt: new Date(0).toISOString() };
});
const memoryClientProducts: ClientProduct[] = [];
const memoryAssetFiles = new Map<string, { bytes: Uint8Array; mimeType: string }>();
let memoryMasterId = 1;
const memoryCapacityRules: CapacityRule[] = [];
const memoryInternalDefaults: InternalProductionDefault[] = [];
let memoryAvailablePeople: number | undefined;
const memoryExternalDefaults: ExternalProductionDefault[] = [];
const memoryTransportDefaults: TransportCapacityDefault[] = [];
const memoryCapacityAdjustments: CapacityAdjustment[] = [];
const memoryProductionResources: ProductionResource[] = [
  { id: "internal", name: "Fábrica", resourceType: "internal_factory", active: true, displayOrder: 10 },
  { id: "blanc", name: "Blanc", resourceType: "external_supplier", providerId: "blanc", active: true, displayOrder: 20 },
  { id: "mirasol", name: "Mirasol", resourceType: "external_supplier", providerId: "mirasol", active: true, displayOrder: 30 },
  { id: "sandro_raul", name: "Sandro Raul", resourceType: "internal_crew", active: true, displayOrder: 40 },
  { id: "fabrica_john", name: "Fábrica John", resourceType: "internal_factory", active: true, displayOrder: 50 },
  { id: "fabrica_omar", name: "Fábrica Omar", resourceType: "internal_factory", active: true, displayOrder: 60 },
  { id: "john_esteban", name: "John y Esteban", resourceType: "internal_crew", active: true, displayOrder: 70 },
  { id: "enzo", name: "Enzo", resourceType: "internal_crew", active: true, displayOrder: 80 },
  { id: "lito", name: "Lito", resourceType: "internal_crew", active: true, displayOrder: 90 },
];
const memoryProductionRules: ProductionCapacityRule[] = [];
let memoryProductionId = 1;

function seedMemoryPalletProductionRules(relation: ClientProduct) {
  if (!relation.active || relation.product.kind !== "Pallet") return;
  for (const baseline of palletProductionDefaults(relation.product.attributes?.modelo)) {
    const resource = memoryProductionResources.find((item) => item.id === baseline.resourceId && item.active);
    if (!resource || memoryProductionRules.some((rule) => String(rule.clientProductId) === String(relation.id) && String(rule.resourceId) === String(resource.id))) continue;
    memoryProductionRules.push({
      id: `rule-${memoryProductionId++}`,
      resourceId: resource.id,
      productId: relation.productId,
      clientProductId: relation.id,
      productName: productLabel(relation.product),
      configurationLabel: "Base para pallets",
      normalUnitsPerDay: baseline.normal,
      maximumUnitsPerDay: baseline.maximum,
      validFrom: PALLET_RULE_START_DATE,
      source: "planilla de rendimiento inicial",
      createdAt: new Date().toISOString(),
    });
  }
}
const memoryStockMovements: StockMovement[] = [];
const memoryStockReservations: Array<{ id: string; shipmentLineId: number | string; productId: string; quantity: number; status: "active" | "consumed" | "released" }> = [];
const memoryTreatmentBatches: TreatmentBatch[] = [];
let memoryTreatmentId = 1;

function canonicalOperations(operations: CapacityOperation[] | null | undefined): CapacityOperation[] {
  return [...new Set((operations ?? ["assembly"]).map((operation) => operation === "marking" || operation === "ht" ? "treatment" : operation))];
}

function treatmentFromLabel(label: string) {
  if (productHeatTreatmentLabel(label) === "Con HT") return "Marcado" as const;
  return undefined;
}

for (const order of memoryOrders) {
  const createdAt = new Date(0).toISOString();
  order.requiredOperations = canonicalOperations(order.requiredOperations);
  order.product = canonicalProductName(order.product);
  for (const line of order.lines) {
    line.treatment = treatmentFromLabel(line.product);
    line.product = canonicalProductName(line.product);
    const resourceId = order.producerProviderId ?? (order.productionSource === "internal" ? "internal" : undefined);
    line.productionAllocations = [{ id: `pa-${line.id}`, orderLineId: line.id, resourceId, productionResourceId: resourceId, plannedDate: order.productionDate ?? order.importArrivalDate ?? getOrderPlannedDate(order), plannedQuantity: line.quantity, status: "draft", note: "Planificación histórica", createdAt, updatedAt: createdAt }];
  }
  const shipmentStatus: ShipmentStatus = getOrderStage(order) === "completado" ? "delivered" : order.dispatchedAt ? "dispatched" : "planned";
  order.shipments = [{
    id: `shipment-${order.id}`, orderId: order.id, plannedDate: getOrderPlannedDate(order), status: shipmentStatus,
    transportSource: order.transportSource ?? "internal", transportProviderId: order.transportProviderId,
    transportLabel: order.transport, remittance: shipmentStatus === "planned" ? order.remittance : order.remittance ?? "Remito histórico no informado",
    deliveryAddressSnapshot: shipmentStatus === "planned" ? undefined : order.deliveryAddress ?? "Dirección histórica no informada",
    loadedAt: shipmentStatus === "planned" ? undefined : order.dispatchedAt ?? createdAt,
    dispatchedAt: ["dispatched", "delivered"].includes(shipmentStatus) ? order.dispatchedAt ?? createdAt : undefined,
    deliveredAt: shipmentStatus === "delivered" ? order.deliveredAt ?? createdAt : undefined,
    createdAt, updatedAt: createdAt,
    lines: order.lines.map((line, index) => ({ id: `sl-${line.id}`, shipmentId: `shipment-${order.id}`, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: line.quantity, deliveredQuantity: Math.min(line.quantity, Math.max(order.delivered - order.lines.slice(0, index).reduce((sum, item) => sum + item.quantity, 0), 0)) })),
    events: [{ id: `se-${order.id}`, shipmentId: `shipment-${order.id}`, eventType: "created", nextStatus: shipmentStatus, nextDate: getOrderPlannedDate(order), responsible: "Migración", createdAt }],
  }];
}

type DbAllocation = { id: number; order_line_id: string; resource_id: string | null; production_resource_id: number | null; capacity_rule_id: number | null; planned_date: string; planned_quantity: number; actual_quantity: number | null; actual_date: string | null; result_destination: "client" | "stock" | null; status: ProductionAllocationStatus; note: string | null; completed_at: string | null; completion_note: string | null; created_at: string; updated_at: string };
type DbLineTreatmentProgress = { id: number; order_line_id: string | null; quantity: number; status: TreatmentBatchStatus; reversal_of_batch_id: number | null };
type DbShipmentLine = { id: number; shipment_id: number; order_line_id: string; planned_quantity: number; loaded_quantity: number | null; delivered_quantity: number };
type DbShipmentEvent = { id: number; shipment_id: number; event_type: Shipment["events"][number]["eventType"]; previous_status: ShipmentStatus | null; next_status: ShipmentStatus | null; previous_date: string | null; next_date: string | null; reason: RescheduleReason | null; note: string | null; previous_remittance: string | null; next_remittance: string | null; responsible: string; created_at: string };
type DbShipment = { id: number; order_id: string; planned_date: string; status: ShipmentStatus; transport_source: TransportSource; transport_provider_id: string | null; remittance: string | null; shared_remittance_reason: string | null; delivery_address_snapshot: string | null; loaded_at: string | null; dispatched_at: string | null; delivered_at: string | null; created_at: string; updated_at: string; shipment_lines: DbShipmentLine[]; shipment_events: DbShipmentEvent[] };
function mapOrder(row: DbOrder): OperationOrder {
  return {
    id: row.id,
    reference: row.reference,
    client: row.client,
    product: canonicalProductName(row.product),
    productId: row.order_lines?.[0]?.product_id ?? undefined,
    clientProductId: row.order_lines?.[0]?.client_product_id ?? undefined,
    requested: row.requested,
    delivered: row.delivered,
    pending: row.pending,
    stage: row.stage,
    orderDate: row.order_date ?? undefined,
    requestedDeliveryDate: row.requested_delivery_date ?? undefined,
    zetaCode: row.zeta_code ?? undefined,
    plannedDate: row.planned_date,
    originalPlannedDate: row.original_planned_date ?? undefined,
    dateLabel: formatPlannedDate(row.planned_date),
    transport: row.transport,
    supply: row.supply,
    preparation: row.preparation,
    logistics: row.logistics,
    delivery: row.delivery,
    action: row.action,
    remittance: row.remittance ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    notes: row.notes ?? undefined,
    deliveryStatus: row.delivery_status ?? undefined,
    dispatchedAt: row.dispatched_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    source: row.source,
    productionSource: row.production_source ?? "internal",
    producerProviderId: row.producer_provider_id ?? undefined,
    productionDate: row.production_date ?? undefined,
    importArrivalDate: row.import_arrival_date ?? undefined,
    requiredOperations: canonicalOperations(row.required_operations),
    transportSource: row.transport_source ?? (row.transport.toLocaleLowerCase() === "interno" || row.transport.toLocaleLowerCase() === "propio" ? "internal" : "external"),
    transportProviderId: row.transport_provider_id ?? undefined,
    deliveryDateNote: row.delivery_date_note ?? undefined,
    productionDefined: row.production_defined ?? true,
    productionEndDate: row.production_end_date ?? undefined,
    transportDefined: row.transport_defined ?? true,
    dryingStartDate: row.drying_start_date ?? undefined,
    dryingEndDate: row.drying_end_date ?? undefined,
    dryingNote: row.drying_note ?? undefined,
    lines: [...(row.order_lines ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({ id: line.id, product: canonicalProductName(line.product), productId: line.product_id ?? undefined, clientProductId: line.client_product_id ?? undefined, quantity: line.requested_quantity ?? line.quantity, preparation: line.preparation ?? undefined, treatment: treatmentFromLabel(line.product) })),
  };
}

async function attachDatabaseOperations(orders: OperationOrder[]) {
  const orderIds = orders.map((order) => order.id);
  const lineIds = orders.flatMap((order) => order.lines.map((line) => line.id));
  if (!orderIds.length) return orders;
  const [allocations, shipments, providers, treatmentProgress, reservations, dryingRows] = await Promise.all([
    lineIds.length ? supabaseRequest<DbAllocation[]>(`/rest/v1/production_allocations?select=*&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})&order=planned_date.asc,id.asc`) : Promise.resolve([]),
    supabaseRequest<DbShipment[]>(`/rest/v1/shipments?select=*,shipment_lines(*),shipment_events(*)&order_id=in.(${orderIds.map(encodeURIComponent).join(",")})&order=planned_date.asc,id.asc&shipment_events.order=created_at.asc,id.asc`),
    getProviders({ includeRetired: true }),
    lineIds.length ? supabaseRequest<DbLineTreatmentProgress[]>(`/rest/v1/treatment_batches?select=id,order_line_id,quantity,status,reversal_of_batch_id&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})`) : Promise.resolve([]),
    lineIds.length ? supabaseRequest<Array<{ shipment_line_id: number; quantity: number; status: string; shipment_lines: { order_line_id: string } | null }>>(`/rest/v1/stock_reservations?select=shipment_line_id,quantity,status,shipment_lines(order_line_id)&status=eq.active`) : Promise.resolve([]),
    lineIds.length ? supabaseRequest<Array<{ order_line_id: string; planned_date: string; planned_quantity: number }>>(`/rest/v1/drying_allocations?select=order_line_id,planned_date,planned_quantity&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})&order=planned_date.asc`).catch(() => []) : Promise.resolve([]),
  ]);
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));
  const lineMap = new Map(orders.flatMap((order) => order.lines.map((line) => [line.id, line] as const)));
  for (const order of orders) {
    for (const line of order.lines) {
      line.productionAllocations = allocations.filter((item) => item.order_line_id === line.id).map<ProductionAllocation>((item) => ({ id: item.id, orderLineId: item.order_line_id, resourceId: item.resource_id ?? undefined, productionResourceId: item.production_resource_id ?? undefined, capacityRuleId: item.capacity_rule_id ?? undefined, plannedDate: item.planned_date, plannedQuantity: item.planned_quantity, actualQuantity: item.actual_quantity ?? undefined, actualDate: item.actual_date ?? undefined, resultDestination: item.result_destination ?? undefined, status: item.status, note: item.note ?? undefined, completedAt: item.completed_at ?? undefined, completionNote: item.completion_note ?? undefined, createdAt: item.created_at, updatedAt: item.updated_at }));
      const lineBatches = treatmentProgress.filter((batch) => batch.order_line_id === line.id);
      const treated = lineBatches.reduce((sum, batch) => sum + (batch.status === "posted" ? batch.quantity : batch.status === "reversal" ? -batch.quantity : 0), 0);
      line.dryingAllocations = dryingRows.filter((item) => item.order_line_id === line.id).map((item) => ({ date: item.planned_date, quantity: item.planned_quantity }));
      line.treatedQuantity = Math.max(treated, 0);
      line.treatmentPendingQuantity = Math.max(line.quantity - line.treatedQuantity, 0);
      line.readyReservedQuantity = 0;
      line.readyReservedQuantity = reservations.filter((reservation) => reservation.shipment_lines?.order_line_id === line.id).reduce((sum, reservation) => sum + reservation.quantity, 0);
    }
    order.shipments = shipments.filter((item) => item.order_id === order.id).map<Shipment>((item) => ({
      id: item.id, orderId: item.order_id, plannedDate: item.planned_date, status: item.status, transportSource: item.transport_source,
      transportProviderId: item.transport_provider_id ?? undefined, transportLabel: item.transport_source === "internal" ? providerNames.get(item.transport_provider_id ?? "") ?? "Transporte interno" : providerNames.get(item.transport_provider_id ?? "") ?? "Transportista",
      remittance: item.remittance ?? undefined, sharedRemittanceReason: item.shared_remittance_reason ?? undefined, deliveryAddressSnapshot: item.delivery_address_snapshot ?? undefined,
      loadedAt: item.loaded_at ?? undefined, dispatchedAt: item.dispatched_at ?? undefined, deliveredAt: item.delivered_at ?? undefined, createdAt: item.created_at, updatedAt: item.updated_at,
      lines: item.shipment_lines.map((line) => ({ id: line.id, shipmentId: line.shipment_id, orderLineId: line.order_line_id, product: lineMap.get(line.order_line_id)?.product ?? "Producto", treatment: lineMap.get(line.order_line_id)?.treatment, plannedQuantity: line.planned_quantity, loadedQuantity: line.loaded_quantity ?? undefined, deliveredQuantity: line.delivered_quantity })),
      events: [...item.shipment_events].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((event) => ({ id: event.id, shipmentId: event.shipment_id, eventType: event.event_type, previousStatus: event.previous_status ?? undefined, nextStatus: event.next_status ?? undefined, previousDate: event.previous_date ?? undefined, nextDate: event.next_date ?? undefined, reason: event.reason ?? undefined, note: event.note ?? undefined, previousRemittance: event.previous_remittance ?? undefined, nextRemittance: event.next_remittance ?? undefined, responsible: event.responsible, createdAt: event.created_at })),
    }));
  }
  return orders;
}

async function getDatabaseOrder(id: string) {
  const query = new URLSearchParams({ select: "*,order_lines(*)", id: `eq.${id}`, "order_lines.order": "position.asc" });
  const rows = await supabaseRequest<DbOrder[]>(`/rest/v1/orders?${query}`);
  return rows[0] ? (await attachDatabaseOperations([mapOrder(rows[0])]))[0] : null;
}

export async function getOrders() {
  if (useMemoryStore) return memoryOrders;
  const query = new URLSearchParams({ select: "*,order_lines(*)", order: "created_at.asc", "order_lines.order": "position.asc" });
  const rows = await supabaseRequest<DbOrder[]>(`/rest/v1/orders?${query}`);
  const clientProductIds = [...new Set(rows.flatMap((row) => (row.order_lines ?? []).map((line) => line.client_product_id).filter((id): id is number => id !== null)))];
  const links = clientProductIds.length ? await supabaseRequest<Array<{ id: number; client_id: string }>>(`/rest/v1/client_products?select=id,client_id&id=in.(${clientProductIds.join(",")})`) : [];
  const clientByProduct = new Map(links.map((link) => [String(link.id), link.client_id]));
  return attachDatabaseOperations(rows.map((row) => { const order = mapOrder(row); order.clientId = clientByProduct.get(String(order.clientProductId)); return order; }));
}

export type CreateProviderInput = {
  name: string;
  type: ProviderType;
  supplies: string;
};

export type UpdateProviderInput = {
  name?: string;
  type?: ProviderType;
  supplies?: string;
};

export function generateProviderSlug(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `prov-${crypto.randomUUID().slice(0, 8)}`;
}

export async function getProviders({ includeRetired = false } = {}) {
  if (useMemoryStore) return includeRetired ? memoryProviders : memoryProviders.filter(isActiveProvider);
  const query = new URLSearchParams({ select: "*", order: "type.asc,name.asc" });
  const rows = await supabaseRequest<Array<Provider & { internal_transport?: boolean }>>(`/rest/v1/providers?${query}`);
  return (includeRetired ? rows : rows.filter(isActiveProvider))
    .map((row) => ({ id: row.id, name: row.name, type: row.type, supplies: row.supplies, internalTransport: Boolean(row.internal_transport) }));
}

export async function createProvider(input: CreateProviderInput): Promise<Provider> {
  const name = input.name.trim();
  if (!name) throw new Error("Indique el nombre del proveedor.");

  const validTypes = new Set<ProviderType>(["Aserradero", "Transporte", "Importador"]);
  if (!validTypes.has(input.type)) throw new Error("El tipo de proveedor indicado no es válido.");

  const supplies = input.supplies?.trim() ?? "";
  if (!supplies) throw new Error("Indique qué provee el proveedor.");

  if (useMemoryStore) {
    if (memoryProviders.some((p) => p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
      throw new Error("Ya existe un proveedor con ese nombre.");
    }
    const baseSlug = generateProviderSlug(name);
    let id = baseSlug;
    let counter = 2;
    while (memoryProviders.some((p) => p.id === id)) {
      id = `${baseSlug}-${counter++}`;
    }
    const provider: Provider = { id, name, type: input.type, supplies };
    memoryProviders.push(provider);
    return provider;
  }

  const existing = await getProviders({ includeRetired: true });
  if (existing.some((p) => p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
    throw new Error("Ya existe un proveedor con ese nombre.");
  }
  const baseSlug = generateProviderSlug(name);
  let id = baseSlug;
  let counter = 2;
  while (existing.some((p) => p.id === id)) {
    id = `${baseSlug}-${counter++}`;
  }

  const rows = await supabaseServerRequest<Provider[]>("/rest/v1/providers", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ id, name, type: input.type, supplies }),
  });
  const created = rows?.[0] ?? (await getProviders()).find((p) => p.id === id);
  if (!created) throw new Error("El proveedor se creó pero no pudo recuperarse.");
  return created;
}

export async function updateProvider(id: string, input: UpdateProviderInput): Promise<Provider> {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("ID de proveedor no válido.");

  if (useMemoryStore) {
    const current = memoryProviders.find((p) => p.id === trimmedId);
    if (!current) throw new Error("Proveedor no encontrado.");

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("El nombre no puede estar vacío.");
      if (memoryProviders.some((p) => p.id !== trimmedId && p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
        throw new Error("Ya existe otro proveedor con ese nombre.");
      }
      current.name = name;
    }
    if (input.type !== undefined) {
      const validTypes = new Set<ProviderType>(["Aserradero", "Transporte", "Importador"]);
      if (!validTypes.has(input.type)) throw new Error("El tipo de proveedor no es válido.");
      current.type = input.type;
    }
    if (input.supplies !== undefined) {
      const supplies = input.supplies.trim();
      if (!supplies) throw new Error("Indique qué provee el proveedor.");
      current.supplies = supplies;
    }
    return current;
  }

  const current = (await getProviders()).find((p) => p.id === trimmedId);
  if (!current) throw new Error("Proveedor no encontrado.");

  const patch: { name?: string; type?: ProviderType; supplies?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("El nombre no puede estar vacío.");
    const existing = await getProviders({ includeRetired: true });
    if (existing.some((p) => p.id !== trimmedId && p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
      throw new Error("Ya existe otro proveedor con ese nombre.");
    }
    patch.name = name;
  }
  if (input.type !== undefined) {
    const validTypes = new Set<ProviderType>(["Aserradero", "Transporte", "Importador"]);
    if (!validTypes.has(input.type)) throw new Error("El tipo de proveedor no es válido.");
    patch.type = input.type;
  }
  if (input.supplies !== undefined) {
    const supplies = input.supplies.trim();
    if (!supplies) throw new Error("Indique qué provee el proveedor.");
    patch.supplies = supplies;
  }

  if (Object.keys(patch).length > 0) {
    await supabaseServerRequest<unknown>(`/rest/v1/providers?id=eq.${encodeURIComponent(trimmedId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify(patch),
    });
  }

  const updated = (await getProviders()).find((p) => p.id === trimmedId);
  if (!updated) throw new Error("El proveedor se actualizó pero no pudo recuperarse.");
  return updated;
}

export async function deleteProvider(id: string): Promise<{ ok: boolean }> {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("ID de proveedor no válido.");

  if (useMemoryStore) {
    const index = memoryProviders.findIndex((p) => p.id === trimmedId);
    if (index === -1) throw new Error("Proveedor no encontrado.");

    const isReferencedInOrders = memoryOrders.some(
      (order) =>
        order.producerProviderId === trimmedId ||
        order.transportProviderId === trimmedId ||
        order.shipments?.some((s) => s.transportProviderId === trimmedId)
    );
    const isReferencedInResources = memoryProductionResources.some((r) => r.providerId === trimmedId);
    const isReferencedInDefaults =
      memoryExternalDefaults.some((d) => d.providerId === trimmedId) ||
      memoryTransportDefaults.some((t) => t.providerId === trimmedId);
    const isReferencedInMovements = memoryStockMovements.some((m) => m.providerId === trimmedId);

    if (isReferencedInOrders || isReferencedInResources || isReferencedInDefaults || isReferencedInMovements) {
      throw new Error("No se puede eliminar el proveedor porque tiene órdenes, transportes o recursos asociados.");
    }

    memoryProviders.splice(index, 1);
    return { ok: true };
  }

  const [ordersUsing, resourcesUsing, externalDefaults, transportDefaults] = await Promise.all([
    supabaseRequest<Array<{ id: string }>>(
      `/rest/v1/orders?or=(producer_provider_id.eq.${encodeURIComponent(trimmedId)},transport_provider_id.eq.${encodeURIComponent(trimmedId)})&select=id&limit=1`
    ).catch(() => []),
    supabaseRequest<Array<{ id: number }>>(
      `/rest/v1/production_resources?provider_id=eq.${encodeURIComponent(trimmedId)}&select=id&limit=1`
    ).catch(() => []),
    supabaseRequest<Array<{ id: number }>>(
      `/rest/v1/external_production_defaults?provider_id=eq.${encodeURIComponent(trimmedId)}&select=id&limit=1`
    ).catch(() => []),
    supabaseRequest<Array<{ id: number }>>(
      `/rest/v1/transport_capacity_defaults?provider_id=eq.${encodeURIComponent(trimmedId)}&select=id&limit=1`
    ).catch(() => []),
  ]);

  if (ordersUsing.length > 0 || resourcesUsing.length > 0 || externalDefaults.length > 0 || transportDefaults.length > 0) {
    throw new Error("No se puede eliminar el proveedor porque tiene órdenes, transportes o recursos asociados.");
  }

  try {
    await supabaseServerRequest<unknown>(`/rest/v1/providers?id=eq.${encodeURIComponent(trimmedId)}`, {
      method: "DELETE",
      prefer: "return=representation",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("foreign key") || (error as { code?: string }).code === "23503") {
      throw new Error("No se puede eliminar el proveedor porque tiene registros dependientes.");
    }
    throw error;
  }

  return { ok: true };
}

export async function getProducts() {
  if (useMemoryStore) {
    const clientNameById = new Map(memoryClients.map((client) => [client.id, client.name]));
    return memoryProducts.map((product) => ({
      ...product,
      heightCm: product.kind === "Pallet" ? product.heightCm ?? 10 : product.heightCm,
      clientNames: [...new Set(memoryClientProducts.filter((item) => item.productId === product.id && item.active).map((item) => clientNameById.get(item.clientId)).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "es")),
    })).sort(compareProductsByInternalCode);
  }
  const query = new URLSearchParams({
    select: "*",
    order: "stock_name.asc,kind.asc,measure.asc",
  });
  const [rows, assignments, clients] = await Promise.all([
    supabaseRequest<DbProductRow[]>(`/rest/v1/products?${query}`),
    supabaseRequest<Array<{ product_id: string; client_id: string }>>("/rest/v1/client_products?select=product_id,client_id&active=eq.true&order=display_order.asc,id.asc"),
    supabaseRequest<Array<{ id: string; name: string }>>("/rest/v1/clients?select=id,name&order=name.asc"),
  ]);
  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));
  const namesByProduct = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const name = clientNameById.get(assignment.client_id);
    if (!name) continue;
    const names = namesByProduct.get(assignment.product_id) ?? new Set<string>();
    names.add(name);
    namesByProduct.set(assignment.product_id, names);
  }
  return rows.map((row) => ({ ...mapProduct(row), clientNames: [...(namesByProduct.get(row.id) ?? [])].sort((a, b) => a.localeCompare(b, "es")) })).sort(compareProductsByInternalCode);
}

export async function getClients() {
  if (useMemoryStore) return memoryClients;
  const rows = await supabaseRequest<Array<{ id: string; name: string; address: string | null; department: string | null; active: boolean; updated_at: string }>>("/rest/v1/clients?select=id,name,address,department,active,updated_at&order=name.asc");
  return rows.map((row) => ({ id: row.id, name: row.name, address: row.address ?? undefined, department: row.department ?? undefined, active: row.active, updatedAt: row.updated_at }));
}

export async function createClient(input: CreateClientInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Indique el nombre del cliente.");
  if (!useMemoryStore) {
    const id = await supabaseServerRequest<string>("/rest/v1/rpc/create_operation_client", { method: "POST", body: JSON.stringify({ p_name: name, p_address: input.address?.trim() || null, p_department: input.department?.trim() || null }) });
    const client = (await getClients()).find((item) => item.id === id);
    if (!client) throw new Error("El cliente se creó pero no pudo recuperarse.");
    return client;
  }
  if (memoryClients.some((client) => client.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) throw new Error("Ese cliente ya existe.");
  const address = input.address?.trim() || undefined;
  const client: ClientMaster = { id: `cliente-${crypto.randomUUID()}`, name, address, department: input.department?.trim() || undefined, active: true, updatedAt: new Date().toISOString() };
  memoryClients.push(client);
  return client;
}

export async function updateClientMaster(id: string, input: { name?: string; address?: string; department?: string; active?: boolean }) {
  const current = (await getClients()).find((item) => item.id === id);
  if (!current) return null;
  const next = { name: input.name?.trim() || current.name, address: input.address === undefined ? current.address : input.address.trim() || undefined, department: input.department === undefined ? current.department : input.department.trim() || undefined, active: input.active ?? current.active ?? false };
  if (useMemoryStore) {
    Object.assign(current, next, { updatedAt: new Date().toISOString() });
    return current;
  }
  await supabaseServerRequest<unknown>(`/rest/v1/clients?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ name: next.name, address: next.address ?? null, department: next.department ?? null, active: next.active }) });
  return (await getClients()).find((item) => item.id === id) ?? null;
}

export async function deleteClient(id: string): Promise<{ ok: boolean }> {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("ID de cliente no válido.");

  const clients = await getClients();
  const current = clients.find((c) => c.id === trimmedId);
  if (!current) throw new Error("Cliente no encontrado.");

  if (useMemoryStore) {
    const isReferencedInOrders = memoryOrders.some(
      (order) => order.client.localeCompare(current.name, "es", { sensitivity: "accent" }) === 0
    );
    if (isReferencedInOrders) {
      throw new Error("No se puede eliminar el cliente porque tiene pedidos registrados.");
    }

    const clientProductIds = new Set(
      memoryClientProducts.filter((cp) => cp.clientId === trimmedId).map((cp) => String(cp.id))
    );
    for (const cpId of clientProductIds) {
      memoryAssetFiles.delete(cpId);
    }
    const nextClientProducts = memoryClientProducts.filter((cp) => cp.clientId !== trimmedId);
    memoryClientProducts.length = 0;
    memoryClientProducts.push(...nextClientProducts);
    const keptRules = memoryProductionRules.filter((rule) => !clientProductIds.has(String(rule.clientProductId)));
    memoryProductionRules.length = 0;
    memoryProductionRules.push(...keptRules);

    const clientIndex = memoryClients.findIndex((c) => c.id === trimmedId);
    if (clientIndex !== -1) {
      memoryClients.splice(clientIndex, 1);
    }
    return { ok: true };
  }

  const ordersUsing = await supabaseRequest<Array<{ id: string }>>(
    `/rest/v1/orders?client=eq.${encodeURIComponent(current.name)}&select=id&limit=1`
  ).catch(() => []);

  if (ordersUsing.length > 0) {
    throw new Error("No se puede eliminar el cliente porque tiene pedidos registrados.");
  }

  try {
    const clientProducts = await supabaseRequest<Array<{ id: number }>>(
      `/rest/v1/client_products?client_id=eq.${encodeURIComponent(trimmedId)}&select=id`
    ).catch(() => []);

    for (const cp of clientProducts) {
      await supabaseServerRequest<unknown>(
        `/rest/v1/client_product_assets?client_product_id=eq.${cp.id}`,
        { method: "DELETE" }
      ).catch(() => undefined);
      await supabaseServerRequest<unknown>(
        `/rest/v1/client_product_controls?client_product_id=eq.${cp.id}`,
        { method: "DELETE" }
      ).catch(() => undefined);
    }


    await supabaseServerRequest<unknown>(
      `/rest/v1/client_products?client_id=eq.${encodeURIComponent(trimmedId)}`,
      { method: "DELETE" }
    ).catch(() => undefined);

    await supabaseServerRequest<unknown>(
      `/rest/v1/clients?id=eq.${encodeURIComponent(trimmedId)}`,
      { method: "DELETE", prefer: "return=representation" }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("foreign key") || (error as { code?: string }).code === "23503") {
      throw new Error("No se puede eliminar el cliente porque tiene registros dependientes.");
    }
    throw error;
  }

  return { ok: true };
}

type DbProductRow = { id: string; kind: ProductKind; measure: string | null; height_cm?: number | null; treatment: Product["treatment"] | null; requires_treatment: boolean; stock_name?: string | null; source_catalog?: Product["sourceCatalog"] | null; source_code?: string | null; zeta_code?: string | null; stock_active?: boolean; attributes?: Record<string, string> | null; model?: string | null; reinforcement?: string | null; board_count?: number | null; quality?: string | null; finish?: string | null; heat_treatment?: string | null };
function mapProduct(row: DbProductRow): Product {
  // Antes de aplicar la migración de niveles los valores viven en las columnas viejas: se pasan a niveles al leer.
  const stored = cleanAttributes(row.attributes);
  const hasLegacy = Boolean(row.model || row.reinforcement || row.board_count || row.quality || row.finish || row.heat_treatment);
  const attributes = row.attributes != null ? stored : hasLegacy ? attributesFromLegacy(row) : undefined;
  return { id: row.id, kind: row.kind, measure: row.measure ?? undefined, heightCm: row.kind === "Pallet" ? row.height_cm ?? 10 : row.height_cm ?? undefined, treatment: row.treatment ?? undefined, requiresTreatment: row.requires_treatment, stockName: row.stock_name ?? undefined, sourceCatalog: row.source_catalog ?? undefined, sourceCode: row.source_code ?? undefined, zetaCode: row.zeta_code ?? undefined, stockActive: row.stock_active ?? true, ...(attributes !== undefined ? { attributes } : {}) };
}

type DbClientProductRow = {
  id: number;
  client_id: string;
  product_id: string;
  zeta_code: string | null;
  operational_name: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  products: DbProductRow | DbProductRow[];
  client_product_controls: Array<{ id: number; client_product_id: number; title: string; detail: string | null; display_order: number; active: boolean }>;
  client_product_assets: Array<{ id: number; client_product_id: number; storage_path: string; file_name: string; asset_type: "photo" | "plan"; mime_type: ClientProductAsset["mimeType"]; size_bytes: number; alt_text: string; is_primary: boolean; active: boolean; created_at: string }>;
};

function mapClientProduct(row: DbClientProductRow): ClientProduct {
  const product = mapProduct(Array.isArray(row.products) ? row.products[0] : row.products);
  return {
    id: row.id,
    clientId: row.client_id,
    productId: row.product_id,
    zetaCode: product.zetaCode ?? row.zeta_code ?? "",
    operationalName: row.operational_name ?? undefined,
    active: row.active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    product,
    controls: [...(row.client_product_controls ?? [])].sort((a, b) => a.display_order - b.display_order).map((control) => ({
      id: control.id, clientProductId: control.client_product_id, title: control.title, detail: control.detail ?? undefined, displayOrder: control.display_order, active: control.active,
    })),
    assets: [...(row.client_product_assets ?? [])].filter((asset) => asset.active).map((asset) => ({
      id: asset.id, clientProductId: asset.client_product_id, storagePath: asset.storage_path, fileName: asset.file_name, assetType: asset.asset_type, mimeType: asset.mime_type, sizeBytes: asset.size_bytes, altText: asset.alt_text, isPrimary: asset.is_primary, active: asset.active, createdAt: asset.created_at,
    })),
  };
}

const masterSelect = "id,client_id,product_id,zeta_code,operational_name,active,display_order,created_at,updated_at,products(*),client_product_controls(id,client_product_id,title,detail,display_order,active),client_product_assets(id,client_product_id,storage_path,file_name,asset_type,mime_type,size_bytes,alt_text,is_primary,active,created_at)";

async function getClientProduct(id: number | string) {
  if (useMemoryStore) return memoryClientProducts.find((item) => String(item.id) === String(id)) ?? null;
  const query = new URLSearchParams({ select: masterSelect, id: `eq.${id}` });
  const rows = await supabaseRequest<DbClientProductRow[]>(`/rest/v1/client_products?${query}`);
  return rows[0] ? mapClientProduct(rows[0]) : null;
}

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  const client = (await getClients()).find((item) => item.id === clientId);
  if (!client) return null;
  if (useMemoryStore) return { client: client as ClientMaster, products: memoryClientProducts.filter((item) => item.clientId === clientId).sort((a, b) => a.displayOrder - b.displayOrder) };
  const query = new URLSearchParams({ select: masterSelect, client_id: `eq.${clientId}`, order: "display_order.asc,created_at.asc" });
  const rows = await supabaseRequest<DbClientProductRow[]>(`/rest/v1/client_products?${query}`);
  return { client: client as ClientMaster, products: rows.map(mapClientProduct) };
}

export async function getClientProductOptions(clientId: string, activeOnly = true): Promise<ClientProductOption[]> {
  const detail = await getClientDetail(clientId);
  if (!detail || (activeOnly && !detail.client.active)) return [];
  return detail.products.filter((item) => !activeOnly || (item.active && item.product.stockActive !== false && clientProductReady(item))).map((item) => ({
    id: item.id,
    productId: item.productId,
    kind: item.product.kind,
    label: productLabel(item.product, item.operationalName),
    zetaCode: item.product.zetaCode ?? item.zetaCode,
    clientAddress: detail.client.address,
    treatmentRequired: item.product.requiresTreatment,
    controlsReady: item.controls.some((control) => control.active),
  }));
}

export type CreateClientProductInput = { productId: string; operationalName?: string; initialControl?: string; displayOrder?: number };
export async function createClientProduct(clientId: string, input: CreateClientProductInput) {
  const initialControl = input.initialControl?.trim() ?? "";
  if (!input.productId) throw new Error("Seleccione un producto.");
  if (useMemoryStore) {
    const client = memoryClients.find((item) => item.id === clientId);
    const product = memoryProducts.find((item) => item.id === input.productId);
    if (!client || !product) throw new Error("Cliente o producto no encontrado.");
    if (memoryClientProducts.some((item) => item.clientId === clientId && item.productId === input.productId)) throw Object.assign(new Error("Ese producto ya está habilitado para el cliente."), { status: 409 });
    const zetaCode = product.zetaCode ?? "";
    const id = memoryMasterId++;
    const now = new Date().toISOString();
    const item: ClientProduct = { id, clientId, productId: product.id, zetaCode, operationalName: input.operationalName?.trim() || undefined, active: true, displayOrder: input.displayOrder ?? memoryClientProducts.filter((entry) => entry.clientId === clientId).length, createdAt: now, updatedAt: now, product, controls: initialControl ? [{ id: memoryMasterId++, clientProductId: id, title: initialControl, displayOrder: 0, active: true }] : [], assets: [] };
    memoryClientProducts.push(item);
    seedMemoryPalletProductionRules(item);
    return item;
  }
  const id = await supabaseServerRequest<number>("/rest/v1/rpc/create_client_product_master_v2", { method: "POST", body: JSON.stringify({ p_client_id: clientId, p_product_id: input.productId, p_operational_name: input.operationalName?.trim() || null, p_control_title: initialControl, p_control_detail: null }) });
  const item = await getClientProduct(id);
  if (!item) throw new Error("La relación se creó pero no pudo recuperarse.");
  return item;
}

export type UpdateClientProductInput = { operationalName?: string; active?: boolean; displayOrder?: number };
export async function updateClientProduct(id: number | string, input: UpdateClientProductInput) {
  const current = await getClientProduct(id);
  if (!current) return null;
  const zetaCode = current.product.zetaCode ?? current.zetaCode;
  const next = { ...current, zetaCode, operationalName: input.operationalName === undefined ? current.operationalName : input.operationalName.trim() || undefined, active: input.active ?? current.active, displayOrder: input.displayOrder ?? current.displayOrder };
  if (!next.zetaCode) throw new Error("El código es obligatorio.");
  if (useMemoryStore) {
    Object.assign(current, next, { updatedAt: new Date().toISOString() });
    if (next.active) seedMemoryPalletProductionRules(current);
    return current;
  }
  await supabaseServerRequest<unknown>("/rest/v1/rpc/update_client_product_master_v2", { method: "POST", body: JSON.stringify({ p_id: Number(id), p_operational_name: next.operationalName ?? null, p_active: next.active, p_display_order: next.displayOrder }) });
  return getClientProduct(id);
}

export async function replaceClientProductControls(id: number | string, controls: Array<{ title: string; detail?: string; active?: boolean }>) {
  const normalized = controls.map((control) => ({ title: control.title.trim(), detail: control.detail?.trim() || undefined, active: control.active !== false })).filter((control) => control.title);
  const current = await getClientProduct(id);
  if (!current) return null;
  if (useMemoryStore) {
    current.controls = normalized.map((control, index) => ({ id: memoryMasterId++, clientProductId: current.id, title: control.title, detail: control.detail, active: control.active, displayOrder: index }));
    current.updatedAt = new Date().toISOString();
    return current;
  }
  await supabaseServerRequest<unknown>("/rest/v1/rpc/replace_client_product_controls", { method: "POST", body: JSON.stringify({ p_client_product_id: Number(id), p_controls: normalized }) });
  return getClientProduct(id);
}

export async function addClientProductAsset(id: number | string, file: File, input: { altText: string; assetType: "photo" | "plan"; isPrimary: boolean }) {
  const current = await getClientProduct(id);
  if (!current) throw Object.assign(new Error("Relación cliente–producto no encontrada."), { status: 404 });
  if (!allowedAssetTypes.includes(file.type as typeof allowedAssetTypes[number])) throw new Error("Use una imagen JPG, PNG o WebP, o un plano PDF.");
  if (file.size <= 0 || file.size > maximumAssetBytes) throw new Error("El archivo debe pesar entre 1 byte y 6 MB.");
  const altText = input.altText.trim();
  if (!altText) throw new Error("Describa brevemente el plano o la fotografía.");
  const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${current.clientId}/${current.id}/${crypto.randomUUID()}.${extension}`;
  if (useMemoryStore) {
    if (input.isPrimary) current.assets.forEach((asset) => { asset.isPrimary = false; });
    const asset: ClientProductAsset = { id: memoryMasterId++, clientProductId: current.id, storagePath: path, fileName: file.name, assetType: input.assetType, mimeType: file.type as ClientProductAsset["mimeType"], sizeBytes: file.size, altText, isPrimary: input.isPrimary || !current.assets.some((item) => item.active && item.isPrimary), active: true, createdAt: new Date().toISOString() };
    current.assets.push(asset);
    memoryAssetFiles.set(String(asset.id), { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
    return asset;
  }
  await uploadPrivateAsset(path, file);
  try {
    const assetId = await supabaseServerRequest<number>("/rest/v1/rpc/add_client_product_asset", { method: "POST", body: JSON.stringify({ p_client_product_id: Number(id), p_storage_path: path, p_file_name: file.name, p_asset_type: input.assetType, p_mime_type: file.type, p_size_bytes: file.size, p_alt_text: altText, p_is_primary: input.isPrimary }) });
    const refreshed = await getClientProduct(id);
    const asset = refreshed?.assets.find((item) => String(item.id) === String(assetId));
    if (!asset) throw new Error("El archivo se cargó pero no pudo recuperarse.");
    return asset;
  } catch (error) {
    await deletePrivateAsset(path).catch(() => undefined);
    throw error;
  }
}

export async function softDeleteClientProductAsset(assetId: number | string) {
  const item = memoryClientProducts.flatMap((entry) => entry.assets).find((asset) => String(asset.id) === String(assetId));
  if (useMemoryStore) {
    if (!item) return false;
    item.active = false;
    item.isPrimary = false;
    return true;
  }
  await supabaseServerRequest<unknown>(`/rest/v1/client_product_assets?id=eq.${assetId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ active: false, is_primary: false }) });
  return true;
}

export async function getClientProductAssetUrl(assetId: number | string) {
  if (useMemoryStore) {
    if (!memoryAssetFiles.has(String(assetId))) return null;
    return `/api/client-product-assets/${assetId}/content`;
  }
  const rows = await supabaseRequest<Array<{ storage_path: string }>>(`/rest/v1/client_product_assets?select=storage_path&id=eq.${assetId}&active=eq.true`);
  return rows[0] ? createPrivateAssetUrl(rows[0].storage_path) : null;
}

export function getMemoryClientProductAssetContent(assetId: number | string) {
  return useMemoryStore ? memoryAssetFiles.get(String(assetId)) ?? null : null;
}

function dbErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}

/** Si falta aplicar la migración de niveles, el error lo dice en vez de mostrar un mensaje técnico. */
function levelsMigrationError(error: unknown): never {
  if (["PGRST202", "PGRST204", "PGRST205", "42703", "42P01", "42883"].includes(dbErrorCode(error))) throw new Error("La base todavía no tiene los niveles de producto: falta aplicar la migración 20261104165453_product_levels_and_catalog_20261104.");
  throw error;
}

type DbLevelRow = { id: string; label: string; position: number; options: unknown; system: boolean };

export async function getProductLevels(): Promise<ProductLevel[]> {
  if (useMemoryStore) return structuredClone(memoryProductLevels);
  try {
    const rows = await supabaseServerRequest<DbLevelRow[]>("/rest/v1/product_levels?select=id,label,position,options,system&order=position.asc");
    return rows.length ? rows.map((row) => ({ id: row.id, label: row.label, system: row.system, options: cleanOptions(row.options) })) : structuredClone(defaultProductLevels);
  } catch (error) {
    // Sin la migración los productos siguen funcionando con los niveles de partida.
    if (["PGRST205", "42P01"].includes(dbErrorCode(error))) return structuredClone(defaultProductLevels);
    throw error;
  }
}

/** Cuántos productos usan cada opción de cada nivel (se muestra en la tabla de niveles). */
export function countLevelUsage(products: Product[], levels: ProductLevel[]) {
  const usage: Record<string, Record<string, number>> = {};
  for (const level of levels) {
    const counts: Record<string, number> = {};
    for (const product of products) {
      const value = levelValue(product, level.id).toLocaleLowerCase("es");
      if (value) counts[value] = (counts[value] ?? 0) + 1;
    }
    usage[level.id] = counts;
  }
  return usage;
}

async function persistProductLevels(levels: ProductLevel[]) {
  if (useMemoryStore) {
    memoryProductLevels.length = 0;
    memoryProductLevels.push(...structuredClone(levels));
    return;
  }
  await supabaseServerRequest<boolean>("/rest/v1/rpc/save_product_levels_v1", {
    method: "POST",
    body: JSON.stringify({ p_levels: levels.map((level) => ({ id: level.id, label: level.label, options: level.options })) }),
  }).catch(levelsMigrationError);
}

/** Guarda la lista completa de niveles y sus opciones, en el orden recibido. La Medida siempre va primera. */
export async function saveProductLevels(input: Array<{ id?: string; label?: string; options?: unknown }>) {
  const [current, products] = await Promise.all([getProductLevels(), getProducts()]);
  const taken = new Set(current.map((level) => level.id));
  const next: ProductLevel[] = [];
  for (const item of input) {
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label) throw new Error("Cada nivel necesita un nombre.");
    const existing = typeof item.id === "string" ? current.find((level) => level.id === item.id) : undefined;
    const id = existing?.id ?? levelSlug(label, taken);
    taken.add(id);
    next.push({ id, label, system: existing?.system ?? false, options: cleanOptions(item.options) });
  }
  if (next[0]?.id !== MEASURE_LEVEL) throw new Error("La Medida es siempre el primer nivel.");
  const duplicate = next.find((level, index) => next.findIndex((other) => other.label.toLocaleLowerCase("es") === level.label.toLocaleLowerCase("es")) !== index);
  if (duplicate) throw new Error(`Hay dos niveles llamados «${duplicate.label}».`);
  for (const level of current) {
    if (next.some((item) => item.id === level.id)) continue;
    if (level.system) throw new Error(`No se puede quitar el nivel «${level.label}».`);
    const used = products.filter((product) => levelValue(product, level.id)).length;
    if (used) throw new Error(`No se puede eliminar el nivel «${level.label}»: ${used} ${used === 1 ? "producto lo usa" : "productos lo usan"}.`);
  }
  await persistProductLevels(next);
  return next;
}

/** Un valor nuevo escrito en un producto pasa a ser una opción del nivel (son sugerencias; si falla no frena el alta). */
async function rememberLevelOptions(measure: string | undefined, attributes: ProductAttributes) {
  const levels = await getProductLevels();
  let changed = false;
  const next = levels.map((level) => {
    const value = level.id === MEASURE_LEVEL ? measure?.trim() : attributes[level.id];
    if (!value || level.options.some((option) => option.toLocaleLowerCase("es") === value.toLocaleLowerCase("es"))) return level;
    changed = true;
    return { ...level, options: [...level.options, value] };
  });
  if (changed) await persistProductLevels(next).catch(() => undefined);
}

/** Valores por nivel listos para guardar: sólo niveles que existen y Exportación ⇒ Con HT. */
function resolveAttributes(input: { attributes?: ProductAttributes; requiresTreatment?: boolean }, levels: ProductLevel[]) {
  const attributes = cleanAttributes(input.attributes);
  const known = new Set(levels.map((level) => level.id));
  const unknown = Object.keys(attributes).find((key) => key === MEASURE_LEVEL || !known.has(key));
  if (unknown) throw new Error(`El nivel «${unknown}» no existe.`);
  if (!attributes[TREATMENT_LEVEL] && typeof input.requiresTreatment === "boolean") {
    attributes[TREATMENT_LEVEL] = input.requiresTreatment ? "Con HT" : "Sin HT";
  }
  const resolved = applyLevelRules(attributes);
  if (resolved[TREATMENT_LEVEL] && resolved[TREATMENT_LEVEL] !== "Sin HT" && !requiresHeatTreatment(resolved[TREATMENT_LEVEL])) throw new Error("El tratamiento tiene que ser Sin HT o Con HT.");
  return resolved;
}

function validateProductHeight(heightCm?: number | null) {
  if (heightCm !== undefined && heightCm !== null
    && (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 99_999.99 || Math.abs(heightCm * 100 - Math.round(heightCm * 100)) > 1e-8))
    throw new Error("La altura debe ser positiva y tener como máximo dos decimales.");
}

export async function createProduct(input: CreateProductInput) {
  validateProductHeight(input.heightCm);
  const heightCm = input.kind === "Pallet" ? input.heightCm ?? 10 : input.heightCm ?? null;
  const levels = await getProductLevels();
  const zetaCode = input.zetaCode?.trim().toLocaleUpperCase("es");
  if (!zetaCode || !/^[1-9]\d*$/.test(zetaCode)) throw new Error("Indique un código numérico.");
  const measure = input.measure?.trim();
  if (!measure) throw new Error("Indique la medida.");
  const attributes = resolveAttributes(input, levels);
  const requiresTreatment = requiresHeatTreatment(attributes[TREATMENT_LEVEL]);
  const stockName = input.stockName?.trim() || buildProductName({ kind: input.kind, measure, attributes, requiresTreatment }, levels);
  const clientIds = [...new Set(input.clientIds ?? [])].filter(Boolean);
  if (!useMemoryStore) {
    const id = await supabaseServerRequest<string>("/rest/v1/rpc/create_catalog_product_v7", {
      method: "POST",
      body: JSON.stringify({ p_kind: input.kind, p_measure: measure, p_height_cm: heightCm, p_attributes: attributes, p_zeta_code: zetaCode, p_stock_name: stockName, p_client_ids: clientIds }),
    }).catch(levelsMigrationError);
    await rememberLevelOptions(measure, attributes);
    const product = (await getProducts()).find((item) => item.id === id);
    if (!product) throw new Error("El producto se creó pero no pudo recuperarse.");
    return product;
  }
  if (memoryProducts.some((product) => product.zetaCode?.toLocaleUpperCase("es") === zetaCode)) throw new Error(`Ya existe un producto con el código ${zetaCode}.`);
  const draft = { id: `producto-${crypto.randomUUID()}`, kind: input.kind, measure, heightCm: heightCm ?? undefined, attributes, requiresTreatment, zetaCode, stockName } satisfies Product;
  const twin = memoryProducts.find((product) => productKey(product) === productKey(draft));
  if (twin) throw new Error(`Ya existe un producto con esa clasificación (código ${twin.zetaCode ?? twin.id}).`);
  memoryProducts.push(draft);
  await rememberLevelOptions(measure, attributes);
  for (const clientId of clientIds) await assignClientToProduct(draft.id, clientId);
  return (await getProducts()).find((item) => item.id === draft.id) ?? draft;
}

async function assignClientToProduct(productId: string, clientId: string) {
  const client = (await getClients()).find((item) => item.id === clientId);
  if (!client) throw new Error("El cliente seleccionado no existe.");

  if (useMemoryStore) {
    const product = memoryProducts.find((item) => item.id === productId);
    if (!product) throw new Error("Producto no encontrado.");
    if (memoryClientProducts.some((item) => item.clientId === clientId && item.productId === productId)) return;
    const id = memoryMasterId++;
    const now = new Date().toISOString();
    memoryClientProducts.push({
      id,
      clientId,
      productId,
      zetaCode: product.zetaCode ?? "",
      active: true,
      displayOrder: memoryClientProducts.filter((item) => item.clientId === clientId).length,
      createdAt: now,
      updatedAt: now,
      product,
      controls: [],
      assets: [],
    });
    seedMemoryPalletProductionRules(memoryClientProducts[memoryClientProducts.length - 1]);
    return;
  }

  const query = new URLSearchParams({ select: "id", client_id: `eq.${clientId}`, product_id: `eq.${productId}`, limit: "1" });
  const existing = await supabaseServerRequest<Array<{ id: number }>>(`/rest/v1/client_products?${query}`);
  if (existing.length) return;
  await supabaseServerRequest<unknown>("/rest/v1/client_products", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ client_id: clientId, product_id: productId, zeta_code: null, active: true }),
  });
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  validateProductHeight(input.heightCm);
  const heightCm = input.kind === "Pallet" && input.heightCm === null ? 10 : input.heightCm;
  const levels = await getProductLevels();
  const stockName = input.stockName?.trim();
  const zetaCode = input.zetaCode?.trim().toLocaleUpperCase("es");
  if (input.stockName !== undefined && !stockName) throw new Error("Indique el nombre del producto.");
  if (input.zetaCode !== undefined && (!zetaCode || !/^[1-9]\d*$/.test(zetaCode))) throw new Error("Indique un código numérico.");
  const measure = input.measure?.trim();
  if (!measure) throw new Error("Indique la medida.");
  const attributes = resolveAttributes(input, levels);
  const requiresTreatment = requiresHeatTreatment(attributes[TREATMENT_LEVEL]);

  if (!useMemoryStore) {
    await supabaseServerRequest<string>("/rest/v1/rpc/update_catalog_product_v5", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_kind: input.kind, p_measure: measure, p_height_cm: heightCm ?? null, p_height_provided: heightCm !== undefined, p_attributes: attributes, p_zeta_code: zetaCode ?? null, p_stock_name: stockName ?? null }),
    }).catch(levelsMigrationError);
    await rememberLevelOptions(measure, attributes);
    if (input.clientIds) await supabaseServerRequest<boolean>("/rest/v1/rpc/set_product_clients_v1", { method: "POST", body: JSON.stringify({ p_product_id: id, p_client_ids: [...new Set(input.clientIds)] }) });
    else if (input.clientId) await assignClientToProduct(id, input.clientId);
    const products = await getProducts();
    const product = products.find((item) => item.id === id);
    if (!product) throw new Error("El producto se actualizó pero no pudo recuperarse.");
    return product;
  }

  const product = memoryProducts.find((item) => item.id === id);
  if (!product) throw new Error("Producto no encontrado.");
  if (zetaCode && memoryProducts.some((item) => item.id !== id && item.zetaCode?.toLocaleUpperCase("es") === zetaCode)) throw new Error(`Ya existe otro producto con el código ${zetaCode}.`);
  const candidate = { ...product, kind: input.kind, measure, attributes, requiresTreatment };
  const twin = memoryProducts.find((item) => item.id !== id && productKey(item) === productKey(candidate));
  if (twin) throw new Error(`Ya existe un producto con esa clasificación (código ${twin.zetaCode ?? twin.id}).`);
  Object.assign(product, { kind: input.kind, measure, attributes, requiresTreatment, ...(heightCm !== undefined ? { heightCm: heightCm ?? undefined } : {}), ...(stockName ? { stockName } : {}), ...(zetaCode ? { zetaCode } : {}) });
  await rememberLevelOptions(measure, attributes);
  if (zetaCode) memoryClientProducts.filter((item) => item.productId === id).forEach((item) => { item.zetaCode = zetaCode; item.product.zetaCode = zetaCode; });
  if (input.clientIds) {
    const wanted = new Set(input.clientIds);
    for (const clientId of wanted) await assignClientToProduct(id, clientId);
    const usedLink = (linkId: number | string) => memoryOrders.some((order) => order.lines.some((line) => String(line.clientProductId) === String(linkId)));
    memoryClientProducts.filter((item) => item.productId === id && !wanted.has(item.clientId)).forEach((item) => { item.active = false; });
    const kept = memoryClientProducts.filter((item) => item.productId !== id || wanted.has(item.clientId) || usedLink(item.id));
    const keptIds = new Set(kept.map((item) => String(item.id)));
    const keptRules = memoryProductionRules.filter((rule) => rule.clientProductId === undefined || keptIds.has(String(rule.clientProductId)));
    memoryProductionRules.length = 0;
    memoryProductionRules.push(...keptRules);
    memoryClientProducts.length = 0;
    memoryClientProducts.push(...kept);
  } else if (input.clientId) await assignClientToProduct(id, input.clientId);
  const updated = (await getProducts()).find((item) => item.id === id);
  if (!updated) throw new Error("El producto se actualizó pero no pudo recuperarse.");
  return updated;
}

export async function deleteProduct(id: string) {
  if (!useMemoryStore) {
    await supabaseServerRequest<string>("/rest/v1/rpc/delete_catalog_product_v2", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    return;
  }

  const index = memoryProducts.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Producto no encontrado.");
  const usedBy = memoryOrders.filter((order) => order.lines.some((line) => line.productId === id));
  if (usedBy.length) throw new Error(`No se puede eliminar: el producto figura en ${usedBy.length} pedido(s) de ${[...new Set(usedBy.map((order) => order.client))].join(", ")}. Cancelá o eliminá esos pedidos primero.`);
  const remaining = memoryClientProducts.filter((item) => item.productId !== id);
  const keptRules = memoryProductionRules.filter((rule) => rule.productId !== id);
  memoryProductionRules.length = 0;
  memoryProductionRules.push(...keptRules);
  memoryClientProducts.length = 0;
  memoryClientProducts.push(...remaining);
  memoryProducts.splice(index, 1);
}

/** Elimina un pedido con sus viajes y su producción. Si ya tiene stock o tratamientos HT registrados, hay que cancelarlo en su lugar. */
export async function deleteOrder(id: string) {
  if (!useMemoryStore) {
    try {
      await supabaseServerRequest<string>("/rest/v1/rpc/delete_operation_order_v1", {
        method: "POST",
        body: JSON.stringify({ p_order_id: id }),
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "PGRST202") throw new Error("La base todavía no permite eliminar pedidos: falta aplicar la migración 20261030120000_delete_order.");
      throw error;
    }
    return;
  }

  const index = memoryOrders.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Pedido no encontrado.");
  const order = memoryOrders[index];
  const lineIds = new Set(order.lines.map((line) => String(line.id)));
  const shipmentLineIds = new Set((order.shipments ?? []).flatMap((shipment) => shipment.lines.map((line) => String(line.id))));
  const hasLedger = memoryStockMovements.some((movement) => (movement.orderLineId !== undefined && lineIds.has(String(movement.orderLineId))) || (movement.shipmentLineId !== undefined && shipmentLineIds.has(String(movement.shipmentLineId))))
    || memoryTreatmentBatches.some((batch) => lineIds.has(String(batch.orderLineId)));
  if (hasLedger) throw new Error("El pedido ya tiene movimientos de stock o tratamientos HT registrados. Cancelalo para conservar el historial.");
  const keptReservations = memoryStockReservations.filter((item) => !shipmentLineIds.has(String(item.shipmentLineId)));
  memoryStockReservations.length = 0;
  memoryStockReservations.push(...keptReservations);
  memoryHistory.delete(id);
  memoryOrders.splice(index, 1);
}

export async function createOrder(input: CreateOrderInput) {
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.some((line) => !line.clientProductId || !Number.isInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("Indique al menos un producto con una cantidad mayor a cero.");
  }
  if (!useMemoryStore) {
    const id = await supabaseServerRequest<string>("/rest/v1/rpc/create_operation_order_v7", {
      method: "POST",
      body: JSON.stringify({
        p_lines: input.lines.map((line) => ({ clientProductId: Number(line.clientProductId), quantity: line.quantity })),
        p_order_date: input.orderDate,
        p_planned_date: input.plannedDate,
        p_delivery_date_note: input.deliveryDateNote?.trim() || null,
        p_notes: input.notes?.trim() || null,
        p_required_operations: canonicalOperations(input.requiredOperations),
      }),
    });
    const order = await getDatabaseOrder(id);
    if (!order) throw new Error("El pedido se creó pero no pudo recuperarse.");
    return order;
  }

  const selected = input.lines.map((line) => ({ line, relation: memoryClientProducts.find((item) => String(item.id) === String(line.clientProductId)) }));
  const client = memoryClients.find((item) => item.id === selected[0]?.relation?.clientId);
  if (!client || !client.active || selected.some(({ relation }) => !relation || relation.clientId !== client.id || !relation.active || !clientProductReady(relation))) throw new Error("Los productos deben estar activos y pertenecer al mismo cliente.");
  const requested = input.lines.reduce((sum, line) => sum + line.quantity, 0);
  const resolvedLines = selected.map(({ line, relation }, index) => ({ id: "", product: productLabel(relation!.product, relation!.operationalName), productId: relation!.productId, clientProductId: relation!.id, quantity: line.quantity, treatment: relation!.product.treatment, index }));
  const resolvedProduct = resolvedLines.map((line) => line.product).join(" · ");

  const id = `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const order: OperationOrder = {
    id,
    reference: `Pedido ${memoryOrders.length + 1}`,
    client: client.name,
    clientId: client.id,
    product: resolvedProduct,
    productId: resolvedLines[0].productId,
    clientProductId: resolvedLines[0].clientProductId,
    requested,
    delivered: 0,
    pending: requested,
    stage: "negociacion",
    orderDate: input.orderDate,
    requestedDeliveryDate: input.plannedDate,
    deliveryDateNote: input.deliveryDateNote?.trim() || undefined,
    zetaCode: selected.map(({ relation }) => relation!.zetaCode).join(" · "),
    plannedDate: input.plannedDate,
    dateLabel: formatPlannedDate(input.plannedDate),
    transport: "Sin definir",
    transportSource: "internal",
    transportDefined: false,
    productionSource: "internal",
    productionDefined: false,
    requiredOperations: canonicalOperations(input.requiredOperations),
    supply: "Producción sin planificar",
    preparation: "Pendiente de preparación",
    logistics: "Transporte sin definir",
    delivery: `0 de ${requested} entregados`,
    action: "Preparar y coordinar la entrega.",
    deliveryAddress: client.address,
    notes: input.notes?.trim() || undefined,
    lines: resolvedLines.map((line) => ({ ...line, id: `${id}-${line.index + 1}`, productionAllocations: [] })),
    source: "Alta desde dashboard",
  };
  order.shipments = [{ id: `shipment-${crypto.randomUUID()}`, orderId: id, plannedDate: input.plannedDate, status: "planned", transportSource: "internal", transportLabel: "Sin definir", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lines: order.lines.map((line) => ({ id: `sl-${crypto.randomUUID()}`, shipmentId: `shipment-${id}`, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: line.quantity, deliveredQuantity: 0 })), events: [] }];
  order.shipments[0].events.push({ id: `se-${crypto.randomUUID()}`, shipmentId: order.shipments[0].id, eventType: "created", nextStatus: "planned", nextDate: input.plannedDate, responsible: "Sistema", createdAt: new Date().toISOString() });
  memoryOrders.unshift(order);
  return order;
}

export async function planOrderProduction(orderId: string, allocations: ProductionPlanInput) {
  if (allocations.some((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate) || !Number.isInteger(item.plannedQuantity) || item.plannedQuantity <= 0 || !item.resourceId)) throw new Error("Revisá recursos, fechas y cantidades.");
  if (!useMemoryStore) {
    const currentOrder = await getDatabaseOrder(orderId);
    if (!currentOrder) return null;
    for (const line of currentOrder.lines) {
      const fixed = Math.min(line.quantity, (line.productionAllocations ?? []).reduce((sum, item) => sum + (item.status === "completed" ? item.actualQuantity ?? 0 : item.status === "confirmed" ? item.plannedQuantity : 0), 0));
      const planned = allocations.filter((item) => item.orderLineId === line.id).reduce((sum, item) => sum + item.plannedQuantity, 0);
      if (fixed + planned > line.quantity) throw new Error(`La producción asignada supera la cantidad de ${line.product}.`);
    }
    await supabaseServerRequest<boolean>("/rest/v1/rpc/plan_order_production_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_allocations: allocations.map((item) => ({ ...item, status: "draft" })) }) });
    return getDatabaseOrder(orderId);
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  for (const line of order.lines) {
    await replaceProductionAllocations(line.id, allocations.filter((item) => item.orderLineId === line.id).map((item) => ({ resourceId: item.resourceId, plannedDate: item.plannedDate, plannedQuantity: item.plannedQuantity, status: "draft" })));
  }
  const dates = order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled").map((item) => item.plannedDate)).sort();
  order.productionDefined = dates.length > 0;
  order.productionDate = dates[0];
  order.productionEndDate = dates.at(-1);
  order.supply = dates.length ? "Producción planificada" : "Producción sin planificar";
  return order;
}

export async function assignOrderTransport(orderId: string, input: TransportAssignmentInput) {
  const providerId = input.providerId?.trim() || generateProviderSlug(input.newProviderName ?? "");
  if (!isActiveProvider({ id: providerId })) throw new Error("El transportista Linares está retirado.");
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/assign_order_transport_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_source: input.source, p_provider_id: input.providerId?.trim() || null, p_new_provider_name: input.newProviderName?.trim() || null }) });
    return getDatabaseOrder(orderId);
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  let provider = input.newProviderName?.trim() ? memoryProviders.find((item) => item.name.localeCompare(input.newProviderName!.trim(), "es", { sensitivity: "accent" }) === 0) : memoryProviders.find((item) => item.id === input.providerId);
  if (!provider && input.newProviderName?.trim()) {
    provider = { id: generateProviderSlug(input.newProviderName), name: input.newProviderName.trim(), type: "Transporte", supplies: "Transporte", internalTransport: input.source === "internal" };
    memoryProviders.push(provider);
  }
  if (!provider || provider.type !== "Transporte") throw new Error("Seleccioná un transporte.");
  Object.assign(order, { transportSource: input.source, transportProviderId: provider.id, transport: provider.name, logistics: `${provider.name} · entrega planificada`, transportDefined: true });
  (order.shipments ?? []).filter((shipment) => shipment.status === "planned").forEach((shipment) => Object.assign(shipment, { transportSource: input.source, transportProviderId: provider!.id, transportLabel: provider!.name }));
  return order;
}

export async function planOrderDrying(orderId: string, input: DryingPlanInput) {
  const allocations = input.allocations?.filter((item) => item.quantity > 0);
  if (allocations?.length) {
    // Con cantidades por día, el rango del pedido sale de la primera y la última fecha programadas.
    const dates = allocations.map((item) => item.date).sort();
    input = { ...input, startDate: dates[0], endDate: dates.at(-1) };
  }
  if (!useMemoryStore) {
    if (allocations) {
      const current = await getDatabaseOrder(orderId);
      const lineIds = new Set((current?.lines ?? []).map((line) => line.id));
      if (!current || allocations.some((item) => !lineIds.has(item.orderLineId) || !Number.isInteger(item.quantity))) throw new Error("Las cantidades no corresponden a este pedido.");
    }
    await supabaseServerRequest<boolean>("/rest/v1/rpc/plan_order_drying_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_start: input.startDate, p_end: input.endDate || null, p_note: input.note?.trim() || null }) });
    if (allocations) {
      const lineIds = (await getDatabaseOrder(orderId))?.lines.map((line) => encodeURIComponent(line.id)) ?? [];
      try {
        if (lineIds.length) await supabaseServerRequest(`/rest/v1/drying_allocations?order_line_id=in.(${lineIds.join(",")})`, { method: "DELETE" });
        await supabaseServerRequest("/rest/v1/drying_allocations", { method: "POST", body: JSON.stringify(allocations.map((item) => ({ order_line_id: item.orderLineId, planned_date: item.date, planned_quantity: item.quantity }))) });
      } catch (error) {
        if ((error as Error & { code?: string }).code === "PGRST205") throw new Error("Falta crear la tabla de programación del secadero en la base de datos.");
        throw error;
      }
    }
    return getDatabaseOrder(orderId);
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  if (input.endDate && input.endDate < input.startDate) throw new Error("La fecha de fin no puede ser anterior al inicio.");
  Object.assign(order, { dryingStartDate: input.startDate, dryingEndDate: input.endDate || input.startDate, dryingNote: input.note?.trim() || undefined });
  if (allocations) for (const line of order.lines) line.dryingAllocations = allocations.filter((item) => item.orderLineId === line.id).map((item) => ({ date: item.date, quantity: item.quantity }));
  return order;
}

export type AllocationInput = { resourceId?: string; plannedDate: string; plannedQuantity: number; status: ProductionAllocationStatus; note?: string };
export type ShipmentLineInput = { orderLineId: string; plannedQuantity: number };
export type ShipmentInput = { plannedDate: string; transportSource: TransportSource; transportProviderId?: string; lines: ShipmentLineInput[]; responsible?: string };

export async function getOrderDetail(id: string) {
  return useMemoryStore ? memoryOrders.find((item) => item.id === id) ?? null : getDatabaseOrder(id);
}

function refreshMemoryOrder(order: OperationOrder) {
  const shipments = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled");
  order.delivered = shipments.flatMap((shipment) => shipment.lines).reduce((sum, line) => sum + line.deliveredQuantity, 0);
  order.pending = Math.max(order.requested - order.delivered, 0);
  order.delivery = `${order.delivered} de ${order.requested} entregados`;
  if (order.delivered >= order.requested) { order.stage = "completado"; order.deliveryStatus = "completa"; }
  else if (order.delivered > 0) order.deliveryStatus = "parcial";
  const next = shipments.filter((shipment) => !["delivered"].includes(shipment.status)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
  if (next) { order.plannedDate = next.plannedDate; order.dateLabel = formatPlannedDate(next.plannedDate); }
}

export async function replaceProductionAllocations(orderLineId: string, allocations: AllocationInput[]) {
  if (!useMemoryStore) {
    const currentOrder = (await getOrders()).find((item) => item.lines.some((line) => line.id === orderLineId));
    const currentLine = currentOrder?.lines.find((line) => line.id === orderLineId);
    if (!currentLine) throw new Error("Línea no encontrada.");
    const fixedQuantity = Math.min(currentLine.quantity, (currentLine.productionAllocations ?? []).reduce((sum, item) => sum + (item.status === "completed" ? item.actualQuantity ?? 0 : item.status === "confirmed" ? item.plannedQuantity : 0), 0));
    if (fixedQuantity + allocations.reduce((sum, item) => sum + item.plannedQuantity, 0) > currentLine.quantity) throw new Error("La producción asignada supera la cantidad de la línea.");
    await supabaseServerRequest<boolean>("/rest/v1/rpc/replace_production_allocations_v1", { method: "POST", body: JSON.stringify({ p_order_line_id: orderLineId, p_allocations: allocations }) });
    const order = (await getOrders()).find((item) => item.lines.some((line) => line.id === orderLineId));
    return order?.lines.find((line) => line.id === orderLineId) ?? null;
  }
  const order = memoryOrders.find((item) => item.lines.some((line) => line.id === orderLineId));
  const line = order?.lines.find((item) => item.id === orderLineId);
  if (!line) return null;
  const fixed = (line.productionAllocations ?? []).filter((item) => item.status === "confirmed" || item.status === "completed");
  const previousDrafts = (line.productionAllocations ?? []).filter((item) => item.status === "draft");
  if (allocations.some((item) => item.status !== "draft" || !/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate) || !Number.isInteger(item.plannedQuantity) || item.plannedQuantity <= 0)) throw new Error("Las asignaciones nuevas se guardan en borrador con fecha y cantidad válidas.");
  const fixedQuantity = Math.min(line.quantity, fixed.reduce((sum, item) => sum + (item.status === "completed" ? item.actualQuantity ?? 0 : item.plannedQuantity), 0));
  if (fixedQuantity + allocations.reduce((sum, item) => sum + item.plannedQuantity, 0) > line.quantity) throw new Error("La producción asignada supera la cantidad de la línea.");
  const now = new Date().toISOString();
  line.productionAllocations = [...fixed, ...allocations.map((item) => { const resourceId = item.resourceId?.trim() || undefined; const resource = memoryProductionResources.find((entry) => String(entry.id) === resourceId || entry.providerId === resourceId || resourceId === "internal" && entry.resourceType === "internal_factory"); return { ...item, id: `pa-${crypto.randomUUID()}`, orderLineId, resourceId, productionResourceId: resource?.id, status: "draft" as const, note: item.note?.trim() || undefined, createdAt: now, updatedAt: now }; })];
  const describe = (entries: Array<{ plannedDate: string; plannedQuantity: number; resourceId?: string }>) => entries.length ? entries.map((entry) => `${formatPlannedDate(entry.plannedDate)} · ${entry.plannedQuantity} palets · ${entry.resourceId ?? "Sin recurso"}`).join(" | ") : "Sin distribuir";
  const from = describe(previousDrafts);
  const to = describe(allocations);
  if (order && from !== to) memoryHistory.set(order.id, [{ id: `produccion-${crypto.randomUUID()}`, changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date(now)), kind: "cambio", note: `${line.product}: distribución de producción actualizada`, changes: [{ field: "Distribución de producción", from, to }] }, ...(memoryHistory.get(order.id) ?? [])]);
  return line;
}

function validateMemoryShipmentLines(order: OperationOrder, shipmentId: number | string | undefined, lines: ShipmentLineInput[]) {
  if (!lines.length) throw new Error("Indique al menos una línea para el viaje.");
  for (const input of lines) {
    const line = order.lines.find((item) => item.id === input.orderLineId);
    if (!line || !Number.isInteger(input.plannedQuantity) || input.plannedQuantity <= 0) throw new Error("Revise las líneas y cantidades del viaje.");
    void shipmentId;
  }
}

export async function createShipment(orderId: string, input: ShipmentInput) {
  if (input.transportProviderId && !isActiveProvider({ id: input.transportProviderId })) throw new Error("El transportista Linares está retirado.");
  if (!useMemoryStore) {
    const id = await supabaseServerRequest<number>("/rest/v1/rpc/create_shipment_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_planned_date: input.plannedDate, p_transport_source: input.transportSource, p_transport_provider_id: input.transportProviderId ?? null, p_lines: input.lines, p_responsible: input.responsible?.trim() || "Operación" }) });
    return (await getDatabaseOrder(orderId))?.shipments?.find((item) => String(item.id) === String(id)) ?? null;
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  validateMemoryShipmentLines(order, undefined, input.lines);
  const provider = memoryProviders.find((item) => item.id === input.transportProviderId);
  if (input.transportSource === "external" && input.transportProviderId && provider?.type !== "Transporte") throw new Error("Seleccione un transportista registrado.");
  const now = new Date().toISOString();
  const id = `shipment-${crypto.randomUUID()}`;
  const shipment: Shipment = { id, orderId, plannedDate: input.plannedDate, status: "planned", transportSource: input.transportSource, transportProviderId: input.transportProviderId, transportLabel: input.transportSource === "internal" ? "Transporte interno" : provider?.name ?? "Transportista", createdAt: now, updatedAt: now, lines: input.lines.map((item) => { const line = order.lines.find((entry) => entry.id === item.orderLineId)!; return { id: `sl-${crypto.randomUUID()}`, shipmentId: id, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: item.plannedQuantity, deliveredQuantity: 0 }; }), events: [{ id: `se-${crypto.randomUUID()}`, shipmentId: id, eventType: "created", nextStatus: "planned", nextDate: input.plannedDate, responsible: input.responsible?.trim() || "Operación", createdAt: now }] };
  order.shipments ??= [];
  order.shipments.push(shipment); refreshMemoryOrder(order); return shipment;
}

export async function updatePlannedShipment(shipmentId: number | string, input: ShipmentInput) {
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/update_planned_shipment_v1", { method: "POST", body: JSON.stringify({ p_shipment_id: Number(shipmentId), p_planned_date: input.plannedDate, p_transport_source: input.transportSource, p_transport_provider_id: input.transportProviderId ?? null, p_lines: input.lines, p_responsible: input.responsible?.trim() || "Operación" }) });
    return (await getOrders()).flatMap((order) => order.shipments ?? []).find((item) => String(item.id) === String(shipmentId)) ?? null;
  }
  const order = memoryOrders.find((item) => item.shipments?.some((shipment) => String(shipment.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  if (!order || !shipment) return null;
  if (shipment.status !== "planned") throw new Error("Solo se edita un viaje planificado.");
  validateMemoryShipmentLines(order, shipmentId, input.lines);
  shipment.plannedDate = input.plannedDate; shipment.transportSource = input.transportSource; shipment.transportProviderId = input.transportProviderId; shipment.transportLabel = input.transportSource === "internal" ? "Transporte interno" : memoryProviders.find((item) => item.id === input.transportProviderId)?.name ?? "Transportista"; shipment.updatedAt = new Date().toISOString();
  shipment.lines = input.lines.map((item) => { const line = order.lines.find((entry) => entry.id === item.orderLineId)!; return { id: `sl-${crypto.randomUUID()}`, shipmentId, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: item.plannedQuantity, deliveredQuantity: 0 }; });
  refreshMemoryOrder(order); return shipment;
}

export async function transitionShipment(shipmentId: number | string, input: { nextStatus: ShipmentStatus; remittance?: string; sharedRemittanceReason?: string; deliveredLines?: Array<{ shipmentLineId: number | string; deliveredQuantity: number }>; loadedLines?: Array<{ shipmentLineId: number | string; loadedQuantity: number }>; responsible?: string }) {
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/transition_shipment_v3", { method: "POST", body: JSON.stringify({ p_shipment_id: Number(shipmentId), p_next_status: input.nextStatus, p_remittance: input.remittance?.trim() || null, p_shared_remittance_reason: input.sharedRemittanceReason?.trim() || null, p_delivered_lines: input.deliveredLines ?? [], p_loaded_lines: input.loadedLines ?? null, p_responsible: input.responsible?.trim() || "Operación" }) });
    return (await getOrders()).flatMap((order) => order.shipments ?? []).find((item) => String(item.id) === String(shipmentId)) ?? null;
  }
  const order = memoryOrders.find((item) => item.shipments?.some((shipment) => String(shipment.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  if (!order || !shipment) return null;
  const expected: Partial<Record<ShipmentStatus, ShipmentStatus>> = { planned: "ready", ready: "loaded", loaded: "dispatched", dispatched: "delivered" };
  if (input.nextStatus !== expected[shipment.status] && !(input.nextStatus === "cancelled" && !["dispatched", "delivered", "cancelled"].includes(shipment.status))) throw new Error("La transición del viaje no es válida.");
  const remittance = input.remittance?.trim() || shipment.remittance;
  const actor = input.responsible?.trim() || "Operación";
  if (input.nextStatus === "ready") {
    shipment.deliveryAddressSnapshot = order.deliveryAddress;
    for (const shipmentLine of shipment.lines) {
      const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
      if (!orderLine?.productId) throw new Error("Una línea del viaje no tiene producto canónico.");
      const stock = (await getStockSummary()).find((item) => item.product.id === orderLine.productId);
      const ownClaim = orderStockReservations([order], memoryProducts).get(orderLine.productId)?.ready ?? 0;
      const ownReserved = order.lines.filter((item) => item.productId === orderLine.productId)
        .reduce((sum, item) => sum + (item.readyReservedQuantity ?? 0), 0);
      const activeReserved = memoryStockReservations.filter((item) => item.productId === orderLine.productId && item.status === "active")
        .reduce((sum, item) => sum + item.quantity, 0);
      const quantity = Math.min(Math.max((stock?.available ?? 0) + ownClaim - ownReserved, 0),
        Math.max((stock?.ready ?? 0) - activeReserved, 0), shipmentLine.plannedQuantity);
      if (quantity > 0) memoryStockReservations.push({ id: `reservation-${crypto.randomUUID()}`, shipmentLineId: shipmentLine.id, productId: orderLine.productId, quantity, status: "active" });
      orderLine.readyReservedQuantity = (orderLine.readyReservedQuantity ?? 0) + quantity;
    }
  }
  if (input.nextStatus === "loaded") {
    const loads = shipment.lines.map((shipmentLine) => ({ shipmentLine,
      loaded: input.loadedLines?.find((item) => String(item.shipmentLineId) === String(shipmentLine.id))?.loadedQuantity ?? shipmentLine.plannedQuantity }));
    if (loads.some(({ shipmentLine, loaded }) => !Number.isInteger(loaded) || loaded < 0 || loaded > shipmentLine.plannedQuantity))
      throw new Error("Cantidad cargada inválida.");
    for (const { shipmentLine, loaded } of loads) {
      shipmentLine.loadedQuantity = loaded;
      const orderLine = order.lines.find((item) => item.id === shipmentLine.orderLineId);
      if (!orderLine?.productId) throw new Error("Una línea del viaje no tiene producto canónico.");
      const previous = memoryStockReservations.find((item) => String(item.shipmentLineId) === String(shipmentLine.id) && item.status === "active");
      if (previous) { previous.status = "released"; orderLine.readyReservedQuantity = Math.max((orderLine.readyReservedQuantity ?? 0) - previous.quantity, 0); }
      const stock = (await getStockSummary()).find((item) => item.product.id === orderLine.productId);
      const ownClaim = orderStockReservations([order], memoryProducts).get(orderLine.productId)?.ready ?? 0;
      const ownReserved = order.lines.filter((item) => item.productId === orderLine.productId)
        .reduce((sum, item) => sum + (item.readyReservedQuantity ?? 0), 0);
      const activeReserved = memoryStockReservations.filter((item) => item.productId === orderLine.productId && item.status === "active")
        .reduce((sum, item) => sum + item.quantity, 0);
      const reserved = Math.min(Math.max((stock?.available ?? 0) + ownClaim - ownReserved, 0),
        Math.max((stock?.ready ?? 0) - activeReserved, 0), loaded);
      if (reserved > 0) memoryStockReservations.push({ id: `reservation-${crypto.randomUUID()}`, shipmentLineId: shipmentLine.id,
        productId: orderLine.productId, quantity: reserved, status: "active" });
      orderLine.readyReservedQuantity = (orderLine.readyReservedQuantity ?? 0) + reserved;
    }
  }
  if (input.nextStatus === "cancelled") for (const shipmentLine of shipment.lines) {
    const reservation = memoryStockReservations.find((item) => String(item.shipmentLineId) === String(shipmentLine.id) && item.status === "active");
    if (!reservation) continue;
    reservation.status = "released";
    const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
    if (orderLine) orderLine.readyReservedQuantity = Math.max((orderLine.readyReservedQuantity ?? 0) - reservation.quantity, 0);
  }
  if (input.nextStatus === "dispatched") for (const shipmentLine of shipment.lines) {
    const reservation = memoryStockReservations.find((item) => String(item.shipmentLineId) === String(shipmentLine.id) && item.status === "active");
    const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
    if (!orderLine?.productId) throw new Error("Una línea del viaje no tiene producto canónico.");
    const actual = shipmentLine.loadedQuantity ?? shipmentLine.plannedQuantity;
    if (actual === 0) continue;
    const before = calculateStockBalances(memoryStockMovements).get(orderLine.productId)?.ready ?? 0;
    const now = new Date().toISOString();
    memoryStockMovements.push({ id: `movement-${memoryTreatmentId++}`, productId: orderLine.productId, stockState: "ready", quantity: -actual, movementType: "dispatch", orderLineId: orderLine.id, shipmentLineId: shipmentLine.id, remittance, transformationId: crypto.randomUUID(), performedAt: now, responsible: input.responsible?.trim() || "Operación", note: `Despacho de viaje ${shipment.id}`, createdAt: now });
    if (reservation) { reservation.status = "consumed"; orderLine.readyReservedQuantity = Math.max((orderLine.readyReservedQuantity ?? 0) - reservation.quantity, 0); }
  }
  if (input.nextStatus === "delivered") for (const delivered of input.deliveredLines ?? []) { const line = shipment.lines.find((item) => String(item.id) === String(delivered.shipmentLineId)); if (!line || !Number.isInteger(delivered.deliveredQuantity) || delivered.deliveredQuantity < 0 || delivered.deliveredQuantity > (line.loadedQuantity ?? line.plannedQuantity)) throw new Error("Cantidad entregada inválida."); line.deliveredQuantity = delivered.deliveredQuantity; }
  const previousStatus = shipment.status; const previousRemittance = shipment.remittance; const now = new Date().toISOString(); shipment.status = input.nextStatus; shipment.remittance = remittance; shipment.sharedRemittanceReason = input.sharedRemittanceReason?.trim() || shipment.sharedRemittanceReason; shipment.updatedAt = now;
  if (input.nextStatus === "loaded") shipment.loadedAt = now; if (input.nextStatus === "dispatched") shipment.dispatchedAt = now; if (input.nextStatus === "delivered") shipment.deliveredAt = now;
  shipment.events.push({ id: `se-${crypto.randomUUID()}`, shipmentId, eventType: "transition", previousStatus, nextStatus: input.nextStatus, previousRemittance, nextRemittance: remittance, responsible: input.responsible?.trim() || "Operación", createdAt: now });
  refreshMemoryOrder(order); return shipment;
}

export async function rescheduleShipment(shipmentId: number | string, input: { newDate: string; reason: RescheduleReason; note?: string; responsible?: string }) {
  if (input.reason === "other" && !input.note?.trim()) throw new Error("Detalle el motivo de reprogramación.");
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/reschedule_shipment_v1", { method: "POST", body: JSON.stringify({ p_shipment_id: Number(shipmentId), p_new_date: input.newDate, p_reason: input.reason, p_note: input.note?.trim() || null, p_responsible: input.responsible?.trim() || "Operación" }) });
    return (await getOrders()).flatMap((order) => order.shipments ?? []).find((item) => String(item.id) === String(shipmentId)) ?? null;
  }
  const order = memoryOrders.find((item) => item.shipments?.some((shipment) => String(shipment.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  if (!order || !shipment) return null;
  if (!["planned", "ready"].includes(shipment.status) || shipment.plannedDate === input.newDate) throw new Error("Solo se reprograman viajes planificados o prontos a una fecha distinta.");
  const previousDate = shipment.plannedDate; const now = new Date().toISOString(); shipment.plannedDate = input.newDate; shipment.updatedAt = now; shipment.events.push({ id: `se-${crypto.randomUUID()}`, shipmentId, eventType: "rescheduled", previousDate, nextDate: input.newDate, reason: input.reason, note: input.note?.trim() || undefined, responsible: input.responsible?.trim() || "Operación", createdAt: now }); refreshMemoryOrder(order); return shipment;
}

const shipmentHistoryStatus: Record<ShipmentStatus, string> = { planned: "Planificado", ready: "Pronto", loaded: "Cargado", dispatched: "En viaje", delivered: "Entregado", cancelled: "Cancelado" };
const shipmentHistoryReasons: Record<RescheduleReason, string> = { production: "Producción", logistics: "Logística", client: "Cliente", weather: "Clima / lluvia", other: "Otro" };

function shipmentHistory(order: OperationOrder) {
  return (order.shipments ?? []).flatMap((shipment) => shipment.events.map((event) => {
    const changes: OrderChange["changes"] = [];
    if (event.eventType === "created") changes.push({ field: "Viaje", from: "—", to: `Creado para ${formatPlannedDate(event.nextDate ?? shipment.plannedDate)}` });
    if (event.eventType === "rescheduled" && event.previousDate && event.nextDate) changes.push({ field: "Fecha de entrega", from: formatPlannedDate(event.previousDate), to: formatPlannedDate(event.nextDate) });
    if (event.eventType === "transition" && event.previousStatus && event.nextStatus) changes.push({ field: "Estado del viaje", from: shipmentHistoryStatus[event.previousStatus], to: shipmentHistoryStatus[event.nextStatus] });
    if ((event.eventType === "transition" || event.eventType === "remittance_corrected") && event.previousRemittance !== event.nextRemittance) changes.push({ field: "Remito", from: event.previousRemittance ?? "—", to: event.nextRemittance ?? "—" });
    if (event.eventType === "incident" && !changes.length) changes.push({ field: "Viaje", from: "Sin incidencia", to: "Incidencia registrada" });
    const reason = event.reason ? `Motivo: ${shipmentHistoryReasons[event.reason]}. ` : "";
    const detail = [reason, event.note, `Responsable: ${event.responsible}`].filter(Boolean).join(" ").trim();
    const kind: OrderUpdateKind = event.eventType === "incident" ? "incidencia" : event.nextStatus === "delivered" ? "entrega" : event.nextStatus === "dispatched" ? "despacho" : "cambio";
    return { createdAt: event.createdAt, change: { id: `shipment-${event.id}`, changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt)), kind, note: detail || undefined, changes } satisfies OrderChange };
  })).filter((entry) => entry.change.changes.length > 0);
}

export async function getOrderHistory(id: string) {
  if (useMemoryStore) {
    const order = memoryOrders.find((item) => item.id === id);
    return [...(order ? shipmentHistory(order).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => entry.change) : []), ...(memoryHistory.get(id) ?? [])];
  }
  const query = new URLSearchParams({
    select: "id,changed_at,kind,note,order_change_items(field,from_value,to_value,position)",
    order_id: `eq.${id}`,
    order: "changed_at.desc",
    "order_change_items.order": "position.asc",
  });
  const [rows, order] = await Promise.all([supabaseRequest<DbChange[]>(`/rest/v1/order_changes?${query}`), getDatabaseOrder(id)]);
  const orderChanges = rows.map((row) => ({ createdAt: row.changed_at, change: {
    id: row.id,
    changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.changed_at)),
    kind: row.kind,
    note: row.note ?? undefined,
    changes: [...row.order_change_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        field: item.field,
        from: item.field === "Fecha planificada" ? formatPlannedDate(item.from_value) : item.from_value,
        to: item.field === "Fecha planificada" ? formatPlannedDate(item.to_value) : item.to_value,
      })),
  } satisfies OrderChange }));
  return [...orderChanges, ...(order ? shipmentHistory(order) : [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => entry.change);
}

export async function recordOrderUpdate(id: string, input: RecordOrderUpdateInput) {
  if (!useMemoryStore) {
    await supabaseRequest<string>("/rest/v1/rpc/record_operation_update", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_kind: input.kind,
        p_delivered_quantity: input.deliveredQuantity ?? null,
        p_delivery_address: input.deliveryAddress?.trim() || null,
        p_remittance: input.remittance?.trim() || null,
        p_dispatched_at: input.dispatchedAt ?? null,
        p_delivered_at: input.deliveredAt ?? null,
        p_note: input.note?.trim() || null,
      }),
    });
    const [order, history] = await Promise.all([getDatabaseOrder(id), getOrderHistory(id)]);
    return order ? { order, change: history[0] } : null;
  }

  const order = memoryOrders.find((item) => item.id === id);
  if (!order) return null;
  const changes: OrderChange["changes"] = [];

  if (input.kind === "entrega") {
    const quantity = input.deliveredQuantity ?? 0;
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Indique una cantidad entregada mayor a cero.");
    if (order.delivered + quantity > order.requested) throw new Error("La entrega no puede superar la cantidad del pedido.");
    const previousDelivered = order.delivered;
    const previousPending = order.pending;
    order.delivered += quantity;
    order.pending = order.requested - order.delivered;
    order.delivery = `${order.delivered} de ${order.requested} entregados`;
    order.deliveryStatus = order.pending === 0 ? "completa" : "parcial";
    order.deliveredAt = input.deliveredAt ?? new Date().toISOString();
    changes.push(
      { field: "Cantidad entregada", from: String(previousDelivered), to: String(order.delivered) },
      { field: "Saldo", from: String(previousPending), to: String(order.pending) },
    );
    if (order.pending === 0 && getOrderStage(order) !== "completado") {
      changes.push({ field: "Etapa", from: stageLabels[getOrderStage(order)], to: stageLabels.completado });
      order.stage = "completado";
    }
  }

  if (input.kind === "direccion") {
    const address = input.deliveryAddress?.trim();
    if (!address) throw new Error("Indique la dirección de entrega.");
    changes.push({ field: "Dirección de entrega", from: order.deliveryAddress ?? "—", to: address });
    order.deliveryAddress = address;
  }

  if (input.kind === "despacho") {
    const dispatchedAt = input.dispatchedAt ?? new Date().toISOString();
    changes.push({ field: "Despacho", from: order.dispatchedAt ?? "—", to: dispatchedAt });
    order.dispatchedAt = dispatchedAt;
    order.deliveryStatus = "en_transito";
    if (getOrderStage(order) === "negociacion") {
      changes.push({ field: "Etapa", from: stageLabels.negociacion, to: stageLabels.logistica });
      order.stage = "logistica";
    }
  }

  if (input.kind === "incidencia") {
    const note = input.note?.trim();
    if (!note) throw new Error("Describa la incidencia.");
    changes.push({ field: "Incidencia", from: "—", to: note });
  }

  const change: OrderChange = {
    id: `actualizacion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
    kind: input.kind,
    note: input.note?.trim() || undefined,
    changes,
  };
  memoryHistory.set(id, [change, ...(memoryHistory.get(id) ?? [])]);
  return { order, change };
}

export async function updateOrder(id: string, changes: UpdateOrderInput) {
  if (!useMemoryStore) {
    const current = await getDatabaseOrder(id);
    if (!current) return null;
    const productionSource = changes.productionSource ?? current.productionSource ?? "internal";
    const transportSource = changes.transportSource ?? current.transportSource ?? "external";
    await supabaseServerRequest<string>("/rest/v1/rpc/update_operation_order_v3", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_planned_date: changes.plannedDate ?? getOrderPlannedDate(current),
        p_requested: changes.requested ?? current.requested,
        p_stage: changes.stage ?? getOrderStage(current),
        p_production_source: productionSource,
        p_producer_provider_id: productionSource === "internal" ? null : changes.producerProviderId ?? current.producerProviderId ?? null,
        p_production_date: productionSource === "import" ? null : changes.productionDate ?? current.productionDate ?? getOrderPlannedDate(current),
        p_import_arrival_date: productionSource === "import" ? changes.importArrivalDate ?? current.importArrivalDate ?? null : null,
        p_required_operations: canonicalOperations(changes.requiredOperations ?? current.requiredOperations),
        p_transport_source: transportSource,
        p_transport_provider_id: transportSource === "internal" ? null : changes.transportProviderId ?? current.transportProviderId ?? null,
      }),
    });
    const [order, history] = await Promise.all([getDatabaseOrder(id), getOrderHistory(id)]);
    return order ? { order, change: history[0] } : null;
  }

  const order = memoryOrders.find((item) => item.id === id);
  if (!order) return null;
  if (typeof changes.requested === "number" && changes.requested < order.delivered) {
    throw new Error("La cantidad no puede ser menor que lo ya entregado.");
  }

  const recordedChanges: OrderChange["changes"] = [];
  if (typeof changes.plannedDate === "string" && changes.plannedDate && changes.plannedDate !== getOrderPlannedDate(order)) {
    const previousDate = getOrderPlannedDate(order);
    order.originalPlannedDate ??= previousDate;
    recordedChanges.push({ field: "Fecha planificada", from: formatPlannedDate(previousDate), to: formatPlannedDate(changes.plannedDate) });
    order.plannedDate = changes.plannedDate;
    order.dateLabel = formatPlannedDate(changes.plannedDate);
  }
  if (typeof changes.requested === "number" && changes.requested !== order.requested) {
    recordedChanges.push({ field: "Cantidad de pallets", from: String(order.requested), to: String(changes.requested) });
    let remainingAdjustment = changes.requested - order.requested;
    for (const line of [...order.lines].reverse()) {
      if (remainingAdjustment >= 0) {
        line.quantity += remainingAdjustment;
        break;
      }
      const reduction = Math.min(line.quantity, Math.abs(remainingAdjustment));
      line.quantity -= reduction;
      remainingAdjustment += reduction;
    }
    order.requested = changes.requested;
    order.pending = Math.max(order.requested - order.delivered, 0);
    order.delivery = `${order.delivered} de ${order.requested} entregados`;
  }
  if (typeof changes.transport === "string" && changes.transport.trim() && changes.transport.trim() !== order.transport) {
    recordedChanges.push({ field: "Transportista", from: order.transport, to: changes.transport.trim() });
    order.logistics = order.logistics.replace(order.transport, changes.transport.trim());
    order.transport = changes.transport.trim();
  }
  if (changes.stage && changes.stage !== getOrderStage(order)) {
    recordedChanges.push({ field: "Etapa", from: stageLabels[getOrderStage(order)], to: stageLabels[changes.stage] });
    order.stage = changes.stage;
  }
  const assignmentFields: Array<[keyof OperationOrder, string, unknown]> = [
    ["productionSource", "Origen de producción", changes.productionSource],
    ["producerProviderId", "Productor", changes.producerProviderId],
    ["productionDate", "Fecha de producción", changes.productionDate],
    ["importArrivalDate", "Llegada de importación", changes.importArrivalDate],
    ["requiredOperations", "Operaciones", changes.requiredOperations],
    ["transportSource", "Origen del transporte", changes.transportSource],
    ["transportProviderId", "Transportista", changes.transportProviderId],
  ];
  for (const [field, label, value] of assignmentFields) {
    if (value === undefined) continue;
    const previous = order[field];
    const normalize = (item: unknown) => Array.isArray(item) ? item.join(", ") : String(item ?? "—");
    if (normalize(previous) !== normalize(value)) {
      recordedChanges.push({ field: label, from: normalize(previous), to: normalize(value) });
      (order as unknown as Record<string, unknown>)[field] = value;
    }
  }
  if (changes.productionSource === "internal") order.producerProviderId = undefined;
  if (changes.productionSource === "import") order.productionDate = undefined;
  if (changes.productionSource && changes.productionSource !== "import") order.importArrivalDate = undefined;
  if (changes.transportSource === "internal") order.transportProviderId = undefined;
  const change = recordedChanges.length > 0 ? {
    id: `cambio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
    changes: recordedChanges,
  } satisfies OrderChange : undefined;
  if (change) memoryHistory.set(id, [change, ...(memoryHistory.get(id) ?? [])]);
  return { order, change };
}

type DbCapacityRule = { operation: CapacityOperation; people_count: number; pallet_capacity: number };
type DbInternalDefault = { operation: CapacityOperation; people_count: number; manual_capacity: number | null };
type DbInternalTeam = { available_people: number };
type DbExternalDefault = { id: string; provider_id: string; operation: CapacityOperation; pallet_capacity: number; status: ExternalProductionDefault["status"] };
type DbTransportDefault = { id: string; source: TransportSource; provider_id: string | null; pallet_capacity: number; trip_capacity: number | null; status: TransportCapacityDefault["status"] };
type DbCapacityAdjustment = { adjustment_date: string; resource_type: CapacityAdjustment["resourceType"]; operation: CapacityOperation | null; source: TransportSource | null; provider_id: string | null; pallet_adjustment: number; trip_adjustment: number; people_count: number | null; responsible: string | null; status: CapacityStatus | null };
type DbProductionResource = { id: number; name: string; resource_type: ProductionResourceType; provider_id: string | null; active: boolean; display_order: number; product_kinds?: Array<"Pallet" | "Bin" | "Piso"> | null };
const mapProductionResource = (row: DbProductionResource): ProductionResource => ({ id: row.id, name: row.name, resourceType: row.resource_type, providerId: row.provider_id ?? undefined, active: row.active, displayOrder: row.display_order, productKinds: row.product_kinds?.length ? row.product_kinds : undefined });
type DbProductionRule = { id: number; resource_id: number; product_id: string; client_product_id: number | null; people_count: number | null; configuration_label: string; normal_units_per_day: number; maximum_units_per_day: number; valid_from: string; valid_to: string | null; source: string; note: string | null; created_at: string };

function productionProducts(products: Product[]): ProductionProduct[] {
  return products.map((product) => ({ id: product.id, name: productLabel(product) }));
}

export async function getCapacity(from: string, to: string) {
  if (useMemoryStore) return buildCapacitySnapshot({ from, to, rules: memoryCapacityRules, internalDefaults: memoryInternalDefaults, availablePeople: memoryAvailablePeople, externalDefaults: memoryExternalDefaults, transportDefaults: memoryTransportDefaults, adjustments: memoryCapacityAdjustments, orders: memoryOrders, providers: memoryProviders, productionResources: memoryProductionResources, productionRules: memoryProductionRules, productionProducts: productionProducts(memoryProducts) });
  const range = `adjustment_date=gte.${from}&adjustment_date=lte.${to}`;
  const [rules, internal, team, external, transport, adjustments, orders, providers, resources, productionRules, products] = await Promise.all([
    supabaseRequest<DbCapacityRule[]>("/rest/v1/capacity_rules?select=operation,people_count,pallet_capacity&order=operation.asc,people_count.asc"),
    supabaseRequest<DbInternalDefault[]>("/rest/v1/internal_production_defaults?select=operation,people_count,manual_capacity"),
    supabaseRequest<DbInternalTeam[]>("/rest/v1/internal_team_capacity?select=available_people&id=eq.true"),
    supabaseRequest<DbExternalDefault[]>("/rest/v1/external_production_defaults?select=id,provider_id,operation,pallet_capacity,status"),
    supabaseRequest<DbTransportDefault[]>("/rest/v1/transport_capacity_defaults?select=id,source,provider_id,pallet_capacity,trip_capacity,status"),
    supabaseRequest<DbCapacityAdjustment[]>(`/rest/v1/capacity_daily_adjustments?select=adjustment_date,resource_type,operation,source,provider_id,pallet_adjustment,trip_adjustment,people_count,responsible,status&${range}`),
    getOrders(), getProviders({ includeRetired: true }),
    supabaseRequest<DbProductionResource[]>("/rest/v1/production_resources?select=*&order=display_order.asc,id.asc"),
    supabaseRequest<DbProductionRule[]>("/rest/v1/production_capacity_rules?select=*&order=valid_from.desc,id.desc"),
    getProducts(),
  ]);
  const productOptions = productionProducts(products);
  const productNames = new Map(productOptions.map((product) => [product.id, product.name]));
  return buildCapacitySnapshot({
    from, to, orders, providers,
    rules: rules.map((item) => ({ operation: item.operation, peopleCount: item.people_count, palletCapacity: item.pallet_capacity })),
    internalDefaults: internal.map((item) => ({ operation: item.operation, peopleCount: item.people_count, manualCapacity: item.manual_capacity ?? undefined })),
    availablePeople: team[0]?.available_people,
    externalDefaults: external.map((item) => ({ id: item.id, providerId: item.provider_id, operation: item.operation, palletCapacity: item.pallet_capacity, status: item.status })),
    transportDefaults: transport.map((item) => ({ id: item.id, source: item.source, providerId: item.provider_id ?? undefined, palletCapacity: item.pallet_capacity, tripCapacity: item.trip_capacity ?? undefined, status: item.status })),
    adjustments: adjustments.map((item) => ({ date: item.adjustment_date, resourceType: item.resource_type, operation: item.operation ?? undefined, source: item.source ?? undefined, providerId: item.provider_id ?? undefined, palletAdjustment: item.pallet_adjustment, tripAdjustment: item.trip_adjustment, peopleCount: item.people_count ?? undefined, responsible: item.responsible ?? undefined, status: item.status ?? undefined })),
    productionResources: resources.map(mapProductionResource),
    productionRules: productionRules.map((item) => ({ id: item.id, resourceId: item.resource_id, productId: item.product_id, clientProductId: item.client_product_id ?? undefined, productName: productNames.get(item.product_id) ?? item.product_id, peopleCount: item.people_count ?? undefined, configurationLabel: item.configuration_label, normalUnitsPerDay: item.normal_units_per_day, maximumUnitsPerDay: item.maximum_units_per_day, validFrom: item.valid_from, validTo: item.valid_to ?? undefined, source: item.source, note: item.note ?? undefined, createdAt: item.created_at })),
    productionProducts: productOptions,
  });
}

function upsertMemory<T>(items: T[], predicate: (item: T) => boolean, value: T) {
  const index = items.findIndex(predicate);
  if (index === -1) items.push(value); else items[index] = value;
}

export async function saveCapacityRule(value: CapacityRule) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_capacity_rule", { method: "POST", body: JSON.stringify({ p_operation: value.operation, p_people_count: value.peopleCount, p_pallet_capacity: value.palletCapacity }) });
  else upsertMemory(memoryCapacityRules, (item) => item.operation === value.operation && item.peopleCount === value.peopleCount, value);
  return value;
}

export async function deleteCapacityRule(operation: CapacityOperation, peopleCount: number) {
  if (!useMemoryStore) return supabaseRequest<boolean>("/rest/v1/rpc/delete_capacity_rule", { method: "POST", body: JSON.stringify({ p_operation: operation, p_people_count: peopleCount }) });
  const index = memoryCapacityRules.findIndex((item) => item.operation === operation && item.peopleCount === peopleCount);
  if (index === -1) return false;
  memoryCapacityRules.splice(index, 1);
  return true;
}

export async function saveInternalProduction(value: InternalProductionDefault) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_internal_production_default", { method: "POST", body: JSON.stringify({ p_operation: value.operation, p_people_count: value.peopleCount, p_manual_capacity: value.manualCapacity ?? null }) });
  else upsertMemory(memoryInternalDefaults, (item) => item.operation === value.operation, value);
  return value;
}

export async function saveInternalTeamCapacity(availablePeople: number): Promise<InternalTeamCapacity> {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_internal_team_capacity", { method: "POST", body: JSON.stringify({ p_available_people: availablePeople }) });
  else memoryAvailablePeople = availablePeople;
  return { availablePeople };
}

export async function saveExternalProduction(value: ExternalProductionDefault) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_external_production_default", { method: "POST", body: JSON.stringify({ p_provider_id: value.providerId, p_operation: value.operation, p_pallet_capacity: value.palletCapacity, p_status: value.status }) });
  else upsertMemory(memoryExternalDefaults, (item) => item.providerId === value.providerId && item.operation === value.operation, { ...value, id: value.id ?? `external-${Date.now()}` });
  return value;
}

export async function saveTransportCapacity(value: TransportCapacityDefault) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_transport_capacity_default", { method: "POST", body: JSON.stringify({ p_source: value.source, p_provider_id: value.providerId ?? null, p_pallet_capacity: value.palletCapacity, p_status: value.status }) });
  else upsertMemory(memoryTransportDefaults, (item) => item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""), { ...value, id: value.id ?? `transport-${Date.now()}` });
  return value;
}

export async function saveTransportTripCapacity(value: Omit<TransportCapacityDefault, "palletCapacity"> & { tripCapacity: number }) {
  if (!useMemoryStore) await supabaseServerRequest("/rest/v1/rpc/upsert_transport_trip_capacity_v1", { method: "POST", body: JSON.stringify({ p_source: value.source, p_provider_id: value.providerId ?? null, p_trip_capacity: value.tripCapacity, p_status: value.status }) });
  else {
    const current = memoryTransportDefaults.find((item) => item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""));
    upsertMemory(memoryTransportDefaults, (item) => item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""), { ...current, ...value, palletCapacity: current?.palletCapacity ?? 0, id: value.id ?? current?.id ?? `transport-${Date.now()}` });
  }
  return value;
}

export async function saveTransportTripAdjustment(value: { date: string; source: TransportSource; providerId?: string; tripAdjustment: number; responsible?: string; status: CapacityStatus }) {
  if (!useMemoryStore) await supabaseServerRequest("/rest/v1/rpc/upsert_transport_trip_adjustment_v1", { method: "POST", body: JSON.stringify({ p_date: value.date, p_source: value.source, p_provider_id: value.providerId ?? null, p_trip_adjustment: value.tripAdjustment, p_responsible: value.responsible?.trim() || null, p_status: value.status }) });
  else {
    const current = memoryCapacityAdjustments.find((item) => item.date === value.date && item.resourceType === "transport" && item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""));
    upsertMemory(memoryCapacityAdjustments, (item) => item.date === value.date && item.resourceType === "transport" && item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""), { ...current, ...value, resourceType: "transport", palletAdjustment: current?.palletAdjustment ?? 0 });
  }
  return value;
}

export async function saveCapacityAdjustment(value: CapacityAdjustment) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_capacity_daily_adjustment", { method: "POST", body: JSON.stringify({ p_date: value.date, p_resource_type: value.resourceType, p_operation: value.operation ?? null, p_source: value.source ?? null, p_provider_id: value.providerId ?? null, p_pallet_adjustment: value.palletAdjustment, p_people_count: value.peopleCount ?? null, p_responsible: value.responsible?.trim() || null, p_status: value.status ?? null }) });
  else upsertMemory(memoryCapacityAdjustments, (item) => item.date === value.date && item.resourceType === value.resourceType && (item.operation ?? "") === (value.operation ?? "") && (item.source ?? "") === (value.source ?? "") && (item.providerId ?? "") === (value.providerId ?? ""), value);
  return value;
}

export type ProductionResourceInput = { name: string; resourceType: ProductionResourceType; providerId?: string; active?: boolean; displayOrder?: number };
export type ProductionRuleInput = Omit<ProductionCapacityRule, "id" | "productName" | "createdAt">;

function productionRuleFromRow(row: DbProductionRule, product?: Product): ProductionCapacityRule {
  return {
    id: row.id,
    resourceId: row.resource_id,
    productId: row.product_id,
    clientProductId: row.client_product_id ?? undefined,
    productName: product ? productLabel(product) : row.product_id,
    peopleCount: row.people_count ?? undefined,
    configurationLabel: row.configuration_label,
    normalUnitsPerDay: row.normal_units_per_day,
    maximumUnitsPerDay: row.maximum_units_per_day,
    validFrom: row.valid_from,
    validTo: row.valid_to ?? undefined,
    source: row.source,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createProductionResource(input: ProductionResourceInput) {
  const value = { name: input.name.trim(), resourceType: input.resourceType, providerId: input.providerId?.trim() || undefined, active: input.active ?? true, displayOrder: input.displayOrder ?? 100 };
  if (useMemoryStore) {
    if (memoryProductionResources.some((item) => item.active && item.name.toLocaleLowerCase("es") === value.name.toLocaleLowerCase("es"))) throw new Error("Ya existe un recurso activo con ese nombre.");
    const resource: ProductionResource = { id: `resource-${memoryProductionId++}`, ...value };
    memoryProductionResources.push(resource);
    return resource;
  }
  const rows = await supabaseServerRequest<DbProductionResource[]>("/rest/v1/production_resources?select=*", { method: "POST", prefer: "return=representation", body: JSON.stringify({ name: value.name, resource_type: value.resourceType, provider_id: value.providerId ?? null, active: value.active, display_order: value.displayOrder }) });
  const row = rows[0];
  return mapProductionResource(row);
}

export async function updateProductionResource(id: number | string, changes: { name?: string; active?: boolean; displayOrder?: number; productKinds?: Array<"Pallet" | "Bin" | "Piso"> | null }) {
  if (useMemoryStore) {
    const resource = memoryProductionResources.find((item) => String(item.id) === String(id));
    if (!resource) return null;
    if (changes.name !== undefined) resource.name = changes.name.trim();
    if (changes.active !== undefined) resource.active = changes.active;
    if (changes.displayOrder !== undefined) resource.displayOrder = changes.displayOrder;
    if (changes.productKinds !== undefined) resource.productKinds = changes.productKinds?.length ? changes.productKinds : undefined;
    return resource;
  }
  const body: Record<string, unknown> = {};
  if (changes.name !== undefined) body.name = changes.name.trim();
  if (changes.active !== undefined) body.active = changes.active;
  if (changes.displayOrder !== undefined) body.display_order = changes.displayOrder;
  if (changes.productKinds !== undefined) body.product_kinds = changes.productKinds?.length ? changes.productKinds : null;
  const rows = await supabaseServerRequest<DbProductionResource[]>(`/rest/v1/production_resources?id=eq.${encodeURIComponent(String(id))}&select=*`, { method: "PATCH", prefer: "return=representation", body: JSON.stringify(body) });
  const row = rows[0];
  return row ? mapProductionResource(row) : null;
}

export async function createProductionRule(input: ProductionRuleInput) {
  const value = { ...input, configurationLabel: input.configurationLabel.trim(), source: input.source.trim(), note: input.note?.trim() || undefined };
  if (value.clientProductId !== undefined) { const link = await getClientProduct(value.clientProductId); if (!link || link.productId !== value.productId) throw new Error("El producto no pertenece al cliente seleccionado."); }
  if (useMemoryStore) {
    const overlaps = memoryProductionRules.some((item) => String(item.resourceId) === String(value.resourceId) && String(item.clientProductId ?? "") === String(value.clientProductId ?? "") && item.productId === value.productId && (item.peopleCount ?? 0) === (value.peopleCount ?? 0) && item.validFrom <= (value.validTo ?? "9999-12-31") && value.validFrom <= (item.validTo ?? "9999-12-31"));
    if (overlaps) throw new Error("Ya existe una regla vigente para ese recurso, producto y configuración.");
    const product = memoryProducts.find((item) => item.id === value.productId);
    const rule: ProductionCapacityRule = { id: `rule-${memoryProductionId++}`, ...value, productName: product ? productLabel(product) : value.productId, createdAt: new Date().toISOString() };
    memoryProductionRules.push(rule);
    return rule;
  }
  const rows = await supabaseServerRequest<DbProductionRule[]>("/rest/v1/production_capacity_rules?select=*", { method: "POST", prefer: "return=representation", body: JSON.stringify({ resource_id: value.resourceId, product_id: value.productId, client_product_id: value.clientProductId ?? null, people_count: value.peopleCount ?? null, configuration_label: value.configurationLabel, normal_units_per_day: value.normalUnitsPerDay, maximum_units_per_day: value.maximumUnitsPerDay, valid_from: value.validFrom, valid_to: value.validTo ?? null, source: value.source, note: value.note ?? null }) });
  const row = rows[0];
  const product = (await getProducts()).find((item) => item.id === row.product_id);
  return productionRuleFromRow(row, product);
}

export async function updateProductionRule(id: number | string, input: ProductionRuleInput) {
  const value = { ...input, configurationLabel: input.configurationLabel.trim(), source: input.source.trim(), note: input.note?.trim() || undefined };
  if (value.clientProductId !== undefined) { const link = await getClientProduct(value.clientProductId); if (!link || link.productId !== value.productId) throw new Error("El producto no pertenece al cliente seleccionado."); }
  if (useMemoryStore) {
    const rule = memoryProductionRules.find((item) => String(item.id) === String(id));
    if (!rule) return null;
    const overlaps = memoryProductionRules.some((item) => String(item.id) !== String(id) && String(item.resourceId) === String(value.resourceId) && String(item.clientProductId ?? "") === String(value.clientProductId ?? "") && item.productId === value.productId && (item.peopleCount ?? 0) === (value.peopleCount ?? 0) && item.validFrom <= (value.validTo ?? "9999-12-31") && value.validFrom <= (item.validTo ?? "9999-12-31"));
    if (overlaps) throw new Error("Ya existe una regla vigente para ese recurso, producto y configuración.");
    const product = memoryProducts.find((item) => item.id === value.productId);
    Object.assign(rule, value, { productName: product ? productLabel(product) : value.productId });
    return rule;
  }
  const rows = await supabaseServerRequest<DbProductionRule[]>(`/rest/v1/production_capacity_rules?id=eq.${encodeURIComponent(String(id))}&select=*`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ resource_id: value.resourceId, product_id: value.productId, client_product_id: value.clientProductId ?? null, people_count: value.peopleCount ?? null, configuration_label: value.configurationLabel, normal_units_per_day: value.normalUnitsPerDay, maximum_units_per_day: value.maximumUnitsPerDay, valid_from: value.validFrom, valid_to: value.validTo ?? null, source: value.source, note: value.note ?? null }),
  });
  const row = rows[0];
  if (!row) return null;
  const product = (await getProducts()).find((item) => item.id === row.product_id);
  return productionRuleFromRow(row, product);
}

export async function deleteProductionRule(id: number | string) {
  if (useMemoryStore) {
    const referenced = memoryOrders.some((order) => order.lines.some((line) => (line.productionAllocations ?? []).some((allocation) => String(allocation.capacityRuleId) === String(id))));
    if (referenced) throw new Error("No se puede eliminar la regla porque está siendo utilizada por una asignación de producción.");
    const index = memoryProductionRules.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return false;
    memoryProductionRules.splice(index, 1);
    return true;
  }
  try {
    const rows = await supabaseServerRequest<Array<{ id: number | string }>>(`/rest/v1/production_capacity_rules?id=eq.${encodeURIComponent(String(id))}&select=id`, { method: "DELETE", prefer: "return=representation" });
    return rows.length > 0;
  } catch (error) {
    if ((error as Error & { code?: string }).code === "23503") throw new Error("No se puede eliminar la regla porque está siendo utilizada por una asignación de producción.");
    throw error;
  }
}

function findMemoryAllocation(id: number | string) {
  for (const order of memoryOrders) for (const line of order.lines) {
    const allocation = (line.productionAllocations ?? []).find((item) => String(item.id) === String(id));
    if (allocation) return { order, line, allocation };
  }
  return null;
}

export async function moveProductionAllocation(id: number | string, plannedDate: string) {
  const parsed = new Date(`${plannedDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== plannedDate) throw new Error("Seleccione una fecha válida.");
  if (useMemoryStore) {
    const found = findMemoryAllocation(id);
    if (!found) return null;
    if (found.allocation.status !== "draft" && found.allocation.status !== "confirmed") throw new Error("Solo se pueden mover asignaciones pendientes de producir.");
    if (found.allocation.plannedDate === plannedDate) return found.order.id;
    const previousDate = found.allocation.plannedDate;
    found.allocation.plannedDate = plannedDate;
    found.allocation.status = "draft";
    found.allocation.capacityRuleId = undefined;
    found.allocation.updatedAt = new Date().toISOString();
    const dates = found.order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled").map((item) => item.plannedDate)).sort();
    found.order.productionDefined = dates.length > 0;
    found.order.productionDate = dates[0];
    found.order.productionEndDate = dates.at(-1);
    found.order.supply = dates.length ? "Producción planificada" : "Producción sin planificar";
    memoryHistory.set(found.order.id, [{ id: `produccion-${crypto.randomUUID()}`, changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date()), kind: "cambio", note: `${found.line.product}: fecha de producción actualizada`, changes: [{ field: "Fecha de producción", from: formatPlannedDate(previousDate), to: formatPlannedDate(plannedDate) }] }, ...(memoryHistory.get(found.order.id) ?? [])]);
    return found.order.id;
  }
  const rows = await supabaseServerRequest<DbAllocation[]>(`/rest/v1/production_allocations?id=eq.${encodeURIComponent(String(id))}&select=*`);
  const allocation = rows[0];
  if (!allocation) return null;
  if (allocation.status !== "draft" && allocation.status !== "confirmed") throw new Error("Solo se pueden mover asignaciones pendientes de producir.");
  const order = (await getOrders()).find((item) => item.lines.some((line) => line.id === allocation.order_line_id));
  if (!order) return null;
  if (allocation.planned_date !== plannedDate) {
    const updated = await supabaseServerRequest<DbAllocation[]>(`/rest/v1/production_allocations?id=eq.${encodeURIComponent(String(id))}&status=in.(draft,confirmed)&select=id`, { method: "PATCH", prefer: "return=representation", body: JSON.stringify({ planned_date: plannedDate, status: "draft", capacity_rule_id: null }) });
    if (!updated.length) throw new Error("La asignación cambió mientras se movía. Actualice el calendario.");
    const dates = order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled").map((item) => String(item.id) === String(id) ? plannedDate : item.plannedDate)).sort();
    try {
      await supabaseServerRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, { method: "PATCH", body: JSON.stringify({ production_defined: dates.length > 0, production_date: dates[0] ?? null, production_end_date: dates.at(-1) ?? null, supply: dates.length ? "Producción planificada" : "Producción sin planificar", updated_at: new Date().toISOString() }) });
    } catch (error) {
      await supabaseServerRequest(`/rest/v1/production_allocations?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", body: JSON.stringify({ planned_date: allocation.planned_date, status: allocation.status, capacity_rule_id: allocation.capacity_rule_id }) });
      throw error;
    }
  }
  return order.id;
}

export async function confirmProductionAllocation(id: number | string, resourceId: number | string, capacityRuleId: number | string, overloadNote?: string) {
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/confirm_production_allocation_v1", { method: "POST", body: JSON.stringify({ p_allocation_id: id, p_resource_id: resourceId, p_capacity_rule_id: capacityRuleId, p_overload_note: overloadNote?.trim() || null }) });
    return true;
  }
  const found = findMemoryAllocation(id);
  if (!found || found.allocation.status !== "draft") throw new Error("Solo se confirman asignaciones en borrador.");
  const rule = memoryProductionRules.find((item) => String(item.id) === String(capacityRuleId));
  if (!rule || String(rule.resourceId) !== String(resourceId) || rule.productId !== found.line.productId || String(rule.clientProductId) !== String(found.line.clientProductId) || rule.validFrom > found.allocation.plannedDate || rule.validTo && rule.validTo < found.allocation.plannedDate) throw new Error("Seleccione una regla vigente para el recurso y producto del cliente.");
  const previousResource = found.allocation.productionResourceId;
  const previousRule = found.allocation.capacityRuleId;
  found.allocation.productionResourceId = resourceId;
  found.allocation.capacityRuleId = capacityRuleId;
  const snapshot = await getCapacity(found.allocation.plannedDate, found.allocation.plannedDate);
  const resource = snapshot.production.days[0].resources.find((item) => String(item.resource.id) === String(resourceId));
  if (!resource || resource.status === "missing_rule" || resource.status === "overloaded") {
    found.allocation.productionResourceId = previousResource;
    found.allocation.capacityRuleId = previousRule;
    throw new Error(resource?.status === "overloaded" ? "La asignación supera la capacidad máxima del recurso." : "No se pudo calcular la capacidad de la asignación.");
  }
  if (resource.status === "stretched" && !overloadNote?.trim()) {
    found.allocation.productionResourceId = previousResource;
    found.allocation.capacityRuleId = previousRule;
    throw new Error("Indique una nota para confirmar por encima de la capacidad normal.");
  }
  const selectedResource = memoryProductionResources.find((item) => String(item.id) === String(resourceId));
  found.allocation.resourceId = selectedResource?.providerId ?? (selectedResource?.resourceType === "internal_factory" ? "internal" : String(resourceId));
  found.allocation.status = "confirmed";
  found.allocation.note = overloadNote?.trim() || found.allocation.note;
  found.allocation.updatedAt = new Date().toISOString();
  return true;
}

export async function completeProductionAllocation(id: number | string, actualQuantity: number, completionNote?: string) {
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/complete_production_allocation_v1", { method: "POST", body: JSON.stringify({ p_allocation_id: id, p_actual_quantity: actualQuantity, p_completion_note: completionNote?.trim() || null }) });
    return true;
  }
  const found = findMemoryAllocation(id);
  if (!found || found.allocation.status !== "confirmed") throw new Error("Solo se completan asignaciones confirmadas.");
  if (!Number.isInteger(actualQuantity) || actualQuantity < 0 || actualQuantity > found.allocation.plannedQuantity) throw new Error("La cantidad real debe estar entre cero y la cantidad planificada.");
  if (actualQuantity !== found.allocation.plannedQuantity && !completionNote?.trim()) throw new Error("Explique la diferencia entre lo planificado y lo producido.");
  const product = memoryProducts.find((item) => item.id === found.line.productId);
  if (!product) throw new Error("La línea no está vinculada a un producto del maestro.");
  if (actualQuantity > 0) {
    const now = new Date().toISOString();
    memoryStockMovements.push({
      id: `movement-${memoryTreatmentId++}`,
      productId: product.id,
      stockState: product.requiresTreatment ? "pending_treatment" : "ready",
      quantity: actualQuantity,
      movementType: "production_receipt",
      productionAllocationId: id,
      transformationId: crypto.randomUUID(),
      performedAt: now,
      responsible: "Producción",
      note: completionNote?.trim() || "Producción completada",
      createdAt: now,
    });
  }
  found.allocation.actualQuantity = actualQuantity;
  found.allocation.completedAt = new Date().toISOString();
  found.allocation.completionNote = completionNote?.trim() || undefined;
  found.allocation.status = "completed";
  found.allocation.updatedAt = found.allocation.completedAt;
  return true;
}

export async function recordProductionResult(id: number | string, actualQuantity: number, actualDate: string, destination?: "client" | "stock", note?: string) {
  const parsedDate = new Date(`${actualDate}T12:00:00Z`);
  if (!Number.isInteger(actualQuantity) || actualQuantity < 0) throw new Error("Indique una cantidad real válida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actualDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== actualDate) throw new Error("Indique una fecha real válida.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (actualDate > today) throw new Error("La fecha real no puede ser futura.");
  if (actualQuantity > 0 && destination !== "client" && destination !== "stock") throw new Error("Indique si la producción va al cliente o a stock.");
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/record_production_result_v1", { method: "POST", body: JSON.stringify({ p_allocation_id: id, p_actual_quantity: actualQuantity, p_actual_date: actualDate, p_destination: actualQuantity ? destination : null, p_note: note?.trim() || null }) });
    return true;
  }
  const found = findMemoryAllocation(id);
  if (!found || (found.allocation.status !== "draft" && found.allocation.status !== "confirmed")) throw new Error("Esta asignación ya tiene un resultado o fue cancelada.");
  if (!found.allocation.productionResourceId) throw new Error("Indique quién realizó la producción.");
  const product = memoryProducts.find((item) => item.id === found.line.productId);
  if (!product) throw new Error("La línea no está vinculada a un producto del maestro.");
  const now = new Date().toISOString();
  if (actualQuantity > 0) memoryStockMovements.push({
    id: `movement-${memoryTreatmentId++}`, productId: product.id,
    stockState: product.requiresTreatment ? "pending_treatment" : "ready",
    quantity: actualQuantity, movementType: "production_receipt", productionAllocationId: id,
    orderLineId: destination === "client" ? found.line.id : undefined,
    clientId: destination === "client" ? found.order.clientId : undefined,
    transformationId: crypto.randomUUID(), performedAt: new Date(`${actualDate}T12:00:00-03:00`).toISOString(),
    responsible: "Producción", note: note?.trim() || "Producción registrada", createdAt: now,
  });
  found.allocation.actualQuantity = actualQuantity;
  found.allocation.actualDate = actualDate;
  found.allocation.resultDestination = actualQuantity ? destination : undefined;
  found.allocation.completedAt = now;
  found.allocation.completionNote = note?.trim() || undefined;
  found.allocation.status = "completed";
  found.allocation.updatedAt = now;
  return true;
}

type DbStockMovementRow = {
  id: number; product_id: string; stock_state: StockMovement["stockState"]; quantity: number;
  movement_type: StockMovement["movementType"]; treatment_batch_id: number | null;
  production_allocation_id: number | null; transformation_id: string; performed_at: string;
  responsible: string; note: string | null; correction_of_movement_id: number | null; created_at: string;
  order_line_id: string | null; shipment_line_id: number | null; client_id: string | null; provider_id: string | null;
  remittance: string | null; source_reference: string | null;
};
type DbTreatmentCheckRow = { id: number; batch_id: number; control_id: number; control_title_snapshot: string; result: TreatmentControlCheck["result"]; note: string | null };
type DbTreatmentBatchRow = {
  id: number; product_id: string; client_product_id: number | null; order_line_id: string | null;
  quantity: number; performed_at: string; responsible: string; status: TreatmentBatchStatus;
  note: string | null; reversal_of_batch_id: number | null; created_at: string;
  treatment_control_checks: DbTreatmentCheckRow[]; stock_movements: DbStockMovementRow[];
};

function mapStockMovement(row: DbStockMovementRow): StockMovement {
  return {
    id: row.id, productId: row.product_id, stockState: row.stock_state, quantity: row.quantity,
    movementType: row.movement_type, treatmentBatchId: row.treatment_batch_id ?? undefined,
    productionAllocationId: row.production_allocation_id ?? undefined, transformationId: row.transformation_id,
    performedAt: row.performed_at, responsible: row.responsible, note: row.note ?? undefined,
    orderLineId: row.order_line_id ?? undefined, shipmentLineId: row.shipment_line_id ?? undefined,
    clientId: row.client_id ?? undefined, providerId: row.provider_id ?? undefined,
    remittance: row.remittance ?? undefined, sourceReference: row.source_reference ?? undefined,
    correctionOfMovementId: row.correction_of_movement_id ?? undefined, createdAt: row.created_at,
  };
}

async function loadDatabaseTreatmentBatches(filters: string) {
  const [rows, products, clients, clientProducts, lines, orders] = await Promise.all([
    supabaseRequest<DbTreatmentBatchRow[]>(`/rest/v1/treatment_batches?select=*,treatment_control_checks(*),stock_movements(*)&${filters}&order=performed_at.desc,id.desc&treatment_control_checks.order=id.asc&stock_movements.order=id.asc`),
    getProducts(),
    getClients(),
    supabaseRequest<Array<{ id: number; client_id: string }>>("/rest/v1/client_products?select=id,client_id"),
    supabaseRequest<Array<{ id: string; order_id: string }>>("/rest/v1/order_lines?select=id,order_id"),
    supabaseRequest<Array<{ id: string; reference: string }>>("/rest/v1/orders?select=id,reference"),
  ]);
  const productMap = new Map(products.map((product) => [product.id, productTreatmentLabel(product)]));
  const clientMap = new Map(clients.map((client) => [client.id, client.name]));
  const clientProductMap = new Map(clientProducts.map((item) => [String(item.id), item.client_id]));
  const lineMap = new Map(lines.map((line) => [line.id, line.order_id]));
  const orderMap = new Map(orders.map((order) => [order.id, order.reference]));
  const postedIds = rows.filter((row) => row.status === "posted").map((row) => row.id);
  const reversals = postedIds.length
    ? await supabaseRequest<Array<{ id: number; reversal_of_batch_id: number }>>(`/rest/v1/treatment_batches?select=id,reversal_of_batch_id&reversal_of_batch_id=in.(${postedIds.join(",")})`)
    : [];
  const reversedBy = new Map(reversals.map((row) => [String(row.reversal_of_batch_id), row.id]));
  return rows.map<TreatmentBatch>((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: productMap.get(row.product_id) ?? row.product_id,
    clientProductId: row.client_product_id ?? undefined,
    clientName: row.client_product_id === null ? undefined : clientMap.get(clientProductMap.get(String(row.client_product_id)) ?? ""),
    orderLineId: row.order_line_id ?? undefined,
    orderReference: row.order_line_id === null ? undefined : orderMap.get(lineMap.get(row.order_line_id) ?? ""),
    quantity: row.quantity,
    performedAt: row.performed_at,
    responsible: row.responsible,
    status: row.status,
    note: row.note ?? undefined,
    reversalOfBatchId: row.reversal_of_batch_id ?? undefined,
    reversedByBatchId: reversedBy.get(String(row.id)),
    createdAt: row.created_at,
    checks: (row.treatment_control_checks ?? []).map((check) => ({ id: check.id, batchId: check.batch_id, controlId: check.control_id, title: check.control_title_snapshot, result: check.result, note: check.note ?? undefined })),
    movements: (row.stock_movements ?? []).map(mapStockMovement),
  }));
}

export async function getStockMovements() {
  if (useMemoryStore) return memoryStockMovements;
  const rows: DbStockMovementRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest<DbStockMovementRow[]>(`/rest/v1/stock_movements?select=*&order=performed_at.asc,id.asc&limit=${pageSize}&offset=${offset}`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map(mapStockMovement);
}

export async function getLogisticsTreatmentProgress() {
  if (useMemoryStore) return memoryTreatmentBatches.map((batch) => ({ orderLineId: batch.orderLineId, quantity: batch.quantity, status: batch.status }));
  const rows = await supabaseServerRequest<Array<{ order_line_id: string | null; quantity: number; status: TreatmentBatchStatus }>>(
    "/rest/v1/treatment_batches?select=order_line_id,quantity,status&order_line_id=not.is.null",
  );
  return rows.map((row) => ({ orderLineId: row.order_line_id ?? undefined, quantity: row.quantity, status: row.status }));
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function treatmentDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function getTreatmentBatchesBetween(from: string, until: string) {
  if (useMemoryStore) return Promise.resolve(memoryTreatmentBatches.filter((batch) => treatmentDateKey(batch.performedAt) >= from && treatmentDateKey(batch.performedAt) < until));
  return loadDatabaseTreatmentBatches(`performed_at=gte.${encodeURIComponent(`${from}T00:00:00-03:00`)}&performed_at=lt.${encodeURIComponent(`${until}T00:00:00-03:00`)}`);
}

export async function getTreatmentDashboard(date: string): Promise<TreatmentDashboard> {
  const batches = await getTreatmentBatchesBetween(date, addDays(date, 1));
  const balances = calculateStockBalances(await getStockMovements());
  const dayBatches = batches.filter((batch) => treatmentDateKey(batch.performedAt) === date);
  const summary = summarizeTreatmentDay(date, dayBatches.map((batch) => ({ ...batch, performedAt: `${date}T12:00:00Z` })), balances);
  return { date, summary, batches: dayBatches.sort((a, b) => b.performedAt.localeCompare(a.performedAt)) };
}

const treatmentNotPerformedPrefix = "HT no realizado · ";

async function getTreatmentNotPerformed(from: string, until: string): Promise<TreatmentNotPerformed[]> {
  const rows = useMemoryStore
    ? [...memoryHistory.entries()].flatMap(([order_id, history]) => history.filter((change) => change.kind === "incidencia").map(({ note }) => ({ order_id, note })))
    : await supabaseRequest<Array<{ order_id: string; note: string }>>(`/rest/v1/order_changes?${new URLSearchParams([
      ["select", "order_id,note"], ["kind", "eq.incidencia"], ["note", `gte.${treatmentNotPerformedPrefix}${from}`],
      ["note", `lt.${treatmentNotPerformedPrefix}${until}`], ["order", "changed_at.desc,id.desc"],
    ])}`);
  const results = new Map<string, TreatmentNotPerformed>();
  for (const { order_id: orderId, note: event } of rows) {
    if (!event?.startsWith(treatmentNotPerformedPrefix)) continue;
    const [key, responsibleLine, ...details] = event.slice(treatmentNotPerformedPrefix.length).split("\n");
    const [date, orderLineId] = key.split(" · ");
    const responsible = responsibleLine?.replace(/^Responsable: /, "");
    if (!orderLineId || !responsible || date < from || date >= until || results.has(key)) continue;
    results.set(key, { orderId, orderLineId, date, responsible, note: details.join("\n") || undefined });
  }
  return [...results.values()];
}

export async function getTreatmentWeek(from: string, to: string): Promise<TreatmentWeek> {
  const until = addDays(to, 1);
  const [batches, notPerformed] = await Promise.all([getTreatmentBatchesBetween(from, until), getTreatmentNotPerformed(from, until)]);
  return { batches, notPerformed };
}

export async function recordTreatmentNotPerformed(input: TreatmentNotPerformed) {
  const order = await getOrderDetail(input.orderId);
  const line = order?.lines.find((item) => item.id === input.orderLineId);
  if (!order?.dryingStartDate || !line || isOrderClosed(order) || input.date < order.dryingStartDate || input.date > (order.dryingEndDate ?? order.dryingStartDate)) {
    throw new Error("El lote ya no está programado para esa fecha.");
  }
  if (!line.treatment && !(await getProducts()).some((product) => product.id === line.productId && product.requiresTreatment)) throw new Error("El producto no requiere HT.");
  const existing = await getTreatmentNotPerformed(input.date, addDays(input.date, 1));
  if (existing.some((result) => result.orderLineId === input.orderLineId)) return;
  // A missed operation is an incident on the order, with no treatment batch or stock movement.
  const note = [`${treatmentNotPerformedPrefix}${input.date} · ${input.orderLineId}`, `Responsable: ${input.responsible}`, input.note].filter(Boolean).join("\n");
  await recordOrderUpdate(input.orderId, { kind: "incidencia", note });
}

export async function getTreatmentOptions(): Promise<TreatmentProductOption[]> {
  const [products, movements, clients, orders] = await Promise.all([getProducts(), getStockMovements(), getClients(), getOrders()]);
  // Se incluyen también los vínculos inactivos: un pedido abierto puede seguir apuntando a uno.
  const relations = useMemoryStore
    ? memoryClientProducts
    : (await supabaseRequest<DbClientProductRow[]>(`/rest/v1/client_products?select=${masterSelect}&order=display_order.asc,id.asc`)).map(mapClientProduct);
  const balances = calculateStockBalances(movements);
  const clientMap = new Map(clients.map((client) => [client.id, client.name]));
  const relationDestinations = await Promise.all(relations.map(async (relation) => {
    const primary = relation.assets.find((asset) => asset.active && asset.isPrimary);
    const url = primary ? await getClientProductAssetUrl(primary.id) : null;
    const base = {
      clientProductId: relation.id,
      clientName: clientMap.get(relation.clientId) ?? relation.clientId,
      controls: relation.controls.filter((control) => control.active).map((control) => ({ id: control.id, title: control.title, detail: control.detail })),
      primaryAsset: primary && url ? { id: primary.id, url, mimeType: primary.mimeType, altText: primary.altText } : undefined,
    };
    const destinations: TreatmentDestination[] = relation.active ? [{ key: `client:${relation.id}`, label: base.clientName, ...base }] : [];
    for (const order of orders.filter((item) => !isOrderClosed(item))) for (const line of order.lines.filter((item) => String(item.clientProductId) === String(relation.id))) {
      destinations.push({ key: `order:${line.id}`, label: `${base.clientName} · ${order.reference}`, ...base, orderLineId: line.id, orderReference: order.reference });
    }
    return { productId: relation.productId, destinations };
  }));
  return products.filter((product) => product.requiresTreatment).map((product) => {
    const balance = balances.get(product.id) ?? { pending: 0, ready: 0 };
    return {
      product,
      label: productTreatmentLabel(product),
      pending: balance.pending,
      ready: balance.ready,
      destinations: [{ key: "general", label: "Stock general", controls: [] }, ...relationDestinations.filter((entry) => entry.productId === product.id).flatMap((entry) => entry.destinations)],
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function refreshMemoryTreatmentProgress(orderLineId?: string) {
  if (!orderLineId) return;
  const order = memoryOrders.find((item) => item.lines.some((line) => line.id === orderLineId));
  const line = order?.lines.find((item) => item.id === orderLineId);
  if (!line) return;
  const treated = memoryTreatmentBatches.filter((batch) => batch.orderLineId === orderLineId).reduce((sum, batch) => sum + (batch.status === "posted" ? batch.quantity : batch.status === "reversal" ? -batch.quantity : 0), 0);
  line.treatedQuantity = Math.max(treated, 0);
  line.treatmentPendingQuantity = Math.max(line.quantity - line.treatedQuantity, 0);
}

export async function recordTreatmentBatch(input: CreateTreatmentBatchInput): Promise<TreatmentRecordResult> {
  if (!useMemoryStore) {
    return supabaseServerRequest<TreatmentRecordResult>("/rest/v1/rpc/record_treatment_batch_v1", { method: "POST", body: JSON.stringify({
      p_product_id: input.productId,
      p_client_product_id: input.clientProductId === undefined ? null : Number(input.clientProductId),
      p_order_line_id: input.orderLineId ?? null,
      p_quantity: input.quantity,
      p_performed_at: input.performedAt,
      p_responsible: input.responsible.trim(),
      p_note: input.note?.trim() || null,
      p_controls: input.controls,
    }) });
  }
  const product = memoryProducts.find((item) => item.id === input.productId);
  if (!product || !product.requiresTreatment) throw new Error("El producto no requiere HT.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  if (!input.responsible.trim()) throw new Error("Indique quién realizó el HT.");
  let relation = input.clientProductId === undefined ? undefined : memoryClientProducts.find((item) => String(item.id) === String(input.clientProductId));
  if (input.orderLineId) {
    const order = memoryOrders.find((item) => item.lines.some((line) => line.id === input.orderLineId));
    const line = order?.lines.find((item) => item.id === input.orderLineId);
    if (!line || line.productId !== product.id) throw new Error("La línea no corresponde al producto seleccionado.");
    const lineRelation = memoryClientProducts.find((item) => String(item.id) === String(line.clientProductId));
    if (!lineRelation || relation && String(relation.id) !== String(lineRelation.id)) throw new Error("La línea no corresponde al cliente/producto seleccionado.");
    relation = lineRelation;
  }
  if (relation) {
    if (relation.productId !== product.id) throw new Error("El cliente/producto no coincide con el producto.");
    const activeControls = relation.controls.filter((control) => control.active);
    if (input.controls.some((check) => !activeControls.some((control) => String(control.id) === String(check.controlId)))) throw new Error("Uno de los controles no pertenece a la ficha seleccionada.");
  } else if (input.controls.length) throw new Error("Stock general no admite controles específicos de cliente.");
  const failed = input.controls.filter((control) => control.result === "fail");
  if (failed.some((control) => !control.note?.trim())) throw new Error("Explique cada control no conforme.");
  if (failed.length && !input.note?.trim()) throw new Error("Explique el rechazo del lote.");
  const balances = calculateStockBalances(memoryStockMovements);
  const previous = balances.get(product.id) ?? { pending: 0, ready: 0 };
  const status: TreatmentBatchStatus = failed.length ? "rejected" : "posted";
  if (status === "posted" && previous.pending < input.quantity) throw new Error("El stock pendiente no alcanza para confirmar el HT.");
  const id = `batch-${memoryTreatmentId++}`;
  const transformationId = crypto.randomUUID();
  const checks: TreatmentControlCheck[] = input.controls.map((check) => {
    const control = relation?.controls.find((item) => String(item.id) === String(check.controlId));
    return { id: `check-${memoryTreatmentId++}`, batchId: id, controlId: check.controlId, title: control?.title ?? "Control", result: check.result, note: check.note?.trim() || undefined };
  });
  const batch: TreatmentBatch = {
    id, productId: product.id, productName: productTreatmentLabel(product), clientProductId: relation?.id,
    clientName: relation ? memoryClients.find((client) => client.id === relation!.clientId)?.name : undefined,
    orderLineId: input.orderLineId, orderReference: input.orderLineId ? memoryOrders.find((order) => order.lines.some((line) => line.id === input.orderLineId))?.reference : undefined,
    quantity: input.quantity, performedAt: input.performedAt, responsible: input.responsible.trim(), status,
    note: input.note?.trim() || undefined, createdAt: new Date().toISOString(), checks, movements: [],
  };
  if (status === "posted") {
    const base = { productId: product.id, treatmentBatchId: id, transformationId, performedAt: input.performedAt, responsible: input.responsible.trim(), note: input.note?.trim() || undefined, createdAt: new Date().toISOString() };
    batch.movements = [
      { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "pending_treatment", quantity: -input.quantity, movementType: "treatment_out" },
      { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "ready", quantity: input.quantity, movementType: "treatment_in" },
    ];
    memoryStockMovements.push(...batch.movements);
  }
  memoryTreatmentBatches.push(batch);
  refreshMemoryTreatmentProgress(input.orderLineId);
  return { batchId: id, status, transformationId: status === "posted" ? transformationId : undefined, previousPending: previous.pending, newPending: previous.pending - (status === "posted" ? input.quantity : 0), previousReady: previous.ready, newReady: previous.ready + (status === "posted" ? input.quantity : 0) };
}

export async function reverseTreatmentBatch(id: number | string, input: { performedAt: string; responsible: string; note: string }): Promise<TreatmentRecordResult> {
  if (!useMemoryStore) return supabaseServerRequest<TreatmentRecordResult>("/rest/v1/rpc/reverse_treatment_batch_v1", { method: "POST", body: JSON.stringify({ p_batch_id: id, p_performed_at: input.performedAt, p_responsible: input.responsible.trim(), p_note: input.note.trim() }) });
  const original = memoryTreatmentBatches.find((batch) => String(batch.id) === String(id));
  if (!original || original.status !== "posted") throw new Error("Solo se revierte un lote confirmado.");
  if (memoryTreatmentBatches.some((batch) => String(batch.reversalOfBatchId) === String(id))) throw new Error("El lote ya fue revertido.");
  if (!input.responsible.trim() || !input.note.trim()) throw new Error("Responsable y motivo son obligatorios para revertir.");
  const previous = calculateStockBalances(memoryStockMovements).get(original.productId) ?? { pending: 0, ready: 0 };
  if (previous.ready < original.quantity) throw new Error("El stock listo ya no alcanza; use un ajuste autorizado de stock.");
  const reversalId = `batch-${memoryTreatmentId++}`;
  const transformationId = crypto.randomUUID();
  const base = { productId: original.productId, treatmentBatchId: reversalId, transformationId, performedAt: input.performedAt, responsible: input.responsible.trim(), note: input.note.trim(), createdAt: new Date().toISOString() };
  const movements: StockMovement[] = [
    { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "ready", quantity: -original.quantity, movementType: "treatment_reversal_out" },
    { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "pending_treatment", quantity: original.quantity, movementType: "treatment_reversal_in" },
  ];
  original.reversedByBatchId = reversalId;
  memoryTreatmentBatches.push({ ...original, id: reversalId, status: "reversal", reversalOfBatchId: original.id, reversedByBatchId: undefined, performedAt: input.performedAt, responsible: input.responsible.trim(), note: input.note.trim(), createdAt: new Date().toISOString(), checks: [], movements });
  memoryStockMovements.push(...movements);
  refreshMemoryTreatmentProgress(original.orderLineId);
  return { batchId: reversalId, status: "reversal", transformationId, previousPending: previous.pending, newPending: previous.pending + original.quantity, previousReady: previous.ready, newReady: previous.ready - original.quantity };
}

export async function getTreatmentBatchDetail(id: number | string) {
  const batch = useMemoryStore
    ? memoryTreatmentBatches.find((item) => String(item.id) === String(id)) ?? null
    : (await loadDatabaseTreatmentBatches(`id=eq.${encodeURIComponent(String(id))}`))[0] ?? null;
  if (!batch?.clientProductId) return batch;
  const relation = await getClientProduct(batch.clientProductId);
  const primary = relation?.assets.find((asset) => asset.active && asset.isPrimary);
  const url = primary ? await getClientProductAssetUrl(primary.id) : null;
  return {
    ...batch,
    primaryAsset: primary && url ? { id: primary.id, url, mimeType: primary.mimeType, altText: primary.altText } : undefined,
  };
}

type DbStockBalanceRow = {
  product_id: string;
  pending_quantity: number;
  ready_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  physical_quantity: number;
  last_movement_at: string | null;
};

export async function getStockSummary(includeOrderCommitments = false): Promise<StockSummaryRow[]> {
  const allProducts = await getProducts();
  if (useMemoryStore) {
    const balances = calculateStockBalances(memoryStockMovements);
    const products = allProducts.filter((product) => product.stockActive !== false || ((balances.get(product.id)?.pending ?? 0) + (balances.get(product.id)?.ready ?? 0)) > 0);
    const orderReservations = orderStockReservations(memoryOrders, products);
    const rows = products.map<StockSummaryRow>((product) => {
      const balance = balances.get(product.id) ?? { pending: 0, ready: 0 };
      const shipmentReserved = memoryStockReservations.filter((item) => item.productId === product.id && item.status === "active").reduce((sum, item) => sum + item.quantity, 0);
      const assigned = orderReservations.get(product.id) ?? { pending: 0, ready: 0, orders: [] };
      const readyReserved = Math.min(Math.max(balance.ready, 0), Math.max(shipmentReserved, assigned.ready));
      const pendingReserved = Math.min(balance.pending, assigned.pending);
      const reserved = readyReserved + pendingReserved;
      const available = Math.max(balance.ready - readyReserved, 0);
      return { product, pending: balance.pending, ready: balance.ready, reserved, available, physical: balance.pending + balance.ready, ...(includeOrderCommitments ? { orderCommitments: assigned.orders } : {}) };
    });
    return includeOrderCommitments ? scopeStockInventory(rows, memoryOrders) : rows;
  }
  const [rows, orders, movements] = await Promise.all([
    supabaseRequest<DbStockBalanceRow[]>("/rest/v1/stock_balances?select=*&order=product_id.asc"),
    getOrders(),
    getStockMovements(),
  ]);
  const balances = calculateStockBalances(movements);
  const balanceProductIds = new Set(rows.map((row) => row.product_id));
  const extraProducts = allProducts.filter((product) => !balanceProductIds.has(product.id) && ((balances.get(product.id)?.pending ?? 0) + (balances.get(product.id)?.ready ?? 0)) > 0);
  const productMap = new Map(allProducts.map((product) => [product.id, product]));
  const orderReservations = orderStockReservations(orders, allProducts);
  const balanceRows = rows.map<StockSummaryRow>((row) => {
    const deliveries = orders.flatMap((order) => (order.shipments ?? []).filter((shipment) => !["cancelled", "delivered"].includes(shipment.status)).flatMap((shipment) => shipment.lines.flatMap((shipmentLine) => {
      const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
      return orderLine?.productId === row.product_id ? [{ date: shipment.plannedDate, quantity: shipmentLine.plannedQuantity, client: order.client }] : [];
    }))).sort((a, b) => a.date.localeCompare(b.date));
    const assigned = orderReservations.get(row.product_id) ?? { pending: 0, ready: 0, orders: [] };
    const readyReserved = Math.min(Math.max(row.ready_quantity, 0), Math.max(row.reserved_quantity, assigned.ready));
    const pendingReserved = Math.min(row.pending_quantity, assigned.pending);
    const available = Math.max(row.ready_quantity - readyReserved, 0);
    return {
      product: productMap.get(row.product_id) ?? { id: row.product_id, kind: "Pallet", requiresTreatment: false, stockName: row.product_id },
      pending: row.pending_quantity,
      ready: row.ready_quantity,
      reserved: readyReserved + pendingReserved,
      available,
      physical: row.physical_quantity,
      nextDelivery: deliveries[0],
      lastMovementAt: row.last_movement_at ?? undefined,
      ...(includeOrderCommitments ? { orderCommitments: assigned.orders } : {}),
    };
  });
  const extraRows = extraProducts.map<StockSummaryRow>((product) => {
    const balance = balances.get(product.id)!;
    const assigned = orderReservations.get(product.id) ?? { pending: 0, ready: 0, orders: [] };
    const pending = Math.max(balance.pending, 0);
    const ready = balance.ready;
    const reserved = Math.min(pending, assigned.pending) + Math.min(Math.max(ready, 0), assigned.ready);
    return { product, pending, ready, reserved, available: Math.max(ready - assigned.ready, 0), physical: pending + ready, ...(includeOrderCommitments ? { orderCommitments: assigned.orders } : {}) };
  });
  const summary = [...balanceRows, ...extraRows];
  return includeOrderCommitments ? scopeStockInventory(summary, orders) : summary;
}

export async function getStockDetail(productId: string): Promise<StockDetail | null> {
  const summary = (await getStockSummary()).find((row) => row.product.id === productId);
  if (!summary) return null;
  if (useMemoryStore) {
    return { summary, movements: memoryStockMovements.filter((movement) => movement.productId === productId).sort((a, b) => b.performedAt.localeCompare(a.performedAt)) };
  }
  const movementRows = await supabaseRequest<DbStockMovementRow[]>(`/rest/v1/stock_movements?select=*&product_id=eq.${encodeURIComponent(productId)}&order=performed_at.desc,id.desc&limit=150`);
  return { summary, movements: movementRows.map(mapStockMovement) };
}

export async function getStockImportReport() {
  if (useMemoryStore) return [];
  return supabaseRequest<Array<{ id: number; source_file: string; source_catalog: string; as_of_date: string; expected_pending: number; expected_ready: number; source_reported_pending: number | null; source_reported_ready: number | null; status: string; note: string | null }>>("/rest/v1/stock_import_runs?select=*&order=source_catalog.asc");
}

export async function recordStockReceipt(input: { productId: string; stockState: StockMovement["stockState"]; quantity: number; movementType: "internal_production" | "supplier_receipt" | "return"; providerId?: string; sourceReference?: string; occurredAt: string; responsible: string; note?: string }) {
  if (!useMemoryStore) return supabaseServerRequest<number>("/rest/v1/rpc/record_stock_receipt_v1", { method: "POST", body: JSON.stringify({ p_product_id: input.productId, p_stock_state: input.stockState, p_quantity: input.quantity, p_movement_type: input.movementType, p_provider_id: input.providerId ?? null, p_source_reference: input.sourceReference?.trim() || null, p_occurred_at: input.occurredAt, p_responsible: input.responsible.trim(), p_note: input.note?.trim() || null }) });
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || !input.responsible.trim()) throw new Error("Cantidad y responsable son obligatorios.");
  if (!memoryProducts.some((product) => product.id === input.productId)) throw new Error("Producto no encontrado.");
  const id = `movement-${memoryTreatmentId++}`;
  memoryStockMovements.push({ id, productId: input.productId, stockState: input.stockState, quantity: input.quantity, movementType: input.movementType, providerId: input.providerId, sourceReference: input.sourceReference?.trim() || undefined, transformationId: crypto.randomUUID(), performedAt: input.occurredAt, responsible: input.responsible.trim(), note: input.note?.trim() || undefined, createdAt: new Date().toISOString() });
  return id;
}

export async function recordStockAdjustment(input: { productId: string; stockState: StockMovement["stockState"]; quantityDelta: number; occurredAt: string; responsible: string; reason: string }) {
  if (!useMemoryStore) return supabaseServerRequest<number>("/rest/v1/rpc/record_stock_adjustment_v1", { method: "POST", body: JSON.stringify({ p_product_id: input.productId, p_stock_state: input.stockState, p_quantity_delta: input.quantityDelta, p_occurred_at: input.occurredAt, p_responsible: input.responsible.trim(), p_reason: input.reason.trim() }) });
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0 || !input.responsible.trim() || !input.reason.trim()) throw new Error("Cantidad, responsable y motivo son obligatorios.");
  const balance = calculateStockBalances(memoryStockMovements).get(input.productId) ?? { pending: 0, ready: 0 };
  const current = input.stockState === "ready" ? balance.ready : balance.pending;
  if (current + input.quantityDelta < 0) throw new Error("El ajuste dejaría stock negativo.");
  const id = `movement-${memoryTreatmentId++}`;
  memoryStockMovements.push({ id, productId: input.productId, stockState: input.stockState, quantity: input.quantityDelta, movementType: "adjustment", transformationId: crypto.randomUUID(), performedAt: input.occurredAt, responsible: input.responsible.trim(), note: input.reason.trim(), createdAt: new Date().toISOString() });
  return id;
}

export async function reverseStockMovement(id: number | string, input: { occurredAt: string; responsible: string; reason: string }) {
  if (!useMemoryStore) return supabaseServerRequest<number>("/rest/v1/rpc/reverse_stock_movement_v1", { method: "POST", body: JSON.stringify({ p_movement_id: Number(id), p_occurred_at: input.occurredAt, p_responsible: input.responsible.trim(), p_reason: input.reason.trim() }) });
  const original = memoryStockMovements.find((movement) => String(movement.id) === String(id));
  if (!original || original.movementType === "reversal" || memoryStockMovements.some((movement) => String(movement.correctionOfMovementId) === String(id))) throw new Error("El movimiento no existe o ya fue revertido.");
  return recordStockAdjustment({ productId: original.productId, stockState: original.stockState, quantityDelta: -original.quantity, occurredAt: input.occurredAt, responsible: input.responsible, reason: input.reason }).then((newId) => { const movement = memoryStockMovements.find((item) => String(item.id) === String(newId)); if (movement) { movement.movementType = "reversal"; movement.correctionOfMovementId = original.id; } return newId; });
}

