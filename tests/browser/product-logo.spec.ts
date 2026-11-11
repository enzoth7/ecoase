import { expect, test } from "@playwright/test";

test("Logo propio aparece después de Tratamiento y ofrece las opciones de Niveles", async ({ page }) => {
  await page.goto("/niveles");
  await expect(page.getByRole("heading", { name: "Niveles" })).toBeVisible();
  const headings = await page.locator(".levels-sheet thead th input[data-level-label]").evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value));
  expect(headings.indexOf("Logo propio")).toBe(headings.indexOf("Tratamiento") + 1);
  const logoColumn = headings.indexOf("Logo propio");
  await expect(page.locator(`.levels-sheet [data-cell="${logoColumn}:0"]`)).toHaveValue("A");
  await expect(page.locator(`.levels-sheet [data-cell="${logoColumn}:1"]`)).toHaveValue("Crufi");
  await expect(page.locator(`.levels-sheet [data-cell="${logoColumn}:2"]`)).toHaveValue("MSJ");

  await page.goto("/productos");
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  const productHeadings = await page.locator(".products-heading .column-filter > span").allTextContents();
  expect(productHeadings.findIndex((value) => value.includes("Logo propio"))).toBe(productHeadings.findIndex((value) => value.includes("Tratamiento")) + 1);
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const logoSelect = page.getByRole("dialog").getByRole("combobox", { name: "Logo propio" });
  await expect(logoSelect).toBeVisible();
  await expect(logoSelect.locator("option")).toHaveText(["Sin especificar", "A", "Crufi", "MSJ"]);
});

test("Logo propio no agrega desplazamiento horizontal en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/niveles", "/productos"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: route === "/niveles" ? "Niveles" : "Catálogo" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator(route === "/niveles" ? ".levels-sheet" : ".products-scroll").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("Catálogo muestra un botón de papelera que conserva la confirmación", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 920 });
  const created = await page.request.post("/api/products", { data: { kind: "Pallet", measure: "120 x 100", zetaCode: String(Date.now()), attributes: { identificacion: "Punto Rojo" } } });
  expect(created.ok()).toBeTruthy();
  await page.goto("/productos");
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  const deleteButton = page.locator(".product-row .row-delete-icon").first();
  const editButton = page.locator(".product-row .product-edit").first();
  await expect(deleteButton).toHaveAttribute("aria-label", /^Eliminar /);
  await expect(deleteButton.locator("svg")).toBeVisible();
  await expect(deleteButton).not.toContainText("Eliminar");
  const editBox = await editButton.boundingBox();
  const deleteBox = await deleteButton.boundingBox();
  const editIcon = await editButton.locator("svg").boundingBox();
  const deleteIcon = await deleteButton.locator("svg").boundingBox();
  expect(editBox?.width).toBe(deleteBox?.width);
  expect(editBox?.height).toBe(deleteBox?.height);
  expect(editIcon?.width).toBe(deleteIcon?.width);
  expect(editIcon?.height).toBe(deleteIcon?.height);
  const identification = page.locator('.products-heading .column-filter').filter({ hasText: "Identificación" });
  const label = identification.locator("span");
  const labelWidth = await label.evaluate((element) => element.scrollWidth);
  const labelBox = await label.boundingBox();
  const filterBox = await identification.getByRole("button").boundingBox();
  expect(labelBox!.x + labelWidth).toBeLessThanOrEqual(filterBox!.x);
  await deleteButton.click();
  await expect(page.getByRole("alertdialog", { name: /Eliminar/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).last().click();
});

