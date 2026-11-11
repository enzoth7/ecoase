import { expect, test } from "@playwright/test";

test("el detalle separa producción real, saldo por producir y fechas", async ({ page, request }) => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const clientName = `Detalle productivo ${Date.now()}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p04" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 10 }], orderDate: date, plannedDate: date } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json() as { order: { lines: Array<{ id: string }> } };
  const planResponse = await request.put(`/api/order-lines/${order.lines[0].id}/production-allocations`, { data: { allocations: [{ resourceId: "blanc", plannedDate: date, plannedQuantity: 10, status: "draft" }] } });
  expect(planResponse.ok()).toBeTruthy();
  const { line } = await planResponse.json() as { line: { productionAllocations: Array<{ id: number | string }> } };
  const resultResponse = await request.post(`/api/production-allocations/${line.productionAllocations[0].id}/result`, { data: { actualQuantity: 6, actualDate: date, destination: "client" } });
  expect(resultResponse.ok()).toBeTruthy();

  await page.goto("/pedidos");
  await page.locator(".order-row").filter({ hasText: clientName }).click();
  await page.getByRole("button", { name: "Producción", exact: true }).click();
  const table = page.locator(".production-tracking-table");
  await expect(table.locator(".native-column-filter-trigger")).toHaveCount(0);
  await expect(table.locator("thead")).toContainText("Producido");
  await expect(table.locator("thead")).toContainText("Pendiente de producir");
  await expect(table.locator("thead")).toContainText("Listo para entregar");
  await expect(table.locator("thead")).toContainText("Fechas");
  await expect(table.locator("thead")).not.toContainText("Pend. HT");
  await expect(table.locator("thead")).not.toContainText("Planificación");
  const row = table.locator("tbody tr").first();
  await expect(row.locator("td").nth(1)).toHaveText("6");
  await expect(row.locator("td").nth(2)).toHaveText("4");
  await expect(row.locator("td").nth(4)).toHaveText("6");
  await expect(row.locator("td").nth(5)).not.toContainText("Completado");
  await expect(row.locator("td").nth(5)).not.toContainText("Borrador");
  const header = table.locator("thead tr");
  expect(await header.locator("th").first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(244, 246, 248)");
  expect(await header.locator("th").first().evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).not.toBe("0px");
  await page.setViewportSize({ width: 390, height: 820 });
  expect(await table.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
});

test("un producto que requiere HT no figura listo antes del tratamiento", async ({ page, request }) => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const clientName = `Pedido con HT ${Date.now()}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "pamer-p01" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 10 }], orderDate: date, plannedDate: date } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json() as { order: { lines: Array<{ id: string }> } };
  const planResponse = await request.put(`/api/order-lines/${order.lines[0].id}/production-allocations`, { data: { allocations: [{ resourceId: "blanc", plannedDate: date, plannedQuantity: 10, status: "draft" }] } });
  expect(planResponse.ok()).toBeTruthy();
  const { line } = await planResponse.json() as { line: { productionAllocations: Array<{ id: number | string }> } };
  const resultResponse = await request.post(`/api/production-allocations/${line.productionAllocations[0].id}/result`, { data: { actualQuantity: 10, actualDate: date, destination: "client" } });
  expect(resultResponse.ok()).toBeTruthy();

  await page.goto("/pedidos");
  await page.locator(".order-row").filter({ hasText: clientName }).click();
  await page.getByRole("button", { name: "Producción", exact: true }).click();
  const row = page.locator(".production-tracking-table tbody tr").first();
  await expect(row.locator("td").nth(1)).toHaveText("10");
  await expect(row.locator("td").nth(3)).toHaveText("0");
  await expect(row.locator("td").nth(4)).toHaveText("0");
});

test("los viajes muestran encabezados redondeados y columnas sin superposición", async ({ page, request }) => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const clientName = `Viaje visual ${Date.now()}`;
  const clientResponse = await request.post("/api/clients", { data: { name: clientName } });
  expect(clientResponse.ok()).toBeTruthy();
  const { client } = await clientResponse.json() as { client: { id: string } };
  const relationResponse = await request.post(`/api/clients/${client.id}/products`, { data: { productId: "palbin-p04" } });
  expect(relationResponse.ok()).toBeTruthy();
  const { product } = await relationResponse.json() as { product: { id: number | string } };
  const orderResponse = await request.post("/api/orders", { data: { lines: [{ clientProductId: product.id, quantity: 10 }], orderDate: date, plannedDate: date } });
  expect(orderResponse.ok()).toBeTruthy();
  const { order } = await orderResponse.json() as { order: { shipments: Array<{ id: number | string }>; lines: Array<{ id: string }> } };
  const planned = await request.patch(`/api/shipments/${order.shipments[0].id}`, { data: { plannedDate: date, transportSource: "internal", lines: [{ orderLineId: order.lines[0].id, plannedQuantity: 10 }] } });
  expect(planned.ok()).toBeTruthy();
  const run = await request.post("/api/logistics/runs", { data: { mode: "customer_pickup", shipmentId: order.shipments[0].id, plannedDate: date } });
  expect(run.ok()).toBeTruthy();
  await page.goto("/pedidos");
  await page.locator(".order-row").filter({ hasText: clientName }).click();
  await page.getByRole("button", { name: /Viajes/ }).click();
  const table = page.locator(".shipment-tracking-table");
  await expect(table).toBeVisible();
  expect(await table.locator("thead th").first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(244, 246, 248)");
  expect(await table.locator("thead th").first().evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).not.toBe("0px");
  await table.locator(".shipment-table-products").evaluate((element) => {
    for (let index = 0; index < 7; index += 1) {
      const name = document.createElement("strong");
      name.textContent = `Pallet especial 120 x 100 con tratamiento ${index + 1}`;
      element.appendChild(name);
    }
  });
  const products = await table.locator("tbody td").nth(4).boundingBox();
  const remittance = await table.locator("tbody td").nth(5).boundingBox();
  expect(products && remittance && products.x + products.width <= remittance.x + 1).toBeTruthy();
  expect(await table.locator(".shipment-table-products").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 390, height: 820 });
  expect(await table.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
});
