import { getStockDetail } from "../../store";

export async function GET(_: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const stock = await getStockDetail((await params).productId);
    return stock ? Response.json({ stock }) : Response.json({ error: "Producto no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el producto." }, { status: 500 });
  }
}
