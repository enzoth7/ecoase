import { expect, test } from "@playwright/test";

test("cambia de sección sin recargar y conserva datos e historial", async ({ page }) => {
  const documentRequests: string[] = [];
  const orderRequests: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest()) documentRequests.push(request.url());
    if (new URL(request.url()).pathname === "/api/orders" && request.method() === "GET") orderRequests.push(request.url());
  });

  await page.goto("/pedidos");
  await expect(page.locator(".orders-surface")).toBeVisible();
  await page.evaluate(() => Object.defineProperty(window, "__ecoase_navigation_marker", { value: "same-document" }));

  await page.locator('.area-rail a[href="/productos"]').click();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Catálogo");
  await page.locator('.subnav a[href="/niveles"]').click();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Niveles");
  await page.locator('.subnav a[href="/clientes"]').click();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Clientes");
  await page.locator('.client-table-row').first().click();
  await expect(page).toHaveURL(/\/clientes\/[^/]+$/);
  await page.locator('.client-subtab[href="/clientes"]').click();
  await expect(page).toHaveURL(/\/clientes$/);

  await page.locator('.area-rail a[href="/stock"]').click();
  await expect(page.getByRole("heading", { name: "Stock general" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/clientes$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/stock$/);

  expect(await page.evaluate(() => Reflect.get(window, "__ecoase_navigation_marker"))).toBe("same-document");
  expect(documentRequests).toHaveLength(1);
  expect(orderRequests).toHaveLength(1);
});

