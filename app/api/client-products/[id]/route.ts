import { updateClientProduct } from "../../store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const product = await updateClientProduct(id, {
      operationalName: typeof body.operationalName === "string" ? body.operationalName : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      displayOrder: typeof body.displayOrder === "number" ? body.displayOrder : undefined,
    });
    return product ? Response.json({ product }) : Response.json({ error: "Relación no encontrada." }, { status: 404 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && error.status === 409 ? 409 : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar." }, { status });
  }
}
