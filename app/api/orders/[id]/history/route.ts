import { getOrderHistory } from "../../../store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return Response.json({ history: await getOrderHistory(id) });
}
