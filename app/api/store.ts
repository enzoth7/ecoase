import {
  compareProductsByInternalCode,
  formatPlannedDate,
  getOrderPlannedDate,
  getOrderStage,
  orders as seededOrders,
  products as seededProducts,
  providers as seededProviders,
  stageLabels,
  type OperationOrder,
  type OperationStage,
  type OrderChange,
  type OrderUpdateKind,
  type Provider,
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
  ProductionDailyOverride,
  ProductionProduct,
  ProductionResource,
  ProductionResourceType,
} from "../production-capacity";
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
  type TreatmentProductOption,
  type TreatmentRecordResult,
} from "../treatment";
import {
  classifyStockRisk,
  type StockConsumptionRule,
  type StockDetail,
  type StockProjectionPoint,
  type StockRiskLevel,
  type StockSummaryRow,
} from "../stock";

export type CreateOrderInput = {
  lines: Array<{ clientProductId: number | string; quantity: number }>;
  orderDate: string;
  requestedDeliveryDate: string;
  plannedDate: string;
  transport: string;
  reference?: string;
  notes?: string;
  stage?: Exclude<OperationStage, "completado">;
  productionSource: ProductionSource;
  producerProviderId?: string;
  productionDate?: string;
  importArrivalDate?: string;
  requiredOperations: CapacityOperation[];
  transportSource: TransportSource;
  transportProviderId?: string;
};

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
  requiresTreatment: boolean;
  stockName?: string;
  zetaCode?: string;
  clientId?: string;
};

export type CreateProductInput = Omit<UpdateProductInput, "clientId" | "stockName">;
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
  { id: "mirasol", name: "Mirasol", resourceType: "external_supplier", providerId: "mirasol", active: true, displayOrder: 20 },
  { id: "blanc", name: "Blanc", resourceType: "external_supplier", providerId: "blanc", active: true, displayOrder: 30 },
];
const memoryProductionRules: ProductionCapacityRule[] = [];
const memoryProductionOverrides: ProductionDailyOverride[] = [];
let memoryProductionId = 1;
const memoryStockMovements: StockMovement[] = [];
const memoryStockReservations: Array<{ id: string; shipmentLineId: number | string; productId: string; quantity: number; status: "active" | "consumed" | "released" }> = [];
const memoryConsumptionRules: Array<StockConsumptionRule & { productId: string }> = [];
const memoryTreatmentBatches: TreatmentBatch[] = [];
let memoryTreatmentId = 1;

function canonicalOperations(operations: CapacityOperation[] | null | undefined): CapacityOperation[] {
  return [...new Set((operations ?? ["assembly"]).map((operation) => operation === "marking" || operation === "ht" ? "treatment" : operation))];
}

function treatmentFromLabel(label: string) {
  if (/HT|Marcado/i.test(label)) return "Marcado" as const;
  return undefined;
}

