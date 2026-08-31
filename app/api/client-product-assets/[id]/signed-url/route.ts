import { getClientProductAssetUrl } from "../../../store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = await getClientProductAssetUrl(id);
  return url ? Response.json({ url }) : Response.json({ error: "Archivo no encontrado." }, { status: 404 });
}
