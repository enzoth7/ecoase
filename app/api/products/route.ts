import { createProduct, getProducts } from "../store";
import { parseClassification, parseClientIds, parseHeightCm, parseKind, parseRequiresTreatment } from "./parse";

export async function GET() {
  return Response.json({ products: await getProducts() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const kind = parseKind(body.kind);
    if (!kind) return Response.json({ error: "Revise el tipo del producto." }, { status: 400 });
    const product = await createProduct({
      kind,
      ...parseClassification(body),
      heightCm: parseHeightCm(body),
      requiresTreatment: parseRequiresTreatment(body),
      zetaCode: typeof body.zetaCode === "string" ? body.zetaCode : "",
      stockName: typeof body.stockName === "string" ? body.stockName : undefined,
      clientIds: parseClientIds(body.clientIds) ?? [],
    });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el producto." }, { status: 400 });
  }
}
