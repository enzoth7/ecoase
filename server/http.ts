import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

export async function serveApi(incoming: IncomingMessage, outgoing: ServerResponse, dispatch: (request: Request) => Promise<Response>) {
  const url = new URL(incoming.url || "/", `http://${incoming.headers.host || "localhost"}`);
  const body = incoming.method === "GET" || incoming.method === "HEAD" ? undefined : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
  const request = new Request(url, {
    method: incoming.method,
    headers: incoming.headers as HeadersInit,
    body,
    ...(body ? { duplex: "half" } : {}),
  });
  const response = await dispatch(request);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outgoing.write(value);
    }
  }
  outgoing.end();
}
