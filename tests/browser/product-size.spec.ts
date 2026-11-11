import { expect, test } from "@playwright/test";

test("el catálogo clasifica por superficie y permite corregir y restablecer el tamaño", async ({ page }) => {
  const code = String(Date.now());
  const created = await page.request.post("/api/products", {
    data: { kind: "Pallet", measure: "122 x 102", zetaCode: code, attributes: { modelo: `Tamaño ${code}` } },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/productos");
  const row = page.locator(".product-row").filter({ hasText: code });
  await expect(row).toContainText("Grande");
  await expect(row.locator(".product-size-edit")).toHaveCount(0);
  await expect(row.locator(".product-edit")).toHaveCount(1);

  await row.locator(".product-edit").click();
  const dialog = page.getByRole("dialog", { name: "Producto" });
  await expect(dialog.getByRole("combobox", { name: "Tamaño logístico" })).toHaveValue("auto");
  await dialog.getByRole("combobox", { name: "Tamaño logístico" }).selectOption("small");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(row).toContainText("Chico");

  await page.reload();
  await expect(row).toContainText("Chico");
  await row.locator(".product-edit").click();
  await dialog.getByRole("combobox", { name: "Tamaño logístico" }).selectOption("auto");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(row).toContainText("Grande");

  await page.reload();
  await expect(row).toContainText("Grande");
  const config = await page.request.get("/api/logistics/config");
  expect(config.ok()).toBeTruthy();
  const { product } = await created.json();
  const { classes } = await config.json();
  expect(classes[product.id]).toBeUndefined();
});
