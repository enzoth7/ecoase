import type { OperationOrder, Product } from "./data";
import type { StockSummaryRow } from "./stock";
import type { StockMovement } from "./treatment";

export type PalletClass = "small" | "large" | "unclassified";
export type LogisticsMode = "delivery" | "supplier_pickup" | "customer_pickup";
export type RouteStatus = "viable" | "tight" | "not_viable" | "no_data";

export type LogisticsDriver = { id: string; name: string; active: boolean };
export type LogisticsVehicle = {
  id: string; name: string; smallCapacity?: number; largeCapacity?: number;
  habitualDriverId?: string; lengthM?: number; widthM?: number; heightM?: number; weightT?: number; active: boolean;
};
export type LogisticsTransportCapacity = {
  id: string; kind: "provider" | "customer_pickup"; providerId?: string;
  largeCapacity?: number; smallCapacity?: number;
};
export type LogisticsClientDeliveryLimit = {
  clientId: string; distanceKm?: number; travelHours?: number; handlingMinutes?: number; routeCheckedAt?: string; ordersPerDay?: number;
};
export const PALLET_HEIGHT_ASSUMPTION_M = 0.1;
export const SMALL_REFERENCE_FOOTPRINT_M2 = 1.2;
export const LARGE_REFERENCE_FOOTPRINT_M2 = 2.2 * 1.17;

export function palletDimensionsCm(measure?: string): { lengthCm: number; widthCm: number } | undefined {
  const match = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?$/i.exec(measure?.trim() ?? "");
  if (!match) return undefined;
  const lengthCm = Number(match[1].replace(",", "."));
  const widthCm = Number(match[2].replace(",", "."));
  if (widthCm <= 0 || lengthCm <= 0) return undefined;
  return { lengthCm, widthCm };
}

export function palletFootprintM2(measure?: string): number | undefined {
  const dimensions = palletDimensionsCm(measure);
  return dimensions ? dimensions.lengthCm * dimensions.widthCm / 10_000 : undefined;
}

export function palletVolumeM3(product: Pick<Product, "measure" | "heightCm">): number | undefined {
  const footprintM2 = palletFootprintM2(product.measure);
  if (footprintM2 === undefined) return undefined;
  return footprintM2 * (product.heightCm ?? PALLET_HEIGHT_ASSUMPTION_M * 100) / 100;
}

export function estimatedTransportVolumeM3(smallCapacity?: number, largeCapacity?: number) {
  if (smallCapacity === undefined || largeCapacity === undefined
    || !Number.isInteger(smallCapacity) || !Number.isInteger(largeCapacity)
    || smallCapacity < 0 || largeCapacity < 0) return undefined;
  const bySmall = smallCapacity * SMALL_REFERENCE_FOOTPRINT_M2 * PALLET_HEIGHT_ASSUMPTION_M;
  const byLarge = largeCapacity * LARGE_REFERENCE_FOOTPRINT_M2 * PALLET_HEIGHT_ASSUMPTION_M;
  return { lower: Math.min(bySmall, byLarge), upper: Math.max(bySmall, byLarge) };
}
export function estimateDailyClientOrders(oneWayHours?: number, handlingMinutes?: number): number | undefined {
  if (oneWayHours === undefined || !Number.isFinite(oneWayHours) || oneWayHours < 0
    || handlingMinutes === undefined || !Number.isInteger(handlingMinutes) || handlingMinutes < 0) return undefined;
  const handlingHours = handlingMinutes / 60;
  if (oneWayHours + handlingHours === 0) return undefined;
  // Para N pedidos: N idas, N - 1 vueltas y N operaciones de carga y descarga.
  return Math.max(0, Math.floor((24 + oneWayHours) / (2 * oneWayHours + handlingHours) + 1e-9));
}
export type LogisticsSettings = {
  originAddress: string; originLatitude?: number; originLongitude?: number;
  originPrecision: "exact" | "city" | "unknown";
  shiftStart?: string; shiftEnd?: string; breakMinutes?: number;
  loadMinutes?: number; unloadMinutes?: number; marginMinutes?: number;
};
export type LogisticsLocation = {
  entityType: "client" | "provider"; entityId: string; address: string;
  latitude?: number; longitude?: number; precision: "exact" | "city" | "unknown"; verified: boolean;
};

