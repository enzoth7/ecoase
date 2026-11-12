import { json, oauthCors, oauthEnabled, publicOrigin } from "../core";

export async function GET(request: Request) {
  if (!oauthEnabled()) return json({ error: "not_found" }, 404);
  const origin = publicOrigin(request);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCors });
}
