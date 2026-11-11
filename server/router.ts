import { routes } from "./route-map";

type RouteContext = { params: Promise<Record<string, string>> };
type RouteHandler = (request: Request, context: RouteContext) => Promise<Response> | Response;

export async function dispatch(request: Request, pathOverride?: string): Promise<Response> {
  const pathname = pathOverride ?? new URL(request.url).pathname;
  const route = routes.find((item) => item.pattern.test(pathname));
  if (!route) return Response.json({ error: "Ruta no encontrada." }, { status: 404 });
  try {
    const match = route.pattern.exec(pathname)!;
    const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    const module = await route.load() as Record<string, unknown>;
    const handler = module[request.method] as RouteHandler | undefined;
    if (!handler) {
      const allow = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].filter((method) => typeof module[method] === "function").join(", ");
      return new Response(null, { status: 405, headers: { Allow: allow } });
    }
    return await handler(request, { params: Promise.resolve(params) });
  } catch (error) {
    console.error(`Error en ${request.method} ${pathname}:`, error);
    return Response.json({ error: "No se pudo completar la operación." }, { status: 500 });
  }
}
