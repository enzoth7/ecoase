/**
 * OAuth 2.1 mínimo para el MCP, sin base de datos.
 *
 * Claude en el celular y en la web solo se conecta a servidores remotos mediante OAuth (no admite un
 * encabezado con token propio). Este módulo permite que esa conexión funcione sin guardar nada: los
 * códigos, los tokens y los clientes registrados son datos firmados con HMAC. La clave se deriva del
 * token del MCP, de modo que rotar ECOASE_MCP_TOKEN cierra todas las sesiones abiertas.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type Scope = "write" | "read";
export type Signed = Record<string, unknown> & { t: string; exp?: number };

const ACCESS_SECONDS = 12 * 3600;
const REFRESH_SECONDS = 90 * 24 * 3600;
export const CODE_SECONDS = 300;

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

function secret() {
  const base = process.env.ECOASE_MCP_TOKEN?.trim() || process.env.ECOASE_MCP_READ_TOKEN?.trim();
  return base ? createHmac("sha256", "ecoase-oauth-v1").update(base).digest() : null;
}

/** OAuth solo existe cuando hay tokens configurados; sin ellos el MCP es de solo lectura abierta. */
export function oauthEnabled() {
  return secret() !== null;
}

export function sign(payload: Signed, lifetimeSeconds?: number) {
  const key = secret();
  if (!key) throw new Error("OAuth no está habilitado.");
  const body = b64(JSON.stringify(lifetimeSeconds ? { ...payload, exp: now() + lifetimeSeconds } : payload));
  return `${body}.${b64(createHmac("sha256", key).update(body).digest())}`;
}

export function verify(token: string, type: string): Signed | null {
  const key = secret();
  const [body, signature] = token.split(".");
  if (!key || !body || !signature) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Signed;
    if (payload.t !== type) return null;
    if (typeof payload.exp === "number" && payload.exp < now()) return null;
    return payload;
  } catch { return null; }
}

export function issueTokens(scope: Scope, clientId: string) {
  return {
    access_token: sign({ t: "access", scope }, ACCESS_SECONDS),
    token_type: "Bearer",
    expires_in: ACCESS_SECONDS,
    refresh_token: sign({ t: "refresh", scope, cid: clientId }, REFRESH_SECONDS),
    scope: "mcp",
  };
}

function same(a: string, b?: string) {
  if (!a || !b) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Código que escribe la persona en la pantalla de autorización. */
export function accessForCode(code: string): Scope | null {
  const typed = code.trim();
  if (same(typed, process.env.ECOASE_MCP_PASSWORD?.trim()) || same(typed, process.env.ECOASE_MCP_TOKEN?.trim())) return "write";
  if (same(typed, process.env.ECOASE_MCP_READ_TOKEN?.trim())) return "read";
  return null;
}

/** Permiso que da un Bearer del MCP: token fijo o token OAuth firmado. */
export function accessForBearer(sent: string): Scope | null {
  if (!sent) return null;
  if (same(sent, process.env.ECOASE_MCP_TOKEN?.trim())) return "write";
  if (same(sent, process.env.ECOASE_MCP_READ_TOKEN?.trim())) return "read";
  const access = verify(sent, "access");
  return access?.scope === "write" ? "write" : access?.scope === "read" ? "read" : null;
}

const TRUSTED_HOSTS: Array<{ host: string; name: string }> = [
  { host: "chatgpt.com", name: "ChatGPT" }, { host: "chat.openai.com", name: "ChatGPT" }, { host: "openai.com", name: "ChatGPT" },
  { host: "claude.ai", name: "Claude" }, { host: "claude.com", name: "Claude" },
];

function trustedHost(uri: string) {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" || url.hash) return undefined;
    return TRUSTED_HOSTS.find(({ host }) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return undefined; }
}

/**
 * Cliente que se conecta. Lo normal es que se registre solo (registro dinámico) y traiga un client_id firmado.
 * Si la persona cargó a mano un Client ID en ChatGPT o Claude, se acepta igual siempre que vuelva a una dirección
 * de ChatGPT o Claude: el client_id de un cliente público no es un secreto; la seguridad la dan PKCE y el código de acceso.
 */
export function resolveClient(clientId: string, redirect: string): { name: string; uris: string[] } | null {
  if (!clientId || clientId.length > 300) return null;
  const registered = verify(clientId, "client");
  if (registered) return { name: String(registered.name ?? "Claude"), uris: registered.uris as string[] };
  const trusted = trustedHost(redirect);
  return trusted ? { name: trusted.name, uris: [redirect] } : null;
}

/** El client_id puede llegar en el cuerpo o en un encabezado Basic (cuando el cliente cree tener un secreto). */
export function clientIdFrom(request: Request, params: Record<string, string>) {
  if (params.client_id) return params.client_id;
  const basic = /^Basic\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  return basic ? Buffer.from(basic, "base64").toString("utf8").split(":")[0] : "";
}

export function pkceMatches(verifier: string, challenge: string) {
  return same(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

/** Solo https (los servicios de Claude) o http en la propia máquina (Claude Code, Inspector). */
export function allowedRedirect(uri: string) {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

/** Dirección pública del servidor tal como la ve quien se conecta. */
export function publicOrigin(request: Request) {
  const configured = process.env.ECOASE_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (local ? "http" : "https");
  return `${protocol}://${host}`;
}

export const oauthCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...oauthCors, "Cache-Control": "no-store", ...extra } });
}

export function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  const raw = type.includes("application/json") ? await request.json().catch(() => ({})) as Record<string, unknown> : Object.fromEntries(new URLSearchParams(await request.text()));
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string")) as Record<string, string>;
}
