import {
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
  type Client,
  type Product,
  type ProductKind,
  type ProductionSource,
  type TransportSource,
  type CapacityOperation,
  type CapacityStatus,
} from "../data";
import {
  buildCapacitySnapshot,
  type CapacityAdjustment,
  type CapacityRule,
  type ExternalProductionDefault,
  type InternalProductionDefault,
  type TransportCapacityDefault,
} from "../capacity";
import { supabaseRequest } from "../lib/supabase";

export type CreateOrderInput = {
  client: string;
  product: string;
  requested: number;
  orderDate: string;
  requestedDeliveryDate: string;
  plannedDate: string;
  transport: string;
  reference?: string;
  zetaCode?: string;
  deliveryAddress?: string;
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
  treatment?: Product["treatment"];
};

export type CreateProductInput = UpdateProductInput;
export type CreateClientInput = { name: string; address?: string; department?: string };

type DbLine = { id: string; product: string; quantity: number; preparation: string | null; position: number };
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
const memoryClients: Client[] = [...new Set(seededOrders.map((order) => order.client))].map((name, index) => ({ id: `cliente-${index + 1}`, name }));
const memoryCapacityRules: CapacityRule[] = [];
const memoryInternalDefaults: InternalProductionDefault[] = [];
const memoryExternalDefaults: ExternalProductionDefault[] = [];
const memoryTransportDefaults: TransportCapacityDefault[] = [];
const memoryCapacityAdjustments: CapacityAdjustment[] = [];
function mapOrder(row: DbOrder): OperationOrder {
  return {
    id: row.id,
    reference: row.reference,
    client: row.client,
    product: row.product,
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
    requiredOperations: row.required_operations ?? ["assembly"],
    transportSource: row.transport_source ?? (row.transport.toLocaleLowerCase() === "interno" || row.transport.toLocaleLowerCase() === "propio" ? "internal" : "external"),
    transportProviderId: row.transport_provider_id ?? undefined,
    lines: [...(row.order_lines ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({ id: line.id, product: line.product, quantity: line.quantity, preparation: line.preparation ?? undefined })),
  };
}

async function getDatabaseOrder(id: string) {
  const query = new URLSearchParams({ select: "*,order_lines(*)", id: `eq.${id}`, "order_lines.order": "position.asc" });
  const rows = await supabaseRequest<DbOrder[]>(`/rest/v1/orders?${query}`);
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function getOrders() {
  if (useMemoryStore) return memoryOrders;
  const query = new URLSearchParams({ select: "*,order_lines(*)", order: "created_at.asc", "order_lines.order": "position.asc" });
  const rows = await supabaseRequest<DbOrder[]>(`/rest/v1/orders?${query}`);
  return rows.map(mapOrder);
}

export async function getProviders() {
  if (useMemoryStore) return seededProviders;
  const query = new URLSearchParams({ select: "id,name,type,supplies", order: "type.asc,name.asc" });
  return supabaseRequest<Provider[]>(`/rest/v1/providers?${query}`);
}

export async function getProducts() {
  if (useMemoryStore) return memoryProducts;
  const query = new URLSearchParams({
    select: "id,kind,measure,treatment",
    order: "kind.asc,measure.asc",
  });
  return supabaseRequest<Product[]>(`/rest/v1/products?${query}`);
}

export async function getClients() {
  if (useMemoryStore) return memoryClients;
  return supabaseRequest<Client[]>("/rest/v1/clients?select=id,name,address,department&order=name.asc");
}

export async function createClient(input: CreateClientInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Indique el nombre del cliente.");
  if (!useMemoryStore) {
    const id = await supabaseRequest<string>("/rest/v1/rpc/create_operation_client", { method: "POST", body: JSON.stringify({ p_name: name, p_address: input.address?.trim() || null, p_department: input.department?.trim() || null }) });
    const client = (await getClients()).find((item) => item.id === id);
    if (!client) throw new Error("El cliente se creó pero no pudo recuperarse.");
    return client;
  }
  if (memoryClients.some((client) => client.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) throw new Error("Ese cliente ya existe.");
  const client = { id: `cliente-${Date.now()}`, name, address: input.address?.trim() || undefined, department: input.department?.trim() || undefined };
  memoryClients.push(client);
  return client;
}

export async function createProduct(input: CreateProductInput) {
  const measure = input.measure?.trim() || undefined;
  if (!useMemoryStore) {
    const id = await supabaseRequest<string>("/rest/v1/rpc/create_catalog_product", {
      method: "POST",
      body: JSON.stringify({ p_kind: input.kind, p_measure: measure ?? null, p_treatment: input.treatment ?? null }),
    });
    const product = (await getProducts()).find((item) => item.id === id);
    if (!product) throw new Error("El producto se creó pero no pudo recuperarse.");
    return product;
  }
  if (memoryProducts.some((product) => product.kind === input.kind && (product.measure ?? "") === (measure ?? ""))) throw new Error("Ya existe un producto con ese tipo y medida.");
  const product = { id: `producto-${Date.now()}`, kind: input.kind, measure, treatment: input.treatment } satisfies Product;
  memoryProducts.push(product);
  return product;
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const measure = input.measure?.trim() || undefined;

  if (!useMemoryStore) {
    await supabaseRequest<string>("/rest/v1/rpc/update_catalog_product", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_kind: input.kind,
        p_measure: measure ?? null,
        p_treatment: input.treatment ?? null,
      }),
    });
    const products = await getProducts();
    const product = products.find((item) => item.id === id);
    if (!product) throw new Error("El producto se actualizó pero no pudo recuperarse.");
    return product;
  }

  const product = memoryProducts.find((item) => item.id === id);
  if (!product) throw new Error("Producto no encontrado.");
  Object.assign(product, { kind: input.kind, measure, treatment: input.treatment });
  return product;
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
  if (!useMemoryStore) {
    const id = await supabaseRequest<string>("/rest/v1/rpc/create_operation_order_v2", {
      method: "POST",
      body: JSON.stringify({
        p_client: input.client.trim(),
        p_product: input.product.trim(),
        p_requested: input.requested,
        p_order_date: input.orderDate,
        p_requested_delivery_date: input.requestedDeliveryDate,
        p_planned_date: input.plannedDate,
        p_reference: input.reference?.trim() || null,
        p_zeta_code: input.zetaCode?.trim() || null,
        p_delivery_address: input.deliveryAddress?.trim() || null,
        p_notes: input.notes?.trim() || null,
        p_stage: input.stage ?? "negociacion",
        p_production_source: input.productionSource,
        p_producer_provider_id: input.producerProviderId ?? null,
        p_production_date: input.productionDate ?? null,
        p_import_arrival_date: input.importArrivalDate ?? null,
        p_required_operations: input.requiredOperations,
        p_transport_source: input.transportSource,
        p_transport_provider_id: input.transportProviderId ?? null,
      }),
    });
    const order = await getDatabaseOrder(id);
    if (!order) throw new Error("El pedido se creó pero no pudo recuperarse.");
    return order;
  }

  const id = `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const order: OperationOrder = {
    id,
    reference: input.reference?.trim() || `Pedido ${memoryOrders.length + 1}`,
    client: input.client.trim(),
    product: input.product.trim(),
    requested: input.requested,
    delivered: 0,
    pending: input.requested,
    stage: input.stage ?? "negociacion",
    orderDate: input.orderDate,
    requestedDeliveryDate: input.requestedDeliveryDate,
    zetaCode: input.zetaCode?.trim() || undefined,
    plannedDate: input.plannedDate,
    dateLabel: formatPlannedDate(input.plannedDate),
    transport: input.transport.trim(),
    transportSource: input.transportSource,
    transportProviderId: input.transportProviderId,
    productionSource: input.productionSource,
    producerProviderId: input.producerProviderId,
    productionDate: input.productionDate,
    importArrivalDate: input.importArrivalDate,
    requiredOperations: input.requiredOperations,
    supply: input.stage === "produccion" ? "Producción planificada" : "Pendiente de asignación",
    preparation: "Pendiente de preparación",
    logistics: `${input.transport.trim()} · entrega planificada`,
    delivery: `0 de ${input.requested} entregados`,
    action: input.stage === "logistica" ? "Coordinar la entrega." : "Preparar y coordinar la entrega.",
    deliveryAddress: input.deliveryAddress?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    lines: [{ id: `${id}-1`, product: input.product.trim(), quantity: input.requested }],
    source: "Alta desde dashboard",
  };
  memoryOrders.unshift(order);
  return order;
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
    await supabaseRequest<string>("/rest/v1/rpc/update_operation_order_v2", {
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
        p_required_operations: changes.requiredOperations ?? current.requiredOperations ?? ["assembly"],
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
type DbExternalDefault = { id: string; provider_id: string; operation: CapacityOperation; pallet_capacity: number; status: ExternalProductionDefault["status"] };
type DbTransportDefault = { id: string; source: TransportSource; provider_id: string | null; pallet_capacity: number; status: TransportCapacityDefault["status"] };
type DbCapacityAdjustment = { adjustment_date: string; resource_type: CapacityAdjustment["resourceType"]; operation: CapacityOperation | null; source: TransportSource | null; provider_id: string | null; pallet_adjustment: number; responsible: string | null; status: CapacityStatus | null };

export async function getCapacity(from: string, to: string) {
  if (useMemoryStore) return buildCapacitySnapshot({ from, to, rules: memoryCapacityRules, internalDefaults: memoryInternalDefaults, externalDefaults: memoryExternalDefaults, transportDefaults: memoryTransportDefaults, adjustments: memoryCapacityAdjustments, orders: memoryOrders, providers: seededProviders });
  const range = `adjustment_date=gte.${from}&adjustment_date=lte.${to}`;
  const [rules, internal, external, transport, adjustments, orders, providers] = await Promise.all([
    supabaseRequest<DbCapacityRule[]>("/rest/v1/capacity_rules?select=operation,people_count,pallet_capacity&order=operation.asc,people_count.asc"),
    supabaseRequest<DbInternalDefault[]>("/rest/v1/internal_production_defaults?select=operation,people_count,manual_capacity"),
    supabaseRequest<DbExternalDefault[]>("/rest/v1/external_production_defaults?select=id,provider_id,operation,pallet_capacity,status"),
    supabaseRequest<DbTransportDefault[]>("/rest/v1/transport_capacity_defaults?select=id,source,provider_id,pallet_capacity,status"),
    supabaseRequest<DbCapacityAdjustment[]>(`/rest/v1/capacity_daily_adjustments?select=adjustment_date,resource_type,operation,source,provider_id,pallet_adjustment,responsible,status&${range}`),
    getOrders(), getProviders(),
  ]);
  return buildCapacitySnapshot({
    from, to, orders, providers,
    rules: rules.map((item) => ({ operation: item.operation, peopleCount: item.people_count, palletCapacity: item.pallet_capacity })),
    internalDefaults: internal.map((item) => ({ operation: item.operation, peopleCount: item.people_count, manualCapacity: item.manual_capacity ?? undefined })),
    externalDefaults: external.map((item) => ({ id: item.id, providerId: item.provider_id, operation: item.operation, palletCapacity: item.pallet_capacity, status: item.status })),
    transportDefaults: transport.map((item) => ({ id: item.id, source: item.source, providerId: item.provider_id ?? undefined, palletCapacity: item.pallet_capacity, status: item.status })),
    adjustments: adjustments.map((item) => ({ date: item.adjustment_date, resourceType: item.resource_type, operation: item.operation ?? undefined, source: item.source ?? undefined, providerId: item.provider_id ?? undefined, palletAdjustment: item.pallet_adjustment, responsible: item.responsible ?? undefined, status: item.status ?? undefined })),
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

export async function saveInternalProduction(value: InternalProductionDefault) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_internal_production_default", { method: "POST", body: JSON.stringify({ p_operation: value.operation, p_people_count: value.peopleCount, p_manual_capacity: value.manualCapacity ?? null }) });
  else upsertMemory(memoryInternalDefaults, (item) => item.operation === value.operation, value);
  return value;
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

export async function saveCapacityAdjustment(value: CapacityAdjustment) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_capacity_daily_adjustment", { method: "POST", body: JSON.stringify({ p_date: value.date, p_resource_type: value.resourceType, p_operation: value.operation ?? null, p_source: value.source ?? null, p_provider_id: value.providerId ?? null, p_pallet_adjustment: value.palletAdjustment, p_responsible: value.responsible?.trim() || null, p_status: value.status ?? null }) });
  else upsertMemory(memoryCapacityAdjustments, (item) => item.date === value.date && item.resourceType === value.resourceType && (item.operation ?? "") === (value.operation ?? "") && (item.source ?? "") === (value.source ?? "") && (item.providerId ?? "") === (value.providerId ?? ""), value);
  return value;
}
