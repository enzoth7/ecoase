import { getProviders } from "../store";

export async function GET() {
  return Response.json({ providers: await getProviders() });
}
