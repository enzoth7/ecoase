import { countLevelUsage, getProductLevels, getProducts, saveProductLevels } from "../store";

async function snapshot() {
  const [levels, products] = await Promise.all([getProductLevels(), getProducts()]);
  return { levels, usage: countLevelUsage(products, levels) };
}

export async function GET() {
  try {
    return Response.json(await snapshot());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar los niveles." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { levels?: unknown };
    if (!Array.isArray(body.levels)) return Response.json({ error: "Falta la lista de niveles." }, { status: 400 });
    await saveProductLevels(body.levels.map((item) => {
      const level = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return { id: typeof level.id === "string" ? level.id : undefined, label: typeof level.label === "string" ? level.label : undefined, options: level.options };
    }));
    return Response.json(await snapshot());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar los niveles." }, { status: 400 });
  }
}
