import type { ProductKind } from "./data";
import type { ProductionResource } from "./production-capacity";

/** John y Esteban trabaja con bins, no con pallets ni pisos. */
export function canProduceProductKind(resource: Pick<ProductionResource, "name">, kind?: ProductKind) {
  const binsOnly = isBinsOnlyResource(resource);
  return !binsOnly || kind === undefined || kind === "Bin";
}

export function isBinsOnlyResource(resource: Pick<ProductionResource, "name">) {
  return resource.name.trim().toLocaleLowerCase("es") === "john y esteban";
}
