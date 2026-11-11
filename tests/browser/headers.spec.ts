import { expect, test } from "@playwright/test";

test("los encabezados conservan las palabras completas sin desbordar la pantalla", async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [375, 768, 1024, 1440, 2048]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/clientes", "/productos", "/pedidos", "/produccion", "/stock", "/secadero", "/logistica", "/registro-ht", "/recursos", "/niveles"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      if (route === "/clientes") await expect(page.locator(".clients-heading")).toBeVisible();
      const defects = await page.evaluate(() => {
        const headings = [...document.querySelectorAll<HTMLElement>('main [class*="heading"], main thead th, main h1, main h2, main h3, main h4')];
        const defects: string[] = [];
        for (const heading of headings) {
          if (getComputedStyle(heading).display === "none" || heading.getBoundingClientRect().width === 0) continue;
          const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const value = node.textContent ?? "";
            for (const match of value.matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const rects = [...range.getClientRects()];
              if (rects.length > 1 && Math.max(...rects.map((rect) => rect.top)) - Math.min(...rects.map((rect) => rect.top)) > 2) {
                defects.push(`Palabra cortada: ${match[0]} en ${heading.className || heading.tagName}`);
              }
            }
          }
        }
        if (document.documentElement.scrollWidth > window.innerWidth + 1) defects.push(`Desborde: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
        return defects;
      });
      expect(defects, `${route} a ${width}px`).toEqual([]);
    }
  }
});
