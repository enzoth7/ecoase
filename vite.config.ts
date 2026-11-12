import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, sep } from "node:path";
import { serveApi } from "./server/http";
import { generateRoutes } from "./server/generate-routes.mjs";

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: "ecoase-api",
    configureServer(server) {
      const apiDirectory = resolve(server.config.root, "app/api") + sep;
      const refreshRoutes = (path: string) => {
        const file = resolve(path);
        if (file.startsWith(apiDirectory) && file.endsWith(`${sep}route.ts`)) generateRoutes();
      };
      server.watcher.on("add", refreshRoutes).on("unlink", refreshRoutes);
      for (const [key, value] of Object.entries(loadEnv(mode, server.config.root, ""))) {
        process.env[key] ??= value;
      }
      server.middlewares.use((incoming, outgoing, next) => {
        const path = new URL(incoming.url || "/", "http://localhost").pathname;
        if (!path.startsWith("/api/") && path !== "/mcp" && !path.startsWith("/oauth/") && !path.startsWith("/.well-known/oauth-") && !path.startsWith("/.well-known/openid-")) return next();
        void server.ssrLoadModule("/server/router.ts")
          .then((module) => serveApi(incoming, outgoing, module.dispatch))
          .catch((error: unknown) => {
            server.config.logger.error(error instanceof Error ? error.message : "Error en la API.");
            if (!outgoing.headersSent) outgoing.writeHead(500, { "content-type": "application/json" });
            outgoing.end(JSON.stringify({ error: "No se pudo completar la operación." }));
          });
      });
    },
  }],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
  },
  build: { outDir: "dist" },
}));
