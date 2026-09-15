import { deleteProvider, updateProvider } from "../../store";
import type { ProviderType } from "../../../data";

const validProviderTypes = new Set<ProviderType>(["Aserradero", "Transporte", "Importador"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: unknown;
      type?: unknown;
      supplies?: unknown;
    };

    let type: ProviderType | undefined;
    if (typeof body.type === "string") {
      if (!validProviderTypes.has(body.type as ProviderType)) {
        return Response.json({ error: "El tipo de proveedor indicado no es válido." }, { status: 400 });
      }
      type = body.type as ProviderType;
    }

    const provider = await updateProvider(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      type,
      supplies: typeof body.supplies === "string" ? body.supplies : undefined,
    });

    return Response.json({ provider });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el proveedor." },
      { status: 400 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteProvider(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar el proveedor." },
      { status: 400 }
    );
  }
}
