import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve("design-system/control-operativo-propuestas/og-final.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "public/og.png" });
} finally {
  await browser.close();
}
