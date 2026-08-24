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
  Plus,
  Search,
  Truck,
  Users,
  Warehouse,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  orderFilters,
  orders as initialOrders,
  type OperationOrder,
  type OrderFilter,
  type OrderStatus,
} from "./data";

const number = new Intl.NumberFormat("es-UY");
export type DashboardSection = "pedidos" | "calendario" | "logistica" | "clientes";

const sectionPaths: Record<DashboardSection, string> = {
  pedidos: "/pedidos",
  calendario: "/calendario",
  logistica: "/logistica",
  clientes: "/clientes",
};

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
    <small className={`status-badge ${order.status}`}>
      <Icon size={14} aria-hidden="true" />
      {order.statusLabel}
    </small>
  );
}

function QuantitySummary({ order }: { order: OperationOrder }) {
  return (
    <div className="quantity-summary" aria-label="Cantidades del pedido">
      <div>
        <small>Pedido</small>
        <strong>{number.format(order.requested)}</strong>
      </div>
      <div>
        <small>Entregado</small>
        <strong>{number.format(order.delivered)}</strong>
      </div>
      <div className={order.pending > 0 ? "pending" : ""}>
        <small>Saldo</small>
        <strong>{number.format(order.pending)}</strong>
      </div>
    </div>
  );
}

function OperationFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article className="operation-fact">
      <i className="fact-icon"><Icon size={17} aria-hidden="true" /></i>
      <div>
        <small>{label}</small>
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
        <small className="order-reference">{order.reference}</small>
      </div>

      <div className="detail-meta">
        <div><CalendarDays size={15} aria-hidden="true" />{order.dateLabel}</div>
        <div><Truck size={15} aria-hidden="true" />{order.transport}</div>
      </div>

      <QuantitySummary order={order} />

      <div className="detail-progress" aria-label={`${progress}% entregado`}>
        <div><b>Avance</b><strong>{progress}%</strong></div>
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
          {order.remittance && <small>Remito {order.remittance}</small>}
        </div>
        <div className="line-list">
          {order.lines.map((line) => (
            <div key={line.id}>
              <div>
                <strong>{line.product}</strong>
                {line.preparation && <small>{line.preparation}</small>}
              </div>
              <b>{number.format(line.quantity)}</b>
            </div>
          ))}
        </div>
      </section>

      <div className={`action-card ${order.status}`}>
        <small>{order.status === "completado" ? "Estado" : "Acción operativa"}</small>
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
          <h2 id="clients-title">Clientes</h2>
        </div>
        <small>{clients.length} clientes activos</small>
      </div>
      <div className="client-list">
        <div className="data-heading client-heading" aria-hidden="true">
          <div /><div>Cliente</div><div>Pedido</div><div>Entregado</div><div>Saldo</div><div />
        </div>
        {clients.map((client) => (
          <button type="button" className="client-row" key={client.name} onClick={() => onOpen(client.name)}>
            <i className="client-avatar" aria-hidden="true">{client.name.slice(0, 1)}</i>
            <div className="client-name"><strong>{client.name}</strong><small>{client.orders} {client.orders === 1 ? "pedido" : "pedidos"}</small></div>
            <div><small>Pedido</small><strong>{number.format(client.requested)}</strong></div>
            <div><small>Entregado</small><strong>{number.format(client.delivered)}</strong></div>
            <div className={client.pending > 0 ? "client-pending" : "client-complete"}><small>Saldo</small><strong>{number.format(client.pending)}</strong></div>
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function CalendarView({ orders, onOpen }: { orders: OperationOrder[]; onOpen: (id: string) => void }) {
  return (
    <section className="module-surface" aria-labelledby="calendar-page-title">
      <div className="module-toolbar">
        <div><h2 id="calendar-page-title">Calendario</h2></div>
        <small>10–15 agosto 2026</small>
      </div>
      <div className="calendar-board">
        {weekDays.map((day) => {
          const dayOrders = orders.filter((order) => Number(order.dateLabel.match(/\d+/)?.[0]) === day.day && !order.dateLabel.includes("julio"));
          return (
            <section className="calendar-day" key={day.day} aria-label={`${day.name} ${day.day}`}>
              <div><small>{day.name}</small><strong>{day.day}</strong><small>{dayOrders.length} {dayOrders.length === 1 ? "pedido" : "pedidos"}</small></div>
              <div className="calendar-orders">
                {dayOrders.map((order) => (
                  <button type="button" key={order.id} onClick={() => onOpen(order.id)}>
                    <StatusBadge order={order} /><strong>{order.client}</strong><small>{order.reference}</small><small>{number.format(order.requested)} unidades</small>
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

function LogisticsView({ orders, onOpen }: { orders: OperationOrder[]; onOpen: (id: string) => void }) {
  const transports = [...new Set(orders.map((order) => order.transport))];
  return (
    <section className="module-surface" aria-labelledby="logistics-page-title">
      <div className="module-toolbar">
        <div><h2 id="logistics-page-title">Logística</h2></div>
        <small>{transports.length} transportes registrados</small>
      </div>
      <div className="logistics-board">
        <div className="data-heading logistics-heading" aria-hidden="true">
          <div /><div>Cliente y pedido</div><div>Fecha</div><div>Transporte</div><div>Estado</div><div />
        </div>
        {orders.map((order) => (
          <button type="button" className="logistics-order" key={order.id} onClick={() => onOpen(order.id)}>
            <i className="logistics-icon"><Truck size={18} aria-hidden="true" /></i>
            <div><strong>{order.client}</strong><small>{order.reference} · {order.product}</small></div>
            <div><small>Fecha</small><strong>{order.dateLabel}</strong></div>
            <div><small>Transporte</small><strong>{order.transport}</strong></div>
            <StatusBadge order={order} />
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function AddOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (order: OperationOrder) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const clientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    clientInputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: form.get("client"),
        reference: form.get("reference"),
        product: form.get("product"),
        requested: Number(form.get("requested")),
        dateLabel: form.get("dateLabel"),
        transport: form.get("transport"),
      }),
    });
    const payload = (await response.json()) as { order?: OperationOrder; error?: string };
    setSaving(false);
    if (!response.ok || !payload.order) {
      setError(payload.error ?? "No se pudo agregar el pedido.");
      return;
    }
    onCreated(payload.order);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-order-modal" role="dialog" aria-modal="true" aria-labelledby="add-order-title">
        <div className="modal-heading">
          <div><h2 id="add-order-title">Agregar pedido</h2></div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
        </div>
        <form onSubmit={submit}>
          <label>Cliente<input ref={clientInputRef} name="client" required /></label>
          <label>Referencia<input name="reference" placeholder="Ej. Orden 184834" /></label>
          <label className="field-wide">Producto<input name="product" required /></label>
          <label>Cantidad<input name="requested" type="number" min="1" step="1" required /></label>
          <label>Fecha<input name="dateLabel" placeholder="Ej. Viernes 14" required /></label>
          <label className="field-wide">Transporte<input name="transport" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Agregar pedido"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function matchesFilter(order: OperationOrder, filter: OrderFilter) {
  if (filter === "gestion") return order.status !== "completado";
  if (filter === "completados") return order.status === "completado";
  return true;
}

export default function Dashboard({ initialSection = "pedidos" }: { initialSection?: DashboardSection }) {
  const [section, setSection] = useState<DashboardSection>(initialSection);
  const [filter, setFilter] = useState<OrderFilter>("gestion");
  const [query, setQuery] = useState("");
  const [orderRows, setOrderRows] = useState<OperationOrder[]>(initialOrders);
  const [selectedId, setSelectedId] = useState(initialOrders[0].id);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((response) => response.json())
      .then((payload: { orders?: OperationOrder[] }) => { if (payload.orders) setOrderRows(payload.orders); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (window.location.hash || window.location.pathname === "/") {
      window.history.replaceState({}, "", sectionPaths[initialSection]);
    }
  }, [initialSection]);

  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return orderRows.filter((order) => {
      if (!matchesFilter(order, filter)) return false;
      if (!normalized) return true;
      return [order.client, order.reference, order.product, order.transport]
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
    });
  }, [filter, orderRows, query]);

  const selectedOrder = visibleOrders.find((order) => order.id === selectedId) ?? visibleOrders[0] ?? orderRows[0];
  const inManagement = orderRows.filter((order) => order.status !== "completado").length;
  const blocked = orderRows.filter((order) => order.status === "bloqueado").length;
  const completed = orderRows.filter((order) => order.status === "completado").length;
  const totalRequested = orderRows.reduce((sum, order) => sum + order.requested, 0);
  const totalDelivered = orderRows.reduce((sum, order) => sum + order.delivered, 0);
  const deliveryRate = totalRequested ? Math.round(totalDelivered / totalRequested * 100) : 0;
  const clients = useMemo<ClientSummary[]>(() => {
    const summaries = new Map<string, ClientSummary>();
    orderRows.forEach((order) => {
      const current = summaries.get(order.client) ?? { name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0 };
      current.orders += 1;
      current.requested += order.requested;
      current.delivered += order.delivered;
      current.pending += order.pending;
      summaries.set(order.client, current);
    });
    return [...summaries.values()].sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "es"));
  }, [orderRows]);

  const selectOrder = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 920px)").matches) {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const openClientOrders = (client: string) => {
    setSection("pedidos");
    window.history.pushState({}, "", sectionPaths.pedidos);
    setFilter("todos");
    setQuery(client);
    setSelectedId(orderRows.find((order) => order.client === client)?.id ?? orderRows[0].id);
  };

  const openOrder = (id: string) => {
    setSection("pedidos");
    window.history.pushState({}, "", sectionPaths.pedidos);
    setFilter("todos");
    setQuery("");
    setSelectedId(id);
  };

  const addCreatedOrder = (order: OperationOrder) => {
    setOrderRows((current) => [order, ...current.filter((item) => item.id !== order.id)]);
    setSelectedId(order.id);
    setFilter("gestion");
    setQuery("");
    setSection("pedidos");
    window.history.replaceState({}, "", sectionPaths.pedidos);
    setShowAddOrder(false);
  };

  const sectionCopy: Record<DashboardSection, string> = {
    pedidos: "Control operativo",
    calendario: "Calendario",
    logistica: "Logística",
    clientes: "Clientes",
  };

  return (
    <div className="dashboard-shell">
      <button className="skip-link" type="button" onClick={() => document.getElementById("main-content")?.focus()}>Saltar al contenido</button>

      <aside className="app-sidebar" aria-label="Navegación principal">
        <div className="brand" aria-label="Ecoase">
          <i className="brand-mark" aria-hidden="true">E</i>
          <div><strong>Ecoase</strong><small>Control operativo</small></div>
        </div>

        <div className="sidebar-section">
          <p>Principal</p>
          <nav aria-label="Secciones principales">
            <a className={section === "pedidos" ? "active" : ""} href="/pedidos" aria-current={section === "pedidos" ? "page" : undefined}>
              <ClipboardList size={17} aria-hidden="true" /><small>Pedidos</small>
            </a>
            <a className={section === "calendario" ? "active" : ""} href="/calendario" aria-current={section === "calendario" ? "page" : undefined}>
              <CalendarDays size={17} aria-hidden="true" /><small>Calendario</small>
            </a>
            <a className={section === "logistica" ? "active" : ""} href="/logistica" aria-current={section === "logistica" ? "page" : undefined}>
              <Truck size={17} aria-hidden="true" /><small>Logística</small>
            </a>
            <a className={section === "clientes" ? "active" : ""} href="/clientes" aria-current={section === "clientes" ? "page" : undefined}>
              <Users size={17} aria-hidden="true" /><small>Clientes</small>
            </a>
          </nav>
        </div>

        <div className="sidebar-week">
          <CalendarDays size={17} aria-hidden="true" />
          <div><small>Plan semanal</small><strong>10–15 agosto 2026</strong></div>
        </div>
      </aside>

      <div className="workspace">
        <main id="main-content" className="dashboard-main" tabIndex={-1}>
        <section className="dashboard-heading" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">{sectionCopy[section]}</h1>
          </div>
        </section>

        {section === "pedidos" && (
          <section className="dashboard-kpis" aria-label="Indicadores de pedidos">
            <button type="button" onClick={() => setFilter("gestion")}><strong>{inManagement}</strong><small>En gestión · {blocked} bloqueado</small></button>
            <button type="button" onClick={() => setFilter("completados")}><strong>{completed}</strong><small>Completados · {number.format(totalDelivered)} entregados</small></button>
            <article><strong>{number.format(totalRequested)}</strong><small>Volumen pedido · unidades totales</small></article>
            <article className="kpi-progress"><strong>{deliveryRate}%</strong><small>Cumplimiento</small><i><b style={{ width: `${deliveryRate}%` }} /></i></article>
          </section>
        )}

        {section === "pedidos" ? <div className="operations-layout">
          <section className="orders-surface" aria-labelledby="orders-title">
            <div className="orders-toolbar">
              <div>
                <h2 id="orders-title">Pedidos</h2>
              </div>
              <div className="orders-actions">
              <label className="search-field">
                <i className="sr-only">Buscar cliente, pedido, producto o transporte</i>
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
              <button type="button" className="add-order-button" onClick={() => setShowAddOrder(true)}><Plus size={17} aria-hidden="true" />Agregar pedido</button>
              </div>
            </div>

            <div className="filter-tabs" aria-label="Filtrar pedidos">
              {orderFilters.map((item) => {
                const count = orderRows.filter((order) => matchesFilter(order, item.id)).length;
                return (
                  <button type="button" key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>
                    {item.label}<small>{count}</small>
                  </button>
                );
              })}
            </div>

            <div className="list-heading" aria-hidden="true">
              <div>Cliente y pedido</div><div>Fecha / transporte</div><div>Cantidades</div><div />
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
                      <small>{order.reference} · {order.product}</small>
                    </div>
                    <div className="order-schedule">
                      <strong>{order.dateLabel}</strong>
                      <div><Truck size={14} aria-hidden="true" />{order.transport}</div>
                    </div>
                    <div className="order-quantities">
                      <div><b>{number.format(order.delivered)}</b> / {number.format(order.requested)}</div>
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
        </div> : section === "calendario" ? <CalendarView orders={orderRows} onOpen={openOrder} /> : section === "logistica" ? <LogisticsView orders={orderRows} onOpen={openOrder} /> : <ClientsView clients={clients} onOpen={openClientOrders} />}
        </main>

        <footer className="dashboard-footer">
          <Boxes size={17} aria-hidden="true" />
          <small>Ecoase · Control de pedidos</small>
        </footer>
      </div>
      {showAddOrder && <AddOrderModal onClose={() => setShowAddOrder(false)} onCreated={addCreatedOrder} />}
    </div>
  );
}
