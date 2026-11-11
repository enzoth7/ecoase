import { deleteProduct, updateProduct } from "../../store";
import { parseClassification, parseClientIds, parseHeightCm, parseKind, parseRequiresTreatment } from "../parse";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const kind = parseKind(body.kind);
    if (!kind) return Response.json({ error: "El tipo indicado no es válido." }, { status: 400 });
    const product = await updateProduct(id, {
      kind,
      ...parseClassification(body),
      heightCm: parseHeightCm(body),
      requiresTreatment: parseRequiresTreatment(body),
      stockName: typeof body.stockName === "string" ? body.stockName : undefined,
      zetaCode: typeof body.zetaCode === "string" ? body.zetaCode : undefined,
      clientId: typeof body.clientId === "string" && body.clientId ? body.clientId : undefined,
      clientIds: parseClientIds(body.clientIds),
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
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el producto." }, { status: 409 });
  }
}
