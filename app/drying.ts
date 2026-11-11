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
