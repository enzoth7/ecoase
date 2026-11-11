import { expect, test } from "@playwright/test";

function uruguayDay(offset: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const day = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00-03:00`);
  day.setUTCDate(day.getUTCDate() + offset);
  const next = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(day).map((part) => [part.type, part.value]));
  return `${next.year}-${next.month}-${next.day}`;
}

test("Inicio calcula métricas, ordena urgencias y distingue cero", async ({ page }) => {
  const order = (id: string, offset: number, productionDefined: boolean, transportDefined: boolean, delivered = 0) => ({
    id, reference: id, client: id, product: "Pallet de prueba", requested: 10, delivered, pending: 10 - delivered,
    plannedDate: uruguayDay(offset), productionDefined, transportDefined, lines: [], shipments: [], stage: "negociacion",
  });
  await page.route("**/api/orders", (route) => route.fulfill({ json: { orders: [
    order("Hoy", 0, false, false), order("Futuro", 1, false, true), order("Vencido", -1, true, true),
    order("Sin alerta", 8, true, true), order("Cerrado", -2, true, true, 10),
  ] } }));
  await page.route("**/api/history", (route) => route.fulfill({ json: { history: [] } }));
  await page.route("**/api/products", (route) => route.fulfill({ json: { products: [] } }));
  await page.route(/\/api\/stock\/summary(?:\?.*)?$/, (route) => route.fulfill({ json: { stock: [] } }));
  await page.goto("/");
  await expect(page.locator(".home-metric strong")).toHaveText(["4", "1", "2", "1"]);
  await expect(page.locator(".home-attention .home-list-main strong")).toHaveText(["Vencido", "Hoy", "Futuro"]);
  await expect(page.locator(".home-delivery-row .home-list-main strong")).toHaveText(["Hoy", "Futuro"]);
  await expect(page.getByText("Todavía no hay unidades de stock para comparar.")).toBeVisible();
});

test("Inicio muestra gráficos de datos reales y alinea los contenedores", async ({ page }) => {
  const order = (id: string, offset: number) => ({ id, reference: id, client: id, product: "Pallet de prueba", requested: 10, delivered: 0, pending: 10, plannedDate: uruguayDay(offset), productionDefined: true, transportDefined: true, lines: [], shipments: [], stage: "negociacion" });
  await page.route("**/api/orders", (route) => route.fulfill({ json: { orders: [
    order("Hoy", 0),
    { ...order("Mañana A", 1), dispatchedAt: new Date().toISOString() },
    { ...order("Mañana B", 1), delivered: 5, pending: 5 },
  ] } }));
  await page.route("**/api/history", (route) => route.fulfill({ json: { history: [] } }));
  await page.route("**/api/products", (route) => route.fulfill({ json: { products: [] } }));
  await page.route(/\/api\/stock\/summary(?:\?.*)?$/, (route) => route.fulfill({ json: { stock: [{ product: { id: "pallet", stockName: "Pallet de prueba", clientNames: [] }, pending: 10, ready: 30, reserved: 20, available: 10 }] } }));
  await page.goto("/");
  await expect(page.getByRole("img", { name: /Entregas previstas por día/ })).toHaveAttribute("aria-label", /1; .*2;/);
  await expect(page.getByRole("img", { name: /Unidades de stock por estado/ })).toHaveAttribute("aria-label", /Pendiente de HT, 10; Listo, 30; Reservado, 20; Disponible, 10/);
  await expect(page.getByRole("img", { name: /Pedidos activos por estado/ })).toHaveAttribute("aria-label", /Planificado, 1; En viaje, 1; Entrega parcial, 1/);
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await page.evaluate(() => ({
      charts: [...document.querySelectorAll(".home-chart-panel")].map((element) => Math.round(element.getBoundingClientRect().height)),
      panels: [...document.querySelectorAll(".home-grid > .home-panel")].map((element) => Math.round(element.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(sizes.charts[0], `${width}px: gráficos`).toBe(sizes.charts[1]);
    expect(sizes.panels).toHaveLength(3);
    if (width === 1440) expect(new Set(sizes.panels).size, `${width}px: paneles`).toBe(1);
    expect(sizes.overflow, `${width}px: ancho`).toBeLessThanOrEqual(1);
  }
});

test("Inicio resume pendientes y abre el pedido elegido", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Resumen operativo" })).toBeVisible();
  await expect(page.locator(".home-metric")).toHaveCount(4);
  await expect(page.locator(".home-attention .home-list-row").first()).toBeVisible();
  await page.locator(".home-attention .home-list-row").first().click();
  await expect(page).toHaveURL(/\/pedidos$/);
  await expect(page.locator(".order-detail-slot.open")).toBeVisible();
});

test("Inicio muestra el error de stock sin ocultar los pedidos", async ({ page }) => {
  await page.route("**/api/stock/summary", (route) => route.fulfill({ status: 503, json: { error: "Temporal" } }));
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo cargar el stock" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para resolver" })).toBeVisible();
});

test("el gráfico de stock distingue carga, cero unidades y saldos disponibles", async ({ page }) => {
  let releaseStock!: () => void;
  const blocked = new Promise<void>((resolve) => { releaseStock = resolve; });
  let hasStock = false;
  await page.route(/\/api\/stock\/summary(?:\?.*)?$/, async (route) => {
    await blocked;
    await route.fulfill({ json: { stock: hasStock ? [{ product: { id: "stock-test", stockName: "Pallet de prueba", clientNames: [] }, pending: 0, ready: 20, reserved: 5, available: 15 }] : [] } });
  });
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Cargando stock" })).toBeVisible();
  releaseStock();
  await expect(page.getByText("Todavía no hay unidades de stock para comparar.")).toBeVisible();
  hasStock = true;
  await page.reload();
  await expect(page.getByRole("img", { name: /Unidades de stock por estado/ })).toHaveAttribute("aria-label", /Listo, 20; Reservado, 5; Disponible, 15/);
});

test("Inicio diferencia la carga de pedidos de un error", async ({ page }) => {
  let releaseOrders!: () => void;
  const blocked = new Promise<void>((resolve) => { releaseOrders = resolve; });
  await page.route("**/api/orders", async (route) => {
    await blocked;
    await route.fulfill({ status: 503, json: { error: "Temporal" } });
  });
  await page.goto("/");
  await expect(page.locator("main .loading-state")).toBeVisible();
  releaseOrders();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudieron cargar los datos" })).toBeVisible();
});

test("la nueva identidad mantiene navegación y ancho sin desbordes", async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const route of ["/", "/pedidos", "/calendario", "/produccion", "/stock", "/secadero", "/logistica"]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(horizontalOverflow, `${route} a ${width} px`).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/");
  await expect(page.locator(".control-brand")).toHaveText("Operaciones");
  await expect(page.locator(".control-brand img")).toHaveAttribute("src", "/operaciones-mark.svg");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Pedidos" })).toBeVisible();
  await page.locator(".control-sidebar .sidebar-close").click();
  await expect(page.locator(".control-sidebar")).not.toBeInViewport();
});

test("el texto visible conserva un mínimo de 12 px en las áreas operativas", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const route of ["/", "/pedidos", "/calendario", "/produccion", "/stock", "/secadero", "/logistica"]) {
      await page.goto(route);
      await expect(page.locator("main .loading-state")).toHaveCount(0);
      const smallText = await page.locator("main").evaluate((main) => Array.from(main.querySelectorAll("*"))
        .filter((element) => element.childNodes && Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        .filter((element) => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0; })
        .map((element) => ({ text: element.textContent?.trim().slice(0, 45), size: Number.parseFloat(getComputedStyle(element).fontSize), tag: element.tagName, className: element.className }))
        .filter((item) => item.size < 12));
      expect(smallText, `${route} a ${width} px`).toEqual([]);
    }
  }
});

test("Inicio y el menú móvil mantienen áreas táctiles de 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Resumen operativo" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  const undersized = await page.locator(".home-page a, .home-page button, .control-sidebar a, .control-sidebar button").evaluateAll((elements) => elements
    .filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; })
    .map((element) => { const rect = element.getBoundingClientRect(); return { text: element.getAttribute("aria-label") ?? element.textContent?.trim(), width: Math.round(rect.width), height: Math.round(rect.height) }; })
    .filter(({ width, height }) => width < 44 || height < 44));
  expect(undersized).toEqual([]);
});

test("la animación del menú respeta movimiento reducido", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/");
  const sidebar = page.locator(".control-sidebar");
  await expect(sidebar).toHaveCSS("transition-duration", "0.22s");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(sidebar).toBeInViewport();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(sidebar).toHaveCSS("transition-duration", "0s");
  await sidebar.getByRole("button", { name: "Cerrar menú" }).click();
  await expect(sidebar).not.toBeInViewport();
});

test("el panel de áreas se abre con hover y se cierra al salir", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/produccion");
  const sections = page.locator(".control-secondary-panel");
  await expect.poll(async () => Math.round((await sections.boundingBox())?.x ?? -1)).toBe(72);
  await expect(page.locator(".control-secondary-panel h2")).toHaveCount(0);
  await expect(sections).toHaveCSS("border-left-width", "1px");
  await expect(page.locator(".double-sidebar")).toHaveCSS("width", "302px");
  await expect(page.getByRole("button", { name: /Contraer|Expandir/ })).toHaveCount(0);
  await page.mouse.move(36, 180);
  await expect.poll(async () => Math.round((await sections.boundingBox())?.x ?? -1)).toBe(216);
  await page.mouse.move(800, 180);
  await expect.poll(async () => Math.round((await sections.boundingBox())?.x ?? -1)).toBe(72);
});

test("Inicio agrupa Calendario y los paneles no muestran líneas ni contadores", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/pedidos");
  const sidebar = page.locator(".double-sidebar");
  await expect(sidebar.locator(".control-brand-row")).toHaveCSS("border-bottom-width", "0px");
  await expect(sidebar.locator(".control-nav-count, .control-section-links b")).toHaveCount(0);
  await expect(sidebar.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Calendario" })).toHaveCount(0);
  const aligned = await sidebar.evaluate((element) => {
    const firstArea = element.querySelector(".rail-links a")?.getBoundingClientRect();
    const firstSection = element.querySelector(".control-section-links a")?.getBoundingClientRect();
    return Math.abs((firstArea?.top ?? -100) - (firstSection?.top ?? 100));
  });
  expect(aligned).toBeLessThanOrEqual(1);

  await page.mouse.move(36, 130);
  await expect.poll(async () => Math.round((await sidebar.locator(".control-secondary-panel").boundingBox())?.x ?? -1)).toBe(216);
  await sidebar.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Inicio" }).click();
  await expect(sidebar.getByRole("navigation", { name: "Secciones de Inicio" }).getByRole("link", { name: "Calendario" })).toBeVisible();
  await sidebar.getByRole("navigation", { name: "Secciones de Inicio" }).getByRole("link", { name: "Calendario" }).click();
  await expect(page).toHaveURL(/\/calendario$/);
  await expect(page.locator(".workspace-title h1")).toHaveText("Calendario");
  await expect(sidebar.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Inicio" })).toHaveClass(/selected/);
});

test("los encabezados no añaden eyebrow ni flechas de adorno", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".home-page .home-eyebrow, .home-page .home-metric-arrow, .home-page .lucide-arrow-right")).toHaveCount(0);
  await page.goto("/pedidos");
  await expect(page.locator(".workspace-title p")).toHaveCount(0);
});
