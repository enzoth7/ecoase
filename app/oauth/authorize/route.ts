import { CODE_SECONDS, accessForCode, allowedRedirect, oauthCors, oauthEnabled, readParams, resolveClient, sign } from "../core";

const page = (body: string, status = 200) => new Response(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Conectar a Ecoase</title>
<style>
:root{color-scheme:light dark;--ink:#26343e;--bg:#f4f6f8;--card:#fff;--line:#d5dce2;--yellow:#ffca08;--muted:#5b6a76}
@media (prefers-color-scheme:dark){:root{--ink:#eef2f5;--bg:#161e24;--card:#1f2a32;--line:#34434e;--muted:#9fb0bc}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{margin:0 0 4px;font-size:20px}p{margin:8px 0;color:var(--muted)}label{display:block;margin:20px 0 6px;font-weight:600}
input{width:100%;min-height:48px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font:inherit;letter-spacing:.04em}
button{width:100%;min-height:48px;margin-top:16px;border:0;border-radius:8px;background:var(--yellow);color:#26343e;font:inherit;font-weight:700;cursor:pointer}
.error{margin-top:12px;color:#c0392b;font-weight:600}small{display:block;margin-top:16px;color:var(--muted)}
</style></head><body><main>${body}</main></body></html>`, {
  status,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'; form-action 'self' https: http://localhost:* http://127.0.0.1:*", ...oauthCors },
});

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const hidden = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

function check(params: Record<string, string>) {
  const redirect = params.redirect_uri ?? "";
  const client = resolveClient(params.client_id ?? "", redirect);
  if (!client) return { error: "Esta conexión no está registrada. Volvé a agregarla desde Claude o ChatGPT, dejando vacíos los campos de Client ID y Client secret." };
  if (!allowedRedirect(redirect) || !client.uris.includes(redirect)) return { error: "La dirección de retorno no coincide con la registrada." };
  if (params.response_type !== "code" || params.code_challenge_method !== "S256" || !params.code_challenge) return { error: "Falta la verificación de seguridad (PKCE). Volvé a agregar la conexión desde Claude." };
  return { client, redirect };
}

function form(params: Record<string, string>, clientName: string, error = "") {
  return page(`<h1>Conectar a Ecoase</h1>
<p><b>${escape(clientName)}</b> quiere leer y modificar el control operativo (pedidos, producción, logística y stock).</p>
<form method="post" action="/oauth/authorize" autocomplete="off">
${hidden.filter((name) => params[name] !== undefined).map((name) => `<input type="hidden" name="${name}" value="${escape(params[name])}">`).join("")}
<label for="code">Código de acceso</label>
<input id="code" name="code" type="password" required autofocus autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text">
${error ? `<div class="error" role="alert">${escape(error)}</div>` : ""}
<button type="submit">Autorizar</button>
</form><small>Si no iniciaste esta conexión, cerrá esta página.</small>`, error ? 401 : 200);
}

export async function GET(request: Request) {
  if (!oauthEnabled()) return page("<h1>No disponible</h1><p>El acceso con OAuth no está habilitado en este servidor.</p>", 404);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = check(params);
  if ("error" in result) return page(`<h1>No se pudo conectar</h1><p>${escape(result.error ?? "")}</p>`, 400);
  return form(params, result.client.name);
}

export async function POST(request: Request) {
  if (!oauthEnabled()) return page("<h1>No disponible</h1><p>El acceso con OAuth no está habilitado en este servidor.</p>", 404);
  const params = await readParams(request);
  const result = check(params);
  if ("error" in result) return page(`<h1>No se pudo conectar</h1><p>${escape(result.error ?? "")}</p>`, 400);
  const scope = accessForCode(params.code ?? "");
  if (!scope) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return form(params, result.client.name, "Código incorrecto. Probá de nuevo.");
  }
  const code = sign({ t: "code", cid: params.client_id, ru: result.redirect, cc: params.code_challenge, scope }, CODE_SECONDS);
  const target = new URL(result.redirect!);
  target.searchParams.set("code", code);
  if (params.state) target.searchParams.set("state", params.state);
  return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store" } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCors });
}
