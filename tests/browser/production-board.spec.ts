import { expect, test } from "@playwright/test";

test("el asistente de planificación es amplio sin ocupar toda la ventana", async ({ page, request }) => {
  const clientName = `Prueba planificación ${Date.now()}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 10 }], orderDate: "2026-11-05", plannedDate: "2026-11-12" } });
  expect(orderResponse.ok()).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 820 });
  await page.goto("/produccion");
  await page.locator(".phase-queue > .queue-list .queue-card").filter({ hasText: clientName }).getByRole("button").first().click();
  const dialog = page.getByRole("dialog", { name: "Planificar producción" });
  await expect(dialog).toBeVisible();
  const previousWeek = dialog.getByRole("button", { name: "Semana anterior" });
  await expect(previousWeek).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(previousWeek.locator("svg")).toHaveCSS("color", "rgb(24, 79, 55)");
  await expect(previousWeek.locator("svg path")).toHaveCSS("stroke", "rgb(24, 79, 55)");
  for (const viewport of [{ width: 1440, height: 820 }, { width: 390, height: 820 }]) {
    await page.setViewportSize(viewport);
    const bounds = await dialog.boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.width).toBeGreaterThan(viewport.width > 1000 ? 1100 : viewport.width * 0.9);
    if (viewport.width > 1000) {
      expect(bounds!.width).toBeLessThan(viewport.width * 0.9);
      expect(bounds!.height).toBeLessThan(viewport.height * 0.9);
    }
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  }
  await page.setViewportSize({ width: 1440, height: 820 });
  await dialog.locator(".day-picker button").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.locator(".resource-picker").getByText("John y Esteban", { exact: true })).toHaveCount(0);
  const producer = await dialog.locator(".resource-picker button strong").first().textContent();
  await dialog.locator(".resource-picker button").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.locator(".quantity-grid td input").first().fill("10");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog).toContainText("Faltan reglas de rendimiento");
  await dialog.getByRole("button", { name: "Ir a configurar" }).click();
  await expect(page).toHaveURL(new RegExp(`/reglas-produccion\\?cliente=${client.id}`));
  await expect(page.locator(`#client-rule-${product.id}`)).toHaveClass(/focused/);
  await expect(page.locator(`#client-rule-${product.id}`).getByText("John y Esteban", { exact: true })).toHaveCount(0);
  await expect(page.locator(`#client-rule-${product.id}`).getByText("John y Esteban", { exact: true })).toHaveCount(0);
  const ruleCell = page.locator(`#client-rule-${product.id} .rule-matrix-cell`).filter({ has: page.getByText(producer!, { exact: true }) });
  await ruleCell.locator("input").first().fill("20");
  await ruleCell.locator("input").last().fill("30");
  await page.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(page.locator(".client-rules-content [role=status]")).toContainText("Reglas guardadas");
  await page.goto("/produccion");
  await page.locator(".queue-planned summary").click();
  await page.locator(".queue-planned .queue-card").filter({ hasText: clientName }).getByRole("button").first().click();
  const reopened = page.getByRole("dialog", { name: "Planificar producción" });
  await reopened.getByRole("button", { name: "Continuar" }).click();
  await reopened.getByRole("button", { name: "Continuar" }).click();
  await reopened.getByRole("button", { name: "Continuar" }).click();
  await expect(reopened).toContainText("Reglas de rendimiento configuradas");
  await expect(reopened.getByRole("button", { name: "Ir a configurar" })).toHaveCount(0);
  const orders = await (await request.get("/api/orders")).json() as { orders: Array<{ clientId?: string; lines: Array<{ clientProductId?: number | string; productionAllocations?: unknown[] }> }> };
  expect(orders.orders.some((order) => order.clientId === client.id && order.lines.some((line) => String(line.clientProductId) === String(product.id) && (line.productionAllocations?.length ?? 0) > 0))).toBe(true);
});