test("abre enlaces directos y conserva las vistas antiguas", async ({ page }) => {
  await page.goto("/produccion?vista=configuracion");
  await expect(page).toHaveURL(/\/recursos$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Recursos");
  await expect(page.locator(".production-config-table-wrap")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reglas de rendimiento" })).toHaveCount(0);
  await page.locator('.subnav a[href="/reglas-produccion"]').click();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Reglas de rendimiento");
  await expect(page.locator(".client-rules-layout")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar reglas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reglas individuales" })).toHaveCount(0);
  await expect(page.locator('.subnav a[href="/produccion?vista=excepciones"]')).toHaveCount(0);
  await page.goto("/produccion?vista=excepciones");
  await expect(page).toHaveURL(/\/recursos$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Recursos");
  await page.locator('.subnav a[href="/produccion-real"]').click();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Producción real");
  await page.reload();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("Producción real");

  await page.goto("/capacidad?fecha=2026-08-30");
  await expect(page).toHaveURL(/\/recursos\?fecha=2026-08-30$/);
  await page.goto("/tratamiento?fecha=2026-08-30");
  await expect(page).toHaveURL(/\/registro-ht\?fecha=2026-08-30$/);
  await page.goto("/plan?pedido=frutura-74");
  await expect(page).toHaveURL(/\/produccion\?pedido=frutura-74$/);
  await page.goto("/stock");
  await expect(page.getByRole("heading", { name: "Stock general" })).toBeVisible();
});

test("separa los artículos, los indicadores y las entradas de Stock Pamer", async ({ page }) => {
  const products = [
    { id: "palbin", stockName: "Artículo general", sourceCatalog: "Palbin", clientNames: [], pending: 4, ready: 7, reserved: 7 },
    { id: "pamer-original", stockName: "Artículo Pamer histórico", sourceCatalog: "Pamer", clientNames: [], pending: 10, ready: 13, reserved: 3 },
    { id: "pamer-manual", stockName: "Artículo Pamer nuevo", sourceCatalog: "Manual", clientNames: ["Pamer"], pending: 2, ready: 18, reserved: 0 },
    { id: "shared", stockName: "Artículo compartido", sourceCatalog: "Manual", clientNames: ["Pamer", "Otro cliente"], pending: 1, ready: 23, reserved: 2 },
  ];
  await page.route(/\/api\/stock\/summary(?:\?.*)?$/, (route) => route.fulfill({ json: {
    stock: products.map(({ pending, ready, reserved, ...product }) => {
      const orderCommitments = product.id === "pamer-original" ? [
        { orderId: "a", reference: "Pedido A", client: "Cliente A", pending: 2, ready: 1 },
        { orderId: "b", reference: "Pedido B", client: "Cliente B", pending: 0, ready: 2 },
      ] : [];
      return { product: { ...product, kind: "Pallet", requiresTreatment: false }, pending, ready, reserved: reserved + (orderCommitments[0]?.pending ?? 0), available: ready - reserved, physical: pending + ready, orderCommitments };
    }),
  } }));

  await page.goto("/stock");
  const table = page.locator(".stock-table");
  const actions = table.locator("tbody .stock-row-actions");
  const cards = page.locator(".stock-kpis button");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table).toContainText("Artículo general");
  await expect(table).toContainText("Artículo compartido");
  await expect(table.getByRole("columnheader", { name: "Acciones" })).toBeVisible();
  await expect(actions).toHaveText(["", ""]);
  await expect(actions.locator("*")).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: /Días de stock/i })).toHaveCount(0);
  await expect(cards.locator("small")).toHaveText(["Pendiente de HT", "Listo", "Reservado", "Disponible"]);
  await expect(cards.locator("strong")).toHaveText(["5", "30", "9", "21"]);
  const availableCard = cards.filter({ hasText: "Disponible" });
  await availableCard.click();
  await expect(availableCard).toHaveAttribute("aria-pressed", "true");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("Artículo compartido");
  await availableCard.click();
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Buscar producto" }).fill("general");
  await page.getByRole("link", { name: "Stock Pamer" }).click();
  await expect(page).toHaveURL(/\/stock-pamer$/);
  await expect(page.getByRole("link", { name: "Stock Pamer" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("searchbox", { name: "Buscar producto" })).toHaveValue("");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table).toContainText("Artículo Pamer histórico");
  await expect(table).toContainText("Artículo Pamer nuevo");
  await expect(actions).toHaveText(["", ""]);
  await expect(actions.locator("*")).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: /Días de stock/i })).toHaveCount(0);
  await expect(cards.locator("strong")).toHaveText(["12", "31", "5", "28"]);
  await expect(page.getByRole("button", { name: /Productos con alerta/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar entrada de stock" });
  const productOptions = dialog.getByRole("combobox", { name: "Producto" }).locator("option");
  await expect(productOptions).toHaveText(["Seleccionar producto", "Artículo Pamer histórico", "Artículo Pamer nuevo"]);
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  const pamerRow = table.getByRole("row").filter({ hasText: "Artículo Pamer histórico" });
  for (const { label, total, destinations } of [
    { label: "Pendiente de HT", total: 10, destinations: ["Cliente A Pedido A 2 u.", "Sin cliente asignado 8 u."] },
    { label: "Listo", total: 13, destinations: ["Cliente A Pedido A 1 u.", "Cliente B Pedido B 2 u.", "Sin cliente asignado 10 u."] },
    { label: "Reservado", total: 5, destinations: ["Cliente A Pedido A 2 u. pendientes de HT · 1 u. listas 3 u.", "Cliente B Pedido B 2 u."] },
    { label: "Disponible", total: 10, destinations: ["Sin cliente asignado 10 u."] },
  ]) {
    const quantity = pamerRow.getByRole("button", { name: new RegExp(`^${label}: ${total} unidades`) });
    await quantity.click();
    const destination = page.getByRole("dialog", { name: `${label} · ${total} u.` });
    await expect(destination).toContainText("Artículo Pamer histórico");
    await expect(destination.getByRole("listitem")).toHaveText(destinations, { useInnerText: true });
    await destination.getByRole("button", { name: "Cerrar" }).click();
    await expect(quantity).toBeFocused();
  }

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 820 });
    const styles = await cards.evaluateAll((buttons) => buttons.map((button) => {
      const { width, height, top, left, right } = button.getBoundingClientRect();
      return { width, height, top, left, right, background: getComputedStyle(button).backgroundColor };
    }));
    expect(styles.every((style) => style.width >= 120 && style.height >= 110)).toBe(true);
    expect(new Set(styles.map((style) => style.background)).size).toBe(4);
    expect(new Set(styles.map((style) => style.top)).size).toBe(width === 1440 ? 1 : 2);
    const panel = await page.locator(".stock-kpis").evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    });
    const leftGap = Math.min(...styles.map((style) => style.left)) - panel.left;
    const rightGap = panel.right - Math.max(...styles.map((style) => style.right));
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);
  }
  const overflow = await page.locator(".stock-table-wrap").evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await pamerRow.getByRole("button", { name: /^Reservado: 5 unidades/ }).click();
  const mobileDestination = page.getByRole("dialog", { name: "Reservado · 5 u." });
  await expect(mobileDestination).toBeVisible();
  expect(await mobileDestination.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await mobileDestination.getByRole("button", { name: "Cerrar" }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Stock general" })).toBeVisible();
});

test("recupera los productos si la API falla una vez al abrir", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/products", async (route) => {
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Temporal"}' });
    else await route.continue();
  });
  await page.goto("/productos");
  await expect(page.locator(".product-row").first()).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("No se pudieron cargar los datos de esta sección.")).toHaveCount(0);
});

