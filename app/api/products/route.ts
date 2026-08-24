import { createProduct, getProducts } from "../store";

const productKinds = new Set(["Pallet", "Piso", "Bin"]);
const treatments = new Set(["", "Marcado", "HT", "Marcado y HT"]);

export async function GET() {
  return Response.json({ products: await getProducts() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { kind?: unknown; measure?: unknown; treatment?: unknown };
    const kind = typeof body.kind === "string" ? body.kind : "";
    const measure = typeof body.measure === "string" ? body.measure : "";
    const treatment = typeof body.treatment === "string" ? body.treatment : "";
    if (!productKinds.has(kind) || !treatments.has(treatment)) return Response.json({ error: "Revise tipo y tratamiento del producto." }, { status: 400 });
    const product = await createProduct({ kind: kind as "Pallet" | "Piso" | "Bin", measure, treatment: treatment ? treatment as "Marcado" | "HT" | "Marcado y HT" : undefined });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el producto." }, { status: 400 });
  }
}
