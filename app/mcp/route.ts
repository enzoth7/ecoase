import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { accessForBearer, publicOrigin } from "../oauth/core";
import { createEcoaseMcpServer } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Permisos de la conexión.
 * - ECOASE_MCP_TOKEN: token con permiso de lectura y escritura.
 * - ECOASE_MCP_READ_TOKEN: token de solo lectura (opcional).
 * - Sin ningún token configurado, el MCP queda abierto pero solo de lectura, como en la versión piloto.
 */
function accessFor(request: Request): "write" | "read" | "denied" {
  if (!process.env.ECOASE_MCP_TOKEN?.trim() && !process.env.ECOASE_MCP_READ_TOKEN?.trim()) return "read";
  const sent = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  return accessForBearer(sent) ?? "denied";
}

async function handle(request: Request) {
  const access = accessFor(request);
  if (access === "denied") {
    return withCors(new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Falta el token de acceso o no es válido." }, id: null }), {
      status: 401,
      headers: { "content-type": "application/json", "WWW-Authenticate": `Bearer realm="ecoase-mcp", resource_metadata="${publicOrigin(request)}/.well-known/oauth-protected-resource"` },
    }));
  }
  const server = createEcoaseMcpServer({ canWrite: access === "write" });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

