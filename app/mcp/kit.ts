import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { apiErrorMessage, callApi, shrink, type ApiRequest } from "./bridge";

export type ToolContext = { canWrite: boolean };

/** Resultado de una herramienta: datos para mostrar o un mensaje de error para la persona. */
export type Outcome = { ok: true; summary: string; data: unknown } | { ok: false; message: string };

export const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export const RESPONSABLE = "Claude (MCP)";

// ---- Esquemas de entrada compartidos --------------------------------------------------------------------------
export const fecha = (detalle = "Fecha en formato AAAA-MM-DD.") => z.string().regex(isoDate, "Usá el formato AAAA-MM-DD.").describe(detalle);
export const identificador = (detalle: string) => z.union([z.string().min(1), z.number()]).describe(detalle);
export const cantidad = (detalle: string) => z.number().int().positive().describe(detalle);
export const momento = (detalle = "Fecha y hora ISO 8601, por ejemplo 2026-11-12T14:30:00-03:00.") => z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Usá fecha y hora ISO 8601.").describe(detalle);

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function normalize(value: string) {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function fail(message: string): Outcome {
  return { ok: false, message };
}

export function done(summary: string, data: unknown): Outcome {
  return { ok: true, summary, data };
}

/** Quita las claves sin valor para no mandar `undefined` a la API. */
export function clean<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function format(outcome: Outcome) {
  if (!outcome.ok) return { isError: true as const, content: [{ type: "text" as const, text: outcome.message }] };
  const payload = outcome.data === undefined ? "" : `\n${JSON.stringify(shrink(outcome.data))}`;
  return { content: [{ type: "text" as const, text: `${outcome.summary}${payload}` }] };
}

type ToolSpec<S extends ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  /** "read" nunca modifica datos; "write" solo se registra si la conexión tiene permiso de escritura. */
  access: "read" | "write";
  /** Marca las herramientas que borran o cancelan, para que el cliente pida confirmación. */
  destructive?: boolean;
  /** Repetir la misma llamada deja el mismo resultado. */
  idempotent?: boolean;
  input: S;
  run: (args: z.infer<z.ZodObject<S>>) => Promise<Outcome>;
};

/** Registra una herramienta con su manejo uniforme de errores y sus anotaciones de seguridad. */
export function tool<S extends ZodRawShape>(server: McpServer, context: ToolContext, spec: ToolSpec<S>) {
  if (spec.access === "write" && !context.canWrite) return;
  const readOnly = spec.access === "read";
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input,
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: readOnly ? false : Boolean(spec.destructive),
        idempotentHint: readOnly ? true : Boolean(spec.idempotent),
        openWorldHint: false,
      },
    },
    (async (args: unknown) => {
      try {
        return format(await spec.run(args as z.infer<z.ZodObject<S>>));
      } catch (error) {
        return format(fail(error instanceof Error ? error.message : "No se pudo completar la operación."));
      }
    }) as never,
  );
}

type ApiToolSpec<S extends ZodRawShape> = Omit<ToolSpec<S>, "run"> & {
  request: (args: z.infer<z.ZodObject<S>>) => ApiRequest;
  /** Texto que se muestra al terminar bien. */
  summary: string | ((data: unknown, args: z.infer<z.ZodObject<S>>) => string);
  /** Ajusta los datos antes de devolverlos (por ejemplo, para filtrar). */
  pick?: (data: unknown, args: z.infer<z.ZodObject<S>>) => unknown;
};

/** Herramienta que llama a una ruta del dashboard y devuelve su respuesta. */
export function apiTool<S extends ZodRawShape>(server: McpServer, context: ToolContext, spec: ApiToolSpec<S>) {
  tool(server, context, {
    ...spec,
    run: async (args) => {
      const response = await callApi(spec.request(args));
      if (!response.ok) return fail(apiErrorMessage(response));
      const data = spec.pick ? spec.pick(response.data, args) : response.data;
      return done(typeof spec.summary === "function" ? spec.summary(response.data, args) : spec.summary, data);
    },
  });
}

/** Devuelve solo las claves pedidas de un objeto; sin pedido, el objeto completo. */
export function pickKeys(data: unknown, keys?: string[]) {
  if (!keys?.length || !data || typeof data !== "object") return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => keys.includes(key)));
}

export function count(value: unknown, key: string) {
  const list = (value as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? list.length : 0;
}
