import { orders as seededOrders, type OperationOrder, type OrderStatus } from "../data";

export type CreateOrderInput = {
  client: string;
  product: string;
  requested: number;
  dateLabel: string;
  transport: string;
  reference?: string;
};

const memoryOrders: OperationOrder[] = structuredClone(seededOrders);

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