export function isOutsidePaysanduCity(
  client: { address?: string; department?: string }, location?: Pick<LogisticsLocation, "latitude" | "longitude">,
): boolean {
  if (!client.address && !location) return false;
  if (client.department && client.department.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== "paysandu") return true;
  if (location?.latitude === undefined || location.longitude === undefined) return false;
  const latitudeDelta = (location.latitude + 32.318768141) * 111;
  const longitudeDelta = (location.longitude + 58.079021595) * 93;
  return Math.hypot(latitudeDelta, longitudeDelta) > 12;
}
export type LogisticsRun = {
  id: number | string; mode: LogisticsMode; shipmentId?: number | string;
  providerId?: string; orderId?: string; vehicleId?: string; driverId?: string;
  plannedDate: string; plannedStartAt?: string; plannedEndAt?: string;
  endTimeSource?: "manual" | "route";
  destinationAddress?: string; destinationLatitude?: number; destinationLongitude?: number;
  destinationPrecision?: "exact" | "city" | "unknown";
  routeDistanceM?: number; routeDurationS?: number; routeGeometry?: { type: "LineString"; coordinates: number[][] };
  routeCheckedAt?: string; routeStatus?: RouteStatus; routeReason?: string;
  status: "planned" | "completed" | "cancelled"; note?: string; responsible: string;
};
export type LineAvailability = {
  orderId: string; orderLineId: string; productId?: string; product: string;
  pending: number; readyAttributed: number; generalAssignable: number;
  pendingHT: number; inHT?: number; unproduced: number; unassigned: number;
  reservedForThisOrder: number; reservedForOtherTrips: number;
};

export function classifyPallet(product: Pick<Product, "kind" | "measure">, override?: PalletClass): PalletClass {
  if (override) return override;
  if (product.kind !== "Pallet") return "unclassified";
  const footprintM2 = palletFootprintM2(product.measure);
  if (footprintM2 === undefined) return "unclassified";
  return footprintM2 <= 1.2 ? "small" : "large";
}

export function loadWarnings(counts: Record<PalletClass, number>) {
  const warnings: string[] = [];
  if (counts.unclassified > 0) warnings.push("Hay productos sin tamaño logístico definido.");
  return warnings;
}

