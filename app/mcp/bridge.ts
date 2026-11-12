/**
 * Puente entre el MCP y la API del dashboard.
 *
 * Cada herramienta que lee o escribe llama a la misma ruta HTTP que usa la pantalla (a través del
 * despachador interno, sin salir a la red). Así el MCP respeta exactamente las mismas validaciones,
 * reglas y efectos que el dashboard, y cualquier mejora futura de una ruta llega sola al MCP.
 */

export type ApiRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export type ApiResponse = { ok: boolean; status: number; data: unknown };

export async function callApi({ method, path, query, body }: ApiRequest): Promise<ApiResponse> {
  // Import dinámico: el despachador carga el mapa de rutas, que a su vez carga la ruta del MCP.
  const { dispatch } = await import("../../server/router");
  const url = new URL(`http://interno.ecoase${path}`);
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  const init: RequestInit = { method, headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await dispatch(new Request(url, init));
  const text = await response.text();
  let data: unknown = text;
  if (!text) data = { ok: response.ok };
  else {
    try { data = JSON.parse(text); } catch { /* respuesta de texto plano */ }
  }
  return { ok: response.ok, status: response.status, data };
}

/** Mensaje legible de una respuesta de error de la API. */
export function apiErrorMessage(response: ApiResponse) {
  const data = response.data as { error?: unknown } | string | null;
  const message = typeof data === "object" && data && typeof data.error === "string" ? data.error : typeof data === "string" && data ? data : "";
  if (response.status === 404) return message || "No se encontró lo que se pidió. Revisá el identificador.";
  if (response.status === 405) return "Esa operación no está disponible.";
  if (response.status >= 500) return message || "El servidor no pudo completar la operación. Probá de nuevo en unos segundos.";
  return message || `La operación fue rechazada (código ${response.status}).`;
}

const MAX_CHARS = 120_000;
const MAX_ITEMS = 100;

/** Si la respuesta es enorme, recorta las listas largas e informa cuántos elementos quedaron afuera. */
export function shrink(value: unknown): unknown {
  if (JSON.stringify(value)?.length <= MAX_CHARS) return value;
  const trim = (item: unknown, depth: number): unknown => {
    if (Array.isArray(item)) {
      const kept = item.slice(0, MAX_ITEMS).map((entry) => trim(entry, depth + 1));
      return item.length > MAX_ITEMS ? [...kept, { _omitidos: item.length - MAX_ITEMS, _aviso: "Lista recortada: pedí un rango o filtro más acotado." }] : kept;
    }
    if (item && typeof item === "object" && depth < 8) return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, trim(entry, depth + 1)]));
    return item;
  };
  return trim(value, 0);
}
