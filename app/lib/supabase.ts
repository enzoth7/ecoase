type SupabaseRequestOptions = RequestInit & {
  prefer?: string;
};

function configuration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en el entorno.");
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
