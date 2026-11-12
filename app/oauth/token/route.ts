import { clientIdFrom, issueTokens, json, oauthCors, oauthEnabled, oauthError, pkceMatches, readParams, resolveClient, verify, type Scope } from "../core";

export async function POST(request: Request) {
  if (!oauthEnabled()) return oauthError("temporarily_unavailable", "El acceso con OAuth no está habilitado en este servidor.", 404);
  const params = await readParams(request);
  const clientId = clientIdFrom(request, params);

  if (params.grant_type === "authorization_code") {
    if (!resolveClient(clientId, params.redirect_uri ?? "")) return oauthError("invalid_client", "Cliente no registrado.", 401);
    const code = verify(params.code ?? "", "code");
    if (!code || code.cid !== clientId) return oauthError("invalid_grant", "El código venció o no es válido. Volvé a conectar.");
    if (code.ru !== params.redirect_uri) return oauthError("invalid_grant", "La dirección de retorno no coincide.");
    if (!params.code_verifier || !pkceMatches(params.code_verifier, String(code.cc))) return oauthError("invalid_grant", "La verificación PKCE falló.");
    return json(issueTokens(code.scope as Scope, clientId));
  }

  if (params.grant_type === "refresh_token") {
    const refresh = verify(params.refresh_token ?? "", "refresh");
    if (!refresh || refresh.cid !== clientId) return oauthError("invalid_grant", "La sesión venció. Volvé a conectar.");
    return json(issueTokens(refresh.scope as Scope, clientId));
  }

  return oauthError("unsupported_grant_type", "Solo se admite authorization_code y refresh_token.");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCors });
}
