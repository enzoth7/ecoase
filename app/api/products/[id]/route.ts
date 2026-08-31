import { deleteProduct, updateProduct } from "../../store";

const productKinds = new Set(["Pallet", "Piso", "Bin"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { kind?: unknown; measure?: unknown; requiresTreatment?: unknown; stockName?: unknown; zetaCode?: unknown; clientId?: unknown };
    const kind = typeof body.kind === "string" ? body.kind : "";
    const measure = typeof body.measure === "string" ? body.measure : "";
    if (!productKinds.has(kind)) {
      return Response.json({ error: "El tipo indicado no es válido." }, { status: 400 });
    }
    if (typeof body.requiresTreatment !== "boolean") return Response.json({ error: "Indique si el producto requiere marcado." }, { status: 400 });
    const product = await updateProduct(id, {
      kind: kind as "Pallet" | "Piso" | "Bin",
      measure,
      requiresTreatment: body.requiresTreatment,
      stockName: typeof body.stockName === "string" ? body.stockName : undefined,
      zetaCode: typeof body.zetaCode === "string" ? body.zetaCode : undefined,
      clientId: typeof body.clientId === "string" && body.clientId ? body.clientId : undefined,
    });
    return Response.json({ product });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el producto." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteProduct(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el producto." }, { status: 404 });
  }
}
