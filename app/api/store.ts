import {
  getOrderStage,
  orders as seededOrders,
  stageLabels,
  type DateDirection,
  type OperationOrder,
  type OrderChange,
  type OrderStatus,
} from "../data";

export type CreateOrderInput = {
  client: string;
  product: string;
  requested: number;
  dateLabel: string;
  transport: string;
  reference?: string;
};

export type UpdateOrderInput = Partial<Pick<OperationOrder, "status" | "transport" | "dateLabel" | "requested" | "stage">> & {
  dateDirection?: DateDirection;
};

const statusLabels: Record<OrderStatus, OperationOrder["statusLabel"]> = {
  bloqueado: "Bloqueado",
  coordinacion: "En coordinación",
  completado: "Completado",
};

const memoryOrders: OperationOrder[] = structuredClone(seededOrders);
const orderHistory = new Map<string, OrderChange[]>();

export function getOrders() {
  return memoryOrders;
}

export function createOrder(input: CreateOrderInput) {
  const status: OrderStatus = "coordinacion";
  const id = `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const order: OperationOrder = {
    id,
    reference: input.reference?.trim() || `Pedido ${memoryOrders.length + 1}`,
    client: input.client.trim(),
    product: input.product.trim(),
    requested: input.requested,
    delivered: 0,
    pending: input.requested,
    status,
    statusLabel: "En coordinación",
    stage: "negociacion",
    dateLabel: input.dateLabel.trim(),
    transport: input.transport.trim(),
    supply: "Pendiente de asignación",
    preparation: "Pendiente de preparación",
    logistics: `${input.transport.trim()} · entrega planificada`,
    delivery: `0 de ${input.requested} entregados`,
    action: "Preparar y coordinar la entrega.",
    lines: [{ id: `${id}-1`, product: input.product.trim(), quantity: input.requested }],
    source: "Alta desde dashboard",
  };

  memoryOrders.unshift(order);
  return order;
}

export function getOrderHistory(id: string) {
  return orderHistory.get(id) ?? [];
}

export function updateOrder(id: string, changes: UpdateOrderInput) {
  const order = memoryOrders.find((item) => item.id === id);
  if (!order) return null;

  if (typeof changes.requested === "number" && changes.requested < order.delivered) {
    throw new Error("La cantidad no puede ser menor que lo ya entregado.");
  }

  const recordedChanges: OrderChange["changes"] = [];

  if (typeof changes.dateLabel === "string" && changes.dateLabel.trim() && changes.dateLabel.trim() !== order.dateLabel) {
    order.originalDateLabel ??= order.dateLabel;
    recordedChanges.push({ field: "Fecha planificada", from: order.dateLabel, to: changes.dateLabel.trim() });
    order.dateLabel = changes.dateLabel.trim();
  }

  if (typeof changes.requested === "number" && changes.requested !== order.requested) {
    recordedChanges.push({ field: "Cantidad de pallets", from: String(order.requested), to: String(changes.requested) });
    let remainingAdjustment = changes.requested - order.requested;
    for (const line of [...order.lines].reverse()) {
      if (remainingAdjustment >= 0) {
        line.quantity += remainingAdjustment;
        remainingAdjustment = 0;
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
    order.transport = changes.transport.trim();
  }

  if (changes.stage && changes.stage !== getOrderStage(order)) {
    recordedChanges.push({ field: "Etapa", from: stageLabels[getOrderStage(order)], to: stageLabels[changes.stage] });
    order.stage = changes.stage;
    if (changes.stage === "completado") {
      order.status = "completado";
      order.statusLabel = "Completado";
    } else {
      order.status = "coordinacion";
      order.statusLabel = "En coordinación";
    }
  }

  if (changes.status && changes.status !== order.status) {
    recordedChanges.push({ field: "Estado", from: order.statusLabel, to: statusLabels[changes.status] });
    order.status = changes.status;
    order.statusLabel = statusLabels[changes.status];
  }

  const change = recordedChanges.length > 0 ? {
    id: `cambio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
    dateDirection: changes.dateDirection && changes.dateDirection !== "sin_cambio" ? changes.dateDirection : undefined,
    changes: recordedChanges,
  } satisfies OrderChange : undefined;

  if (change) {
    orderHistory.set(id, [change, ...getOrderHistory(id)]);
  }

  return { order, change };
}
