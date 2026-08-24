import { deleteProduct, updateProduct } from "../../store";

const productKinds = new Set(["Pallet", "Piso", "Bin"]);
const treatments = new Set(["", "Marcado", "HT"]);
const productNameHasMeasure = /\d+(?:[,.]\d+)?\s*[x×]\s*\d+/i;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { code?: unknown; name?: unknown; kind?: unknown; measure?: unknown; treatment?: unknown };
    const code = typeof body.code === "string" ? body.code : "";
    const name = typeof body.name === "string" ? body.name : "";
    const kind = typeof body.kind === "string" ? body.kind : "";
    const measure = typeof body.measure === "string" ? body.measure : "";
    const treatment = typeof body.treatment === "string" ? body.treatment : "";
    if (!code.trim() || !name.trim() || !productKinds.has(kind)) {
      return Response.json({ error: "Código, producto y tipo son obligatorios." }, { status: 400 });
    }
    if (productNameHasMeasure.test(name)) {
      return Response.json({ error: "La medida debe cargarse en su columna." }, { status: 400 });
    }
    if (!treatments.has(treatment)) {
      return Response.json({ error: "El tratamiento indicado no es válido." }, { status: 400 });
    }
    const product = await updateProduct(id, {
      code,
      name,
      kind: kind as "Pallet" | "Piso" | "Bin",
      measure,
      treatment: treatment ? treatment as "Marcado" | "HT" : undefined,
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
