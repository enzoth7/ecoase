import { CalendarDays, ClipboardList } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { getOrderOperationalStatus, getOrderPlannedDate, isOrderClosed, orderOperationalStatusLabels, type OperationOrder, type OrderOperationalStatus } from "../data";
import { orderNeedsDrying } from "./PhaseViews";
import { scopeStockInventory, type StockSummaryRow } from "../stock";
import { AppLink } from "../navigation-client";
import type { OrderStatusChartPoint, StockChartPoint } from "./HomeCharts";

const DeliveryLineChart = lazy(() => import("./HomeCharts").then((module) => ({ default: module.DeliveryLineChart })));
const StockBarsChart = lazy(() => import("./HomeCharts").then((module) => ({ default: module.StockBarsChart })));
const OrderStatusDonutChart = lazy(() => import("./HomeCharts").then((module) => ({ default: module.OrderStatusDonutChart })));

const orderStatusColors: Record<Exclude<OrderOperationalStatus, "delivered" | "cancelled">, string> = {
  planned: "#D9A000",
  produced: "#1D6FD1",
  ht_planning: "#5B9BE0",
  ht_confirmed: "#1D6FD1",
  shipped: "#2A9D5C",
};

type StockState = { status: "loading" | "ready" | "error"; rows: StockSummaryRow[] };
type OrderAttention = { order: OperationOrder; issues: string[]; priority: number; date: string };
const number = new Intl.NumberFormat("es-UY");
const dateFormat = new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Montevideo" });