test("John y Esteban aparece solo al distribuir bins en un pedido mixto", async ({ page, request }) => {
  const suffix = Date.now();
  const clientName = `Pedido mixto ${suffix}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const binResponse = await request.post("/api/products", { data: { kind: "Bin", measure: `${suffix % 100000} x 99`, zetaCode: String(700000000 + suffix % 100000000) } });
  expect(binResponse.ok()).toBeTruthy();
  const { product: bin } = await binResponse.json() as { product: { id: string } };
  const palletLink = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
  const binLink = await request.post(`/api/clients/${client.id}/products`, { data: { productId: bin.id } });
  expect(palletLink.ok()).toBeTruthy();
  expect(binLink.ok()).toBeTruthy();
  const palletRelation = (await palletLink.json()).product as { id: number | string };
  const binRelation = (await binLink.json()).product as { id: number | string };
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: palletRelation.id, quantity: 10 }, { clientProductId: binRelation.id, quantity: 10 }], orderDate: "2026-11-05", plannedDate: "2026-11-12" } });
  expect(orderResponse.ok()).toBeTruthy();
  await page.goto("/produccion");
  await page.locator(".phase-queue > .queue-list .queue-card").filter({ hasText: clientName }).locator("button").first().click();
  const dialog = page.getByRole("dialog", { name: "Planificar producción" });
  await dialog.locator(".day-picker button").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  const john = dialog.locator(".resource-picker button").filter({ hasText: "John y Esteban" });
  await expect(john).toBeVisible();
  await john.click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.locator(".quantity-grid").getByText("John y Esteban", { exact: true })).toHaveCount(0);
  await dialog.getByRole("tab", { name: /Bin/i }).click();
  await expect(dialog.locator(".quantity-grid").getByText("John y Esteban", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(`/produccion?vista=reglas&cliente=${client.id}`);
  const matrix = page.locator(".client-rule-matrix");
  await expect(matrix.locator(".rule-matrix-product")).toHaveCount(2);
  await expect(matrix.locator(".rule-matrix-head").getByText("John y Esteban", { exact: true })).toBeVisible();
  await expect(page.locator(`#client-rule-${palletRelation.id}`).getByText("No aplica", { exact: true })).toBeVisible();
  await expect(page.locator(`#client-rule-${binRelation.id} input`).first()).toBeVisible();
});

test("la ficha de reglas reconoce un pallet aunque la API no envíe el tipo", async ({ page, request }) => {
  const clientResponse = await request.post("/api/clients", { data: { name: `Reglas sin tipo ${Date.now()}` } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  await page.route(`**/api/clients/${client.id}/products`, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { products: Array<{ kind?: string; label: string }> };
    await route.fulfill({ response, json: { ...body, products: body.products.map((item) => { const withoutKind = { ...item }; delete withoutKind.kind; return { ...withoutKind, label: "Producto especial" }; }) } });
  });
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(`/produccion?vista=reglas&cliente=${client.id}`);
  const card = page.locator(`#client-rule-${product.id}`);
  await expect(card).toBeVisible();
  expect(await card.locator(".rule-matrix-cell").count()).toBeGreaterThanOrEqual(7);
  await expect(page.locator(".rule-matrix-head").getByText("Mirasol", { exact: true })).toBeVisible();
  await expect(page.locator(".client-rule-matrix").getByText("John y Esteban", { exact: true })).toHaveCount(0);
  await expect(card.getByText(/^Código /)).toHaveCount(0);
  const clientListOverflow = await page.locator(".client-rules-list").evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(clientListOverflow).toBeLessThanOrEqual(1);
  for (const width of [1680, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, matrix: document.querySelector(".client-rule-matrix")!.scrollWidth - document.querySelector(".client-rule-matrix")!.clientWidth }));
    expect(overflow.page).toBeLessThanOrEqual(1);
    expect(overflow.matrix).toBeLessThanOrEqual(1);
  }
});

