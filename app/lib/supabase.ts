type SupabaseRequestOptions = RequestInit & {
  prefer?: string;
};

function configuration(secret = false) {
  const url = process.env.SUPABASE_URL;
  const key = secret ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(secret ? "Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno de servidor." : "Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en el entorno.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

export async function supabaseRequest<T>(path: string, options: SupabaseRequestOptions = {}) {
  const { url, key } = configuration();
  const headers = new Headers(options.headers);
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  headers.set("accept", "application/json");
  if (options.body) headers.set("content-type", "application/json");
  if (options.prefer) headers.set("prefer", options.prefer);

  const response = await fetch(`${url}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.text();
  const payload = body ? JSON.parse(body) : null;
  if (!response.ok) {
    const message = payload?.message ?? payload?.error_description ?? "Error al consultar Supabase.";
    throw new Error(message);
  }
  return payload as T;
}

export async function supabaseServerRequest<T>(path: string, options: SupabaseRequestOptions = {}) {
  const { url, key } = configuration(true);
  const headers = new Headers(options.headers);
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  headers.set("accept", "application/json");
  if (options.body && !(options.body instanceof Blob) && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  if (options.prefer) headers.set("prefer", options.prefer);
  const response = await fetch(`${url}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.text();
  const payload = body ? JSON.parse(body) : null;
  if (!response.ok) {
    const error = new Error(payload?.message ?? payload?.error ?? "Error al consultar Supabase desde el servidor.") as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload as T;
}

export async function uploadPrivateAsset(path: string, file: File) {
  return supabaseServerRequest<{ Key?: string }>(`/storage/v1/object/client-product-control/${path}`, {
    method: "POST",
    headers: { "content-type": file.type, "x-upsert": "false" },
    body: file,
  });
}

export async function createPrivateAssetUrl(path: string, expiresIn = 300) {
  const { url } = configuration(true);
  const payload = await supabaseServerRequest<{ signedURL?: string; signedUrl?: string }>(`/storage/v1/object/sign/client-product-control/${path}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn }),
  });
  const signed = payload.signedURL ?? payload.signedUrl;
  if (!signed) throw new Error("No se pudo generar el enlace temporal del archivo.");
  return signed.startsWith("http") ? signed : `${url}${signed}`;
}

export async function deletePrivateAsset(path: string) {
  await supabaseServerRequest<unknown>("/storage/v1/object/client-product-control", {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [path] }),
  });
}
