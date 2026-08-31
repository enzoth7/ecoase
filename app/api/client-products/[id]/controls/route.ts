import { replaceClientProductControls } from "../../../store";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json() as { controls?: Array<{ title?: unknown; detail?: unknown; active?: unknown }> };
    const product = await replaceClientProductControls(id, (body.controls ?? []).map((control) => ({ title: typeof control.title === "string" ? control.title : "", detail: typeof control.detail === "string" ? control.detail : undefined, active: typeof control.active === "boolean" ? control.active : undefined })));
    return product ? Response.json({ product }) : Response.json({ error: "Relación no encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar los controles." }, { status: 400 });
  }
}
