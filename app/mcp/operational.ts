import {
  getOrderOperationalStatus,
  getOrderPlannedDate,
  isOrderClosed,
  orderOperationalStatusLabels,
  type OperationOrder,
} from "../data";
export type AlertSeverity = "critical" | "high" | "medium";

export type OperationalAlert = {
  id: string;
  severity: AlertSeverity;
  kind: "overdue" | "treatment" | "transport" | "production";
  orderId?: string;
  reference?: string;
  client?: string;
  plannedDate?: string;
  title: string;
  detail: string;
  action: string;
};

export type OperationalFilters = {
  from: string;
  to: string;
  clients?: string[];
};

const severityRank: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function dateDiffInDays(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function openShipmentDate(order: OperationOrder) {
  return (order.shipments ?? [])
    .filter((shipment) => !["delivered", "cancelled"].includes(shipment.status))
    .map((shipment) => shipment.plannedDate)
    .sort()[0] ?? getOrderPlannedDate(order);
}

export function filterOperationalOrders(orders: OperationOrder[], filters: OperationalFilters) {
  const clientSet = new Set((filters.clients ?? []).map(normalize).filter(Boolean));
  return orders.filter((order) => {
    if (isOrderClosed(order)) return false;
    const date = openShipmentDate(order);
    if (date < filters.from || date > filters.to) return false;
    return clientSet.size === 0 || clientSet.has(normalize(order.client));
  });
}

export function buildOperationalAlerts(orders: OperationOrder[], today: string): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  for (const order of orders) {
    const plannedDate = openShipmentDate(order);
    const daysUntilDelivery = dateDiffInDays(today, plannedDate);
    const base = { orderId: order.id, reference: order.reference, client: order.client, plannedDate };

    if (daysUntilDelivery < 0) {
      alerts.push({
        ...base,
        id: `overdue:${order.id}`,
        severity: "critical",
        kind: "overdue",
        title: `${order.client}: entrega atrasada`,
        detail: `${order.reference} debía entregarse el ${plannedDate} y mantiene ${order.pending} unidades pendientes.`,
        action: "Confirmar una nueva fecha y registrar el motivo de la reprogramación.",
      });
    }

    for (const line of order.lines) {
      const treatmentPending = line.treatmentPendingQuantity;
      if (line.treatment && typeof treatmentPending === "number" && treatmentPending > 0 && daysUntilDelivery <= 3) {
        alerts.push({
          ...base,
          id: `treatment:${order.id}:${line.id}`,
          severity: daysUntilDelivery <= 1 ? "critical" : "high",
          kind: "treatment",
          title: `${order.client}: HT pendiente`,
          detail: `${line.product}: faltan tratar con HT ${treatmentPending} unidades y la entrega está prevista para el ${plannedDate}.`,
          action: "Programar o confirmar el HT antes de preparar la carga.",
        });
      }

      const activeAllocations = (line.productionAllocations ?? []).filter((allocation) => allocation.status !== "cancelled");
      const allocated = activeAllocations.reduce((sum, allocation) => sum + allocation.plannedQuantity, 0);
      if (allocated < line.quantity && daysUntilDelivery <= 7) {
        alerts.push({
          ...base,
          id: `production:${order.id}:${line.id}`,
          severity: daysUntilDelivery <= 3 ? "high" : "medium",
          kind: "production",
          title: `${order.client}: producción incompleta`,
          detail: `${line.product}: hay ${allocated} de ${line.quantity} unidades asignadas a producción.`,
          action: "Completar la asignación de producción o definir otra fuente de abastecimiento.",
        });
      }
    }

    const openShipments = (order.shipments ?? []).filter((shipment) => !["delivered", "cancelled"].includes(shipment.status));
    const transportMissing = openShipments.length === 0 || openShipments.some((shipment) => {
      const label = normalize(shipment.transportLabel ?? "");
      return !label || label === "transportista" || label === "no registrado";
    });
    if (transportMissing && daysUntilDelivery <= 3) {
      alerts.push({
        ...base,
        id: `transport:${order.id}`,
        severity: daysUntilDelivery <= 1 ? "critical" : "high",
        kind: "transport",
        title: `${order.client}: transporte sin confirmar`,
        detail: `${order.reference} está previsto para el ${plannedDate} y no tiene un transporte confirmado.`,
        action: "Asignar transporte o reprogramar la entrega.",
      });
    }
  }

  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]
    || (a.plannedDate ?? "9999-12-31").localeCompare(b.plannedDate ?? "9999-12-31")
    || a.title.localeCompare(b.title, "es"));
}

export function summarizeOrder(order: OperationOrder) {
  const status = getOrderOperationalStatus(order);
  return {
    id: order.id,
    reference: order.reference,
    client: order.client,
    status,
    statusLabel: orderOperationalStatusLabels[status],
    plannedDate: openShipmentDate(order),
    requestedDeliveryDate: order.requestedDeliveryDate,
    requested: order.requested,
    delivered: order.delivered,
    pending: order.pending,
    transport: order.transport,
    products: order.lines.map((line) => ({
      id: line.id,
      product: line.product,
      quantity: line.quantity,
      treatment: line.treatment,
      treatedQuantity: line.treatedQuantity,
      treatmentPendingQuantity: line.treatmentPendingQuantity,
      production: (line.productionAllocations ?? []).map((allocation) => ({
        date: allocation.plannedDate,
        quantity: allocation.plannedQuantity,
        actualQuantity: allocation.actualQuantity,
        status: allocation.status,
        resourceId: allocation.resourceId ?? allocation.productionResourceId,
      })),
    })),
    shipments: (order.shipments ?? []).map((shipment) => ({
      id: shipment.id,
      date: shipment.plannedDate,
      status: shipment.status,
      transport: shipment.transportLabel,
      remittance: shipment.remittance,
      quantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0),
    })),
    notes: order.notes,
    nextAction: order.action,
    source: order.source,
  };
}