test("Tamaño en Catálogo usa la misma clase que Logística y se puede filtrar", async ({ page }) => {
  const largeCode = String(Date.now());
  const smallCode = String(Date.now() + 1);
  const largeResponse = await page.request.post("/api/products", { data: { kind: "Pallet", measure: "100 x 100", zetaCode: largeCode, attributes: { modelo: `Prueba ${largeCode}`, taco: "5 tacos", refuerzo: "Liviano", identificacion: "Punto Rojo", "corte-esquina": "Con corte", terminacion: "Rústico", tratamiento: "Con HT", "logo-propio": "A" } } });
  const smallResponse = await page.request.post("/api/products", { data: { kind: "Pallet", measure: "100 x 100", zetaCode: smallCode, attributes: { modelo: `Prueba ${smallCode}` } } });
  expect(largeResponse.ok()).toBeTruthy();
  expect(smallResponse.ok()).toBeTruthy();
  const { product: largeProduct } = await largeResponse.json();
  const override = await page.request.put("/api/logistics/config", { data: { kind: "class", productId: largeProduct.id, palletClass: "large", reason: "Prueba de catálogo" } });
  expect(override.ok()).toBeTruthy();

  await page.goto("/productos");
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  await expect(page.locator(".products-heading .column-filter").filter({ hasText: "Tamaño" })).toBeVisible();
  const headings = await page.locator(".products-heading .column-filter > span").allTextContents();
  expect(headings.indexOf("Tamaño")).toBe(headings.indexOf("Medida") + 1);
  const largeRow = page.locator(".product-row").filter({ hasText: largeCode });
  const smallRow = page.locator(".product-row").filter({ hasText: smallCode });
  await expect(largeRow).toContainText("Grande");
  await expect(smallRow).toContainText("Chico");
  await page.getByRole("button", { name: "Filtrar por Tamaño" }).click();
  await page.getByRole("dialog", { name: "Filtrar por Tamaño" }).getByRole("option", { name: "Grande" }).click();
  await expect(largeRow).toBeVisible();
  await expect(smallRow).toHaveCount(0);

  for (const width of [375, 1024, 1440, 1600, 1800, 2048]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.locator(".products-scroll").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `Catálogo desborda a ${width} px`).toBeLessThanOrEqual(1);
    const clippedHeaders = await page.locator(".products-heading .column-filter").evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent?.trim()));
    expect(clippedHeaders, `Encabezados cortados a ${width} px`).toEqual([]);
    if (width >= 1600) {
      await expect(page.locator(".products-heading")).toHaveCSS("display", "grid");
      await expect(largeRow.locator(".column-label").first()).toBeHidden();
      if (width < 1800) {
        const headers = await page.locator(".products-heading .column-filter").evaluateAll((elements) => elements.map((element) => {
          const label = element.querySelector("span")!;
          const arrow = element.querySelector("button")!;
          const labelRect = label.getBoundingClientRect();
          const arrowRect = arrow.querySelector("svg")!.getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(label);
          return { name: label.textContent, clipped: label.scrollWidth > label.clientWidth + 1, overlap: text.getBoundingClientRect().right > arrowRect.left - 2, offset: Math.abs((labelRect.top + labelRect.height / 2) - (arrowRect.top + arrowRect.height / 2)) };
        }));
        expect(headers.filter((header) => header.clipped), `Títulos cortados a ${width} px`).toEqual([]);
        expect(headers.filter((header) => header.overlap), `Títulos y flechas solapados a ${width} px`).toEqual([]);
        expect(headers.filter((header) => header.offset > 1), `Flechas fuera de línea a ${width} px`).toEqual([]);
        await page.getByRole("button", { name: "Filtrar por Tamaño" }).click();
        await expect(page.getByRole("dialog", { name: "Filtrar por Tamaño" })).toBeVisible();
        await page.keyboard.press("Escape");
      }
    }
    if (width >= 1800) {
      const spacing = await page.locator(".products-heading .column-filter").evaluateAll((elements) => elements.slice(1).map((element, index) => Math.round(element.getBoundingClientRect().left - elements[index].getBoundingClientRect().right)));
      expect(Math.min(...spacing), `Separación de encabezados a ${width} px`).toBeGreaterThanOrEqual(7);
      const sidePadding = await page.locator(".section-productos").evaluate((main) => Number.parseFloat(getComputedStyle(main).paddingLeft));
      expect(sidePadding).toBe(16);
    }
  }
});
