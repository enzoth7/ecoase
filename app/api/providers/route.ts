import { createProvider, getProviders } from "../store";
import type { ProviderType } from "../../data";

export async function GET() {
  return Response.json({ providers: await getProviders() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      type?: unknown;
      supplies?: unknown;
    };
    const name = typeof body.name === "string" ? body.name : "";
    const type = typeof body.type === "string" ? (body.type as ProviderType) : ("" as ProviderType);
    const supplies = typeof body.supplies === "string" ? body.supplies : "";

    const provider = await createProvider({ name, type, supplies });
    return Response.json({ provider }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el proveedor." },
      { status: 400 }
    );
  }
}