for (const order of memoryOrders) {
  const createdAt = new Date(0).toISOString();
  order.requiredOperations = canonicalOperations(order.requiredOperations);
  for (const line of order.lines) {
    line.treatment = treatmentFromLabel(line.product);
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

type DbAllocation = { id: number; order_line_id: string; resource_id: string | null; production_resource_id: number | null; capacity_rule_id: number | null; planned_date: string; planned_quantity: number; actual_quantity: number | null; status: ProductionAllocationStatus; note: string | null; completed_at: string | null; completion_note: string | null; created_at: string; updated_at: string };
type DbLineTreatmentProgress = { id: number; order_line_id: string | null; quantity: number; status: TreatmentBatchStatus; reversal_of_batch_id: number | null };
type DbShipmentLine = { id: number; shipment_id: number; order_line_id: string; planned_quantity: number; delivered_quantity: number };
type DbShipmentEvent = { id: number; shipment_id: number; event_type: Shipment["events"][number]["eventType"]; previous_status: ShipmentStatus | null; next_status: ShipmentStatus | null; previous_date: string | null; next_date: string | null; reason: RescheduleReason | null; note: string | null; previous_remittance: string | null; next_remittance: string | null; responsible: string; created_at: string };
type DbShipment = { id: number; order_id: string; planned_date: string; status: ShipmentStatus; transport_source: TransportSource; transport_provider_id: string | null; remittance: string | null; shared_remittance_reason: string | null; delivery_address_snapshot: string | null; loaded_at: string | null; dispatched_at: string | null; delivered_at: string | null; created_at: string; updated_at: string; shipment_lines: DbShipmentLine[]; shipment_events: DbShipmentEvent[] };
function mapOrder(row: DbOrder): OperationOrder {
  return {
    id: row.id,
    reference: row.reference,
    client: row.client,
    product: row.product,
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
    lines: [...(row.order_lines ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({ id: line.id, product: line.product, productId: line.product_id ?? undefined, clientProductId: line.client_product_id ?? undefined, quantity: line.requested_quantity ?? line.quantity, preparation: line.preparation ?? undefined, treatment: treatmentFromLabel(line.product) })),
  };
}

async function attachDatabaseOperations(orders: OperationOrder[]) {
  const orderIds = orders.map((order) => order.id);
  const lineIds = orders.flatMap((order) => order.lines.map((line) => line.id));
  if (!orderIds.length) return orders;
  const [allocations, shipments, providers, treatmentProgress, reservations, stockRisks] = await Promise.all([
    lineIds.length ? supabaseRequest<DbAllocation[]>(`/rest/v1/production_allocations?select=*&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})&order=planned_date.asc,id.asc`) : Promise.resolve([]),
    supabaseRequest<DbShipment[]>(`/rest/v1/shipments?select=*,shipment_lines(*),shipment_events(*)&order_id=in.(${orderIds.map(encodeURIComponent).join(",")})&order=planned_date.asc,id.asc&shipment_events.order=created_at.asc,id.asc`),
    getProviders(),
    lineIds.length ? supabaseRequest<DbLineTreatmentProgress[]>(`/rest/v1/treatment_batches?select=id,order_line_id,quantity,status,reversal_of_batch_id&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})`) : Promise.resolve([]),
    lineIds.length ? supabaseRequest<Array<{ shipment_line_id: number; quantity: number; status: string; shipment_lines: { order_line_id: string } | null }>>(`/rest/v1/stock_reservations?select=shipment_line_id,quantity,status,shipment_lines(order_line_id)&status=eq.active`) : Promise.resolve([]),
    supabaseRequest<Array<{ product_id: string; risk_level: StockRiskLevel; available_quantity: number; days_to_break: number | null; estimated_break_date: string | null }>>(`/rest/v1/stock_risk?select=product_id,risk_level,available_quantity,days_to_break,estimated_break_date`),
  ]);
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));
  const lineMap = new Map(orders.flatMap((order) => order.lines.map((line) => [line.id, line] as const)));
  for (const order of orders) {
    for (const line of order.lines) {
      line.productionAllocations = allocations.filter((item) => item.order_line_id === line.id).map<ProductionAllocation>((item) => ({ id: item.id, orderLineId: item.order_line_id, resourceId: item.resource_id ?? undefined, productionResourceId: item.production_resource_id ?? undefined, capacityRuleId: item.capacity_rule_id ?? undefined, plannedDate: item.planned_date, plannedQuantity: item.planned_quantity, actualQuantity: item.actual_quantity ?? undefined, status: item.status, note: item.note ?? undefined, completedAt: item.completed_at ?? undefined, completionNote: item.completion_note ?? undefined, createdAt: item.created_at, updatedAt: item.updated_at }));
      const lineBatches = treatmentProgress.filter((batch) => batch.order_line_id === line.id);
      const treated = lineBatches.reduce((sum, batch) => sum + (batch.status === "posted" ? batch.quantity : batch.status === "reversal" ? -batch.quantity : 0), 0);
      line.treatedQuantity = Math.max(treated, 0);
      line.treatmentPendingQuantity = Math.max(line.quantity - line.treatedQuantity, 0);
      line.readyReservedQuantity = 0;
      line.readyReservedQuantity = reservations.filter((reservation) => reservation.shipment_lines?.order_line_id === line.id).reduce((sum, reservation) => sum + reservation.quantity, 0);
      const stockRisk = stockRisks.find((risk) => risk.product_id === line.productId);
      line.stockRisk = stockRisk ? { level: stockRisk.risk_level, available: stockRisk.available_quantity, daysToBreak: stockRisk.days_to_break ?? undefined, estimatedBreakDate: stockRisk.estimated_break_date ?? undefined } : undefined;
    }
    order.shipments = shipments.filter((item) => item.order_id === order.id).map<Shipment>((item) => ({
      id: item.id, orderId: item.order_id, plannedDate: item.planned_date, status: item.status, transportSource: item.transport_source,
      transportProviderId: item.transport_provider_id ?? undefined, transportLabel: item.transport_source === "internal" ? "Transporte interno" : providerNames.get(item.transport_provider_id ?? "") ?? "Transportista",
      remittance: item.remittance ?? undefined, sharedRemittanceReason: item.shared_remittance_reason ?? undefined, deliveryAddressSnapshot: item.delivery_address_snapshot ?? undefined,
      loadedAt: item.loaded_at ?? undefined, dispatchedAt: item.dispatched_at ?? undefined, deliveredAt: item.delivered_at ?? undefined, createdAt: item.created_at, updatedAt: item.updated_at,
      lines: item.shipment_lines.map((line) => ({ id: line.id, shipmentId: line.shipment_id, orderLineId: line.order_line_id, product: lineMap.get(line.order_line_id)?.product ?? "Producto", treatment: lineMap.get(line.order_line_id)?.treatment, plannedQuantity: line.planned_quantity, deliveredQuantity: line.delivered_quantity })),
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
  return attachDatabaseOperations(rows.map(mapOrder));
}

export async function getProviders() {
  if (useMemoryStore) return seededProviders;
  const query = new URLSearchParams({ select: "id,name,type,supplies", order: "type.asc,name.asc" });
  return supabaseRequest<Provider[]>(`/rest/v1/providers?${query}`);
}

export async function getProducts() {
  if (useMemoryStore) {
    const clientNameById = new Map(memoryClients.map((client) => [client.id, client.name]));
    return memoryProducts.map((product) => ({
      ...product,
      clientNames: [...new Set(memoryClientProducts.filter((item) => item.productId === product.id).map((item) => clientNameById.get(item.clientId)).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "es")),
    })).sort(compareProductsByInternalCode);
  }
  const query = new URLSearchParams({
    select: "id,kind,measure,treatment,requires_treatment,stock_name,source_catalog,source_code,zeta_code,stock_active",
    order: "stock_name.asc,kind.asc,measure.asc",
  });
  const [rows, assignments, clients] = await Promise.all([
    supabaseRequest<DbProductRow[]>(`/rest/v1/products?${query}`),
    supabaseRequest<Array<{ product_id: string; client_id: string }>>("/rest/v1/client_products?select=product_id,client_id&order=display_order.asc,id.asc"),
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

type DbProductRow = { id: string; kind: ProductKind; measure: string | null; treatment: Product["treatment"] | null; requires_treatment: boolean; stock_name?: string | null; source_catalog?: Product["sourceCatalog"] | null; source_code?: string | null; zeta_code?: string | null; stock_active?: boolean };
function mapProduct(row: DbProductRow): Product {
  return { id: row.id, kind: row.kind, measure: row.measure ?? undefined, treatment: row.treatment ?? undefined, requiresTreatment: row.requires_treatment, stockName: row.stock_name ?? undefined, sourceCatalog: row.source_catalog ?? undefined, sourceCode: row.source_code ?? undefined, zetaCode: row.zeta_code ?? undefined, stockActive: row.stock_active ?? true };
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

const masterSelect = "id,client_id,product_id,zeta_code,operational_name,active,display_order,created_at,updated_at,products(id,kind,measure,treatment,requires_treatment,stock_name,source_catalog,source_code,zeta_code,stock_active),client_product_controls(id,client_product_id,title,detail,display_order,active),client_product_assets(id,client_product_id,storage_path,file_name,asset_type,mime_type,size_bytes,alt_text,is_primary,active,created_at)";

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
  return detail.products.filter((item) => !activeOnly || (item.active && clientProductReady(item))).map((item) => ({
    id: item.id,
    productId: item.productId,
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
  if (!next.zetaCode) throw new Error("El código Zeta es obligatorio.");
  if (useMemoryStore) {
    Object.assign(current, next, { updatedAt: new Date().toISOString() });
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

export async function createProduct(input: CreateProductInput) {
  const measure = input.measure?.trim() || undefined;
  const zetaCode = input.zetaCode?.trim().toLocaleUpperCase("es");
  if (!zetaCode) throw new Error("Indique el código Zeta.");
  if (!useMemoryStore) {
    const id = await supabaseServerRequest<string>("/rest/v1/rpc/create_catalog_product_v3", {
      method: "POST",
      body: JSON.stringify({ p_kind: input.kind, p_measure: measure ?? null, p_requires_treatment: input.requiresTreatment, p_zeta_code: zetaCode }),
    });
    const product = (await getProducts()).find((item) => item.id === id);
    if (!product) throw new Error("El producto se creó pero no pudo recuperarse.");
    return product;
  }
  if (memoryProducts.some((product) => product.kind === input.kind && (product.measure ?? "") === (measure ?? ""))) throw new Error("Ya existe un producto con ese tipo y medida.");
  const product = { id: `producto-${crypto.randomUUID()}`, kind: input.kind, measure, requiresTreatment: input.requiresTreatment, zetaCode } satisfies Product;
  memoryProducts.push(product);
  return product;
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
      active: false,
      displayOrder: memoryClientProducts.filter((item) => item.clientId === clientId).length,
      createdAt: now,
      updatedAt: now,
      product,
      controls: [],
      assets: [],
    });
    return;
  }

  const query = new URLSearchParams({ select: "id", client_id: `eq.${clientId}`, product_id: `eq.${productId}`, limit: "1" });
  const existing = await supabaseServerRequest<Array<{ id: number }>>(`/rest/v1/client_products?${query}`);
  if (existing.length) return;
  await supabaseServerRequest<unknown>("/rest/v1/client_products", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ client_id: clientId, product_id: productId, zeta_code: null, active: false }),
  });
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const measure = input.measure?.trim() || undefined;
  const stockName = input.stockName?.trim();
  const zetaCode = input.zetaCode?.trim().toLocaleUpperCase("es");
  if (input.stockName !== undefined && !stockName) throw new Error("Indique el nombre del producto.");
  if (input.zetaCode !== undefined && !zetaCode) throw new Error("Indique el código Zeta.");

  if (!useMemoryStore) {
    await supabaseServerRequest<string>("/rest/v1/rpc/update_catalog_product_v2", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_kind: input.kind,
        p_measure: measure ?? null,
        p_requires_treatment: input.requiresTreatment,
      }),
    });
    if (stockName) {
      await supabaseServerRequest<unknown>(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ stock_name: stockName }),
      });
    }
    if (zetaCode) {
      await supabaseServerRequest<unknown>(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ zeta_code: zetaCode }),
      });
    }
    if (input.clientId) await assignClientToProduct(id, input.clientId);
    const products = await getProducts();
    const product = products.find((item) => item.id === id);
    if (!product) throw new Error("El producto se actualizó pero no pudo recuperarse.");
    return product;
  }

  const product = memoryProducts.find((item) => item.id === id);
  if (!product) throw new Error("Producto no encontrado.");
  Object.assign(product, { kind: input.kind, measure, requiresTreatment: input.requiresTreatment, ...(stockName ? { stockName } : {}), ...(zetaCode ? { zetaCode } : {}) });
  if (zetaCode) memoryClientProducts.filter((item) => item.productId === id).forEach((item) => { item.zetaCode = zetaCode; item.product.zetaCode = zetaCode; });
  if (input.clientId) await assignClientToProduct(id, input.clientId);
  const updated = (await getProducts()).find((item) => item.id === id);
  if (!updated) throw new Error("El producto se actualizó pero no pudo recuperarse.");
  return updated;
}

