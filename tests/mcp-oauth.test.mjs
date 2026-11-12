import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

process.env.ECOASE_DATA_BACKEND = "memory";
for (const name of ["ECOASE_MCP_TOKEN", "ECOASE_MCP_READ_TOKEN", "ECOASE_MCP_PASSWORD", "ECOASE_PUBLIC_URL"]) delete process.env[name];

const { dispatch } = await import("../server/router.ts");
const ORIGIN = "https://ecoase.example";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const send = (path, init = {}) => dispatch(new Request(`${ORIGIN}${path}`, { ...init, headers: { host: "ecoase.example", ...(init.headers ?? {}) } }));
const form = (data) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() });

function configure() {
  process.env.ECOASE_MCP_TOKEN = "token-fijo-de-prueba";
  process.env.ECOASE_MCP_PASSWORD = "clave-corta-1234";
  process.env.ECOASE_MCP_READ_TOKEN = "token-lectura-de-prueba";
}
function reset() { for (const name of ["ECOASE_MCP_TOKEN", "ECOASE_MCP_READ_TOKEN", "ECOASE_MCP_PASSWORD"]) delete process.env[name]; }

async function register(uris = [REDIRECT]) {
  const response = await send("/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: uris, client_name: "Claude" }) });
  return { response, body: await response.json() };
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function authorize(clientId, challenge, code, redirect = REDIRECT) {
  const params = { response_type: "code", client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state: "estado-1", scope: "mcp" };
  return send("/oauth/authorize", form({ ...params, code }));
}

async function tools(token) {
  const response = await send("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  return { response, names: response.status === 200 ? (await response.json()).result.tools.map((tool) => tool.name) : [] };
}

async function exchange(clientId, challenge, verifier, code) {
  const granted = await authorize(clientId, challenge, code);
  assert.equal(granted.status, 302);
  const authCode = new URL(granted.headers.get("location")).searchParams.get("code");
  return (await send("/oauth/token", form({ grant_type: "authorization_code", client_id: clientId, code: authCode, redirect_uri: REDIRECT, code_verifier: verifier }))).json();
}

test("sin tokens configurados OAuth no existe", async () => {
  reset();
  assert.equal((await send("/.well-known/oauth-authorization-server")).status, 404);
  assert.equal((await register()).response.status, 404);
});

test("publica los datos que Claude necesita para descubrir el acceso", async () => {
  configure();
  try {
    const server = await (await send("/.well-known/oauth-authorization-server")).json();
    assert.equal(server.issuer, ORIGIN);
    assert.equal(server.authorization_endpoint, `${ORIGIN}/oauth/authorize`);
    assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const resource = await (await send(path)).json();
      assert.equal(resource.resource, `${ORIGIN}/mcp`);
      assert.deepEqual(resource.authorization_servers, [ORIGIN]);
    }
    const denied = await tools();
    assert.equal(denied.response.status, 401);
    assert.match(denied.response.headers.get("www-authenticate"), /resource_metadata="https:\/\/ecoase\.example\/\.well-known\/oauth-protected-resource"/);
  } finally { reset(); }
});

test("recorre el flujo completo: registro, código de acceso, token, uso y renovación", async () => {
  configure();
  try {
    const { response, body } = await register();
    assert.equal(response.status, 201);
    const clientId = body.client_id;
    const { verifier, challenge } = pkce();

    const page = await send(`/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}&code_challenge_method=S256&state=estado-1`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Código de acceso/);
    assert.match(html, /type="password"/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");

    const wrong = await authorize(clientId, challenge, "incorrecto");
    assert.equal(wrong.status, 401);
    assert.match(await wrong.text(), /Código incorrecto/);

    const granted = await authorize(clientId, challenge, "clave-corta-1234");
    assert.equal(granted.status, 302);
    const target = new URL(granted.headers.get("location"));
    assert.equal(`${target.origin}${target.pathname}`, REDIRECT);
    assert.equal(target.searchParams.get("state"), "estado-1");
    const code = target.searchParams.get("code");

    const badVerifier = await send("/oauth/token", form({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: "otro-verificador" }));
    assert.equal(badVerifier.status, 400);
    assert.equal((await badVerifier.json()).error, "invalid_grant");
    const wrongRedirect = await send("/oauth/token", form({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: "https://otro.example/cb", code_verifier: verifier }));
    assert.equal(wrongRedirect.status, 400);

    const exchanged = await send("/oauth/token", form({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: verifier }));
    assert.equal(exchanged.status, 200);
    const tokens = await exchanged.json();
    assert.equal(tokens.token_type, "Bearer");
    assert.ok(tokens.refresh_token);

    const full = await tools(tokens.access_token);
    assert.equal(full.response.status, 200);
    assert.ok(full.names.includes("crear_pedido"), "El código de acceso da permiso de escritura");
    assert.ok(full.names.length >= 60);

    const refreshed = await send("/oauth/token", form({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token }));
    assert.equal(refreshed.status, 200);
    const renewed = await refreshed.json();
    assert.equal((await tools(renewed.access_token)).response.status, 200);

    // Un token de acceso no sirve como renovación y uno inventado no entra.
    const misuse = await send("/oauth/token", form({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.access_token }));
    assert.equal(misuse.status, 400);
    assert.equal((await tools(`${tokens.access_token}x`)).response.status, 401);
    // Y el token fijo sigue funcionando para Claude Code.
    assert.ok((await tools("token-fijo-de-prueba")).names.includes("crear_pedido"));
  } finally { reset(); }
});

test("el token de solo lectura inicia una sesión sin herramientas de escritura", async () => {
  configure();
  try {
    const { body } = await register();
    const { verifier, challenge } = pkce();
    const tokens = await exchange(body.client_id, challenge, verifier, "token-lectura-de-prueba");
    const result = await tools(tokens.access_token);
    assert.equal(result.response.status, 200);
    assert.ok(result.names.includes("detalle_pedido"));
    assert.ok(!result.names.includes("crear_pedido"));
  } finally { reset(); }
});

test("rechaza direcciones de retorno no registradas, inseguras o sin PKCE", async () => {
  configure();
  try {
    assert.equal((await register(["http://ecoase.example/cb"])).response.status, 400);
    assert.equal((await register(["http://localhost:6274/oauth/callback"])).response.status, 201);
    const { body } = await register();
    const { challenge } = pkce();
    const stranger = await authorize(body.client_id, challenge, "clave-corta-1234", "https://atacante.example/cb");
    assert.equal(stranger.status, 400);
    assert.equal(stranger.headers.get("location"), null);
    const unknownClient = await send(`/oauth/authorize?response_type=code&client_id=inventado&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}&code_challenge_method=S256`);
    assert.equal(unknownClient.status, 400);
    const noPkce = await send(`/oauth/authorize?response_type=code&client_id=${encodeURIComponent(body.client_id)}&redirect_uri=${encodeURIComponent(REDIRECT)}`);
    assert.equal(noPkce.status, 400);
  } finally { reset(); }
});

test("rotar el token cierra las sesiones abiertas", async () => {
  configure();
  try {
    const { body } = await register();
    const { verifier, challenge } = pkce();
    const tokens = await exchange(body.client_id, challenge, verifier, "clave-corta-1234");
    assert.equal((await tools(tokens.access_token)).response.status, 200);
    process.env.ECOASE_MCP_TOKEN = "token-rotado";
    assert.equal((await tools(tokens.access_token)).response.status, 401);
  } finally { reset(); }
});
