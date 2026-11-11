import { getOrderOperationalStatus, type OperationOrder, type Product } from "./data";
import type { StockMovement, StockState } from "./treatment";

export type StockInventoryScope = "general" | "pamer";

function isPamer(name: string) { return name.trim().toLocaleLowerCase("es") === "pamer"; }

export function scopeStockInventory(rows: StockSummaryRow[], orders: OperationOrder[]): StockSummaryRow[] {
  const pamerOrderProducts = new Set<string>();
  for (const order of orders) {
    if (!isPamer(order.client)) continue;
    for (const line of order.lines) {
      if (line.productId) pamerOrderProducts.add(line.productId);
    }
  }
  return rows.map((row) => {
    if (row.inventoryScope) return row;
    const { product } = row;
    const clientNames = product.clientNames ?? [];
    const pamer = product.sourceCatalog === "Pamer" || (clientNames.length > 0 && clientNames.every(isPamer))
      || (!product.clientNames?.length && pamerOrderProducts.has(product.id));
    return { ...row, inventoryScope: pamer ? "pamer" : "general" };
  });
}

export type StockQuantityField = "pending" | "ready" | "reserved" | "available";

export type StockOrderCommitment = {
  orderId: string;
  reference: string;
  client: string;
  pending: number;
  ready: number;
};

export type StockSummaryRow = {
  product: Product;
  inventoryScope?: StockInventoryScope;
  pending: number;
  ready: number;
  reserved: number;
  available: number;
  physical: number;
  nextDelivery?: { date: string; quantity: number; client: string };
  lastMovementAt?: string;
  orderCommitments?: StockOrderCommitment[];
};

export function stockQuantityBreakdown(row: StockSummaryRow, field: StockQuantityField) {
  const includesPending = field === "pending" || field === "reserved";
  const includesReady = field === "ready" || field === "reserved";
  const readyReserved = Math.max(row.ready - row.available, 0);
  const pendingReserved = Math.max(row.reserved - readyReserved, 0);
  const expectedPending = includesPending ? pendingReserved : 0;
  const expectedReady = includesReady ? readyReserved : 0;
  const entries = (row.orderCommitments ?? []).map((entry) => ({
    ...entry,
    pending: includesPending ? entry.pending : 0,
    ready: includesReady ? entry.ready : 0,
  })).filter((entry) => entry.pending + entry.ready > 0);
  const linkedPending = entries.reduce((sum, entry) => sum + entry.pending, 0);
  const linkedReady = entries.reduce((sum, entry) => sum + entry.ready, 0);
  return {
    entries,
    unassigned: Math.max(row[field] - expectedPending - expectedReady, 0),
    unidentified: Math.max(expectedPending - linkedPending, 0) + Math.max(expectedReady - linkedReady, 0),
    exceedsBalance: linkedPending > expectedPending || linkedReady > expectedReady,
  };
}

export type StockDetail = {
  summary: StockSummaryRow;
  movements: StockMovement[];
};

export function movementStateLabel(state: StockState) {
  return state === "pending_treatment" ? "Pendiente de HT" : "Listo";
}

export function balanceAfterMovement(current: number, movement: Pick<StockMovement, "quantity">) {
  return current + movement.quantity;
}

export function orderStockReservations(orders: OperationOrder[], products: Product[]) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const reserved = new Map<string, { pending: number; ready: number; orders: StockOrderCommitment[] }>();
  for (const order of orders.filter((item) => getOrderOperationalStatus(item) !== "cancelled")) for (const line of order.lines) {
    if (!line.productId) continue;
    const producedForOrder = (line.productionAllocations ?? []).reduce((sum, allocation) => sum + (allocation.status === "completed" && allocation.resultDestination !== "stock" ? Math.max(allocation.actualQuantity ?? 0, 0) : 0), 0);
    const treated = line.treatedQuantity ?? 0;
    const shipmentLines = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled").flatMap((shipment) => shipment.lines.filter((item) => item.orderLineId === line.id).map((item) => ({ item, dispatched: Boolean(shipment.dispatchedAt) || shipment.status === "dispatched" })));
    const delivered = shipmentLines.reduce((sum, { item }) => sum + item.deliveredQuantity, 0);
    const shipped = shipmentLines.reduce((sum, { item, dispatched }) => sum + (dispatched ? item.loadedQuantity ?? item.plannedQuantity : item.deliveredQuantity), 0);
    const openQuantity = Math.max(line.quantity - delivered, 0);
    const requiresTreatment = productMap.get(line.productId)?.requiresTreatment === true;
    const readyForOrder = requiresTreatment ? treated : producedForOrder;
    const ready = Math.min(openQuantity, Math.max(readyForOrder - shipped, line.readyReservedQuantity ?? 0, 0));
    const pending = Math.min(Math.max(openQuantity - ready, 0), requiresTreatment ? Math.max(producedForOrder - treated, 0) : 0);
    if (pending === 0 && ready === 0) continue;
    const current = reserved.get(line.productId) ?? { pending: 0, ready: 0, orders: [] };
    current.pending += pending;
    current.ready += ready;
    const commitment = current.orders.at(-1);
    if (commitment?.orderId === order.id) {
      commitment.pending += pending;
      commitment.ready += ready;
    } else {
      current.orders.push({ orderId: order.id, reference: order.reference, client: order.client, pending, ready });
    }
    reserved.set(line.productId, current);
  }
  return reserved;
}
