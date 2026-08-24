import { getCapacity } from "../store";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isoDate.test(from) || !isoDate.test(to) || from > to) {
    return Response.json({ error: "Indique un rango de fechas válido." }, { status: 400 });
  }
  return Response.json({ capacity: await getCapacity(from, to) });
}
