"use client";

import {
  Archive,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Factory,
  ListChecks,
  PackageCheck,
  Pencil,
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
  getOrderStage,
  getOrderPlannedDate,
  orders as initialOrders,
  providers as initialProviders,
  stageLabels,
  type OperationOrder,
  type OrderChange,
  type OrderStatus,
  type OperationStage,
  type Provider,
} from "./data";

const number = new Intl.NumberFormat("es-UY");
export type DashboardSection = "pedidos" | "plan" | "calendario" | "logistica" | "clientes" | "historial" | "proveedores";

const sectionPaths: Record<DashboardSection, string> = {
  pedidos: "/pedidos",
  plan: "/plan",
  calendario: "/calendario",
  logistica: "/logistica",
  clientes: "/clientes",
  historial: "/historial",
  proveedores: "/proveedores",
};

function visibleReference(order: OperationOrder) {
  return order.reference.startsWith("Plan ") ? "" : order.reference;
}

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
        {visibleReference(order) && <small className="order-reference">{visibleReference(order)}</small>}
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

function EmptyOrderDetail({ history }: { history: boolean }) {
  return (
    <aside className="order-detail empty-order-detail" id="order-detail" aria-live="polite">
      <Archive size={28} aria-hidden="true" />
      <strong>{history ? "No hay pedidos completados" : "No hay pedidos activos"}</strong>
      <small>{history ? "Los pedidos cerrados aparecerán aquí." : "Los pedidos en gestión aparecerán aquí."}</small>
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

function ProvidersView({ providers }: { providers: Provider[] }) {
  return (
    <section className="module-surface providers-surface" aria-labelledby="providers-page-title">
      <div className="module-toolbar">
        <div><h2 id="providers-page-title">Proveedores</h2></div>
        <small>{providers.length} proveedores registrados</small>
      </div>
      <div className="providers-board" aria-label="Listado de proveedores">
        <div className="data-heading providers-heading" aria-hidden="true">
          <div>Proveedor</div><div>Tipo de proveedor</div><div>Qué provee</div>
        </div>
        {providers.map((provider) => (
          <article className="provider-row" key={provider.id}>
            <div className="provider-name"><i className={`provider-icon ${provider.type === "Transporte" ? "transport" : ""}`} aria-hidden="true">{provider.type === "Transporte" ? <Truck size={18} /> : <Factory size={18} />}</i><strong>{provider.name}</strong></div>
            <div><small>Tipo de proveedor</small><strong>{provider.type}</strong></div>
            <div><small>Qué provee</small><strong>{provider.supplies}</strong></div>
          </article>
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
                    <StatusBadge order={order} /><strong>{order.client}</strong>{visibleReference(order) && <small>{visibleReference(order)}</small>}<small>{number.format(order.requested)} unidades</small>
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
            <div><strong>{order.client}</strong><small>{[visibleReference(order), order.product].filter(Boolean).join(" · ")}</small></div>
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

function StageBadge({ stage }: { stage: OperationStage }) {
  return <small className={`stage-badge ${stage}`}>{stageLabels[stage]}</small>;
}

type PlanChanges = {
  plannedDate?: string;
  requested?: number;
  stage?: OperationStage;
  transport?: string;
};

function EditPlanModal({ order, transportOptions, onClose, onSave }: {
  order: OperationOrder;
  transportOptions: string[];
  onClose: () => void;
  onSave: (changes: PlanChanges) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<OrderChange[]>([]);

  useEffect(() => {
    fetch(`/api/orders/${order.id}/history`)
      .then((response) => response.json())
      .then((payload: { history?: OrderChange[] }) => setHistory(payload.history ?? []))
      .catch(() => undefined);
  }, [order.id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const saved = await onSave({
      plannedDate: String(form.get("plannedDate") ?? ""),
      requested: Number(form.get("requested")),
      stage: form.get("stage") as OperationStage,
      transport: String(form.get("transport") ?? "").trim(),
    });
    setSaving(false);
    if (saved) onClose();
    else setError("No se pudieron guardar los cambios.");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="edit-plan-modal" role="dialog" aria-modal="true" aria-labelledby="edit-plan-title">
        <div className="modal-heading">
          <div><h2 id="edit-plan-title">Editar pedido</h2><small>{order.client}</small></div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
        </div>
        <form onSubmit={submit}>
          <label>Fecha planificada<input name="plannedDate" type="date" defaultValue={getOrderPlannedDate(order)} required /></label>
          <label>Cantidad de pallets<input name="requested" type="number" min={order.delivered} step="1" defaultValue={order.requested} required /></label>
          <label>Etapa<select name="stage" defaultValue={getOrderStage(order)}><option value="negociacion">Negociación</option><option value="produccion">Producción</option><option value="logistica">Logística</option><option value="completado">Completado</option></select></label>
          <label className="field-wide">Transportista<select name="transport" defaultValue={order.transport}>{transportOptions.map((transport) => <option key={transport} value={transport}>{transport}</option>)}</select></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <section className="change-history" aria-labelledby="change-history-title">
            <h3 id="change-history-title">Cambios del pedido</h3>
            {history.length > 0 ? <div>{history.map((entry) => <article key={entry.id}><small>{entry.changedAt}</small>{entry.changes.map((change) => <p key={`${entry.id}-${change.field}`}><strong>{change.field}:</strong> {change.from} → {change.to}</p>)}</article>)}</div> : <p>No hay cambios registrados.</p>}
          </section>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
        </form>
      </section>
    </div>
  );
}

function PlanView({ orders, onEdit }: { orders: OperationOrder[]; onEdit: (order: OperationOrder) => void }) {
  const stagePriority: Record<OperationStage, number> = { negociacion: 0, produccion: 1, logistica: 2, completado: 3 };
  const planOrders = [...orders].sort((a, b) => stagePriority[getOrderStage(a)] - stagePriority[getOrderStage(b)] || a.client.localeCompare(b.client, "es"));

  return (
    <section className="module-surface plan-surface" aria-labelledby="plan-title">
      <div className="module-toolbar"><div><h2 id="plan-title">Plan</h2></div></div>
      <div className="plan-board" aria-label="Plan operativo">
        <div className="data-heading plan-heading" aria-hidden="true"><div>Cliente</div><div>Cantidad de pallets</div><div>Fecha planificada</div><div>Etapa</div><div>Transportista</div><div /></div>
        {planOrders.map((order) => {
          const dateChanged = Boolean(order.originalPlannedDate && order.originalPlannedDate !== getOrderPlannedDate(order));
          return <article className="plan-row" key={order.id}>
            <div className="plan-client"><strong>{order.client}</strong></div>
            <div><small>Cantidad de pallets</small><strong>{number.format(order.requested)}</strong></div>
            <div className={dateChanged ? "plan-date changed" : "plan-date"}><small>Fecha planificada</small><strong>{order.dateLabel}</strong></div>
            <div><small>Etapa</small><StageBadge stage={getOrderStage(order)} /></div>
            <div><small>Transportista</small><strong>{order.transport}</strong></div>
            <button type="button" className="plan-edit" onClick={() => onEdit(order)} aria-label={`Editar pedido de ${order.client}`}><Pencil size={17} aria-hidden="true" /></button>
          </article>;
        })}
      </div>
    </section>
  );
}

function AddOrderModal({ transportOptions, onClose, onCreated }: { transportOptions: string[]; onClose: () => void; onCreated: (order: OperationOrder) => void }) {
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
        plannedDate: form.get("plannedDate"),
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
          <label>Fecha planificada<input name="plannedDate" type="date" required /></label>
          <label className="field-wide">Transportista<select name="transport" required defaultValue=""><option value="" disabled>Seleccionar transportista</option>{transportOptions.map((transport) => <option key={transport} value={transport}>{transport}</option>)}</select></label>
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

export default function Dashboard({ initialSection = "pedidos" }: { initialSection?: DashboardSection }) {
  const [section, setSection] = useState<DashboardSection>(initialSection);
  const [query, setQuery] = useState("");
  const [orderRows, setOrderRows] = useState<OperationOrder[]>(initialOrders);
  const [providerRows, setProviderRows] = useState<Provider[]>(initialProviders);
  const [selectedId, setSelectedId] = useState(initialOrders[0].id);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [editingPlanOrder, setEditingPlanOrder] = useState<OperationOrder | null>(null);
  const [updateError, setUpdateError] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([fetch("/api/orders"), fetch("/api/history"), fetch("/api/providers")])
      .then(async ([ordersResponse, historyResponse, providersResponse]) => {
        const [ordersPayload, historyPayload, providersPayload] = await Promise.all([
          ordersResponse.json() as Promise<{ orders?: OperationOrder[] }>,
          historyResponse.json() as Promise<{ history?: OperationOrder[] }>,
          providersResponse.json() as Promise<{ providers?: Provider[] }>,
        ]);
        return { orders: [...(ordersPayload.orders ?? []), ...(historyPayload.history ?? [])], providers: providersPayload.providers ?? [] };
      })
      .then(({ orders, providers }) => {
        setOrderRows(orders);
        setProviderRows(providers);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (window.location.hash || window.location.pathname === "/") {
      window.history.replaceState({}, "", sectionPaths[initialSection]);
    }
  }, [initialSection]);

  const activeOrders = useMemo(() => orderRows.filter((order) => order.status !== "completado"), [orderRows]);
  const historyOrders = useMemo(() => orderRows.filter((order) => order.status === "completado"), [orderRows]);
  const isHistory = section === "historial";
  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return (isHistory ? historyOrders : activeOrders).filter((order) => {
      if (!normalized) return true;
      return [order.client, order.reference, order.product, order.transport]
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
    });
  }, [activeOrders, historyOrders, isHistory, query]);

  const selectedOrder = visibleOrders.find((order) => order.id === selectedId) ?? visibleOrders[0];
  const inManagement = activeOrders.length;
  const blocked = activeOrders.filter((order) => order.status === "bloqueado").length;
  const completed = historyOrders.length;
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
    const clientOrders = orderRows.filter((order) => order.client === client);
    const firstActiveOrder = clientOrders.find((order) => order.status !== "completado");
    const nextSection: DashboardSection = firstActiveOrder ? "pedidos" : "historial";
    setSection(nextSection);
    window.history.pushState({}, "", sectionPaths[nextSection]);
    setQuery(client);
    setSelectedId(firstActiveOrder?.id ?? clientOrders[0]?.id ?? activeOrders[0]?.id ?? historyOrders[0]?.id ?? "");
  };

  const openOrder = (id: string) => {
    const order = orderRows.find((item) => item.id === id);
    const nextSection: DashboardSection = order?.status === "completado" ? "historial" : "pedidos";
    setSection(nextSection);
    window.history.pushState({}, "", sectionPaths[nextSection]);
    setQuery("");
    setSelectedId(id);
  };

  const addCreatedOrder = (order: OperationOrder) => {
    setOrderRows((current) => [order, ...current.filter((item) => item.id !== order.id)]);
    setSelectedId(order.id);
    setQuery("");
    setSection("pedidos");
    window.history.replaceState({}, "", sectionPaths.pedidos);
    setShowAddOrder(false);
  };

  const updateOrder = async (id: string, changes: PlanChanges) => {
    setUpdateError("");
    const response = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    });
    const payload = (await response.json()) as { order?: OperationOrder; error?: string };
    if (!response.ok || !payload.order) {
      setUpdateError(payload.error ?? "No se pudo actualizar el pedido.");
      return false;
    }
    setOrderRows((current) => current.map((order) => order.id === id ? payload.order! : order));
    return true;
  };

  const sectionCopy: Record<DashboardSection, string> = {
    pedidos: "Control operativo",
    plan: "Plan",
    calendario: "Calendario",
    logistica: "Logística",
    clientes: "Clientes",
    historial: "Historial",
    proveedores: "Proveedores",
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
            <a className={section === "plan" ? "active" : ""} href="/plan" aria-current={section === "plan" ? "page" : undefined}>
              <ListChecks size={17} aria-hidden="true" /><small>Plan</small>
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
            <a className={section === "proveedores" ? "active" : ""} href="/proveedores" aria-current={section === "proveedores" ? "page" : undefined}>
              <Factory size={17} aria-hidden="true" /><small>Proveedores</small>
            </a>
            <a className={section === "historial" ? "active" : ""} href="/historial" aria-current={section === "historial" ? "page" : undefined}>
              <Archive size={17} aria-hidden="true" /><small>Historial</small><b>{completed}</b>
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
            <article><strong>{inManagement}</strong><small>En gestión · {blocked} bloqueado</small></article>
            <button type="button" onClick={() => { setSection("historial"); setQuery(""); window.history.pushState({}, "", sectionPaths.historial); }}><strong>{completed}</strong><small>En historial · {number.format(totalDelivered)} entregados</small></button>
            <article><strong>{number.format(totalRequested)}</strong><small>Volumen pedido · unidades totales</small></article>
            <article className="kpi-progress"><strong>{deliveryRate}%</strong><small>Cumplimiento</small><i><b style={{ width: `${deliveryRate}%` }} /></i></article>
          </section>
        )}

        {(section === "pedidos" || section === "historial") ? <div className="operations-layout">
          <section className="orders-surface" aria-labelledby="orders-title">
            <div className="orders-toolbar">
              <div>
                <h2 id="orders-title">{isHistory ? "Historial" : "Pedidos"}</h2>
              </div>
              <div className="orders-actions">
              <label className="search-field">
                <i className="sr-only">Buscar cliente, pedido, producto o transporte</i>
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={isHistory ? "Buscar en historial" : "Buscar pedido o cliente"}
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </label>
              {!isHistory && <button type="button" className="add-order-button" onClick={() => setShowAddOrder(true)}><Plus size={17} aria-hidden="true" />Agregar pedido</button>}
              </div>
            </div>

            <div className="list-heading" aria-hidden="true">
              <div>Cliente y pedido</div><div>Fecha / transporte</div><div>Cantidades</div><div />
            </div>

            <div className="order-list" aria-label={`${visibleOrders.length} pedidos`}>
              {visibleOrders.length > 0 ? visibleOrders.map((order) => {
                const active = order.id === selectedOrder?.id;
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
                      <small>{[visibleReference(order), order.product].filter(Boolean).join(" · ")}</small>
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
                  <Archive size={28} aria-hidden="true" />
                  <strong>{isHistory ? "No hay pedidos en el historial" : "No hay pedidos activos"}</strong>
                  {query && <button type="button" onClick={() => setQuery("")}>Limpiar búsqueda</button>}
                </div>
              )}
            </div>
          </section>

          <div ref={detailRef} className="detail-column">
            {selectedOrder ? <OrderDetail order={selectedOrder} /> : <EmptyOrderDetail history={isHistory} />}
          </div>
        </div> : section === "plan" ? <><PlanView orders={activeOrders} onEdit={setEditingPlanOrder} />{updateError && <p className="plan-error" role="alert">{updateError}</p>}</> : section === "calendario" ? <CalendarView orders={activeOrders} onOpen={openOrder} /> : section === "logistica" ? <LogisticsView orders={activeOrders} onOpen={openOrder} /> : section === "proveedores" ? <ProvidersView providers={providerRows} /> : <ClientsView clients={clients} onOpen={openClientOrders} />}
        </main>

      </div>
      {showAddOrder && <AddOrderModal transportOptions={providerRows.filter((provider) => provider.type === "Transporte").map((provider) => provider.name)} onClose={() => setShowAddOrder(false)} onCreated={addCreatedOrder} />}
      {editingPlanOrder && <EditPlanModal order={editingPlanOrder} transportOptions={providerRows.filter((provider) => provider.type === "Transporte").map((provider) => provider.name)} onClose={() => setEditingPlanOrder(null)} onSave={(changes) => updateOrder(editingPlanOrder.id, changes)} />}
    </div>
  );
}
