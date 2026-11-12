import { canonicalProductName } from "./classification";
import type { OperationOrder, OrderLine, Product } from "./data";
import { productLabel } from "./master-data";

export const dryingDayMs = 86_400_000;
export const parseDryingDay = (date: string) => new Date(`${date}T00:00:00Z`);
export const shiftDryingDay = (date: string, days: number) =>
  new Date(parseDryingDay(date).valueOf() + days * dryingDayMs).toISOString().slice(0, 10);

export function lineNeedsDrying(line: OrderLine, productsRequiringTreatment: Set<string>) {
  return Boolean(line.treatment || (line.productId && productsRequiringTreatment.has(line.productId)));
}

export function dryingOrderLines(order: OperationOrder, products: Product[], productsRequiringTreatment: Set<string>) {
  return order.lines.filter((line) => lineNeedsDrying(line, productsRequiringTreatment)).map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const completed = (line.productionAllocations ?? []).filter((allocation) => allocation.status === "completed");
    const producedForOrder = completed.reduce((sum, allocation) => sum + (allocation.resultDestination === "stock" ? 0 : Math.max(allocation.actualQuantity ?? 0, 0)), 0);
    const planned = producedForOrder || line.quantity;
    const treated = line.treatedQuantity ?? 0;
    const pending = Math.max(producedForOrder - treated, 0);
    return {
      lineId: line.id,
      productId: line.productId,
      product: product ? productLabel(product) : canonicalProductName(line.product),
      pending,
      planned,
      quantity: order.dryingStartDate && !completed.length ? Math.max(planned - treated, 0) : pending,
    };
  });
}

export function dryingQuantityOnDay(order: OperationOrder, quantity: number, day: string) {
  const start = order.dryingStartDate;
  const end = order.dryingEndDate ?? start;
  if (!start || !end || day < start || day > end) return 0;
  const duration = (parseDryingDay(end).valueOf() - parseDryingDay(start).valueOf()) / dryingDayMs + 1;
  const offset = (parseDryingDay(day).valueOf() - parseDryingDay(start).valueOf()) / dryingDayMs;
  return Math.floor(quantity / duration) + Number(offset < quantity % duration);
}

export type DryingLineSplit = { done: Record<string, number>; pending: Record<string, number>; unscheduled: number; legacy: boolean };

/**
 * Reparte las unidades de una línea entre "ya tratado" (por día), "programado y pendiente" (por día) y "sin programar".
 * Lo tratado ocupa primero los días programados más tempranos. Un pedido sin cantidades por día (programación vieja)
 * se considera programado en todo su rango y no tiene unidades sin programar.
 */
export function dryingLineSplit(order: OperationOrder, line: OrderLine, planned: number): DryingLineSplit {
  const allocations = [...(line.dryingAllocations ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const orderHasAllocations = order.lines.some((item) => (item.dryingAllocations ?? []).length > 0);
  const done: Record<string, number> = {}, pending: Record<string, number> = {};
  const treated = Math.max(line.treatedQuantity ?? 0, 0);
  if (allocations.length) {
    let treatedLeft = treated;
    for (const item of allocations) {
      const doneHere = Math.min(item.quantity, treatedLeft);
      treatedLeft -= doneHere;
      if (doneHere > 0) done[item.date] = doneHere;
      if (item.quantity - doneHere > 0) pending[item.date] = item.quantity - doneHere;
    }
    const allocated = allocations.reduce((sum, item) => sum + item.quantity, 0);
    return { done, pending, unscheduled: Math.max(planned - Math.max(allocated, treated), 0), legacy: false };
  }
  // Sin cantidades por día: lo ya tratado se ubica en el primer día programado del pedido.
  const start = order.dryingStartDate;
  if (treated > 0 && start) done[start] = Math.min(treated, planned || treated);
  return { done, pending, unscheduled: orderHasAllocations ? Math.max(planned - treated, 0) : 0, legacy: !orderHasAllocations };
}

/** Unidades programadas de una línea en un día. Es la misma cuenta para el calendario y para el registro de HT. */
export function dryingPlannedOnDay(order: OperationOrder, line: OrderLine, planned: number, day: string) {
  const split = dryingLineSplit(order, line, planned);
  if (split.legacy) return dryingQuantityOnDay(order, planned, day);
  return (split.done[day] ?? 0) + (split.pending[day] ?? 0);
}
