import { allowedRedirect, json, oauthCors, oauthEnabled, oauthError, sign } from "../core";

export async function POST(request: Request) {
  if (!oauthEnabled()) return oauthError("temporarily_unavailable", "El acceso con OAuth no está habilitado en este servidor.", 404);
  const body = await request.json().catch(() => null) as { redirect_uris?: unknown; client_name?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((item): item is string => typeof item === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(allowedRedirect)) return oauthError("invalid_redirect_uri", "Las direcciones de retorno deben ser https (o http local).");
  const name = typeof body?.client_name === "string" ? body.client_name.slice(0, 80) : "Cliente MCP";
  return json({
    client_id: sign({ t: "client", uris, name }),
    client_name: name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000),
  }, 201);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCors });
}
