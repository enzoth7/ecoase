import { addClientProductAsset } from "../../../store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Seleccione un archivo." }, { status: 400 });
    const asset = await addClientProductAsset(id, file, { altText: String(form.get("altText") ?? ""), assetType: form.get("assetType") === "plan" ? "plan" : "photo", isPrimary: form.get("isPrimary") !== "false" });
    return Response.json({ asset }, { status: 201 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el archivo." }, { status });
  }
}