export async function deleteProduct(id: string) {
  if (!useMemoryStore) {
    await supabaseRequest<string>("/rest/v1/rpc/delete_catalog_product", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    return;
  }

  const index = memoryProducts.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Producto no encontrado.");
  memoryProducts.splice(index, 1);
}

export async function createOrder(input: CreateOrderInput) {
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.some((line) => !line.clientProductId || !Number.isInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("Indique al menos un producto con una cantidad mayor a cero.");
  }
  if (!useMemoryStore) {
    const id = await supabaseServerRequest<string>("/rest/v1/rpc/create_operation_order_v6", {
      method: "POST",
      body: JSON.stringify({
        p_lines: input.lines.map((line) => ({ clientProductId: Number(line.clientProductId), quantity: line.quantity })),
        p_order_date: input.orderDate,
        p_requested_delivery_date: input.requestedDeliveryDate,
        p_planned_date: input.plannedDate,
        p_reference: input.reference?.trim() || null,
        p_notes: input.notes?.trim() || null,
        p_stage: input.stage ?? "negociacion",
        p_production_source: input.productionSource,
        p_producer_provider_id: input.producerProviderId ?? null,
        p_production_date: input.productionDate ?? null,
        p_import_arrival_date: input.importArrivalDate ?? null,
        p_required_operations: canonicalOperations(input.requiredOperations),
        p_transport_source: input.transportSource,
        p_transport_provider_id: input.transportProviderId ?? null,
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
    reference: input.reference?.trim() || `Pedido ${memoryOrders.length + 1}`,
    client: client.name,
    clientId: client.id,
    product: resolvedProduct,
    productId: resolvedLines[0].productId,
    clientProductId: resolvedLines[0].clientProductId,
    requested,
    delivered: 0,
    pending: requested,
    stage: input.stage ?? "negociacion",
    orderDate: input.orderDate,
    requestedDeliveryDate: input.requestedDeliveryDate,
    zetaCode: selected.map(({ relation }) => relation!.zetaCode).join(" · "),
    plannedDate: input.plannedDate,
    dateLabel: formatPlannedDate(input.plannedDate),
    transport: input.transport.trim(),
    transportSource: input.transportSource,
    transportProviderId: input.transportProviderId,
    productionSource: input.productionSource,
    producerProviderId: input.producerProviderId,
    productionDate: input.productionDate,
    importArrivalDate: input.importArrivalDate,
    requiredOperations: canonicalOperations(input.requiredOperations),
    supply: input.stage === "produccion" ? "Producción planificada" : "Pendiente de asignación",
    preparation: "Pendiente de preparación",
    logistics: `${input.transport.trim()} · entrega planificada`,
    delivery: `0 de ${requested} entregados`,
    action: input.stage === "logistica" ? "Coordinar la entrega." : "Preparar y coordinar la entrega.",
    deliveryAddress: client.address,
    notes: input.notes?.trim() || undefined,
    lines: resolvedLines.map((line) => { const resourceId = input.producerProviderId ?? (input.productionSource === "internal" ? "internal" : undefined); return { ...line, id: `${id}-${line.index + 1}`, productionAllocations: [{ id: `pa-${id}-${line.index + 1}`, orderLineId: `${id}-${line.index + 1}`, resourceId, productionResourceId: resourceId, plannedDate: input.productionDate ?? input.importArrivalDate ?? input.plannedDate, plannedQuantity: line.quantity, status: "draft", note: input.stage === "produccion" ? "Pendiente de confirmar capacidad" : undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }; }),
    source: "Alta desde dashboard",
  };
  order.shipments = [{ id: `shipment-${crypto.randomUUID()}`, orderId: id, plannedDate: input.plannedDate, status: "planned", transportSource: input.transportSource, transportProviderId: input.transportProviderId, transportLabel: input.transport, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lines: order.lines.map((line) => ({ id: `sl-${crypto.randomUUID()}`, shipmentId: `shipment-${id}`, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: line.quantity, deliveredQuantity: 0 })), events: [] }];
  order.shipments[0].events.push({ id: `se-${crypto.randomUUID()}`, shipmentId: order.shipments[0].id, eventType: "created", nextStatus: "planned", nextDate: input.plannedDate, responsible: "Sistema", createdAt: new Date().toISOString() });
  memoryOrders.unshift(order);
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
    await supabaseServerRequest<boolean>("/rest/v1/rpc/replace_production_allocations_v1", { method: "POST", body: JSON.stringify({ p_order_line_id: orderLineId, p_allocations: allocations }) });
    const order = (await getOrders()).find((item) => item.lines.some((line) => line.id === orderLineId));
    return order?.lines.find((line) => line.id === orderLineId) ?? null;
  }
  const order = memoryOrders.find((item) => item.lines.some((line) => line.id === orderLineId));
  const line = order?.lines.find((item) => item.id === orderLineId);
  if (!line) return null;
  const fixed = (line.productionAllocations ?? []).filter((item) => item.status === "confirmed" || item.status === "completed");
  if (allocations.some((item) => item.status !== "draft" || !/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate) || !Number.isInteger(item.plannedQuantity) || item.plannedQuantity <= 0)) throw new Error("Las asignaciones nuevas se guardan en borrador con fecha y cantidad válidas.");
  if ([...fixed, ...allocations].reduce((sum, item) => sum + item.plannedQuantity, 0) > line.quantity) throw new Error("La producción asignada supera la cantidad de la línea.");
  const now = new Date().toISOString();
  line.productionAllocations = [...fixed, ...allocations.map((item) => { const resourceId = item.resourceId?.trim() || undefined; const resource = memoryProductionResources.find((entry) => String(entry.id) === resourceId || entry.providerId === resourceId || resourceId === "internal" && entry.resourceType === "internal_factory"); return { ...item, id: `pa-${crypto.randomUUID()}`, orderLineId, resourceId, productionResourceId: resource?.id, status: "draft" as const, note: item.note?.trim() || undefined, createdAt: now, updatedAt: now }; })];
  return line;
}

function validateMemoryShipmentLines(order: OperationOrder, shipmentId: number | string | undefined, lines: ShipmentLineInput[]) {
  if (!lines.length) throw new Error("Indique al menos una línea para el viaje.");
  for (const input of lines) {
    const line = order.lines.find((item) => item.id === input.orderLineId);
    if (!line || !Number.isInteger(input.plannedQuantity) || input.plannedQuantity <= 0) throw new Error("Revise las líneas y cantidades del viaje.");
    const committed = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && String(shipment.id) !== String(shipmentId)).flatMap((shipment) => shipment.lines).filter((item) => item.orderLineId === line.id).reduce((sum, item) => sum + item.plannedQuantity, 0);
    if (committed + input.plannedQuantity > line.quantity) throw new Error(`Los viajes superan la cantidad de ${line.product}.`);
  }
}

export async function createShipment(orderId: string, input: ShipmentInput) {
  if (!useMemoryStore) {
    const id = await supabaseServerRequest<number>("/rest/v1/rpc/create_shipment_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_planned_date: input.plannedDate, p_transport_source: input.transportSource, p_transport_provider_id: input.transportProviderId ?? null, p_lines: input.lines, p_responsible: input.responsible?.trim() || "Operación" }) });
    return (await getDatabaseOrder(orderId))?.shipments?.find((item) => String(item.id) === String(id)) ?? null;
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  validateMemoryShipmentLines(order, undefined, input.lines);
  const provider = seededProviders.find((item) => item.id === input.transportProviderId);
  if (input.transportSource === "external" && provider?.type !== "Transporte") throw new Error("Seleccione un transportista registrado.");
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
  shipment.plannedDate = input.plannedDate; shipment.transportSource = input.transportSource; shipment.transportProviderId = input.transportProviderId; shipment.transportLabel = input.transportSource === "internal" ? "Transporte interno" : seededProviders.find((item) => item.id === input.transportProviderId)?.name ?? "Transportista"; shipment.updatedAt = new Date().toISOString();
  shipment.lines = input.lines.map((item) => { const line = order.lines.find((entry) => entry.id === item.orderLineId)!; return { id: `sl-${crypto.randomUUID()}`, shipmentId, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: item.plannedQuantity, deliveredQuantity: 0 }; });
  refreshMemoryOrder(order); return shipment;
}

export async function transitionShipment(shipmentId: number | string, input: { nextStatus: ShipmentStatus; remittance?: string; sharedRemittanceReason?: string; deliveredLines?: Array<{ shipmentLineId: number | string; deliveredQuantity: number }>; responsible?: string }) {
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/transition_shipment_v2", { method: "POST", body: JSON.stringify({ p_shipment_id: Number(shipmentId), p_next_status: input.nextStatus, p_remittance: input.remittance?.trim() || null, p_shared_remittance_reason: input.sharedRemittanceReason?.trim() || null, p_delivered_lines: input.deliveredLines ?? [], p_responsible: input.responsible?.trim() || "Operación" }) });
    return (await getOrders()).flatMap((order) => order.shipments ?? []).find((item) => String(item.id) === String(shipmentId)) ?? null;
  }
  const order = memoryOrders.find((item) => item.shipments?.some((shipment) => String(shipment.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  if (!order || !shipment) return null;
  const expected: Partial<Record<ShipmentStatus, ShipmentStatus>> = { planned: "ready", ready: "loaded", loaded: "dispatched", dispatched: "delivered" };
  if (input.nextStatus !== expected[shipment.status] && !(input.nextStatus === "cancelled" && !["dispatched", "delivered", "cancelled"].includes(shipment.status))) throw new Error("La transición del viaje no es válida.");
  const remittance = input.remittance?.trim() || shipment.remittance;
  if (!["cancelled"].includes(input.nextStatus) && !remittance) throw new Error("El número de remito es obligatorio.");
  if (input.nextStatus === "ready") {
    if (!order.deliveryAddress) throw new Error("El cliente no tiene dirección de entrega.");
    shipment.deliveryAddressSnapshot = order.deliveryAddress;
    for (const shipmentLine of shipment.lines) {
      const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
      if (!orderLine?.productId) throw new Error("Una línea del viaje no tiene producto canónico.");
      const balance = calculateStockBalances(memoryStockMovements).get(orderLine.productId) ?? { pending: 0, ready: 0 };
      const reserved = memoryStockReservations.filter((item) => item.productId === orderLine.productId && item.status === "active").reduce((sum, item) => sum + item.quantity, 0);
      if (balance.ready - reserved < shipmentLine.plannedQuantity) throw new Error(`Stock listo insuficiente para reservar ${shipmentLine.plannedQuantity} unidades.`);
      memoryStockReservations.push({ id: `reservation-${crypto.randomUUID()}`, shipmentLineId: shipmentLine.id, productId: orderLine.productId, quantity: shipmentLine.plannedQuantity, status: "active" });
      orderLine.readyReservedQuantity = (orderLine.readyReservedQuantity ?? 0) + shipmentLine.plannedQuantity;
    }
  }
  if (input.nextStatus === "cancelled") for (const reservation of memoryStockReservations.filter((item) => shipment.lines.some((line) => String(line.id) === String(item.shipmentLineId)) && item.status === "active")) reservation.status = "released";
  if (input.nextStatus === "dispatched") for (const shipmentLine of shipment.lines) {
    const reservation = memoryStockReservations.find((item) => String(item.shipmentLineId) === String(shipmentLine.id) && item.status === "active");
    const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
    if (!reservation || !orderLine?.productId || reservation.quantity !== shipmentLine.plannedQuantity) throw new Error("La línea no tiene una reserva activa completa.");
    const now = new Date().toISOString();
    memoryStockMovements.push({ id: `movement-${memoryTreatmentId++}`, productId: orderLine.productId, stockState: "ready", quantity: -shipmentLine.plannedQuantity, movementType: "dispatch", orderLineId: orderLine.id, shipmentLineId: shipmentLine.id, remittance, transformationId: crypto.randomUUID(), performedAt: now, responsible: input.responsible?.trim() || "Operación", note: `Despacho de viaje ${shipment.id}`, createdAt: now });
    reservation.status = "consumed";
    orderLine.readyReservedQuantity = Math.max((orderLine.readyReservedQuantity ?? 0) - shipmentLine.plannedQuantity, 0);
  }
  if (input.nextStatus === "delivered") for (const delivered of input.deliveredLines ?? []) { const line = shipment.lines.find((item) => String(item.id) === String(delivered.shipmentLineId)); if (!line || delivered.deliveredQuantity < 0 || delivered.deliveredQuantity > line.plannedQuantity) throw new Error("Cantidad entregada inválida."); line.deliveredQuantity = delivered.deliveredQuantity; }
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

export async function getOrderHistory(id: string) {
  if (useMemoryStore) return memoryHistory.get(id) ?? [];
  const query = new URLSearchParams({
    select: "id,changed_at,kind,note,order_change_items(field,from_value,to_value,position)",
    order_id: `eq.${id}`,
    order: "changed_at.desc",
    "order_change_items.order": "position.asc",
  });
  const rows = await supabaseRequest<DbChange[]>(`/rest/v1/order_changes?${query}`);
  return rows.map<OrderChange>((row) => ({
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
  }));
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
    if (!input.remittance?.trim()) throw new Error("El número de remito es obligatorio para despachar.");
    if (input.remittance?.trim() && input.remittance.trim() !== order.remittance) {
      changes.push({ field: "Remito", from: order.remittance ?? "—", to: input.remittance.trim() });
      order.remittance = input.remittance.trim();
    }
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
type DbProductionResource = { id: number; name: string; resource_type: ProductionResourceType; provider_id: string | null; active: boolean; display_order: number };
type DbProductionRule = { id: number; resource_id: number; product_id: string; people_count: number | null; configuration_label: string; normal_units_per_day: number; maximum_units_per_day: number; valid_from: string; valid_to: string | null; source: string; note: string | null; created_at: string };
type DbProductionOverride = { id: number; override_date: string; resource_id: number; capacity_rule_id: number | null; product_id: string | null; normal_units_per_day: number | null; maximum_units_per_day: number | null; available: boolean; external_status: "estimated" | "confirmed" | null; reason: string; responsible: string };

function productionProducts(products: Product[]): ProductionProduct[] {
  return products.map((product) => ({ id: product.id, name: productLabel(product) }));
}

export async function getCapacity(from: string, to: string) {
  if (useMemoryStore) return buildCapacitySnapshot({ from, to, rules: memoryCapacityRules, internalDefaults: memoryInternalDefaults, availablePeople: memoryAvailablePeople, externalDefaults: memoryExternalDefaults, transportDefaults: memoryTransportDefaults, adjustments: memoryCapacityAdjustments, orders: memoryOrders, providers: seededProviders, productionResources: memoryProductionResources, productionRules: memoryProductionRules, productionOverrides: memoryProductionOverrides, productionProducts: productionProducts(memoryProducts) });
  const range = `adjustment_date=gte.${from}&adjustment_date=lte.${to}`;
  const productionRange = `override_date=gte.${from}&override_date=lte.${to}`;
  const [rules, internal, team, external, transport, adjustments, orders, providers, resources, productionRules, overrides, products] = await Promise.all([
    supabaseRequest<DbCapacityRule[]>("/rest/v1/capacity_rules?select=operation,people_count,pallet_capacity&order=operation.asc,people_count.asc"),
    supabaseRequest<DbInternalDefault[]>("/rest/v1/internal_production_defaults?select=operation,people_count,manual_capacity"),
    supabaseRequest<DbInternalTeam[]>("/rest/v1/internal_team_capacity?select=available_people&id=eq.true"),
    supabaseRequest<DbExternalDefault[]>("/rest/v1/external_production_defaults?select=id,provider_id,operation,pallet_capacity,status"),
    supabaseRequest<DbTransportDefault[]>("/rest/v1/transport_capacity_defaults?select=id,source,provider_id,pallet_capacity,trip_capacity,status"),
    supabaseRequest<DbCapacityAdjustment[]>(`/rest/v1/capacity_daily_adjustments?select=adjustment_date,resource_type,operation,source,provider_id,pallet_adjustment,trip_adjustment,people_count,responsible,status&${range}`),
    getOrders(), getProviders(),
    supabaseRequest<DbProductionResource[]>("/rest/v1/production_resources?select=id,name,resource_type,provider_id,active,display_order&order=display_order.asc,id.asc"),
    supabaseRequest<DbProductionRule[]>("/rest/v1/production_capacity_rules?select=*&order=valid_from.desc,id.desc"),
    supabaseRequest<DbProductionOverride[]>(`/rest/v1/production_daily_overrides?select=*&${productionRange}&order=override_date.asc,id.asc`),
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
    productionResources: resources.map((item) => ({ id: item.id, name: item.name, resourceType: item.resource_type, providerId: item.provider_id ?? undefined, active: item.active, displayOrder: item.display_order })),
    productionRules: productionRules.map((item) => ({ id: item.id, resourceId: item.resource_id, productId: item.product_id, productName: productNames.get(item.product_id) ?? item.product_id, peopleCount: item.people_count ?? undefined, configurationLabel: item.configuration_label, normalUnitsPerDay: item.normal_units_per_day, maximumUnitsPerDay: item.maximum_units_per_day, validFrom: item.valid_from, validTo: item.valid_to ?? undefined, source: item.source, note: item.note ?? undefined, createdAt: item.created_at })),
    productionOverrides: overrides.map((item) => ({ id: item.id, date: item.override_date, resourceId: item.resource_id, capacityRuleId: item.capacity_rule_id ?? undefined, productId: item.product_id ?? undefined, normalUnitsPerDay: item.normal_units_per_day ?? undefined, maximumUnitsPerDay: item.maximum_units_per_day ?? undefined, available: item.available, externalStatus: item.external_status ?? undefined, reason: item.reason, responsible: item.responsible })),
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
export type ProductionOverrideInput = Omit<ProductionDailyOverride, "id">;

export async function createProductionResource(input: ProductionResourceInput) {
  const value = { name: input.name.trim(), resourceType: input.resourceType, providerId: input.providerId?.trim() || undefined, active: input.active ?? true, displayOrder: input.displayOrder ?? 100 };
  if (useMemoryStore) {
    if (memoryProductionResources.some((item) => item.active && item.name.toLocaleLowerCase("es") === value.name.toLocaleLowerCase("es"))) throw new Error("Ya existe un recurso activo con ese nombre.");
    const resource: ProductionResource = { id: `resource-${memoryProductionId++}`, ...value };
    memoryProductionResources.push(resource);
    return resource;
  }
  const rows = await supabaseServerRequest<DbProductionResource[]>("/rest/v1/production_resources?select=id,name,resource_type,provider_id,active,display_order", { method: "POST", prefer: "return=representation", body: JSON.stringify({ name: value.name, resource_type: value.resourceType, provider_id: value.providerId ?? null, active: value.active, display_order: value.displayOrder }) });
  const row = rows[0];
  return { id: row.id, name: row.name, resourceType: row.resource_type, providerId: row.provider_id ?? undefined, active: row.active, displayOrder: row.display_order } satisfies ProductionResource;
}

export async function updateProductionResource(id: number | string, changes: { name?: string; active?: boolean; displayOrder?: number }) {
  if (useMemoryStore) {
    const resource = memoryProductionResources.find((item) => String(item.id) === String(id));
    if (!resource) return null;
    if (changes.name !== undefined) resource.name = changes.name.trim();
    if (changes.active !== undefined) resource.active = changes.active;
    if (changes.displayOrder !== undefined) resource.displayOrder = changes.displayOrder;
    return resource;
  }
  const body: Record<string, unknown> = {};
  if (changes.name !== undefined) body.name = changes.name.trim();
  if (changes.active !== undefined) body.active = changes.active;
  if (changes.displayOrder !== undefined) body.display_order = changes.displayOrder;
  const rows = await supabaseServerRequest<DbProductionResource[]>(`/rest/v1/production_resources?id=eq.${encodeURIComponent(String(id))}&select=id,name,resource_type,provider_id,active,display_order`, { method: "PATCH", prefer: "return=representation", body: JSON.stringify(body) });
  const row = rows[0];
  return row ? { id: row.id, name: row.name, resourceType: row.resource_type, providerId: row.provider_id ?? undefined, active: row.active, displayOrder: row.display_order } satisfies ProductionResource : null;
}

export async function createProductionRule(input: ProductionRuleInput) {
  const value = { ...input, configurationLabel: input.configurationLabel.trim(), source: input.source.trim(), note: input.note?.trim() || undefined };
  if (useMemoryStore) {
    const overlaps = memoryProductionRules.some((item) => String(item.resourceId) === String(value.resourceId) && item.productId === value.productId && (item.peopleCount ?? 0) === (value.peopleCount ?? 0) && item.validFrom <= (value.validTo ?? "9999-12-31") && value.validFrom <= (item.validTo ?? "9999-12-31"));
    if (overlaps) throw new Error("Ya existe una regla vigente para ese recurso, producto y configuración.");
    const product = memoryProducts.find((item) => item.id === value.productId);
    const rule: ProductionCapacityRule = { id: `rule-${memoryProductionId++}`, ...value, productName: product ? productLabel(product) : value.productId, createdAt: new Date().toISOString() };
    memoryProductionRules.push(rule);
    return rule;
  }
  const rows = await supabaseServerRequest<DbProductionRule[]>("/rest/v1/production_capacity_rules?select=*", { method: "POST", prefer: "return=representation", body: JSON.stringify({ resource_id: value.resourceId, product_id: value.productId, people_count: value.peopleCount ?? null, configuration_label: value.configurationLabel, normal_units_per_day: value.normalUnitsPerDay, maximum_units_per_day: value.maximumUnitsPerDay, valid_from: value.validFrom, valid_to: value.validTo ?? null, source: value.source, note: value.note ?? null }) });
  const row = rows[0];
  const product = (await getProducts()).find((item) => item.id === row.product_id);
  return productionRuleFromRow(row, product);
}

export async function updateProductionRule(id: number | string, input: ProductionRuleInput) {
  const value = { ...input, configurationLabel: input.configurationLabel.trim(), source: input.source.trim(), note: input.note?.trim() || undefined };
  if (useMemoryStore) {
    const rule = memoryProductionRules.find((item) => String(item.id) === String(id));
    if (!rule) return null;
    const overlaps = memoryProductionRules.some((item) => String(item.id) !== String(id) && String(item.resourceId) === String(value.resourceId) && item.productId === value.productId && (item.peopleCount ?? 0) === (value.peopleCount ?? 0) && item.validFrom <= (value.validTo ?? "9999-12-31") && value.validFrom <= (item.validTo ?? "9999-12-31"));
    if (overlaps) throw new Error("Ya existe una regla vigente para ese recurso, producto y configuración.");
    const product = memoryProducts.find((item) => item.id === value.productId);
    Object.assign(rule, value, { productName: product ? productLabel(product) : value.productId });
    return rule;
  }
  const rows = await supabaseServerRequest<DbProductionRule[]>(`/rest/v1/production_capacity_rules?id=eq.${encodeURIComponent(String(id))}&select=*`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ resource_id: value.resourceId, product_id: value.productId, people_count: value.peopleCount ?? null, configuration_label: value.configurationLabel, normal_units_per_day: value.normalUnitsPerDay, maximum_units_per_day: value.maximumUnitsPerDay, valid_from: value.validFrom, valid_to: value.validTo ?? null, source: value.source, note: value.note ?? null }),
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
    if ((error as Error & { code?: string }).code === "23503") throw new Error("No se puede eliminar la regla porque está siendo utilizada por una asignación o una excepción de producción.");
    throw error;
  }
}

export async function saveProductionOverride(input: ProductionOverrideInput) {
  if (useMemoryStore) {
    const existing = memoryProductionOverrides.find((item) => item.date === input.date && String(item.resourceId) === String(input.resourceId) && String(item.capacityRuleId ?? "") === String(input.capacityRuleId ?? "") && (item.productId ?? "") === (input.productId ?? ""));
    const value: ProductionDailyOverride = { ...input, id: existing?.id ?? `override-${memoryProductionId++}` };
    if (existing) Object.assign(existing, value); else memoryProductionOverrides.push(value);
    return value;
  }
  const id = await supabaseServerRequest<number>("/rest/v1/rpc/upsert_production_daily_override_v1", { method: "POST", body: JSON.stringify({ p_date: input.date, p_resource_id: input.resourceId, p_capacity_rule_id: input.capacityRuleId ?? null, p_product_id: input.productId ?? null, p_normal_units: input.normalUnitsPerDay ?? null, p_maximum_units: input.maximumUnitsPerDay ?? null, p_available: input.available, p_external_status: input.externalStatus ?? null, p_reason: input.reason.trim(), p_responsible: input.responsible.trim() }) });
  return { ...input, id };
}

function findMemoryAllocation(id: number | string) {
  for (const order of memoryOrders) for (const line of order.lines) {
    const allocation = (line.productionAllocations ?? []).find((item) => String(item.id) === String(id));
    if (allocation) return { order, line, allocation };
  }
  return null;
}

export async function confirmProductionAllocation(id: number | string, resourceId: number | string, capacityRuleId: number | string, overloadNote?: string) {
  if (!useMemoryStore) {
    await supabaseServerRequest<boolean>("/rest/v1/rpc/confirm_production_allocation_v1", { method: "POST", body: JSON.stringify({ p_allocation_id: id, p_resource_id: resourceId, p_capacity_rule_id: capacityRuleId, p_overload_note: overloadNote?.trim() || null }) });
    return true;
  }
  const found = findMemoryAllocation(id);
  if (!found || found.allocation.status !== "draft") throw new Error("Solo se confirman asignaciones en borrador.");
  const rule = memoryProductionRules.find((item) => String(item.id) === String(capacityRuleId));
  if (!rule || String(rule.resourceId) !== String(resourceId) || rule.productId !== found.line.productId || rule.validFrom > found.allocation.plannedDate || rule.validTo && rule.validTo < found.allocation.plannedDate) throw new Error("Seleccione una regla vigente para el recurso y producto.");
  const previousResource = found.allocation.productionResourceId;
  const previousRule = found.allocation.capacityRuleId;
  found.allocation.productionResourceId = resourceId;
  found.allocation.capacityRuleId = capacityRuleId;
  const snapshot = await getCapacity(found.allocation.plannedDate, found.allocation.plannedDate);
  const resource = snapshot.production.days[0].resources.find((item) => String(item.resource.id) === String(resourceId));
  if (!resource || resource.status === "unavailable" || resource.status === "missing_rule" || resource.status === "overloaded") {
    found.allocation.productionResourceId = previousResource;
    found.allocation.capacityRuleId = previousRule;
    throw new Error(resource?.status === "unavailable" ? "El recurso no está disponible en esa fecha." : resource?.status === "overloaded" ? "La asignación supera la capacidad máxima del recurso." : "No se pudo calcular la capacidad de la asignación.");
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
  const reversedBy = new Map(rows.filter((row) => row.reversal_of_batch_id !== null).map((row) => [String(row.reversal_of_batch_id), row.id]));
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
  const rows = await supabaseRequest<DbStockMovementRow[]>("/rest/v1/stock_movements?select=*&order=performed_at.asc,id.asc");
  return rows.map(mapStockMovement);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function treatmentDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export async function getTreatmentDashboard(date: string): Promise<TreatmentDashboard> {
  const start = addDays(date, -6);
  const end = addDays(date, 1);
  const batches = useMemoryStore
    ? memoryTreatmentBatches.filter((batch) => treatmentDateKey(batch.performedAt) >= start && treatmentDateKey(batch.performedAt) < end)
    : await loadDatabaseTreatmentBatches(`performed_at=gte.${encodeURIComponent(`${start}T00:00:00-03:00`)}&performed_at=lt.${encodeURIComponent(`${end}T00:00:00-03:00`)}`);
  const balances = calculateStockBalances(await getStockMovements());
  const dayBatches = batches.filter((batch) => treatmentDateKey(batch.performedAt) === date);
  const summary = summarizeTreatmentDay(date, dayBatches.map((batch) => ({ ...batch, performedAt: `${date}T12:00:00Z` })), balances);
  const trend = Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((trendDate) => {
    const entries = batches.filter((batch) => treatmentDateKey(batch.performedAt) === trendDate);
    return {
      date: trendDate,
      processed: entries.filter((batch) => batch.status === "posted").reduce((sum, batch) => sum + batch.quantity, 0),
      rejected: entries.filter((batch) => batch.status === "rejected").reduce((sum, batch) => sum + batch.quantity, 0),
    };
  });
  return { date, summary, trend, batches: dayBatches.sort((a, b) => b.performedAt.localeCompare(a.performedAt)) };
}

export async function getTreatmentOptions(): Promise<TreatmentProductOption[]> {
  const [products, movements, clients, orders] = await Promise.all([getProducts(), getStockMovements(), getClients(), getOrders()]);
  const relations = useMemoryStore
    ? memoryClientProducts.filter((item) => item.active)
    : (await supabaseRequest<DbClientProductRow[]>(`/rest/v1/client_products?select=${masterSelect}&active=eq.true&order=display_order.asc,id.asc`)).map(mapClientProduct);
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
    const destinations: TreatmentDestination[] = [{ key: `client:${relation.id}`, label: base.clientName, ...base }];
    for (const order of orders.filter((item) => getOrderStage(item) !== "completado")) for (const line of order.lines.filter((item) => String(item.clientProductId) === String(relation.id))) {
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
  line.readyReservedQuantity = 0;
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
  if (!product || !product.requiresTreatment) throw new Error("El producto no requiere Marcado.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  if (!input.responsible.trim()) throw new Error("Indique quién realizó el marcado.");
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
    if (!relation.active || relation.productId !== product.id) throw new Error("El cliente/producto no está activo o no coincide con el producto.");
    const activeControls = relation.controls.filter((control) => control.active);
    if (!activeControls.length || input.controls.length !== activeControls.length) throw new Error("Complete todos los puntos de control activos.");
    if (input.controls.some((check) => !activeControls.some((control) => String(control.id) === String(check.controlId)))) throw new Error("Uno de los controles no pertenece a la ficha seleccionada.");
  } else if (input.controls.length || !input.note?.trim()) throw new Error("Justifique el registro como stock general.");
  const failed = input.controls.filter((control) => control.result === "fail");
  if (failed.some((control) => !control.note?.trim())) throw new Error("Explique cada control no conforme.");
  if (failed.length && !input.note?.trim()) throw new Error("Explique el rechazo del lote.");
  const balances = calculateStockBalances(memoryStockMovements);
  const previous = balances.get(product.id) ?? { pending: 0, ready: 0 };
  const status: TreatmentBatchStatus = failed.length ? "rejected" : "posted";
  if (status === "posted" && previous.pending < input.quantity) throw new Error("El stock pendiente no alcanza para confirmar el marcado.");
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

type DbStockRiskRow = {
  product_id: string;
  pending_quantity: number;
  ready_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  physical_quantity: number;
  daily_consumption: number | string;
  weekly_consumption: number | string;
  safety_stock: number;
  days_to_break: number | string | null;
  risk_level: StockRiskLevel;
  estimated_break_date: string | null;
  last_movement_at: string | null;
};

export async function getStockSummary(): Promise<StockSummaryRow[]> {
  const products = (await getProducts()).filter((product) => product.stockActive !== false);
  if (useMemoryStore) {
    const balances = calculateStockBalances(memoryStockMovements);
    return products.map((product) => {
      const balance = balances.get(product.id) ?? { pending: 0, ready: 0 };
      const reserved = memoryStockReservations.filter((item) => item.productId === product.id && item.status === "active").reduce((sum, item) => sum + item.quantity, 0);
      const rules = memoryConsumptionRules.filter((item) => item.productId === product.id);
      const dailyConsumption = rules.reduce((sum, item) => sum + item.dailyConsumption, 0);
      const safetyStock = rules.reduce((sum, item) => sum + item.safetyStock, 0);
      const available = balance.ready - reserved;
      const daysToBreak = dailyConsumption > 0 ? Math.max(available - safetyStock, 0) / dailyConsumption : undefined;
      return { product, pending: balance.pending, ready: balance.ready, reserved, available, physical: balance.pending + balance.ready, dailyConsumption, weeklyConsumption: rules.reduce((sum, item) => sum + item.dailyConsumption * item.workdaysPerWeek, 0), safetyStock, daysToBreak, riskLevel: classifyStockRisk(daysToBreak) };
    });
  }
  const [rows, orders] = await Promise.all([
    supabaseRequest<DbStockRiskRow[]>("/rest/v1/stock_risk?select=*&order=risk_level.asc,days_to_break.asc.nullslast,product_id.asc"),
    getOrders(),
  ]);
  const productMap = new Map(products.map((product) => [product.id, product]));
  return rows.map<StockSummaryRow>((row) => {
    const deliveries = orders.flatMap((order) => (order.shipments ?? []).filter((shipment) => !["cancelled", "delivered"].includes(shipment.status)).flatMap((shipment) => shipment.lines.flatMap((shipmentLine) => {
      const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
      return orderLine?.productId === row.product_id ? [{ date: shipment.plannedDate, quantity: shipmentLine.plannedQuantity, client: order.client }] : [];
    }))).sort((a, b) => a.date.localeCompare(b.date));
    return {
      product: productMap.get(row.product_id) ?? { id: row.product_id, kind: "Pallet", requiresTreatment: false, stockName: row.product_id },
      pending: row.pending_quantity,
      ready: row.ready_quantity,
      reserved: row.reserved_quantity,
      available: row.available_quantity,
      physical: row.physical_quantity,
      dailyConsumption: Number(row.daily_consumption),
      weeklyConsumption: Number(row.weekly_consumption),
      safetyStock: row.safety_stock,
      daysToBreak: row.days_to_break === null ? undefined : Number(row.days_to_break),
      estimatedBreakDate: row.estimated_break_date ?? undefined,
      riskLevel: row.risk_level,
      nextDelivery: deliveries[0],
      lastMovementAt: row.last_movement_at ?? undefined,
    };
  });
}

export async function getStockDetail(productId: string): Promise<StockDetail | null> {
  const summary = (await getStockSummary()).find((row) => row.product.id === productId);
  if (!summary) return null;
  if (useMemoryStore) {
    const projection = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() + index);
      return { date: date.toISOString().slice(0, 10), incoming: 0, plannedOutgoing: 0, dailyOutgoing: summary.dailyConsumption, projectedAvailable: summary.available - summary.dailyConsumption * (index + 1) };
    });
    return { summary, movements: memoryStockMovements.filter((movement) => movement.productId === productId).sort((a, b) => b.performedAt.localeCompare(a.performedAt)), projection, consumption: memoryConsumptionRules.filter((rule) => rule.productId === productId) };
  }
  const [movementRows, projectionRows, consumptionRows] = await Promise.all([
    supabaseRequest<DbStockMovementRow[]>(`/rest/v1/stock_movements?select=*&product_id=eq.${encodeURIComponent(productId)}&order=performed_at.desc,id.desc&limit=150`),
    supabaseRequest<Array<{ projection_date: string; incoming: number | string; planned_outgoing: number | string; daily_outgoing: number | string; projected_available: number | string }>>(`/rest/v1/stock_daily_projection?select=*&product_id=eq.${encodeURIComponent(productId)}&order=projection_date.asc`),
    supabaseRequest<Array<{ id: number; client_id: string; daily_consumption: number | string; workdays_per_week: number; safety_stock: number; valid_from: string; valid_to: string | null; source: string; note: string | null; clients: { name: string } | Array<{ name: string }> }>>(`/rest/v1/client_product_consumption?select=*,clients(name)&product_id=eq.${encodeURIComponent(productId)}&order=valid_from.desc,id.desc`),
  ]);
  const projection: StockProjectionPoint[] = projectionRows.map((row) => ({ date: row.projection_date, incoming: Number(row.incoming), plannedOutgoing: Number(row.planned_outgoing), dailyOutgoing: Number(row.daily_outgoing), projectedAvailable: Number(row.projected_available) }));
  const consumption: StockConsumptionRule[] = consumptionRows.map((row) => ({ id: row.id, clientId: row.client_id, clientName: (Array.isArray(row.clients) ? row.clients[0]?.name : row.clients?.name) ?? row.client_id, dailyConsumption: Number(row.daily_consumption), workdaysPerWeek: row.workdays_per_week, safetyStock: row.safety_stock, validFrom: row.valid_from, validTo: row.valid_to ?? undefined, source: row.source, note: row.note ?? undefined }));
  return { summary, movements: movementRows.map(mapStockMovement), projection, consumption };
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

export async function createConsumptionRule(input: { clientId: string; productId: string; dailyConsumption: number; workdaysPerWeek: number; safetyStock: number; validFrom: string; validTo?: string; source: string; note?: string }) {
  if (!useMemoryStore) return supabaseServerRequest<number>("/rest/v1/rpc/upsert_client_product_consumption_v1", { method: "POST", body: JSON.stringify({ p_client_id: input.clientId, p_product_id: input.productId, p_daily_consumption: input.dailyConsumption, p_workdays_per_week: input.workdaysPerWeek, p_safety_stock: input.safetyStock, p_valid_from: input.validFrom, p_valid_to: input.validTo || null, p_source: input.source.trim(), p_note: input.note?.trim() || null }) });
  const rule = { ...input, id: `consumption-${crypto.randomUUID()}`, clientName: memoryClients.find((client) => client.id === input.clientId)?.name ?? input.clientId };
  memoryConsumptionRules.push(rule);
  return rule.id;
}