test("guarda reglas para el producto de un cliente sin compartirlas con otro", async ({ page, request }) => {
  const makeClient = async (name: string) => {
    const clientResponse = await request.post("/api/clients", { data: { name } });
    expect(clientResponse.ok()).toBeTruthy();
    const { client } = await clientResponse.json() as { client: { id: string } };
    const productResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
    expect(productResponse.ok()).toBeTruthy();
    const { product } = await productResponse.json() as { product: { id: number | string } };
    return { client, product };
  };
  const first = await makeClient(`Rendimiento A ${Date.now()}`);
  const second = await makeClient(`Rendimiento B ${Date.now()}`);
  const options = await (await request.get(`/api/clients/${first.client.id}/products`)).json() as { products: Array<{ label: string }> };
  const capacity = await (await request.get("/api/capacity?from=2026-11-05&to=2026-11-06")).json() as { capacity: { production: { resources: Array<{ id: number | string; name: string; active: boolean }> } } };
  const resource = capacity.capacity.production.resources.find((item) => item.active)!;
  const name = `${options.products[0].label}, ${resource.name}`;
  await page.goto(`/produccion?vista=reglas&cliente=${first.client.id}`);
  for (const [producer, normal, maximum] of [["Blanc", "250", "350"], ["Sandro Raul", "200", "240"], ["Enzo", "120", "140"], ["Lito", "80", "120"]]) {
    await expect(page.getByRole("spinbutton", { name: `${options.products[0].label}, ${producer}, normal por día` })).toHaveValue(normal);
    await expect(page.getByRole("spinbutton", { name: `${options.products[0].label}, ${producer}, máximo por día` })).toHaveValue(maximum);
  }
  await page.getByRole("spinbutton", { name: `${name}, normal por día` }).fill("100");
  await page.getByRole("spinbutton", { name: `${name}, máximo por día` }).fill("130");
  await page.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(page.getByRole("status")).toContainText("Reglas guardadas");
  const saved = await (await request.get("/api/capacity?from=2026-11-05&to=2026-11-06")).json() as { capacity: { production: { rules: Array<{ clientProductId?: number | string; resourceId: number | string; normalUnitsPerDay: number }> } } };
  expect(saved.capacity.production.rules.some((rule) => String(rule.clientProductId) === String(first.product.id) && String(rule.resourceId) === String(resource.id) && rule.normalUnitsPerDay === 100)).toBe(true);
  expect(saved.capacity.production.rules.some((rule) => String(rule.clientProductId) === String(second.product.id) && String(rule.resourceId) === String(resource.id))).toBe(false);
  expect(saved.capacity.production.rules.some((rule) => String(rule.clientProductId) === String(second.product.id) && rule.normalUnitsPerDay === 250)).toBe(true);
  await page.getByRole("navigation", { name: "Clientes con productos" }).getByRole("button", { name: /Rendimiento B/ }).click();
  await expect(page.getByRole("spinbutton", { name: `${name}, normal por día` })).toHaveValue("");
  await expect(page.getByRole("spinbutton", { name: `${name.replace(resource.name, "Blanc")}, normal por día` })).toHaveValue("250");
  await page.getByRole("spinbutton", { name: `${name}, normal por día` }).fill("40");
  await page.getByRole("navigation", { name: "Clientes con productos" }).getByRole("button", { name: /Rendimiento A/ }).click();
  await page.getByRole("navigation", { name: "Clientes con productos" }).getByRole("button", { name: /Rendimiento B/ }).click();
  await expect(page.getByRole("spinbutton", { name: `${name}, normal por día` })).toHaveValue("40");
});

test("recursos comparte el encabezado y distingue los tipos por texto", async ({ page }) => {
  await page.goto("/produccion?vista=recursos");
  await expect(page.locator(".production-resource-type.external_supplier").first()).toBeVisible();
  await expect(page.locator(".production-resource-type.internal_crew").first()).toBeVisible();
  await expect(page.locator(".production-resource-type.internal_factory").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Filtrar por Tipo" })).toBeVisible();

  const styles = await page.evaluate(() => {
    const background = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
    return {
      navigation: background(".area-rail"),
      header: background(".production-config-table-wrap thead th"),
      types: ["external_supplier", "internal_crew", "internal_factory"].map((type) => background(`.production-resource-type.${type}`)),
    };
  });
  expect(styles.header).toBe(styles.navigation);
  expect(new Set(styles.types).size).toBe(1);
});