test("muestra la ocupación normal por productor y el resumen diario", async ({ page, request }) => {
  const [monday, tuesday] = await page.evaluate(() => {
    const current = new Date();
    const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - (current.getDay() + 6) % 7 + 28);
    const tuesday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1);
    const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return [date(monday), date(tuesday)];
  });
  const clientResponse = await request.post("/api/clients", { data: { name: `Ocupación diaria ${Date.now()}` } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  const beforeResponse = await request.get(`/api/capacity?from=${monday}&to=${tuesday}`);
  const before = await beforeResponse.json() as { capacity: { production: { rules: Array<{ clientProductId?: number | string; resourceId: string; normalUnitsPerDay: number }> } } };
  const blancRule = before.capacity.production.rules.find((rule) => String(rule.clientProductId) === String(product.id) && rule.resourceId === "blanc");
  expect(blancRule?.normalUnitsPerDay).toBe(250);
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 550 }], orderDate: monday, plannedDate: tuesday } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json() as { order: { id: string; lines: Array<{ id: string }> } };
  const allocationsResponse = await request.put(`/api/order-lines/${order.lines[0].id}/production-allocations`, { data: { allocations: [
    { resourceId: "blanc", plannedDate: monday, plannedQuantity: 250, status: "draft" },
    { resourceId: "blanc", plannedDate: tuesday, plannedQuantity: 300, status: "draft" },
  ] } });
  expect(allocationsResponse.ok()).toBeTruthy();

  await page.goto("/produccion");
  for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: "Semana siguiente" }).click();
  const blancRow = page.locator(".production-board tbody tr").filter({ hasText: "Blanc" });
  const fullCell = blancRow.locator(`td[data-day="${monday}"]`);
  const overCell = blancRow.locator(`td[data-day="${tuesday}"]`);
  await expect(fullCell).toHaveAttribute("data-load-percent", "100");
  await expect(fullCell).toHaveAttribute("data-load-state", "full");
  await expect(fullCell.locator(".board-load")).toHaveText("100%");
  await expect(overCell).toHaveAttribute("data-load-percent", "120");
  await expect(overCell).toHaveAttribute("data-load-state", "over");
  await expect(overCell.locator(".board-load")).toHaveText("120%");
  const fullColor = await fullCell.evaluate((element) => getComputedStyle(element).backgroundColor);
  const overColor = await overCell.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(overColor).not.toBe(fullColor);
  const emptyCell = page.locator(".production-board tbody tr").filter({ hasText: "Mirasol" }).locator(`td[data-day="${monday}"]`);
  await expect(emptyCell.locator(".board-load")).toHaveText("0%");
  for (const cell of [fullCell, emptyCell]) {
    const position = await cell.evaluate((element) => { const box = element.getBoundingClientRect(); const indicator = element.querySelector(".board-load")!.getBoundingClientRect(); return { right: box.right - indicator.right, bottom: box.bottom - indicator.bottom }; });
    expect(position.right).toBeLessThanOrEqual(8);
    expect(position.bottom).toBeLessThanOrEqual(8);
  }

  const capacityResponse = await request.get(`/api/capacity?from=${monday}&to=${tuesday}`);
  const { capacity } = await capacityResponse.json() as { capacity: { production: { days: Array<{ date: string; resources: Array<{ normalLoad?: number; assignments: unknown[] }> }> } } };
  for (const day of [monday, tuesday]) {
    const entries = capacity.production.days.find((item) => item.date === day)!.resources;
    const used = entries.reduce((sum, entry) => sum + (entry.normalLoad ?? 0), 0);
    const summary = page.locator(`.board-capacity-row td[data-day="${day}"]`);
    await expect(summary).toHaveAttribute("data-capacity-percent", String(Math.round(used / entries.length * 100)));
    await expect(summary.locator("strong")).toHaveText(`${Math.round(used / entries.length * 100)}%`);
    await expect(summary.locator("small")).toHaveCount(0);
    expect(await summary.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  }
});

