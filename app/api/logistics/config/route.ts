import { getLogisticsSnapshot, saveLogisticsConfig } from "../../logistics-store";

const kinds = ["settings", "vehicle", "driver", "class", "location", "transport_capacity", "client_limit"] as const;
export async function GET() {
  try {
    const { vehicles, drivers, settings, classes, locations, transportCapacities, clientLimits, limitsSchemaReady } = await getLogisticsSnapshot();
    return Response.json({ vehicles, drivers, settings, classes, locations, transportCapacities, clientLimits, limitsSchemaReady });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar la configuración." }, { status: 500 }); }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const kind = body.kind as typeof kinds[number];
    if (!kinds.includes(kind)) return Response.json({ error: "Configuración inválida." }, { status: 400 });
    return Response.json({ value: await saveLogisticsConfig(kind, body) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuración." }, { status: 400 }); }
}
