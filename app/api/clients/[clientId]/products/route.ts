import { createClientProduct, getClientProductOptions } from "../../../store";

function statusOf(error: unknown) {
  return typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400;
}

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const activeOnly = new URL(request.url).searchParams.get("active") === "true";
  return Response.json({ products: await getClientProductOptions(clientId, activeOnly) });
}

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const product = await createClientProduct(clientId, {
      productId: typeof body.productId === "string" ? body.productId : "",
      operationalName: typeof body.operationalName === "string" ? body.operationalName : undefined,
      initialControl: typeof body.initialControl === "string" ? body.initialControl : "",
      displayOrder: typeof body.displayOrder === "number" ? body.displayOrder : undefined,
    });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo habilitar el producto." }, { status: statusOf(error) });
  }
}
