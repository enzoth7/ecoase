import { expect, test } from "@playwright/test";

test("el editor calcula superficie y conserva altura sin agregar columnas al catálogo", async ({ page }) => {
  const code = String(Date.now());
  const created = await page.request.post("/api/products", {
    data: { kind: "Pallet", measure: "120 x 100", zetaCode: code },
  });
  expect(created.ok()).toBeTruthy();
  const { product } = await created.json();
  expect(product.heightCm).toBe(10);

  await page.goto("/productos");
  const row = page.locator(".product-row").filter({ hasText: code });
  await row.locator(".product-edit").click();
  const dialog = page.getByRole("dialog", { name: "Producto" });
  await expect(dialog.getByRole("textbox", { name: "Ancho (cm)" })).toHaveValue("100");
  await expect(dialog.getByRole("textbox", { name: "Largo (cm)" })).toHaveValue("120");
  await expect(dialog.getByLabel("Superficie de base")).toHaveText("1,20 m²");
  await expect(dialog.getByRole("textbox", { name: "Altura (cm)" })).toHaveValue("10");
  await expect(dialog).not.toContainText("Si queda vacía, Logística usa 10 cm como referencia.");

  await dialog.getByRole("textbox", { name: "Ancho (cm)" }).fill("102");
  await dialog.getByRole("textbox", { name: "Largo (cm)" }).fill("122");
  await dialog.getByRole("textbox", { name: "Altura (cm)" }).fill("12");
  await expect(dialog.getByLabel("Superficie de base")).toHaveText("1,2444 m²");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).not.toBeVisible();

  const response = await page.request.get("/api/products");
  expect(response.ok()).toBeTruthy();
  const { products } = await response.json();
  expect(products.find((item: { id: string }) => item.id === product.id)).toMatchObject({ measure: "122 x 102", heightCm: 12 });
  await page.reload();
  await row.locator(".product-edit").click();
  await expect(dialog.getByRole("textbox", { name: "Ancho (cm)" })).toHaveValue("102");
  await expect(dialog.getByRole("textbox", { name: "Largo (cm)" })).toHaveValue("122");
  await expect(dialog.getByRole("textbox", { name: "Altura (cm)" })).toHaveValue("12");
  await expect(dialog.getByLabel("Superficie de base")).toHaveText("1,2444 m²");
  await expect(page.locator(".products-heading")).not.toContainText("Superficie de base");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
});