export function calculateLineAvailability(
  orders: OperationOrder[], stock: StockSummaryRow[], movements: StockMovement[],
  batches: Array<{ orderLineId?: string; quantity: number; status: "posted" | "rejected" | "reversal" }>,
): LineAvailability[] {
  const stockByProduct = new Map(stock.map((row) => [row.product.id, row]));
  const readyLeft = new Map(stock.map((row) => [row.product.id, Math.max(row.ready, 0)]));
  const pendingLeft = new Map(stock.map((row) => [row.product.id, Math.max(row.pending, 0)]));
  const rows = orders.flatMap((order) => order.lines.map((line) => {
    const pending = Math.max(line.quantity - (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled")
      .flatMap((shipment) => shipment.lines).filter((entry) => entry.orderLineId === line.id)
      .reduce((sum, entry) => sum + entry.deliveredQuantity, 0), 0);
    const own = movements.filter((movement) => movement.orderLineId === line.id);
    const producedReady = own.filter((movement) => movement.movementType === "production_receipt" && movement.stockState === "ready")
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const producedPending = own.filter((movement) => movement.movementType === "production_receipt" && movement.stockState === "pending_treatment")
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const dispatched = -own.filter((movement) => movement.movementType === "dispatch")
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const treated = batches.filter((batch) => batch.orderLineId === line.id)
      .reduce((sum, batch) => sum + (batch.status === "posted" ? batch.quantity : batch.status === "reversal" ? -batch.quantity : 0), 0);
    const productStock = stockByProduct.get(line.productId ?? "");
    const reservedForThisOrder = Math.max(line.readyReservedQuantity ?? 0, 0);
    const productId = line.productId ?? "";
    const readyAttributed = Math.min(pending, Math.max(producedReady + treated - dispatched, 0), readyLeft.get(productId) ?? 0);
    readyLeft.set(productId, (readyLeft.get(productId) ?? 0) - readyAttributed);
    const pendingHT = Math.min(Math.max(pending - readyAttributed, 0),
      Math.max(producedPending - treated, 0), pendingLeft.get(productId) ?? 0);
    pendingLeft.set(productId, (pendingLeft.get(productId) ?? 0) - pendingHT);
    const remaining = Math.max(pending - readyAttributed - pendingHT, 0);
    const physicallyProduced = Math.max(producedReady + producedPending - dispatched, 0);
    const unproduced = Math.min(remaining, Math.max(pending - physicallyProduced, 0));
    const unassigned = remaining - unproduced;
    return {
      orderId: order.id, orderLineId: line.id, productId: line.productId, product: line.product,
      pending, readyAttributed, generalAssignable: 0,
      pendingHT, inHT: undefined, unproduced, unassigned, reservedForThisOrder,
      reservedForOtherTrips: Math.max((productStock?.reserved ?? 0) - reservedForThisOrder, 0),
    };
  }));
  const attributed = new Map<string, number>();
  for (const row of rows) if (row.productId) attributed.set(row.productId,
    (attributed.get(row.productId) ?? 0) + row.readyAttributed);
  const generalLeft = new Map(stock.map((row) => [row.product.id,
    Math.max(Math.min(row.available, row.ready - (attributed.get(row.product.id) ?? 0)), 0)]));
  for (const row of rows) {
    if (!row.productId) continue;
    row.generalAssignable = Math.min(Math.max(row.pending - row.readyAttributed - row.pendingHT, 0),
      generalLeft.get(row.productId) ?? 0);
    generalLeft.set(row.productId, (generalLeft.get(row.productId) ?? 0) - row.generalAssignable);
    const resolvesUnassigned = Math.min(row.unassigned, row.generalAssignable);
    row.unassigned -= resolvesUnassigned;
    row.unproduced -= row.generalAssignable - resolvesUnassigned;
  }
  return rows;
}

export function tripWarnings(run: LogisticsRun, runs: LogisticsRun[], settings: LogisticsSettings): string[] {
  const warnings: string[] = [];
  if (!run.plannedStartAt || !run.plannedEndAt)
    warnings.push("Faltan horarios para evaluar la vuelta.");
  if (!run.destinationAddress) warnings.push("Falta dirección de destino.");
  // Horario de la jornada (hora de Montevideo): fuera de ese rango solo se advierte.
  const atShift = (time?: string) => run.plannedDate && time ? Date.parse(`${run.plannedDate}T${time.slice(0, 5)}:00-03:00`) : Number.NaN;
  const shiftStart = atShift(settings.shiftStart), shiftEnd = atShift(settings.shiftEnd);
  if (run.plannedStartAt && Number.isFinite(shiftStart) && Date.parse(run.plannedStartAt) < shiftStart) warnings.push(`La salida es antes del inicio de la jornada (${settings.shiftStart!.slice(0, 5)}).`);
  if (run.plannedEndAt && Number.isFinite(shiftEnd) && Date.parse(run.plannedEndAt) > shiftEnd) warnings.push(`La vuelta termina después del fin de la jornada (${settings.shiftEnd!.slice(0, 5)}).`);
  if (run.plannedStartAt && run.plannedEndAt) {
    for (const other of runs) {
      if (String(other.id) === String(run.id) || other.status === "cancelled" || !other.plannedStartAt || !other.plannedEndAt) continue;
      if (!(run.plannedStartAt < other.plannedEndAt && other.plannedStartAt < run.plannedEndAt)) continue;
      if (run.vehicleId && run.vehicleId === other.vehicleId) warnings.push("El vehículo se solapa con otra salida.");
      if (run.driverId && run.driverId === other.driverId) warnings.push("El chofer se solapa con otra salida.");
    }
  }
  return [...new Set(warnings)];
}
