"use client";

import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  PackageCheck,
  Search,
  Truck,
  Users,
  Warehouse,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  orderFilters,
  orders,
  type OperationOrder,
  type OrderFilter,
  type OrderStatus,
} from "./data";

const number = new Intl.NumberFormat("es-UY");
type DashboardSection = "pedidos" | "calendario" | "logistica" | "clientes";

const weekDays = [
  { name: "Lun", day: 10 },
  { name: "Mar", day: 11 },
  { name: "Mié", day: 12 },
  { name: "Jue", day: 13 },
  { name: "Vie", day: 14 },
  { name: "Sáb", day: 15 },
];

const statusIcons: Record<OrderStatus, LucideIcon> = {
  bloqueado: AlertTriangle,
  coordinacion: CircleDot,
  completado: CheckCircle2,
};

function StatusBadge({ order }: { order: OperationOrder }) {
  const Icon = statusIcons[order.status];
  return (
    <span className={`status-badge ${order.status}`}>
      <Icon size={14} aria-hidden="true" />
      {order.statusLabel}
    </span>
  );
}

function QuantitySummary({ order }: { order: OperationOrder }) {
  return (
    <div className="quantity-summary" aria-label="Cantidades del pedido">
      <div>
        <span>Pedido</span>
        <strong>{number.format(order.requested)}</strong>
      </div>
      <div>
        <span>Entregado</span>
        <strong>{number.format(order.delivered)}</strong>
      </div>
      <div className={order.pending > 0 ? "pending" : ""}>
        <span>Saldo</span>
        <strong>{number.format(order.pending)}</strong>
      </div>
    </div>
  );
}

function OperationFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article className="operation-fact">
      <span className="fact-icon"><Icon size={17} aria-hidden="true" /></span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function OrderDetail({ order }: { order: OperationOrder }) {
  const progress = Math.round((order.delivered / order.requested) * 100);

  return (
    <aside className="order-detail" id="order-detail" aria-live="polite" aria-labelledby="order-detail-title">
      <div className="detail-heading">
        <div>
          <StatusBadge order={order} />
          <h2 id="order-detail-title">{order.client}</h2>
          <p>{order.product}</p>
        </div>
        <span className="order-reference">{order.reference}</span>
      </div>

      <div className="detail-meta">
        <span><CalendarDays size={15} aria-hidden="true" />{order.dateLabel}</span>
        <span><Truck size={15} aria-hidden="true" />{order.transport}</span>
      </div>

      <QuantitySummary order={order} />

      <div className="detail-progress" aria-label={`${progress}% entregado`}>
        <span><b>Avance</b><strong>{progress}%</strong></span>
        <i><b style={{ width: `${progress}%` }} /></i>
      </div>

      <section className="operation-section" aria-labelledby="operation-title">
        <div className="subsection-title">
          <p>Operación</p>
          <h3 id="operation-title">Preparación y entrega</h3>
        </div>
        <div className="operation-grid">
          <OperationFact icon={Warehouse} label="Abastecimiento" value={order.supply} />
          <OperationFact icon={Wrench} label="Preparación" value={order.preparation} />
          <OperationFact icon={Truck} label="Logística" value={order.logistics} />
          <OperationFact icon={PackageCheck} label="Entrega" value={order.delivery} />
        </div>
      </section>

      <section className="lines-section" aria-labelledby="lines-title">
        <div className="subsection-title horizontal">
          <div>
            <p>Pedido</p>
            <h3 id="lines-title">{order.lines.length} {order.lines.length === 1 ? "línea" : "líneas"}</h3>
          </div>
          {order.remittance && <span>Remito {order.remittance}</span>}
        </div>
        <div className="line-list">
          {order.lines.map((line) => (
            <div key={line.id}>
              <span>
                <strong>{line.product}</strong>
                {line.preparation && <small>{line.preparation}</small>}
              </span>
              <b>{number.format(line.quantity)}</b>
            </div>
          ))}
        </div>
      </section>

      <div className={`action-card ${order.status}`}>
        <span>{order.status === "completado" ? "Estado" : "Acción operativa"}</span>
        <strong>{order.action}</strong>
      </div>
    </aside>
  );
}

type ClientSummary = {
  name: string;
  orders: number;
  requested: number;
  delivered: number;
  pending: number;
};

