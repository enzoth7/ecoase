import { expect, test, type APIRequestContext } from "@playwright/test";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function makeReadyOrder(request: APIRequestContext, quantity: number, ready: number) {
  const date = today();
  const clientName = `Transporte parcial ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json();
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p04" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json();
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity }], orderDate: date, plannedDate: date, transportSource: "internal" } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json();
  const planResponse = await request.put(`/api/order-lines/${order.lines[0].id}/production-allocations`, { data: { allocations: [{ resourceId: "blanc", plannedDate: date, plannedQuantity: ready, status: "draft" }] } });
  expect(planResponse.ok()).toBeTruthy();
  const { line } = await planResponse.json();
  const resultResponse = await request.post(`/api/production-allocations/${line.productionAllocations[0].id}/result`, { data: { actualQuantity: ready, actualDate: date, destination: "client" } });
  expect(resultResponse.ok()).toBeTruthy();
  return { clientName, orderId: order.id, date };
}

test("Logística prioriza Planificación y sus vistas no desbordan en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, heading] of [
    ["/viajes", "Planificación"],
    ["/logistica", "Transporte real"],
    ["/mapa-logistica", "Mapa de tiempos desde Paysandú"],
    ["/limites-logistica", "Límites de logística"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} desborda ${overflow} px`).toBeLessThanOrEqual(1);
  }
  await page.goto("/viajes");
  await expect(page.getByRole("heading", { name: "Transporte a planificar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar pedido" })).toHaveCount(0);
  const boardOverflow = await page.locator(".logistics-planning-board-wrap").evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(boardOverflow).toBeLessThanOrEqual(1);
});