test("abre el detalle del producto y mueve una asignación entre días", async ({ page, request }) => {
  const [monday, tuesday, saturday, sunday] = await page.evaluate(() => {
    const today = new Date();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7);
    const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return [0, 1, 5, 6].map((offset) => date(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset)));
  });
  const clientName = `Cliente de prueba de planificación ${Date.now()}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02", operationalName: "Alias corto" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  const productName = "Palets Citrus / Con HT";
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 100 }], orderDate: monday, plannedDate: tuesday } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json() as { order: { id: string; lines: Array<{ id: string; product: string; quantity: number }> } };
  const line = order.lines[0];
  expect(line.product).toBe("Alias corto");
  const save = await request.put(`/api/order-lines/${line.id}/production-allocations`, { data: { allocations: [{ resourceId: "blanc", plannedDate: monday, plannedQuantity: line.quantity, status: "draft" }] } });
  expect(save.ok()).toBeTruthy();
  const { line: savedLine } = await save.json() as { line: { productionAllocations: Array<{ id: string | number }> } };
  const id = savedLine.productionAllocations[0].id;

  await page.goto("/produccion");
  const card = page.locator(`.board-chip[data-allocation-id="${id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator("strong")).toHaveText(productName);
  const quantityLabel = `100 u. | ${clientName}`;
  await expect(card.locator("span")).toHaveText(quantityLabel);
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(card).toBeVisible();
    const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  const capacityResponse = await request.get(`/api/capacity?from=${monday}&to=${tuesday}`);
  const { capacity } = await capacityResponse.json() as { capacity: { production: { days: Array<{ date: string; resources: Array<{ assignments: Array<{ plannedQuantity: number }> }> }> } } };
  const expectedMonday = capacity.production.days.find((day) => day.date === monday)!.resources.reduce((sum, resource) => sum + resource.assignments.reduce((quantity, assignment) => quantity + assignment.plannedQuantity, 0), 0);
  const mondayTotal = page.locator(`.production-board .board-total-row td[data-day="${monday}"]`);
  const tuesdayTotal = page.locator(`.production-board .board-total-row td[data-day="${tuesday}"]`);
  await expect(page.locator(".production-board thead th")).toHaveCount(7);
  await expect(page.locator(".production-board .board-total-row td")).toHaveCount(6);
  await expect(page.locator(".production-board .board-produced-row td")).toHaveCount(6);
  await expect(page.locator(".production-board .board-capacity-row td")).toHaveCount(6);
  await expect(page.locator(`.production-board .board-total-row td[data-day="${saturday}"]`)).toBeVisible();
  await expect(page.locator(`.production-board td[data-day="${sunday}"]`)).toHaveCount(0);
  await expect(mondayTotal).toHaveAttribute("data-total", String(expectedMonday));
  await expect(mondayTotal).toContainText("palets");
  const tuesdayBefore = Number(await tuesdayTotal.getAttribute("data-total"));
  await card.click();
  const dialog = page.getByRole("dialog", { name: "Detalle de producción" });
  await expect(dialog).toContainText(productName);
  await expect(dialog).toContainText(clientName);
  await dialog.getByRole("button", { name: "Cerrar" }).click();

  const target = page.locator(`.production-board tbody tr`).filter({ hasText: "Blanc" }).locator(`td[data-day="${tuesday}"]`);
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  expect(from && to).toBeTruthy();
  await page.mouse.move(from!.x + 20, from!.y + 15);
  await page.mouse.down();
  await page.mouse.move(from!.x + 34, from!.y + 24, { steps: 4 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 32, { steps: 12 });
  await expect(card).toHaveClass(/board-chip-dragging/);
  await expect(target).toHaveClass(/board-drop-target/);
  await expect(target.locator(".board-chip-preview")).toBeVisible();
  await expect(target.locator(".board-chip-preview strong")).toHaveText(productName);
  await expect(target.locator(".board-chip-preview span")).toHaveText(quantityLabel);
  expect(Number(await card.evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.5);
  await page.mouse.up();
  await expect(page.locator(`td[data-day="${tuesday}"] .board-chip[data-allocation-id="${id}"]`)).toBeVisible();
  await expect(mondayTotal).toHaveAttribute("data-total", String(expectedMonday - line.quantity));
  await expect(tuesdayTotal).toHaveAttribute("data-total", String(tuesdayBefore + line.quantity));
  await expect(page.locator(`.production-board tbody tr`).filter({ hasText: "Blanc" }).locator(`td[data-day="${monday}"] .board-load`)).toBeVisible();
  await expect(page.locator(`.production-board tbody tr`).filter({ hasText: "Blanc" }).locator(`td[data-day="${tuesday}"] .board-load`)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Detalle de producción" })).toHaveCount(0);
  const updated = await (await request.get(`/api/orders/${order.id}`)).json() as { order: { productionDate?: string; lines: Array<{ productionAllocations: Array<{ id: string | number; plannedDate: string }> }> } };
  expect(updated.order.lines.flatMap((item) => item.productionAllocations).find((item) => String(item.id) === String(id))?.plannedDate).toBe(tuesday);
  expect(updated.order.productionDate).toBe(tuesday);
});

test("registra desde la producción planificada y muestra el destino real", async ({ page, request }) => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const clientName = `Destino de prueba ${Date.now()}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: string | number } };
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 10 }], orderDate: date, plannedDate: date } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json() as { order: { id: string; lines: Array<{ id: string; product: string }> } };
  const planResponse = await request.put(`/api/order-lines/${order.lines[0].id}/production-allocations`, { data: { allocations: [{ resourceId: "blanc", plannedDate: date, plannedQuantity: 10, status: "draft" }] } });
  expect(planResponse.ok()).toBeTruthy();
  const { line } = await planResponse.json() as { line: { productionAllocations: Array<{ id: string | number }> } };
  const id = line.productionAllocations[0].id;

  await page.goto("/produccion");
  const card = page.locator(`.board-chip[data-allocation-id="${id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText(order.lines[0].product);
  await expect(card).toContainText("10 u.");
  await expect(card).toContainText(clientName);
  await card.click();
  await expect(page.getByRole("dialog", { name: "Detalle de producción" })).toContainText(clientName);

  await page.goto(`/produccion?vista=semanal&fecha=${date}`);
  const item = page.locator(".production-real-item").filter({ hasText: clientName });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Pendiente");
  await item.getByRole("button", { name: "Registrar resultado" }).click();
  const beforeCapacity = await (await request.get(`/api/capacity?from=${date}&to=${date}`)).json() as { capacity: { production: { days: Array<{ producedQuantity: number }> } } };
  const producedBefore = beforeCapacity.capacity.production.days[0].producedQuantity;
  const dialog = page.getByRole("dialog", { name: "Registrar producción real" });
  await expect(dialog).toContainText("Planificado: 10 unidades");
  await page.setViewportSize({ width: 390, height: 820 });
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  await dialog.getByLabel("Unidades producidas").fill("12");
  await dialog.getByRole("button", { name: "Stock general", exact: true }).click();
  await dialog.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(item).toContainText("Stock general");
  await expect(item).toContainText("12");
  const detail = await request.get(`/api/orders/${order.id}`);
  const updated = await detail.json() as { order: { lines: Array<{ productionAllocations: Array<{ resultDestination?: string; actualQuantity?: number }> }> } };
  expect(updated.order.lines[0].productionAllocations[0].resultDestination).toBe("stock");
  expect(updated.order.lines[0].productionAllocations[0].actualQuantity).toBe(12);
  await page.goto("/produccion");
  await expect(page.locator(`.board-produced-row td[data-day="${date}"]`)).toHaveAttribute("data-produced-total", String(producedBefore + 12));
  await page.goto("/pedidos");
  await page.locator(".order-row").filter({ hasText: clientName }).click();
  const summary = page.locator(".tracking-summary");
  await expect(summary).toContainText("Pedido");
  await expect(summary).toContainText("Producido");
  await expect(summary).toContainText("Por producir");
  await expect(summary).toContainText("Entregado");
  await expect(summary).not.toContainText("Saldo");
  await expect(summary.locator(".tracking-kpi-produced strong")).toHaveText("12");
  await expect(summary.locator(".tracking-kpi-pending strong")).toHaveText("0");
  await expect(page.locator(".tracking-stock-allocation")).toContainText("12 en stock general");
  const summaryColors = await summary.locator(":scope > div").evaluateAll((cards) => cards.map((card) => getComputedStyle(card).backgroundColor));
  expect(new Set(summaryColors).size).toBe(4);
  await page.setViewportSize({ width: 390, height: 820 });
  expect(await summary.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
  await expect(page.locator(".tracking-order-data")).not.toContainText("Código");
  await expect(page.locator(".tracking-order-data")).not.toContainText("Operaciones requeridas");
});

test("suma lo producido en la fecha real y muestra lo pendiente del pedido", async ({ page, request }) => {
  const actualDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const previousDate = new Date(`${actualDate}T12:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const plannedDate = previousDate.toISOString().slice(0, 10);
  const before = await (await request.get(`/api/capacity?from=${actualDate}&to=${actualDate}`)).json() as { capacity: { production: { days: Array<{ producedQuantity: number }> } } };
  const previousTotal = before.capacity.production.days[0].producedQuantity;
  const clientName = `Producción real ${Date.now()}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: string | number } };
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 10 }], orderDate: plannedDate, plannedDate: actualDate } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json() as { order: { id: string; lines: Array<{ id: string }> } };
  const planResponse = await request.post(`/api/orders/${order.id}/production-plan`, { data: { allocations: [{ orderLineId: order.lines[0].id, resourceId: "blanc", plannedDate, plannedQuantity: 10 }] } });
  expect(planResponse.ok()).toBeTruthy();
  await page.goto(`/produccion?vista=semanal&fecha=${plannedDate}`);
  await page.locator(".production-real-item").filter({ hasText: clientName }).getByRole("button", { name: "Registrar resultado" }).click();
  const resultDialog = page.getByRole("dialog", { name: "Registrar producción real" });
  await expect(resultDialog.getByLabel("Fecha real")).toHaveValue(plannedDate);
  await resultDialog.getByLabel("Fecha real").fill(actualDate);
  await resultDialog.getByLabel("Unidades producidas").fill("6");
  await resultDialog.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(resultDialog).toHaveCount(0);

  await page.locator('.subnav a[href="/produccion"]').click();
  await expect(page.locator(`.board-produced-row td[data-day="${actualDate}"]`)).toHaveAttribute("data-produced-total", String(previousTotal + 6));
  await page.locator('.area-rail a[href="/pedidos"]').click();
  await page.locator(".order-row").filter({ hasText: clientName }).click();
  await expect(page.locator(".tracking-kpi-produced strong")).toHaveText("6");
  await expect(page.locator(".tracking-kpi-pending strong")).toHaveText("4");
  await page.locator('.area-rail a[href="/produccion"]').click();
  await page.locator(".queue-planned summary").click();
  const pendingCard = page.locator(".queue-planned .queue-card").filter({ hasText: clientName });
  await expect(pendingCard).toContainText("4 palets por planificar");
  await pendingCard.getByRole("button", { name: "Planificar pendientes" }).click();
  const pendingDialog = page.getByRole("dialog", { name: "Planificar pendientes" });
  await expect(pendingDialog.locator(".modal-heading")).toContainText("4 palets por planificar");
  await pendingDialog.locator(".day-picker button").first().click();
  await pendingDialog.getByRole("button", { name: "Continuar" }).click();
  await pendingDialog.locator(".resource-picker button").first().click();
  await pendingDialog.getByRole("button", { name: "Continuar" }).click();
  await expect(pendingDialog).toContainText("Faltan 4 palets por planificar");
  await page.goto("/secadero");
  const dryingCard = page.locator(".phase-queue .queue-card").filter({ hasText: clientName });
  await expect(dryingCard).toContainText("6");
  await expect(page.locator(".metric-tile").filter({ hasText: "Palets físicos pendientes de HT" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});

test("colorea el resultado de cada tarjeta y oculta el porcentaje al cerrar el día", async ({ page, request }) => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const clientResponse = await request.post("/api/clients", { data: { name: `Resultado visual ${Date.now()}` } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p02" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  const resourceName = `Cuadrilla resultado ${Date.now()}`;
  const resourceResponse = await request.post("/api/capacity/resources", { data: { name: resourceName, resourceType: "internal_crew", displayOrder: 999 } });
  expect(resourceResponse.ok()).toBeTruthy();
  const { resource } = await resourceResponse.json() as { resource: { id: number | string } };
  const allocations: Array<string | number> = [];

  for (const result of [{ actualQuantity: 10, destination: "client" }, { actualQuantity: 12, destination: "stock" }, { actualQuantity: 0, destination: undefined }]) {
    const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 10 }], orderDate: date, plannedDate: date } });
    expect(orderResponse.ok()).toBeTruthy();
    const { order } = await orderResponse.json() as { order: { lines: Array<{ id: string }> } };
    const planResponse = await request.put(`/api/order-lines/${order.lines[0].id}/production-allocations`, { data: { allocations: [{ resourceId: resource.id, plannedDate: date, plannedQuantity: 10, status: "draft" }] } });
    expect(planResponse.ok()).toBeTruthy();
    const { line } = await planResponse.json() as { line: { productionAllocations: Array<{ id: number | string }> } };
    const id = line.productionAllocations[0].id;
    allocations.push(id);
    const resultResponse = await request.post(`/api/production-allocations/${id}/result`, { data: { actualQuantity: result.actualQuantity, actualDate: date, destination: result.destination } });
    expect(resultResponse.ok()).toBeTruthy();
  }

  await page.goto("/produccion");
  const row = page.locator(".production-board tbody tr").filter({ hasText: resourceName });
  const cell = row.locator(`td[data-day="${date}"]`);
  await expect(cell).toHaveAttribute("data-load-state", "completed");
  await expect(cell.locator(".board-load")).toHaveCount(0);
  const colors: string[] = [];
  for (const [index, state, label, quantity] of [
    [0, "client", "Para el cliente", "10 u."],
    [1, "stock", "Stock general", "12 u."],
    [2, "not-produced", "No se produjo", "0 u."],
  ] as const) {
    const card = cell.locator(`.board-chip[data-allocation-id="${allocations[index]}"]`);
    await expect(card).toHaveAttribute("data-result-state", state);
    await expect(card).toContainText(label);
    await expect(card).toContainText(quantity);
    colors.push(await card.evaluate((element) => getComputedStyle(element).backgroundColor));
  }
  expect(new Set(colors).size).toBe(3);
  expect(colors).not.toContain("rgb(255, 255, 255)");
});