function ClientsView({ clients, onOpen }: { clients: ClientSummary[]; onOpen: (client: string) => void }) {
  return (
    <section className="clients-surface" aria-labelledby="clients-title">
      <div className="clients-toolbar">
        <div>
          <p className="eyebrow">Cartera operativa</p>
          <h2 id="clients-title">Clientes</h2>
        </div>
        <span>{clients.length} clientes activos</span>
      </div>
      <div className="client-list">
        {clients.map((client) => (
          <button type="button" className="client-row" key={client.name} onClick={() => onOpen(client.name)}>
            <span className="client-avatar" aria-hidden="true">{client.name.slice(0, 1)}</span>
            <span className="client-name"><strong>{client.name}</strong><small>{client.orders} {client.orders === 1 ? "pedido" : "pedidos"}</small></span>
            <span><small>Pedido</small><strong>{number.format(client.requested)}</strong></span>
            <span><small>Entregado</small><strong>{number.format(client.delivered)}</strong></span>
            <span className={client.pending > 0 ? "client-pending" : "client-complete"}><small>Saldo</small><strong>{number.format(client.pending)}</strong></span>
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function CalendarView({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <section className="module-surface" aria-labelledby="calendar-page-title">
      <div className="module-toolbar">
        <div><p className="eyebrow">Semana 33</p><h2 id="calendar-page-title">Calendario</h2></div>
        <span>10–15 agosto 2026</span>
      </div>
      <div className="calendar-board">
        {weekDays.map((day) => {
          const dayOrders = orders.filter((order) => Number(order.dateLabel.match(/\d+/)?.[0]) === day.day && !order.dateLabel.includes("julio"));
          return (
            <section className="calendar-day" key={day.day} aria-label={`${day.name} ${day.day}`}>
              <div><span>{day.name}</span><strong>{day.day}</strong><small>{dayOrders.length} {dayOrders.length === 1 ? "pedido" : "pedidos"}</small></div>
              <div className="calendar-orders">
                {dayOrders.map((order) => (
                  <button type="button" key={order.id} onClick={() => onOpen(order.id)}>
                    <StatusBadge order={order} /><strong>{order.client}</strong><span>{order.reference}</span><small>{number.format(order.requested)} unidades</small>
                  </button>
                ))}
                {dayOrders.length === 0 && <p>Sin entregas</p>}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function LogisticsView({ onOpen }: { onOpen: (id: string) => void }) {
  const transports = [...new Set(orders.map((order) => order.transport))];
  return (
    <section className="module-surface" aria-labelledby="logistics-page-title">
      <div className="module-toolbar">
        <div><p className="eyebrow">Distribución</p><h2 id="logistics-page-title">Logística</h2></div>
        <span>{transports.length} transportes registrados</span>
      </div>
      <div className="logistics-board">
        {orders.map((order) => (
          <button type="button" className="logistics-order" key={order.id} onClick={() => onOpen(order.id)}>
            <span className="logistics-icon"><Truck size={18} aria-hidden="true" /></span>
            <span><strong>{order.client}</strong><small>{order.reference} · {order.product}</small></span>
            <span><small>Fecha</small><strong>{order.dateLabel}</strong></span>
            <span><small>Transporte</small><strong>{order.transport}</strong></span>
            <StatusBadge order={order} />
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function matchesFilter(order: OperationOrder, filter: OrderFilter) {
  if (filter === "gestion") return order.status !== "completado";
  if (filter === "completados") return order.status === "completado";
  return true;
}

export default function Dashboard() {
  const [section, setSection] = useState<DashboardSection>("pedidos");
  const [filter, setFilter] = useState<OrderFilter>("gestion");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(orders[0].id);
  const detailRef = useRef<HTMLDivElement>(null);

  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      if (!matchesFilter(order, filter)) return false;
      if (!normalized) return true;
      return [order.client, order.reference, order.product, order.transport]
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
    });
  }, [filter, query]);

  const selectedOrder = visibleOrders.find((order) => order.id === selectedId) ?? visibleOrders[0] ?? orders[0];
  const inManagement = orders.filter((order) => order.status !== "completado").length;
  const blocked = orders.filter((order) => order.status === "bloqueado").length;
  const completed = orders.filter((order) => order.status === "completado").length;
  const clients = useMemo<ClientSummary[]>(() => {
    const summaries = new Map<string, ClientSummary>();
    orders.forEach((order) => {
      const current = summaries.get(order.client) ?? { name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0 };
      current.orders += 1;
      current.requested += order.requested;
      current.delivered += order.delivered;
      current.pending += order.pending;
      summaries.set(order.client, current);
    });
    return [...summaries.values()].sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "es"));
  }, []);

  const selectOrder = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 920px)").matches) {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const openClientOrders = (client: string) => {
    setSection("pedidos");
    setFilter("todos");
    setQuery(client);
    setSelectedId(orders.find((order) => order.client === client)?.id ?? orders[0].id);
  };

  const openOrder = (id: string) => {
    setSection("pedidos");
    setFilter("todos");
    setQuery("");
    setSelectedId(id);
  };

  const sectionCopy: Record<DashboardSection, { eyebrow: string; title: string }> = {
    pedidos: { eyebrow: "Pedidos y logística", title: "Control operativo" },
    calendario: { eyebrow: "Plan semanal", title: "Calendario" },
    logistica: { eyebrow: "Entregas y transporte", title: "Logística" },
    clientes: { eyebrow: "Relación comercial", title: "Clientes" },
  };

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>

      <aside className="app-sidebar" aria-label="Navegación principal">
        <div className="brand" aria-label="Ecoase">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>Ecoase</strong><small>Control operativo</small></span>
        </div>

        <div className="sidebar-section">
          <p>Principal</p>
          <nav aria-label="Secciones principales">
            <button type="button" className={section === "pedidos" ? "active" : ""} onClick={() => setSection("pedidos")} aria-pressed={section === "pedidos"}>
              <ClipboardList size={17} aria-hidden="true" /><span>Pedidos</span><b>{orders.length}</b>
            </button>
            <button type="button" className={section === "calendario" ? "active" : ""} onClick={() => setSection("calendario")} aria-pressed={section === "calendario"}>
              <CalendarDays size={17} aria-hidden="true" /><span>Calendario</span>
            </button>
            <button type="button" className={section === "logistica" ? "active" : ""} onClick={() => setSection("logistica")} aria-pressed={section === "logistica"}>
              <Truck size={17} aria-hidden="true" /><span>Logística</span>
            </button>
            <button type="button" className={section === "clientes" ? "active" : ""} onClick={() => setSection("clientes")} aria-pressed={section === "clientes"}>
              <Users size={17} aria-hidden="true" /><span>Clientes</span><b>{clients.length}</b>
            </button>
          </nav>
        </div>

        <div className="sidebar-week">
          <CalendarDays size={17} aria-hidden="true" />
          <span><small>Plan semanal</small><strong>10–15 agosto 2026</strong></span>
        </div>
      </aside>

      <div className="workspace">
        <main id="main-content" className="dashboard-main">
        <section className="dashboard-heading" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">{sectionCopy[section].eyebrow}</p>
            <h1 id="page-title">{sectionCopy[section].title}</h1>
          </div>
          <div className="summary-pills" aria-label="Resumen de pedidos">
            <span><b>{inManagement}</b> en gestión</span>
            <span className="blocked"><b>{blocked}</b> bloqueado</span>
            <span className="completed"><b>{completed}</b> completados</span>
          </div>
        </section>

        {section === "pedidos" ? <div className="operations-layout">
          <section className="orders-surface" aria-labelledby="orders-title">
            <div className="orders-toolbar">
              <div>
                <p className="eyebrow">Semana 33</p>
                <h2 id="orders-title">Pedidos</h2>
              </div>
              <label className="search-field">
                <span className="sr-only">Buscar cliente, pedido, producto o transporte</span>
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar pedido o cliente"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </label>
            </div>

            <div className="filter-tabs" aria-label="Filtrar pedidos">
              {orderFilters.map((item) => {
                const count = orders.filter((order) => matchesFilter(order, item.id)).length;
                return (
                  <button type="button" key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>
                    {item.label}<span>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="list-heading" aria-hidden="true">
              <span>Cliente y pedido</span><span>Fecha / transporte</span><span>Cantidades</span><span />
            </div>

            <div className="order-list" aria-label={`${visibleOrders.length} pedidos`}>
              {visibleOrders.length > 0 ? visibleOrders.map((order) => {
                const active = order.id === selectedOrder.id;
                const progress = Math.round((order.delivered / order.requested) * 100);
                return (
                  <button
                    type="button"
                    className={`order-row ${active ? "active" : ""}`}
                    key={order.id}
                    onClick={() => selectOrder(order.id)}
                    aria-pressed={active}
                    aria-controls="order-detail"
                  >
                    <div className="order-main">
                      <StatusBadge order={order} />
                      <strong>{order.client}</strong>
                      <span>{order.reference} · {order.product}</span>
                    </div>
                    <div className="order-schedule">
                      <strong>{order.dateLabel}</strong>
                      <span><Truck size={14} aria-hidden="true" />{order.transport}</span>
                    </div>
                    <div className="order-quantities">
                      <span><b>{number.format(order.delivered)}</b> / {number.format(order.requested)}</span>
                      <i><b style={{ width: `${progress}%` }} /></i>
                      <small>{order.pending > 0 ? `${number.format(order.pending)} pendientes` : "Completo"}</small>
                    </div>
                    <ChevronRight className="row-chevron" size={19} aria-hidden="true" />
                  </button>
                );
              }) : (
                <div className="empty-state">
                  <ClipboardList size={28} aria-hidden="true" />
                  <strong>No hay pedidos en esta vista</strong>
                  <button type="button" onClick={() => { setQuery(""); setFilter("todos"); }}>Ver todos</button>
                </div>
              )}
            </div>
          </section>

          <div ref={detailRef} className="detail-column">
            <OrderDetail order={selectedOrder} />
          </div>
        </div> : section === "calendario" ? <CalendarView onOpen={openOrder} /> : section === "logistica" ? <LogisticsView onOpen={openOrder} /> : <ClientsView clients={clients} onOpen={openClientOrders} />}
        </main>

        <footer className="dashboard-footer">
          <Boxes size={17} aria-hidden="true" />
          <span>Ecoase · Control de pedidos</span>
        </footer>
      </div>
    </div>
  );
}
