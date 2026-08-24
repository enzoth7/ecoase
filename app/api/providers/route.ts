import { providers } from "../../data";

export async function GET() {
  return Response.json({ providers });
}