test("muestra filtros de columnas en popover y evita barras horizontales", async ({ page }) => {
  await page.goto("/productos");
  await expect(page.locator(".product-row").first()).toBeVisible();
  await expect(page.locator(".products-heading")).toContainText("Tipo");
  await expect(page.locator(".products-heading")).not.toContainText("Nombre");
  await expect(page.locator(".product-row .row-link").filter({ hasText: "Pallets" }).first()).toBeVisible();
  const labels = await page.locator(".products-heading .column-filter > span").allTextContents();
  for (const label of labels) {
    const trigger = page.getByRole("button", { name: `Filtrar por ${label}` });
    await expect(trigger.locator("svg path")).toHaveAttribute("d", "m6 9 6 6 6-6");
    await trigger.click();
    const popup = page.getByRole("dialog", { name: `Filtrar por ${label}` });
    await expect(popup.getByRole("listbox")).toBeVisible();
    await expect(popup.locator("select")).toHaveCount(0);
    await expect(popup.getByRole("option", { name: label, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
  await page.getByRole("dialog", { name: "Filtrar por Tipo" }).getByRole("option", { name: "Pallets" }).click();
  await expect(page.locator(".product-row .row-link").first()).toHaveText("Pallets");
  await page.goto("/produccion");
  await expect(page.locator(".production-board thead .native-column-filter-trigger").first()).toBeVisible();
  const producerHeader = page.locator(".production-board-corner");
  await expect(producerHeader.locator(".native-column-filter-trigger svg path")).toHaveAttribute("d", "m6 9 6 6 6-6");
  const aligned = await producerHeader.evaluate((header) => { const text = header.firstChild; const button = header.querySelector("button"); if (!text || !button) return false; const range = document.createRange(); range.selectNodeContents(text); const label = range.getBoundingClientRect(); const icon = button.getBoundingClientRect(); return Math.abs(label.top + label.height / 2 - (icon.top + icon.height / 2)) < 8; });
  expect(aligned).toBe(true);
  await page.getByRole("button", { name: "Filtrar por Quién produce" }).click();
  await page.getByRole("dialog", { name: "Filtrar por Quién produce" }).getByRole("searchbox").fill("Blanc");
  await expect(page.locator(".production-board tbody tr:visible")).toHaveCount(1);
  const navColor = await page.locator(".area-rail").evaluate((element) => getComputedStyle(element).backgroundColor);
  const headerColor = await page.locator(".phase-header").first().evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(headerColor).toBe(navColor);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.locator(".production-board-wrap").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("ajusta las secciones con tablas sin barras horizontales", async ({ page }) => {
  const selectors = ".products-scroll, .production-board-wrap, .quantity-grid-wrap, .production-table-wrap, .stock-table-wrap, .treatment-table-wrap, .production-config-table-wrap, .production-weekly-table-wrap, .matrix-table-container, .operations-calendar, .levels-scroll, .week-columns, .clients-board, .providers-board, .client-rules-layout, .client-rules-content, .client-rule-product";
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 820 });
    for (const route of ["/productos", "/niveles", "/clientes", "/proveedores", "/produccion", "/produccion?vista=semanal", "/produccion?vista=recursos", "/produccion?vista=reglas", "/stock", "/secadero?vista=registro", "/calendario"]) {
      await page.goto(route);
      await expect(page.locator(".workspace-title")).not.toBeEmpty();
      const expected = route === "/productos" ? ".product-row" : route === "/niveles" ? ".levels-sheet" : route === "/clientes" ? ".client-table-row" : route === "/proveedores" ? ".provider-table-row" : route === "/produccion" ? ".production-board" : route.includes("vista=semanal") ? ".production-real-days" : route.includes("vista=reglas") ? ".client-rules-layout" : route.includes("vista=recursos") ? ".production-config-table-wrap" : route === "/stock" ? ".stock-table" : route.startsWith("/secadero") ? ".treatment-table" : ".operations-calendar-board";
      await expect(page.locator(expected).first()).toBeVisible();
      const overflowing = await page.locator(selectors).evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().width > 0 && element.scrollWidth > element.clientWidth + 2).map((element) => `${element.className}: ${element.scrollWidth - element.clientWidth}px`));
      expect(overflowing, `${route} at ${width}px`).toEqual([]);
    }
  }
});

test("redondea los encabezados de producción sin divisores extra", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await page.goto("/produccion");
  await expect(page.locator(".production-board thead th").first()).toBeVisible();
  const planning = await page.evaluate(() => {
    const section = getComputedStyle(document.querySelector<HTMLElement>(".phase-header")!);
    const first = getComputedStyle(document.querySelector<HTMLElement>(".production-board thead th:first-child")!);
    return {
      sectionRadius: section.borderTopLeftRadius,
      sectionBorder: section.borderBottomWidth,
      columnRadius: first.borderTopLeftRadius,
      columnBorder: first.borderRightWidth,
      plannedBorder: document.querySelector<HTMLElement>(".queue-planned") ? getComputedStyle(document.querySelector<HTMLElement>(".queue-planned")!).borderTopWidth : null,
    };
  });
  expect(planning).toMatchObject({ sectionRadius: "12px", sectionBorder: "0px", columnRadius: "12px", columnBorder: "0px" });
  if (planning.plannedBorder !== null) expect(planning.plannedBorder).toBe("0px");

  await page.goto("/produccion?vista=recursos");
  await expect(page.locator(".production-config-table-wrap thead th").first()).toBeVisible();
  const resources = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(".production-config-section > header")!;
    const heading = document.querySelector<HTMLElement>(".production-config-table-wrap thead th")!;
    return {
      radius: getComputedStyle(section).borderTopLeftRadius,
      border: getComputedStyle(section).borderBottomWidth,
      gap: heading.getBoundingClientRect().top - section.getBoundingClientRect().bottom,
      columnRadius: getComputedStyle(heading).borderTopLeftRadius,
    };
  });
  expect(resources.radius).toBe("12px");
  expect(resources.border).toBe("0px");
  expect(resources.gap).toBeGreaterThanOrEqual(8);
  expect(resources.columnRadius).toBe("12px");

  await page.setViewportSize({ width: 390, height: 820 });
  const mobileResourcesRadius = await page.locator(".production-config-table-wrap thead tr").evaluate((row) => getComputedStyle(row).borderTopLeftRadius);
  expect(mobileResourcesRadius).toBe("12px");
  await page.goto("/produccion");
  await expect(page.locator(".production-board thead tr")).toBeVisible();
  const mobileCalendarRadius = await page.locator(".production-board thead tr").evaluate((row) => getComputedStyle(row).borderTopLeftRadius);
  expect(mobileCalendarRadius).toBe("12px");
});
