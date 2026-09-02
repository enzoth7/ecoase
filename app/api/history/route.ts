import { getOrders } from "../store";
import { isOrderClosed } from "../../data";

export async function GET() {
  return Response.json({ history: (await getOrders()).filter(isOrderClosed) });
}
