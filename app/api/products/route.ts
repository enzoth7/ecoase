import { getProducts } from "../store";

export async function GET() {
  return Response.json({ products: await getProducts() });
}
