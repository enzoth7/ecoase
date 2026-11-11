// Empaqueta el servidor en un solo archivo ESM para la función de Vercel.
// Node en modo ESM exige extensiones en los imports; el código del proyecto usa imports sin extensión.
import { build } from "esbuild";

await build({
  entryPoints: ["server/router.ts"],
  outfile: "server/bundle.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  logLevel: "info",
});
