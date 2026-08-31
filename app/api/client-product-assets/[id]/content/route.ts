import { getMemoryClientProductAssetContent } from "../../../store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = getMemoryClientProductAssetContent(id);
  return content ? new Response(content.bytes as BodyInit, { headers: { "content-type": content.mimeType, "cache-control": "private, max-age=60" } }) : Response.json({ error: "Archivo no encontrado." }, { status: 404 });
}
