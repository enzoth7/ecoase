import { json, oauthCors, oauthEnabled, publicOrigin } from "../core";

export async function GET(request: Request) {
  if (!oauthEnabled()) return json({ error: "not_found" }, 404);
  const origin = publicOrigin(request);
  return json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["mcp"] });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCors });
}
