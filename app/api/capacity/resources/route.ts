import { createProductionResource, getCapacity, getProviders, updateProductionResource } from "../../store";
import type { ProductionResourceType } from "../../../production-capacity";

const types: ProductionResourceType[] = ["internal_factory", "internal_crew", "external_supplier"];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export async function GET() {
  const today = iso(new Date());
  return Response.json({ resources: (await getCapacity(today, today)).production.resources });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const resourceType = payload.resourceType as ProductionResourceType;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const providerId = typeof payload.providerId === "string" ? payload.providerId.trim() : undefined;
    const displayOrder = payload.displayOrder === undefined ? 100 : Number(payload.displayOrder);
    const providers = await getProviders();
    if (!name || !types.includes(resourceType) || !Number.isInteger(displayOrder) || displayOrder < 0 || resourceType === "external_supplier" !== Boolean(providerId) || providerId && !providers.some((provider) => provider.id === providerId && provider.type === "Aserradero")) {
      return Response.json({ error: "Revise nombre, tipo, proveedor y orden del recurso." }, { status: 400 });
    }
    return Response.json({ resource: await createProductionResource({ name, resourceType, providerId, displayOrder }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el recurso." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = typeof payload.id === "string" || typeof payload.id === "number" ? payload.id : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : undefined;
    const active = typeof payload.active === "boolean" ? payload.active : undefined;
    const displayOrder = payload.displayOrder === undefined ? undefined : Number(payload.displayOrder);
    if (!id || name === "" || displayOrder !== undefined && (!Number.isInteger(displayOrder) || displayOrder < 0) || name === undefined && active === undefined && displayOrder === undefined) return Response.json({ error: "Indique el recurso y al menos un cambio válido." }, { status: 400 });
    const resource = await updateProductionResource(id, { name, active, displayOrder });
    return resource ? Response.json({ resource }) : Response.json({ error: "Recurso no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el recurso." }, { status: 400 });
  }
}
