import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatch } from "./router";
import { serveApi } from "./http";

const serveDist = process.argv.includes("--serve-dist");
const port = Number(process.env.PORT || (serveDist ? 3000 : 3001));
const dist = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || "/", `http://${incoming.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/") || url.pathname === "/mcp") {
      await serveApi(incoming, outgoing, dispatch);
      return;
    }
    if (!serveDist) { outgoing.writeHead(404).end(); return; }
    let file = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    if (file !== dist && !file.startsWith(dist + sep)) { outgoing.writeHead(403).end(); return; }
    if (url.pathname === "/") file = resolve(dist, "index.html");
    try { if (!(await stat(file)).isFile()) file = resolve(dist, "index.html"); }
    catch {
      if (url.pathname.startsWith("/assets/") || extname(url.pathname)) { outgoing.writeHead(404).end(); return; }
      file = resolve(dist, "index.html");
    }
    const content = await readFile(file);
    outgoing.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" }).end(content);
  } catch (error) {
    console.error(error);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end("Error interno.");
  }
}).listen(port, "127.0.0.1", () => console.log(`Ecoase ${serveDist ? "app" : "API"} en http://127.0.0.1:${port}`));