function dateKeyInUruguay(date: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateLabel(value: string) { return dateFormat.format(new Date(`${value}T12:00:00-03:00`)); }
function orderDeliveryDate(order: OperationOrder) {
  return (order.shipments ?? []).filter((shipment) => !["delivered", "cancelled"].includes(shipment.status)).map((shipment) => shipment.plannedDate).sort()[0] ?? getOrderPlannedDate(order);
}

export default function OperationHome({ orders, treatmentProductIds, onOpenOrder, onNewOrder }: { orders: OperationOrder[]; treatmentProductIds: Set<string>; onOpenOrder: (id: string) => void; onNewOrder: () => void }) {
  const [stock, setStock] = useState<StockState>({ status: "loading", rows: [] });
  const [today, setToday] = useState(() => dateKeyInUruguay(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setToday(dateKeyInUruguay(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const end = new Date(`${today}T12:00:00-03:00`);
  end.setUTCDate(end.getUTCDate() + 6);
  const lastDay = dateKeyInUruguay(end);
  const active = useMemo(() => orders.filter((order) => !isOrderClosed(order)), [orders]);

  useEffect(() => {
    const controller = new AbortController();
    setStock({ status: "loading", rows: [] });
    fetch("/api/stock/summary", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { stock?: StockSummaryRow[] };
        if (!response.ok || !payload.stock) throw new Error("No se pudo cargar el stock.");
        setStock({ status: "ready", rows: scopeStockInventory(payload.stock, orders) });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setStock({ status: "error", rows: [] }); });
    return () => controller.abort();
  }, [orders]);

  const late = active.filter((order) => orderDeliveryDate(order) < today);
  const missingProduction = active.filter((order) => order.productionDefined === false);
  const missingTransport = active.filter((order) => order.transportDefined === false);
  const attention = active.map((order): OrderAttention | null => {
    const date = orderDeliveryDate(order);
    const issues: string[] = [];
    if (date < today) issues.push("Entrega vencida");
    else if (date === today) issues.push("Entrega hoy");
    if (order.productionDefined === false) issues.push("Sin producción");
    if (orderNeedsDrying(order, treatmentProductIds) && !order.dryingStartDate) issues.push("HT sin programar");
    if (order.transportDefined === false) issues.push("Sin transporte");
    if (!issues.length) return null;
    return { order, issues, date, priority: date < today ? 0 : date === today ? 1 : order.productionDefined === false ? 2 : order.transportDefined === false ? 3 : 4 };
  }).filter((item): item is OrderAttention => item !== null).sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date) || a.order.client.localeCompare(b.order.client, "es"));
  const upcoming = active.filter((order) => { const date = orderDeliveryDate(order); return date >= today && date <= lastDay; })
    .sort((a, b) => orderDeliveryDate(a).localeCompare(orderDeliveryDate(b)) || a.client.localeCompare(b.client, "es"))
    .slice(0, 6);
  const deliveriesByDate = new Map<string, number>();
  for (const order of active) {
    const date = orderDeliveryDate(order);
    if (date >= today && date <= lastDay) deliveriesByDate.set(date, (deliveriesByDate.get(date) ?? 0) + 1);
  }
  const deliveryChart = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(`${today}T12:00:00-03:00`);
    day.setUTCDate(day.getUTCDate() + index);
    const date = dateKeyInUruguay(day);
    return { date, label: `${day.getUTCDate()}/${day.getUTCMonth() + 1}`, count: deliveriesByDate.get(date) ?? 0 };
  });
  const stockChart: StockChartPoint[] = [
    { label: "Pendiente de HT", count: stock.rows.reduce((total, row) => total + (row.pending || 0), 0), color: "#B58900" },
    { label: "Listo", count: stock.rows.reduce((total, row) => total + (row.ready || 0), 0), color: "#41515E" },
    { label: "Reservado", count: stock.rows.reduce((total, row) => total + (row.reserved || 0), 0), color: "#3E6E9A" },
    { label: "Disponible", count: stock.rows.reduce((total, row) => total + (row.available || 0), 0), color: "#277448" },
  ];
  const stageGroups: Array<{ statuses: OrderOperationalStatus[]; color: string }> = [
    { statuses: ["planned"], color: orderStatusColors.planned },
    { statuses: ["produced", "ht_planning", "ht_confirmed"], color: orderStatusColors.produced },
    { statuses: ["shipped"], color: orderStatusColors.shipped },
  ];
  const orderStatusChart: OrderStatusChartPoint[] = stageGroups
    .map(({ statuses, color }) => ({ label: orderOperationalStatusLabels[statuses[0]], count: active.filter((order) => statuses.includes(getOrderOperationalStatus(order))).length, color }))
    .filter(({ count }) => count > 0);

  return <div className="home-page">
    <header className="home-heading">
      <h1 className="sr-only">Resumen operativo</h1>
      <button type="button" className="primary-button" onClick={onNewOrder}>Nuevo pedido</button>
    </header>

    <section className="home-metrics" aria-label="Indicadores operativos">
      {[
        { label: "Pedidos activos", value: active.length, tone: "active-orders", href: "/pedidos" },
        { label: "Entregas vencidas", value: late.length, tone: "overdue-deliveries", href: "/calendario" },
        { label: "Sin producción", value: missingProduction.length, tone: "missing-production", href: "/produccion" },
        { label: "Sin transporte", value: missingTransport.length, tone: "missing-transport", href: "/viajes" },
      ].map(({ label, value, tone, href }) => <AppLink className="home-metric" data-kpi={tone} key={label} href={href}>
        <strong>{number.format(value)}</strong><div className="home-metric-label">{label}</div>
      </AppLink>)}
    </section>

    <div className="home-charts">
      <section className="home-panel home-chart-panel" aria-labelledby="home-delivery-chart-title">
        <div className="home-panel-heading"><div><h2 id="home-delivery-chart-title">Entregas por día</h2><div className="home-panel-description">Próximos siete días</div></div><AppLink href="/calendario">Ver calendario</AppLink></div>
        <div className="home-chart-body"><Suspense fallback={<div className="home-chart-message">Cargando gráfico…</div>}><DeliveryLineChart data={deliveryChart} /></Suspense></div>
      </section>
      <section className="home-panel home-chart-panel" aria-labelledby="home-stock-chart-title">
        <div className="home-panel-heading"><div><h2 id="home-stock-chart-title">Stock por estado</h2><div className="home-panel-description">Unidades, listo incluye reservado</div></div><AppLink href="/stock">Ver stock</AppLink></div>
        <div className="home-chart-body">{stock.status === "loading" ? <div className="home-chart-message" role="status">Cargando stock…</div> : stock.status === "error" ? <div className="home-chart-message" role="alert">No se pudo cargar el stock.</div> : !stockChart.some(({ count }) => count > 0) ? <div className="home-chart-message">Todavía no hay unidades de stock para comparar.</div> : <Suspense fallback={<div className="home-chart-message">Cargando gráfico…</div>}><StockBarsChart data={stockChart} /></Suspense>}</div>
      </section>
    </div>

    <div className="home-grid">
      <section className="home-panel home-attention" aria-labelledby="home-attention-title">
        <div className="home-panel-heading"><h2 id="home-attention-title">Para resolver</h2><AppLink href="/pedidos">Ver pedidos</AppLink></div>
        {attention.length ? <div className="home-list">{attention.slice(0, 8).map(({ order, issues, date }) => <button type="button" className="home-list-row" key={order.id} onClick={() => onOpenOrder(order.id)}>
          <div className="home-list-main"><strong>{order.client}</strong><small>{order.product}, {dateLabel(date)}</small></div>
          <div className="home-issue-list">{issues.map((issue) => <div className={issue === "Entrega vencida" ? "home-issue urgent" : "home-issue"} key={issue}>{issue}</div>)}</div>
        </button>)}</div> : <div className="home-empty"><ClipboardList size={22} aria-hidden="true" /><strong>No hay pedidos que requieran atención.</strong><div className="home-empty-description">Las nuevas alertas aparecerán aquí.</div></div>}
      </section>

      <section className="home-panel" aria-labelledby="home-upcoming-title">
        <div className="home-panel-heading"><div><h2 id="home-upcoming-title">Próximas entregas</h2><div className="home-panel-description">Desde hoy, siete días</div></div><AppLink href="/calendario" aria-label="Ver calendario"><CalendarDays size={18} aria-hidden="true" /></AppLink></div>
        {upcoming.length ? <div className="home-list">{upcoming.map((order) => <button type="button" className="home-list-row home-delivery-row" key={order.id} onClick={() => onOpenOrder(order.id)}><time className="home-delivery-date" dateTime={orderDeliveryDate(order)}>{dateLabel(orderDeliveryDate(order))}</time><div className="home-list-main"><strong>{order.client}</strong><small>{order.product}</small></div></button>)}</div> : <div className="home-empty"><CalendarDays size={22} aria-hidden="true" /><strong>No hay entregas previstas para esta semana.</strong></div>}
      </section>

      <section className="home-panel home-status-panel" aria-labelledby="home-status-title">
        <div className="home-panel-heading"><h2 id="home-status-title">Pedidos por estado</h2><AppLink href="/pedidos">Ver pedidos</AppLink></div>
        <div className="home-status-body">{orderStatusChart.length ? <Suspense fallback={<div className="home-chart-message">Cargando gráfico…</div>}><OrderStatusDonutChart data={orderStatusChart} /></Suspense> : <div className="home-chart-message">No hay pedidos activos.</div>}</div>
      </section>

    </div>
  </div>;
}
