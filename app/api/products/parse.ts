import type { ProductKind } from "../../data";
import { cleanAttributes, type ProductAttributes } from "../../classification";

const productKinds = new Set<string>(["Pallet", "Piso", "Bin"]);

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** Lee medida y valores por nivel del cuerpo de la petición; lo que no sea texto se ignora. */
export function parseClassification(body: Record<string, unknown>): { measure?: string; attributes: ProductAttributes } {
  return { measure: text(body.measure), attributes: cleanAttributes(body.attributes) };
}

export function parseKind(value: unknown): ProductKind | undefined {
  return typeof value === "string" && productKinds.has(value) ? value as ProductKind : undefined;
}

export function parseClientIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : undefined;
}

export function parseHeightCm(body: Record<string, unknown>): number | null | undefined {
  if (!("heightCm" in body)) return undefined;
  if (body.heightCm === null || body.heightCm === "") return null;
  if (typeof body.heightCm !== "number" || !Number.isFinite(body.heightCm) || body.heightCm <= 0
    || body.heightCm > 99_999.99 || Math.abs(body.heightCm * 100 - Math.round(body.heightCm * 100)) > 1e-8)
    throw new Error("La altura debe ser positiva y tener como máximo dos decimales.");
  return body.heightCm;
}

/** El tilde viejo "requiere marcado" sigue valiendo si no llega el nivel Tratamiento. */
export function parseRequiresTreatment(body: Record<string, unknown>) {
  return typeof body.requiresTreatment === "boolean" ? body.requiresTreatment : undefined;
}
