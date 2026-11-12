import type { ProductKind } from "./data";
import type { ProductionResource } from "./production-capacity";

/** John y Esteban trabaja con bins, no con pallets ni pisos. */
export function canProduceProductKind(resource: Pick<ProductionResource, "name" | "productKinds">, kind?: ProductKind) {
  if (kind === undefined) return true;
  if (resource.productKinds?.length) return resource.productKinds.includes(kind);
  const binsOnly = isBinsOnlyResource(resource);
  return !binsOnly || kind === "Bin";
}

export function isBinsOnlyResource(resource: Pick<ProductionResource, "name">) {
  return resource.name.trim().toLocaleLowerCase("es") === "john y esteban";
}
