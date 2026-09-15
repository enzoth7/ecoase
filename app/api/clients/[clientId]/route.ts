import { deleteClient, getClientDetail, updateClientMaster } from "../../store";

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const detail = await getClientDetail(clientId);
  return detail ? Response.json(detail) : Response.json({ error: "Cliente no encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const client = await updateClientMaster(clientId, { name: typeof body.name === "string" ? body.name : undefined, address: typeof body.address === "string" ? body.address : undefined, department: typeof body.department === "string" ? body.department : undefined, active: typeof body.active === "boolean" ? body.active : undefined });
    return client ? Response.json({ client }) : Response.json({ error: "Cliente no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el cliente." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  try {
    await deleteClient(clientId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el cliente." }, { status: 400 });
  }
}