test("configura capacidades de transporte y parámetros por cliente", async ({ page, request }) => {
  const clientName = `Límites cliente ${Date.now()}`;
  const created = await request.post("/api/clients", { data: { name: clientName, address: "Centro, Salto", department: "Salto" } });
  expect(created.ok()).toBeTruthy();
  const { client } = await created.json();
  await page.goto("/limites-logistica");
  await expect(page.getByRole("heading", { name: "Límites de logística" })).toBeVisible();
  for (const removed of ["Direcciones de destino", "Clasificación de pallets", "Choferes", "Centro y jornada"]) {
    await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("Paysandú", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Buscar transporte" })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Buscar cliente en distancias" })).toHaveCount(0);
  await expect(page.locator(".logistics-config-table .native-column-filter-trigger")).toHaveCount(0);
  const transportTable = page.locator(".logistics-config-table").first();
  await expect(transportTable.locator("thead th")).toHaveText(["Transporte", "Tipo", "Volumen orientativo (m³)", "Palets grandes por viaje", "Palets chicos por viaje", "Acciones"]);
  const vehicle = transportTable.locator("tbody tr").filter({ hasText: "HOWO grande" });
  await expect(vehicle.getByLabel("HOWO grande, palets grandes por viaje")).toHaveCount(0);
  await expect(vehicle.locator(".logistics-volume-value")).toHaveText("70,3 a 76,6 m³");
  await vehicle.getByRole("button", { name: "Editar capacidad de HOWO grande" }).click();
  await vehicle.getByLabel("HOWO grande, palets grandes por viaje").fill("275");
  await vehicle.getByLabel("HOWO grande, palets chicos por viaje").fill("640");
  await expect(vehicle.locator(".logistics-volume-value")).toHaveText("70,8 a 76,8 m³");
  await vehicle.getByRole("button", { name: "Guardar capacidad de HOWO grande" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Capacidad de HOWO grande guardada." })).toBeVisible();
  const provider = transportTable.locator("tbody tr").filter({ hasText: "Milton" });
  await provider.getByRole("button", { name: "Editar capacidad de Milton" }).click();
  await provider.getByLabel("Milton, palets grandes por viaje").fill("40");
  await provider.getByLabel("Milton, palets chicos por viaje").fill("80");
  await provider.getByRole("button", { name: "Guardar capacidad de Milton" }).click();
  const customerPickup = transportTable.locator("tbody tr").filter({ hasText: "Retira cliente" });
  await customerPickup.getByRole("button", { name: "Editar capacidad de Retira cliente" }).click();
  await customerPickup.getByLabel("Retira cliente, palets grandes por viaje").fill("10");
  await customerPickup.getByLabel("Retira cliente, palets chicos por viaje").fill("20");
  await customerPickup.getByRole("button", { name: "Guardar capacidad de Retira cliente" }).click();
  const clientRow = page.locator(".logistics-config-table").nth(1).locator("tbody tr").filter({ hasText: clientName });
  await expect(clientRow.locator(".logistics-handling-value")).toHaveText("60 min");
  await expect(clientRow.getByLabel(`${clientName}, distancia en kilómetros`)).toHaveCount(0);
  await clientRow.getByRole("button", { name: `Editar distancia de ${clientName}` }).click();
  await clientRow.getByLabel(`${clientName}, distancia en kilómetros`).fill("125.5");
  await clientRow.getByLabel(`${clientName}, horas de ida`).fill("1.85");
  await expect(clientRow.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("5 aprox.");
  await clientRow.getByLabel(`${clientName}, minutos de carga y descarga por pedido`).fill("90");
  await expect(clientRow.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("4 aprox.");
  await clientRow.getByLabel(`${clientName}, minutos de carga y descarga por pedido`).fill("60");
  await expect(clientRow.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("5 aprox.");
  await clientRow.getByRole("button", { name: `Guardar distancia de ${clientName}` }).click();
  const config = await (await request.get("/api/logistics/config")).json();
  expect(config.vehicles.find((item: { id: string }) => item.id === "howo")).toMatchObject({ largeCapacity: 275, smallCapacity: 640 });
  expect(config.transportCapacities.find((item: { id: string }) => item.id === "provider:milton")).toMatchObject({ largeCapacity: 40, smallCapacity: 80 });
  expect(config.transportCapacities.find((item: { id: string }) => item.id === "customer_pickup")).toMatchObject({ largeCapacity: 10, smallCapacity: 20 });
  expect(config.clientLimits.find((item: { clientId: string }) => item.clientId === client.id)).toMatchObject({ distanceKm: 125.5, travelHours: 1.85, handlingMinutes: 60, ordersPerDay: 5 });
  const invalid = await request.put("/api/logistics/config", { data: { kind: "transport_capacity", source: "provider", providerId: "milton", largeCapacity: 90, smallCapacity: 80 } });
  expect(invalid.status()).toBe(400);
  await page.reload();
  await expect(clientRow.locator('td[data-label="Distancia"] output')).toHaveText("125,5");
  await expect(clientRow.locator('td[data-label="Horas de ida"] output')).toHaveText("1,85");
  await expect(clientRow.locator(".logistics-handling-value")).toHaveText("60 min");
  await expect(page.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("5 aprox.");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Capacidad por transporte" })).toBeVisible();
    await expect(clientRow.locator('td[data-label="Distancia"] output')).toHaveText("125,5");
    await expect(page.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("5 aprox.");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `Límites desborda a ${width} px`).toBeLessThanOrEqual(1);
  }
  await clientRow.getByRole("button", { name: `Editar distancia de ${clientName}` }).click();
  await clientRow.getByLabel(`${clientName}, minutos de carga y descarga por pedido`).fill("90");
  await expect(clientRow.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("4 aprox.");
  await clientRow.getByRole("button", { name: `Cancelar edición de ${clientName}` }).click();
  await expect(clientRow.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("5 aprox.");
  await clientRow.getByRole("button", { name: `Editar distancia de ${clientName}` }).click();
  await page.getByLabel(`${clientName}, horas de ida`).fill("25");
  await expect(page.getByLabel(`${clientName}, pedidos posibles por día`)).toHaveText("0 aprox.");
  await clientRow.getByRole("button", { name: `Guardar distancia de ${clientName}` }).click();
  await expect.poll(async () => {
    const zeroConfig = await (await request.get("/api/logistics/config")).json();
    return zeroConfig.clientLimits.find((item: { clientId: string }) => item.clientId === client.id)?.ordersPerDay;
  }).toBe(0);
  await clientRow.getByRole("button", { name: `Editar distancia de ${clientName}` }).click();
  await page.getByLabel(`${clientName}, horas de ida`).fill("1.85");
  await clientRow.getByRole("button", { name: `Guardar distancia de ${clientName}` }).click();
  const { orderId } = await makeReadyOrder(request, 100, 90);
  const classification = await request.put("/api/logistics/config", { data: { kind: "class", productId: "palbin-p04", palletClass: "small" } });
  expect(classification.ok()).toBeTruthy();
  await page.goto(`/viajes?pedido=${orderId}`);
  const dialog = page.getByRole("dialog", { name: "Asignar transporte" });
  await dialog.getByLabel("Modalidad").selectOption("external");
  await dialog.getByLabel("Transportista", { exact: true }).selectOption("milton");
  await dialog.getByLabel("Capacidad de esta salida").fill("90");
  await expect(dialog.getByRole("complementary", { name: "Carga y volumen" })).toContainText("Chicos0");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.locator(".logistics-line input[type=number]").first().fill("81");
  await expect(dialog.getByRole("complementary", { name: "Carga y volumen" })).toContainText("La carga supera la capacidad configurada del transportista.");
  // Superar la capacidad del transportista es una advertencia: se puede continuar.
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByRole("heading", { name: "Revisá la salida" })).toBeVisible();
});

test("el mapa nacional muestra clientes externos y sus tiempos aunque no existan salidas", async ({ page, request }) => {
  const clientName = `Mapa externo ${Date.now()}`;
  const created = await request.post("/api/clients", { data: { name: clientName, address: "19 de Abril 1967, Salto", department: "Salto" } });
  expect(created.ok()).toBeTruthy();
  const { client } = await created.json();
  expect((await request.put("/api/logistics/config", { data: { kind: "client_limit", clientId: client.id, distanceKm: 120.3, travelHours: 1.75 } })).ok()).toBeTruthy();
  expect((await request.put("/api/logistics/config", { data: { kind: "location", entityType: "client", entityId: client.id,
    address: "19 de Abril 1967, Salto", latitude: -31.386987614, longitude: -57.949637892, precision: "exact", verified: false } })).ok()).toBeTruthy();
  await page.goto("/mapa-logistica");
  const map = page.getByRole("region", { name: "Mapa de tiempos de viaje por carretera desde Paysandú en Uruguay" });
  await expect(map).toBeVisible();
  const marker = map.locator(".logistics-client-marker");
  await marker.hover();
  const popup = map.locator(".travel-client-popup-entry");
  await expect(popup).toContainText(clientName);
  await expect(popup.locator("div").nth(1)).toHaveText("120,3 km");
  await expect(popup.locator("strong").last()).toHaveText("1,75 h de viaje");
  await expect(popup).not.toContainText("aproximada");
  await expect(popup).not.toContainText("estimada");
  const beforeZoom = await marker.boundingBox();
  const mapBounds = await map.boundingBox();
  expect(beforeZoom && mapBounds).toBeTruthy();
  await page.mouse.move(mapBounds!.x + mapBounds!.width / 2, mapBounds!.y + mapBounds!.height / 2);
  await expect(map.locator(".travel-client-popup")).toHaveCount(0);
  await page.mouse.wheel(0, -600);
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.y - beforeZoom!.y)).toBeGreaterThan(10);
  await expect(page.getByRole("group", { name: "Mostrar alcance hasta" })).toHaveCount(0);
  const clientButton = page.getByRole("button", { name: new RegExp(clientName) });
  await expect(clientButton).toContainText("120,3 km");
  await expect(clientButton).toContainText("1,75 h");
  await clientButton.click();
  await expect(clientButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Hasta 2 h", { exact: true }).first()).toBeVisible();
});

test("solo planifica palets listos y confirma el transporte después", async ({ page, request }) => {
  const { clientName, orderId } = await makeReadyOrder(request, 10, 6);
  await page.goto(`/viajes?pedido=${orderId}`);
  const dialog = page.getByRole("dialog", { name: "Asignar transporte" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".modal-heading small")).toHaveCount(0);
  const capacityPanel = dialog.getByRole("complementary", { name: "Carga y volumen" });
  await expect(capacityPanel).toContainText("Listos para enviar6");
  await expect(dialog.getByRole("heading", { name: "¿Cómo lo vas a transportar?" })).toBeVisible();
  await dialog.getByLabel("Modalidad").selectOption("customer_pickup");
  await dialog.getByLabel("Capacidad de esta salida").fill("4");
  await expect(capacityPanel).toContainText("Capacidad indicada4");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByRole("heading", { name: "¿Cuántos palets enviás?" })).toBeVisible();
  await expect(dialog.locator(".logistics-lines-head")).toHaveText("Nombre del productoTamañoCantidad");
  const loadRow = dialog.locator(".logistics-line").first();
  await expect(loadRow.locator(".logistics-line-size")).toHaveText("Chico");
  await expect(loadRow.locator(".logistics-line-quantity small")).toContainText("6 listos");
  await expect(loadRow.locator("input[type=number]")).toBeEmpty();
  expect(await loadRow.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(3);
  await dialog.locator(".logistics-line input[type=number]").first().fill("7");
  // Superar lo listo es una advertencia: se puede planificar igual.
  await expect(capacityPanel).toContainText("La carga supera los palets listos para enviar. Se puede planificar igual.");
  await dialog.locator(".logistics-line input[type=number]").first().fill("5");
  await expect(capacityPanel).toContainText("La carga supera la capacidad indicada. Se puede guardar igual.");
  await dialog.locator(".logistics-line input[type=number]").first().fill("4");
  await expect(capacityPanel).toContainText("Capacidad completa.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await loadRow.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(3);
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByRole("heading", { name: "Revisá la salida" })).toBeVisible();
  await expect(dialog).not.toContainText("Carga prevista:");
  await expect(dialog).not.toContainText("Este es el plan que se guardará");
  await dialog.getByRole("button", { name: "Guardar planificación" }).click();
  await expect(dialog).not.toBeVisible();
  const plannedRuns = await request.get(`/api/logistics/runs?orderId=${orderId}`);
  expect(plannedRuns.ok()).toBeTruthy();
  expect((await plannedRuns.json()).runs).toHaveLength(1);
  const remaining = page.locator(".logistics-queue-table .queue-card").filter({ hasText: clientName });
  await expect(page.locator(".logistics-queue-head")).toHaveText("ClienteListo para enviarTotalEntrega");
  await expect(remaining.locator('[data-label="Listo para enviar"]')).toHaveText("2");
  await expect(remaining.locator('[data-label="Total"]')).toHaveText("10");
  await expect(remaining).not.toContainText("palets listos para planificar");
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `La cola desborda a ${width} px`).toBeLessThanOrEqual(1);
  }
  await expect(page.locator(".logistics-planning-board")).toContainText(clientName);

  await page.goto("/logistica");
  const row = page.locator(".logistics-real-table tbody tr").filter({ hasText: clientName });
  await expect(row).toContainText("4");
  await row.getByRole("button", { name: "Confirmar" }).click();
  const result = page.getByRole("dialog", { name: "Confirmar transporte real" });
  await expect(result.getByRole("button", { name: "Se transportó", exact: true })).toHaveAttribute("aria-pressed", "true");
  await result.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(result).not.toBeVisible();
  await expect(row).toContainText("Se transportó");
  const snapshot = await (await request.get("/api/logistics/snapshot")).json();
  const order = snapshot.orders.find((item: { id: string }) => item.id === orderId);
  expect(order.pending).toBe(6);
  expect(order.shipments[0].lines[0].deliveredQuantity).toBe(4);
});

test("la capacidad de flota propia acompaña la selección de carga", async ({ page, request }) => {
  const { orderId } = await makeReadyOrder(request, 10, 6);
  const classification = await request.put("/api/logistics/config", { data: { kind: "class", productId: "palbin-p04", palletClass: "small" } });
  expect(classification.ok()).toBeTruthy();
  const snapshot = await (await request.get("/api/logistics/snapshot")).json();
  const vehicle = snapshot.vehicles.find((item: { active: boolean; smallCapacity?: number }) => item.active && item.smallCapacity && item.smallCapacity >= 6);
  expect(vehicle).toBeTruthy();
  await page.goto(`/viajes?pedido=${orderId}`);
  const dialog = page.getByRole("dialog", { name: "Asignar transporte" });
  const panel = dialog.getByRole("complementary", { name: "Carga y volumen" });
  await expect(panel).toContainText("Vehículo sin elegir");
  await dialog.getByLabel("Vehículo").selectOption(vehicle.id);
  await expect(panel).toContainText(vehicle.name);
  await expect(panel.locator(".logistics-load-classes")).toContainText(`Chicos0 / ${new Intl.NumberFormat("es-UY").format(vehicle.smallCapacity)}`);
  const smallMeter = panel.getByRole("progressbar", { name: "Palets chicos" });
  await expect(smallMeter).toHaveAttribute("aria-valuemax", String(vehicle.smallCapacity));
  await expect(smallMeter).toHaveAttribute("aria-valuenow", "0");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.locator(".logistics-line input[type=number]").first().fill("2");
  await expect(panel.locator(".logistics-load-classes")).toContainText(`Chicos2 / ${new Intl.NumberFormat("es-UY").format(vehicle.smallCapacity)}`);
  await expect(smallMeter).toHaveAttribute("aria-valuenow", "2");
  await expect(panel.locator(".logistics-load-volume")).toContainText("Volumen de la carga0,2 m³ aprox.");
  await expect(panel.locator(".logistics-load-volume")).toContainText(/Referencia del transporteHasta \d+,\d m³ aprox\./);
  await expect(panel.getByRole("progressbar", { name: "Volumen orientativo ocupado" })).toBeVisible();
  await expect(panel).not.toContainText("lugares disponibles");
});

test("una carga mixta usa el volumen como guía y se puede guardar sin capacidad adicional", async ({ page, request }) => {
  const code = String(Date.now());
  const clientResponse = await request.post("/api/clients", { data: { name: `Mezcla ${code}` } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json();
  const largeResponse = await request.post("/api/products", { data: { kind: "Pallet", measure: "160 x 110", zetaCode: code, attributes: { modelo: `Mezcla ${code}`, tratamiento: "Sin HT" } } });
  expect(largeResponse.ok()).toBeTruthy();
  const { product: largeProduct } = await largeResponse.json();
  const relations = [];
  for (const productId of ["palbin-p04", largeProduct.id]) {
    const response = await request.post(`/api/clients/${client.id}/products`, { data: { productId } });
    expect(response.ok()).toBeTruthy();
    relations.push((await response.json()).product.id);
  }
  const date = today();
  const orderResponse = await request.post("/api/orders", { data: { lines: relations.map((clientProductId, index) => ({ clientProductId, quantity: index === 0 ? 350 : 220 })), orderDate: date, plannedDate: date, transportSource: "internal" } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json();
  for (const line of order.lines) {
    const plan = await request.put(`/api/order-lines/${line.id}/production-allocations`, { data: { allocations: [{ resourceId: "blanc", plannedDate: date, plannedQuantity: line.quantity, status: "draft" }] } });
    expect(plan.ok()).toBeTruthy();
    const allocation = (await plan.json()).line.productionAllocations[0];
    const result = await request.post(`/api/production-allocations/${allocation.id}/result`, { data: { actualQuantity: line.quantity, actualDate: date, destination: "client" } });
    expect(result.ok()).toBeTruthy();
  }

  await page.goto(`/viajes?pedido=${order.id}`);
  const dialog = page.getByRole("dialog", { name: "Asignar transporte" });
  await dialog.getByLabel("Vehículo").selectOption({ label: "HOWO grande" });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  const quantities = dialog.locator(".logistics-line input[type=number]");
  await expect(quantities).toHaveCount(2);
  await quantities.nth(0).fill("350");
  await quantities.nth(1).fill("220");
  const panel = dialog.getByRole("complementary", { name: "Carga y volumen" });
  const config = await (await request.get("/api/logistics/config")).json();
  const howo = config.vehicles.find((item: { id: string }) => item.id === "howo");
  const smallMeter = panel.getByRole("progressbar", { name: "Palets chicos" });
  const largeMeter = panel.getByRole("progressbar", { name: "Palets grandes" });
  await expect(panel.locator(".logistics-load-classes")).toContainText(`Chicos350 / ${new Intl.NumberFormat("es-UY").format(howo.smallCapacity)}`);
  await expect(panel.locator(".logistics-load-classes")).toContainText(`Grandes220 / ${new Intl.NumberFormat("es-UY").format(howo.largeCapacity)}`);
  await expect(smallMeter).toHaveAttribute("aria-valuenow", "350");
  await expect(largeMeter).toHaveAttribute("aria-valuenow", "220");
  const initialScale = await smallMeter.locator("span").evaluate((element) => (element as HTMLElement).style.transform);
  await quantities.nth(0).fill("100");
  await expect(smallMeter).toHaveAttribute("aria-valuenow", "100");
  const reducedScale = await smallMeter.locator("span").evaluate((element) => (element as HTMLElement).style.transform);
  expect(reducedScale).not.toBe(initialScale);
  await quantities.nth(0).fill("350");
  await expect(panel.locator(".logistics-load-volume")).toContainText("Volumen de la carga78,0 m³ aprox.");
  const reference = await panel.locator(".logistics-load-volume strong").nth(1).textContent();
  const referenceM3 = Number(reference?.match(/[\d,]+/)?.[0].replace(",", "."));
  expect(referenceM3).toBeGreaterThan(0);
  expect(78).toBeGreaterThan(referenceM3);
  await expect(dialog.getByRole("button", { name: "Completar espacio" })).toHaveCount(0);
  await expect(dialog.getByLabel("Capacidad confirmada para esta mezcla")).toHaveCount(0);
  await expect(dialog).not.toContainText("Indicá una capacidad confirmada");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("button", { name: "Guardar planificación" }).click();
  await expect(dialog).not.toBeVisible();
  const runs = await request.get(`/api/logistics/runs?orderId=${order.id}`);
  expect(runs.ok()).toBeTruthy();
  expect((await runs.json()).runs).toHaveLength(1);
});

test("una salida no realizada vuelve a dejar los palets disponibles", async ({ page, request }) => {
  const { clientName } = await makeReadyOrder(request, 8, 5);
  await page.goto("/viajes");
  const queueCard = page.locator(".logistics-queue-table .queue-card").filter({ hasText: clientName });
  await expect(queueCard.locator('[data-label="Listo para enviar"]')).toHaveText("5");
  await queueCard.getByRole("button", { name: "Asignar transporte" }).click();
  const dialog = page.getByRole("dialog", { name: "Asignar transporte" });
  await dialog.getByLabel("Modalidad").selectOption("customer_pickup");
  await dialog.getByLabel("Capacidad de esta salida").fill("5");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.locator(".logistics-line input[type=number]").first().fill("5");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("button", { name: "Guardar planificación" }).click();
  await page.goto("/logistica");
  const row = page.locator(".logistics-real-table tbody tr").filter({ hasText: clientName }).first();
  await row.getByRole("button", { name: "Confirmar" }).click();
  const result = page.getByRole("dialog", { name: "Confirmar transporte real" });
  await result.getByRole("button", { name: "No se transportó" }).click();
  await result.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(row).toContainText("No se transportó");
  await page.goto("/viajes");
  await expect(page.locator(".logistics-queue-table .queue-card").filter({ hasText: clientName }).locator('[data-label="Listo para enviar"]')).toHaveText("5");
});

test("arrastrar una salida planificada cambia el día y conserva el horario", async ({ page, request }) => {
  const { clientName, orderId } = await makeReadyOrder(request, 8, 5);
  const monday = new Date(`${today()}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const from = monday.toISOString().slice(0, 10);
  const tuesday = new Date(monday);
  tuesday.setUTCDate(tuesday.getUTCDate() + 1);
  const to = tuesday.toISOString().slice(0, 10);
  await page.goto(`/viajes?pedido=${orderId}`);
  const dialog = page.getByRole("dialog", { name: "Asignar transporte" });
  await dialog.getByLabel("Fecha").fill(from);
  await dialog.getByLabel("Modalidad").selectOption("customer_pickup");
  await dialog.getByLabel("Capacidad de esta salida").fill("2");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.locator(".logistics-line input[type=number]").first().fill("2");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("button", { name: "Guardar planificación" }).click();
  await expect(dialog).not.toBeVisible();
  const before = await (await request.get("/api/logistics/snapshot")).json();
  const run = before.runs.find((item: { orderId: string }) => item.orderId === orderId);
  expect(run).toBeTruthy();
  const updatedRun = await request.patch("/api/logistics/runs", { data: { ...run, plannedStartAt: `${from}T12:00:00.000Z`, plannedEndAt: `${from}T15:00:00.000Z` } });
  expect(updatedRun.ok()).toBeTruthy();
  await page.goto("/viajes");
  const row = page.locator(".logistics-planning-board tbody tr").filter({ has: page.locator("th", { hasText: "Retira cliente" }) });
  const card = row.locator(`td[data-day="${from}"] .logistics-calendar-card`).filter({ hasText: clientName });
  await expect(card).toBeVisible();
  await expect(card.locator(".logistics-card-load")).toHaveText("Total: 2 | Chicos: 2 | Grandes: 0");
  await expect(card).not.toContainText("Vuelta 1");
  await expect(card).not.toContainText("Cambiar fecha");
  await expect(card).not.toContainText("Editar carga");
  await expect(card).not.toContainText("Entrega:");
  await card.click();
  await expect(page.getByRole("dialog", { name: "Asignar transporte" })).toBeVisible();
  await page.getByRole("dialog", { name: "Asignar transporte" }).getByRole("button", { name: "Cerrar" }).click();
  await card.dragTo(row.locator(`td[data-day="${to}"]`));
  await expect(row.locator(`td[data-day="${to}"] .logistics-calendar-card`).filter({ hasText: clientName })).toBeVisible();
  await expect(row.locator(`td[data-day="${to}"] .logistics-card-load`)).toHaveText("Total: 2 | Chicos: 2 | Grandes: 0");
  const after = await (await request.get("/api/logistics/snapshot")).json();
  const moved = after.runs.find((item: { id: string | number }) => String(item.id) === String(run.id));
  expect(moved.plannedDate).toBe(to);
  expect(moved.plannedStartAt).toBe(`${to}T12:00:00.000Z`);
  expect(moved.plannedEndAt).toBe(`${to}T15:00:00.000Z`);
});

test("Planificación no muestra la acción para agendar retiros a proveedores", async ({ page }) => {
  await page.goto("/viajes");
  await expect(page.getByRole("button", { name: "Agendar retiro" })).toHaveCount(0);
  await expect(page.locator(".logistics-panel > header").getByRole("heading", { name: "Retiro a proveedor" })).toHaveCount(0);
});
