import { softDeleteClientProductAsset } from "../../store";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (await softDeleteClientProductAsset(id)) ? new Response(null, { status: 204 }) : Response.json({ error: "Archivo no encontrado." }, { status: 404 });
}
