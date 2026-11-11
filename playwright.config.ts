import { defineConfig } from "@playwright/test";

const port = Number(process.env.ECOASE_E2E_PORT || 3477);

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium", channel: "chrome", headless: true },
  webServer: {
    command: "node --import tsx server/node.ts --serve-dist",
    url: `http://127.0.0.1:${port}/api/orders`,
    env: { ECOASE_DATA_BACKEND: "memory", PORT: String(port) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
  reporter: "list",
});
