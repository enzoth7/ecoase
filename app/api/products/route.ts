import { createProduct, getProducts } from "../store";

const productKinds = new Set(["Pallet", "Piso", "Bin"]);

export async function GET() {
  return Response.json({ products: await getProducts() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { kind?: unknown; measure?: unknown; requiresTreatment?: unknown; zetaCode?: unknown };
    const kind = typeof body.kind === "string" ? body.kind : "";
    const measure = typeof body.measure === "string" ? body.measure : "";
    if (!productKinds.has(kind) || typeof body.requiresTreatment !== "boolean") return Response.json({ error: "Revise el tipo y el marcado del producto." }, { status: 400 });
    const product = await createProduct({ kind: kind as "Pallet" | "Piso" | "Bin", measure, requiresTreatment: body.requiresTreatment, zetaCode: typeof body.zetaCode === "string" ? body.zetaCode : "" });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el producto." }, { status: 400 });
  }
}
