import { saveInternalTeamCapacity } from "../../store";

export async function PUT(request: Request) {
  const payload = await request.json() as { availablePeople?: number };
  const availablePeople = Number(payload.availablePeople);
  if (!Number.isInteger(availablePeople) || availablePeople < 0) {
    return Response.json({ error: "Indique una cantidad entera de personas disponibles." }, { status: 400 });
  }
  return Response.json({ team: await saveInternalTeamCapacity(availablePeople) });
}
