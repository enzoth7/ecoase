import { expect, test } from "@playwright/test";

test("Registro de HT muestra primero los KPI y alinea los controles de fecha", async ({ page }) => {
  await page.goto("/registro-ht");
  await expect(page.getByRole("heading", { name: "Registro de HT" })).toBeVisible();
  await expect(page.locator(".treatment-kpis article")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Confirmación semanal de HT" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registros del día" })).toBeVisible();

  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return {
        inputHeight: box('.treatment-header-actions input[type="date"]').height,
        buttonHeight: box(".treatment-header-actions > button").height,
        kpiTop: box(".treatment-kpis").top,
        weeklyTop: box(".treatment-results").top,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(Math.abs(layout.inputHeight - layout.buttonHeight), `${width}px: altura`).toBeLessThanOrEqual(1);
    expect(layout.kpiTop, `${width}px: orden`).toBeLessThan(layout.weeklyTop);
    expect(layout.overflow, `${width}px: ancho`).toBeLessThanOrEqual(1);
  }
});
