"use client";

import {
  Archive,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Factory,
  Gauge,
  Package,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  Search,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  getOrderStage,
  getOrderPlannedDate,
  orders as initialOrders,
  products as initialProducts,
  providers as initialProviders,
  stageLabels,
  type OperationOrder,
  type OrderChange,
  type OrderUpdateKind,
  type OperationStage,
  type Provider,
  type Product,
} from "./data";
import type { CapacityOperation, ProductionSource, TransportSource } from "./data";
import type { CapacitySnapshot } from "./capacity";
import { capacityOperationLabels } from "./capacity";
import CapacityView, { DayLogisticsAdjustmentModal, GeneralTransport } from "./CapacityView";

const number = new Intl.NumberFormat("es-UY");
export type DashboardSection = "pedidos" | "plan" | "calendario" | "logistica" | "capacidad" | "clientes" | "historial" | "proveedores" | "productos";

const sectionPaths: Record<DashboardSection, string> = {
  pedidos: "/pedidos",
  plan: "/plan",
  calendario: "/calendario",
  logistica: "/logistica",
  capacidad: "/capacidad",
  clientes: "/clientes",
  historial: "/historial",
  proveedores: "/proveedores",
  productos: "/productos",
};

function visibleReference(order: OperationOrder) {
  return order.reference.startsWith("Plan ") ? "" : order.reference;
}

function productOptionLabel(product: Product) {
  return [product.kind, product.measure ?? "Sin medida", product.treatment ?? "Sin tratamiento"].join(" · ");
}

function formatOrderDate(date?: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

type KpiPeriod = "today" | "week";

function isOrderInPeriod(order: OperationOrder, period: KpiPeriod, today: Date) {
  const plannedDate = new Date(`${getOrderPlannedDate(order)}T12:00:00`);
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const orderDay = new Date(plannedDate.getFullYear(), plannedDate.getMonth(), plannedDate.getDate());
  if (period === "today") return orderDay.getTime() === currentDay.getTime();

  const mondayOffset = (currentDay.getDay() + 6) % 7;
  const weekStart = new Date(currentDay);
  weekStart.setDate(currentDay.getDate() - mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return orderDay >= weekStart && orderDay < weekEnd;
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarRange(weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear();
  if (sameMonth) {
    const month = new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(weekStart);
    return `${weekStart.getDate()}–${weekEnd.getDate()} de ${month}`;
  }
  const formatter = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", year: "numeric" });
  return `${formatter.format(weekStart)} – ${formatter.format(weekEnd)}`;
}

type ClientSummary = {
  name: string;
  address?: string;
  department?: string;
  orders: number;
  requested: number;
  delivered: number;
  pending: number;
  activeOrders: number;
  activePallets: number;
};

function ClientsView({ clients, onOpen, onAdd }: { clients: ClientSummary[]; onOpen: (client: string) => void; onAdd: () => void }) {
  return (
    <section className="clients-surface" aria-labelledby="clients-title">
      <div className="clients-toolbar">
        <div>
          <h2 id="clients-title">Clientes</h2>
        </div>
        <div className="module-toolbar-actions"><small>{clients.length} clientes</small><button type="button" className="add-order-button" onClick={onAdd}><Plus size={17} aria-hidden="true" />Agregar cliente</button></div>
      </div>
      <div className="client-list">
        <div className="data-heading client-heading" aria-hidden="true">
          <div /><div>Cliente</div><div>Dirección</div><div>Departamento</div><div>Histórico de palets</div><div>Pedidos activos</div><div />
        </div>
        {clients.map((client) => (
          <button type="button" className="client-row" key={client.name} onClick={() => onOpen(client.name)}>
            <i className="client-avatar" aria-hidden="true">{client.name.slice(0, 1)}</i>
            <div className="client-name"><strong>{client.name}</strong></div>
            <div><strong>{client.address ?? "—"}</strong></div>
            <div><strong>{client.department ?? "—"}</strong></div>
            <div><strong>{number.format(client.delivered)}</strong></div>
            <div className={client.activeOrders > 0 ? "client-pending" : "client-complete"}><strong>{client.activeOrders > 0 ? `${client.activeOrders} (${number.format(client.activePallets)})` : "0 (0)"}</strong></div>
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
            <div><small className="column-label">Tipo de proveedor</small><strong>{provider.type}</strong></div>
            <div><small className="column-label">Qué provee</small><strong>{provider.supplies}</strong></div>
          </article>
        ))}
      </div>
    </section>
  );
}

type ProductChanges = Pick<Product, "kind"> & {
  measure?: string;
  treatment?: Product["treatment"];
};

function ProductsView({ products, onEdit, onAdd }: { products: Product[]; onEdit: (product: Product) => void; onAdd: () => void }) {
  const [productQuery, setProductQuery] = useState("");
  const [productKind, setProductKind] = useState<Product["kind"] | "">("");
  const visibleProducts = useMemo(() => {
    const normalized = productQuery.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      const kindMatches = !productKind || product.kind === productKind;
      const queryMatches = !normalized || [product.kind, product.measure, product.treatment]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
      return kindMatches && queryMatches;
    });
  }, [productKind, productQuery, products]);

  return (
    <section className="module-surface products-surface" aria-labelledby="products-page-title">
      <div className="module-toolbar products-toolbar">
        <div><h2 id="products-page-title">Productos</h2><small>{products.length} productos</small></div>
        <div className="module-toolbar-actions"><label className="search-field">
          <i className="sr-only">Buscar por medida, tipo o tratamiento</i><Search size={17} aria-hidden="true" />
          <input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar medida, tipo o tratamiento" />
          {productQuery && <button type="button" onClick={() => setProductQuery("")} aria-label="Limpiar búsqueda"><X size={15} aria-hidden="true" /></button>}
        </label><button type="button" className="add-order-button" onClick={onAdd}><Plus size={17} aria-hidden="true" />Agregar producto</button></div>
      </div>
      <div className="products-board" aria-label={`${visibleProducts.length} productos`}>
        <div className="data-heading products-heading"><div>Medida</div><label className="table-filter"><i className="sr-only">Filtrar por tipo</i><select value={productKind} onChange={(event) => setProductKind(event.target.value as Product["kind"] | "")} aria-label="Filtrar productos por tipo"><option value="">Tipo</option><option value="Pallet">Pallet</option><option value="Piso">Piso</option><option value="Bin">Bin</option></select></label><div>Tratamiento</div><div className="sr-only">Acciones</div></div>
        {visibleProducts.length > 0 ? visibleProducts.map((product) => (
          <article className="product-row" key={product.id}>
            <div><small className="column-label">Medida</small><strong>{product.measure ?? "—"}</strong></div>
            <div><small className="column-label">Tipo</small><strong>{product.kind}</strong></div>
            <div><small className="column-label">Tratamiento</small><strong>{product.treatment ?? "—"}</strong></div>
            <button type="button" className="product-edit" onClick={() => onEdit(product)} aria-label={`Editar ${product.kind}${product.measure ? ` ${product.measure}` : ""}`}><Pencil size={17} aria-hidden="true" /></button>
          </article>
        )) : <div className="empty-state"><Package size={28} aria-hidden="true" /><strong>No hay productos para ese filtro</strong><button type="button" onClick={() => { setProductQuery(""); setProductKind(""); }}>Limpiar filtros</button></div>}
      </div>
    </section>
  );
}

function EditProductModal({ product, onClose, onSave, onDelete }: { product: Product; onClose: () => void; onSave: (id: string, changes: ProductChanges) => Promise<boolean>; onDelete: (id: string) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    const saved = await onSave(product.id, {
      kind: String(form.get("kind") ?? "Pallet") as Product["kind"],
      measure: String(form.get("measure") ?? ""),
      treatment: (String(form.get("treatment") ?? "") || undefined) as Product["treatment"],
    });
    setSaving(false);
    if (saved) onClose(); else setError("No se pudo guardar el producto.");
  };

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    setError("");
    const deleted = await onDelete(product.id);
    setSaving(false);
    if (deleted) onClose(); else setError("No se pudo eliminar el producto.");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="edit-product-modal" role="dialog" aria-modal="true" aria-labelledby="edit-product-title">
        <div className="modal-heading"><div><h2 id="edit-product-title">Editar producto</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button></div>
        <form onSubmit={save}>
          <label>Tipo<select name="kind" defaultValue={product.kind}><option value="Pallet">Pallet</option><option value="Piso">Piso</option><option value="Bin">Bin</option></select></label>
          <label>Medida<input name="measure" defaultValue={product.measure ?? ""} /></label>
          <label>Tratamiento<select name="treatment" defaultValue={product.treatment ?? ""}><option value="">Sin tratamiento</option><option value="Marcado">Marcado</option><option value="HT">HT</option><option value="Marcado y HT">Marcado y HT</option></select></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="delete-button" onClick={remove} disabled={saving}>{confirmDelete ? "Confirmar eliminación" : "Eliminar producto"}</button><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div></div>
        </form>
      </section>
    </div>
  );
}

function AddProductModal({ onClose, onSave }: { onClose: () => void; onSave: (changes: ProductChanges) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    const saved = await onSave({ kind: String(form.get("kind")) as Product["kind"], measure: String(form.get("measure") ?? ""), treatment: (String(form.get("treatment") ?? "") || undefined) as Product["treatment"] });
    setSaving(false);
    if (saved) onClose(); else setError("No se pudo agregar el producto.");
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="edit-product-modal" role="dialog" aria-modal="true" aria-labelledby="add-product-title"><div className="modal-heading"><div><h2 id="add-product-title">Agregar producto</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button></div><form onSubmit={submit}><label>Tipo<select ref={inputRef} name="kind" defaultValue="Pallet"><option value="Pallet">Pallet</option><option value="Piso">Piso</option><option value="Bin">Bin</option></select></label><label>Medida<input name="measure" placeholder="Ej. 120 × 100" /></label><label>Tratamiento<select name="treatment" defaultValue=""><option value="">Sin tratamiento</option><option value="Marcado">Marcado</option><option value="HT">HT</option><option value="Marcado y HT">Marcado y HT</option></select></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Agregar producto"}</button></div></form></section></div>;
}

function AddClientModal({ onClose, onSave }: { onClose: () => void; onSave: (input: { name: string; address: string; department: string }) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const saved = await onSave({ name: String(form.get("name") ?? ""), address: String(form.get("address") ?? ""), department: String(form.get("department") ?? "") });
    setSaving(false);
    if (saved) onClose(); else setError("No se pudo agregar el cliente.");
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="add-client-modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title"><div className="modal-heading"><div><h2 id="add-client-title">Agregar cliente</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button></div><form onSubmit={submit}><label className="field-wide">Nombre de la empresa<input ref={inputRef} name="name" required /></label><label>Dirección<input name="address" autoComplete="street-address" /></label><label>Departamento<input name="department" /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Agregar cliente"}</button></div></form></section></div>;
}

function CalendarView({ orders, onOpen }: { orders: OperationOrder[]; onOpen: (id: string) => void }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const todayKey = useMemo(() => dateKey(new Date()), []);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const weekday = new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(date).replace(".", "");
    return {
      date,
      key: dateKey(date),
      name: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    };
  }), [weekStart]);

  const moveWeek = (direction: -1 | 1) => {
    setWeekStart((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + direction * 7);
      return next;
    });
  };

  return (
    <section className="module-surface" aria-labelledby="calendar-page-title">
      <div className="module-toolbar calendar-toolbar">
        <div><h2 id="calendar-page-title">Calendario</h2></div>
        <div className="calendar-week-controls">
          <button type="button" onClick={() => moveWeek(-1)} aria-label="Semana anterior"><ChevronLeft size={18} aria-hidden="true" /></button>
          <strong aria-live="polite">{formatCalendarRange(weekStart)}</strong>
          <button type="button" onClick={() => moveWeek(1)} aria-label="Semana siguiente"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="calendar-board">
        {weekDays.map((day) => {
          const dayOrders = orders.filter((order) => getOrderPlannedDate(order) === day.key);
          return (
            <section className={`calendar-day ${day.key === todayKey ? "today" : ""}`} key={day.key} aria-label={`${day.name} ${day.date.getDate()}${day.key === todayKey ? ", hoy" : ""}`}>
              <div><small>{day.name}</small><strong>{day.date.getDate()}</strong><small>{dayOrders.length} {dayOrders.length === 1 ? "pedido" : "pedidos"}</small></div>
              <div className="calendar-orders">
                {dayOrders.map((order) => (
                  <button type="button" key={order.id} onClick={() => onOpen(order.id)}>
                    <StageBadge stage={getOrderStage(order)} /><strong>{order.client}</strong>{visibleReference(order) && <small>{visibleReference(order)}</small>}<small>{number.format(order.requested)} unidades</small>
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

function LogisticsView({ orders, providers, onOpen }: { orders: OperationOrder[]; providers: Provider[]; onOpen: (id: string) => void }) {
  const transports = [...new Set(orders.map((order) => order.transport))];
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    return end;
  }, [weekStart]);
  const weekOrders = useMemo(() => orders.filter((order) => {
    const plannedDate = getOrderPlannedDate(order);
    return plannedDate >= dateKey(weekStart) && plannedDate <= dateKey(weekEnd);
  }), [orders, weekEnd, weekStart]);
  const todayKey = dateKey(new Date());
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [capacityError, setCapacityError] = useState("");
  const [openDate, setOpenDate] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/capacity?from=${dateKey(weekStart)}&to=${dateKey(weekEnd)}`).then((response) => response.json()).then((payload: { capacity?: CapacitySnapshot }) => setCapacity(payload.capacity ?? null)).catch(() => setCapacity(null));
  }, [weekEnd, weekStart]);
  const moveWeek = (direction: -1 | 1) => setWeekStart((current) => {
    const next = new Date(current);
    next.setDate(current.getDate() + direction * 7);
    setOpenDate(null);
    return next;
  });
  const saveTransportCapacity = async (url: string, body: unknown) => {
    setCapacityError("");
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { const message = payload.error ?? "No se pudo guardar la capacidad de transporte."; setCapacityError(message); throw new Error(message); }
    const refreshed = await fetch(`/api/capacity?from=${dateKey(weekStart)}&to=${dateKey(weekEnd)}`).then((item) => item.json()) as { capacity?: CapacitySnapshot };
    setCapacity(refreshed.capacity ?? null);
  };
  const selectedDay = capacity?.days.find((day) => day.date === openDate);
  return (
    <>
    <section className="module-surface logistics-surface" aria-labelledby="logistics-page-title">
      <div className="module-toolbar calendar-toolbar">
        <div><h2 id="logistics-page-title">Cap. Logística semanal</h2><small>Capacidad de transporte por día</small></div>
        <div className="module-toolbar-actions">
          <small>{transports.length} transportes registrados</small>
          <div className="calendar-week-controls">
            <button type="button" onClick={() => moveWeek(-1)} aria-label="Semana anterior"><ChevronLeft size={18} aria-hidden="true" /></button>
            <strong aria-live="polite">{formatCalendarRange(weekStart)}</strong>
            <button type="button" onClick={() => moveWeek(1)} aria-label="Semana siguiente"><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      {capacity && <div className="logistics-capacity-strip" aria-label="Capacidad logística de la semana">
        {capacity.days.map((day) => {
          const deliveryCapacity = day.transportTotals.internal + day.transportTotals.externalConfirmed;
          const hasIssue = day.transportTotals.missing > 0;
          const dayDate = new Date(`${day.date}T12:00:00`);
          return <button key={day.date} type="button" className={`${day.date === todayKey ? "today" : ""} ${hasIssue ? "issue" : ""}`} onClick={() => setOpenDate(day.date)} aria-label={`Ajustar transporte del ${formatOrderDate(day.date)}${hasIssue ? `: faltan ${number.format(day.transportTotals.missing)} palets` : ""}`}>
            <small>{new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(dayDate)}</small>
            <strong>{dayDate.getDate()}</strong>
            <div>
              <em><b>{number.format(day.transportTotals.committed)}</b> a entregar</em>
              {hasIssue ? <em className="missing"><b>{number.format(day.transportTotals.missing)}</b> faltan</em> : <em><b>{number.format(Math.max(deliveryCapacity - day.transportTotals.committed, 0))}</b> libres</em>}
            </div>
            {hasIssue && <mark><AlertTriangle size={12} aria-hidden="true" /> Revisar</mark>}
          </button>;
        })}
      </div>}
      <div className="logistics-board">
        <div className="data-heading logistics-heading" aria-hidden="true">
          <div /><div>Cliente y pedido</div><div>Fecha</div><div>Transporte</div><div>Estado</div><div />
        </div>
        {weekOrders.map((order) => (
          <button type="button" className="logistics-order" key={order.id} onClick={() => onOpen(order.id)}>
            <i className="logistics-icon"><Truck size={18} aria-hidden="true" /></i>
            <div><strong>{order.client}</strong><small>{[visibleReference(order), order.product].filter(Boolean).join(" · ")}</small></div>
            <div><small className="column-label">Fecha</small><strong>{order.dateLabel}</strong></div>
            <div><small className="column-label">Transporte</small><strong>{order.transport}</strong></div>
            <StageBadge stage={getOrderStage(order)} />
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
    <div className="logistics-transport-container">
      {capacity && <GeneralTransport capacity={capacity} providers={providers.filter((provider) => provider.type === "Transporte")} onSave={saveTransportCapacity} />}
      {capacityError && <p className="capacity-error" role="alert">{capacityError}</p>}
    </div>
    {selectedDay && <DayLogisticsAdjustmentModal day={selectedDay} transporters={providers.filter((provider) => provider.type === "Transporte")} onClose={() => setOpenDate(null)} onSave={saveTransportCapacity} />}
    </>
  );
}

function StageBadge({ stage }: { stage: OperationStage }) {
  return <small className={`stage-badge ${stage}`}>{stageLabels[stage]}</small>;
}

const editableStages: OperationStage[] = ["negociacion", "produccion", "logistica", "atrasado", "pospuesto", "cancelado", "reorganizando", "completado"];

const updateLabels: Record<OrderUpdateKind, string> = {
  cambio: "Cambio de planificación",
  entrega: "Entrega registrada",
  direccion: "Dirección de entrega",
  despacho: "Despacho",
  incidencia: "Incidencia",
};

function UpdateIcon({ kind }: { kind?: OrderUpdateKind }) {
  const Icon = kind === "entrega" ? CheckCircle2 : kind === "direccion" ? MapPin : kind === "despacho" ? Truck : kind === "incidencia" ? AlertTriangle : Pencil;
  return <Icon size={16} aria-hidden="true" />;
}

type TrackingUpdate = {
  kind: Exclude<OrderUpdateKind, "cambio">;
  deliveredQuantity?: number;
  deliveryAddress?: string;
  remittance?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  note?: string;
};

function OrderTrackingPanel({ order, providers, refreshKey, onAdd }: { order?: OperationOrder; providers: Provider[]; refreshKey: number; onAdd: (order: OperationOrder) => void }) {
  const [history, setHistory] = useState<OrderChange[]>([]);
  const [loading, setLoading] = useState(true);
  const orderId = order?.id;

  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/orders/${orderId}/history`)
      .then((response) => response.ok ? response.json() : { history: [] })
      .then((payload: { history?: OrderChange[] }) => setHistory(payload.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [orderId, refreshKey]);

  if (!order) {
    return <aside className="detail-column order-tracking-panel empty-order-detail" aria-label="Seguimiento del pedido"><strong>Seleccione un pedido</strong></aside>;
  }
  const productionSourceLabel = order.productionSource === "sawmill" ? "Otro aserradero" : order.productionSource === "import" ? "Importación" : "Producción interna";
  const producer = order.productionSource === "internal" ? "Ecoase" : providers.find((provider) => provider.id === order.producerProviderId)?.name ?? "—";
  const transportOrigin = order.transportSource === "internal" ? "Interno" : "Externo";

  return (
    <aside className="detail-column order-tracking-panel" aria-labelledby="tracking-title">
      <div className="tracking-heading">
        <div><small>Seguimiento del pedido</small><h2 id="tracking-title">{order.client}</h2><p>{order.product}</p></div>
        <StageBadge stage={getOrderStage(order)} />
      </div>
      <div className="tracking-summary" aria-label="Resumen de cantidades">
        <div><small>Pedido</small><strong>{number.format(order.requested)}</strong></div>
        <div><small>Entregado</small><strong>{number.format(order.delivered)}</strong></div>
        <div><small>Saldo</small><strong>{number.format(order.pending)}</strong></div>
      </div>
      <section className="tracking-order-data" aria-label="Datos del pedido">
        <div><small>Referencia</small><strong>{visibleReference(order) || "—"}</strong></div>
        <div><small>Código Zeta</small><strong>{order.zetaCode ?? "—"}</strong></div>
        <div><small>Fecha del pedido</small><strong>{formatOrderDate(order.orderDate)}</strong></div>
        <div><small>Entrega solicitada</small><strong>{formatOrderDate(order.requestedDeliveryDate)}</strong></div>
        <div><small>Fecha planificada</small><strong>{order.dateLabel}</strong></div>
        <div><small>Transportista</small><strong>{order.transport}</strong></div>
        <div><small>Origen productivo</small><strong>{productionSourceLabel}</strong></div>
        <div><small>Productor</small><strong>{producer}</strong></div>
        <div><small>{order.productionSource === "import" ? "Llegada prevista" : "Fecha de producción"}</small><strong>{formatOrderDate(order.productionSource === "import" ? order.importArrivalDate : order.productionDate)}</strong></div>
        <div><small>Origen del transporte</small><strong>{transportOrigin}</strong></div>
        <div className="tracking-data-wide"><small>Operaciones requeridas</small><strong>{(order.requiredOperations ?? ["assembly"]).map((operation) => capacityOperationLabels[operation]).join(" · ")}</strong></div>
        <div className="tracking-data-wide"><small>Dirección de entrega</small><strong>{order.deliveryAddress ?? "—"}</strong></div>
        {order.notes && <div className="tracking-data-wide"><small>Observaciones</small><strong>{order.notes}</strong></div>}
      </section>
      <button type="button" className="tracking-add-button" onClick={() => onAdd(order)}><Plus size={17} aria-hidden="true" />Agregar actualización</button>
      <section className="tracking-timeline" aria-labelledby="timeline-title">
        <h3 id="timeline-title">Actualizaciones</h3>
        {loading ? <p className="tracking-empty">Cargando actualizaciones…</p> : history.length > 0 ? history.map((entry) => (
          <article className="tracking-event" key={entry.id}>
            <i className={entry.kind ?? "cambio"}><UpdateIcon kind={entry.kind} /></i>
            <div>
              <header><strong>{updateLabels[entry.kind ?? "cambio"]}</strong><small>{entry.changedAt}</small></header>
              {entry.changes.map((change) => <p key={`${entry.id}-${change.field}`}><b>{change.field}</b><small>{change.from} → {change.to}</small></p>)}
              {entry.note && entry.kind !== "incidencia" && <p><small>{entry.note}</small></p>}
            </div>
          </article>
        )) : <p className="tracking-empty">Todavía no hay actualizaciones registradas.</p>}
      </section>
    </aside>
  );
}

function OrderUpdateModal({ order, onClose, onSave }: { order: OperationOrder; onClose: () => void; onSave: (input: TrackingUpdate) => Promise<boolean> }) {
  const [kind, setKind] = useState<TrackingUpdate["kind"]>("entrega");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      kind,
      deliveredQuantity: kind === "entrega" ? Number(form.get("deliveredQuantity")) : undefined,
      deliveryAddress: kind === "direccion" ? String(form.get("deliveryAddress") ?? "") : undefined,
      remittance: kind === "despacho" ? String(form.get("remittance") ?? "") : undefined,
      dispatchedAt: kind === "despacho" ? String(form.get("dispatchedAt") ?? "") : undefined,
      deliveredAt: kind === "entrega" ? String(form.get("deliveredAt") ?? "") : undefined,
      note: kind === "incidencia" ? String(form.get("note") ?? "") : undefined,
    });
    setSaving(false);
    if (saved) onClose();
    else setError("No se pudo guardar la actualización.");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="order-update-modal" role="dialog" aria-modal="true" aria-labelledby="order-update-title">
        <div className="modal-heading"><div><h2 id="order-update-title">Actualizar pedido</h2><small>{order.client} · {number.format(order.requested)} palets</small></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button></div>
        <form onSubmit={submit}>
          <label className="field-wide">Tipo de actualización<select value={kind} onChange={(event) => setKind(event.target.value as TrackingUpdate["kind"])}><option value="entrega">Entrega</option><option value="despacho">Despacho</option><option value="direccion">Dirección de entrega</option><option value="incidencia">Incidencia</option></select></label>
          {kind === "entrega" && <><label>Cantidad entregada<input name="deliveredQuantity" type="number" min="1" max={order.pending} step="1" required /></label><label>Fecha de entrega<input name="deliveredAt" type="datetime-local" /></label></>}
          {kind === "despacho" && <><label>Fecha y hora de salida<input name="dispatchedAt" type="datetime-local" /></label><label>Remito<input name="remittance" defaultValue={order.remittance ?? ""} placeholder="Ej. 603" /></label></>}
          {kind === "direccion" && <label className="field-wide">Dirección de entrega<input name="deliveryAddress" defaultValue={order.deliveryAddress ?? ""} required /></label>}
          {kind === "incidencia" && <label className="field-wide">Detalle de la incidencia<textarea name="note" rows={4} required /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar actualización"}</button></div>
        </form>
      </section>
    </div>
  );
}

type PlanChanges = {
  plannedDate?: string;
  requested?: number;
  stage?: OperationStage;
  transport?: string;
  productionSource?: ProductionSource;
  producerProviderId?: string;
  productionDate?: string;
  importArrivalDate?: string;
  requiredOperations?: CapacityOperation[];
  transportSource?: TransportSource;
  transportProviderId?: string;
};

function EditPlanModal({ order, providers, onClose, onSave }: {
  order: OperationOrder;
  providers: Provider[];
  onClose: () => void;
  onSave: (changes: PlanChanges) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<OrderChange[]>([]);
  const [productionSource, setProductionSource] = useState<ProductionSource>(order.productionSource ?? "internal");
  const [transportSource, setTransportSource] = useState<TransportSource>(order.transportSource ?? (order.transport === "Interno" || order.transport === "Propio" ? "internal" : "external"));
  const [producerProviderId, setProducerProviderId] = useState(order.producerProviderId ?? "");
  const [transportProviderId, setTransportProviderId] = useState(order.transportProviderId ?? providers.find((provider) => provider.type === "Transporte" && provider.name === order.transport)?.id ?? "");
  const [productionDate, setProductionDate] = useState(order.productionDate ?? getOrderPlannedDate(order));
  const [arrivalDate, setArrivalDate] = useState(order.importArrivalDate ?? "");
  const [plannedDate, setPlannedDate] = useState(getOrderPlannedDate(order));
  const [quantity, setQuantity] = useState(order.requested);
  const [requiredOperations, setRequiredOperations] = useState<CapacityOperation[]>(order.requiredOperations ?? ["assembly"]);
  const producers = providers.filter((provider) => provider.type === (productionSource === "sawmill" ? "Aserradero" : "Importador"));
  const transporters = providers.filter((provider) => provider.type === "Transporte");

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
      plannedDate,
      requested: quantity,
      stage: form.get("stage") as OperationStage,
      productionSource,
      producerProviderId: productionSource === "internal" ? undefined : producerProviderId,
      productionDate: productionSource === "import" ? undefined : productionDate,
      importArrivalDate: productionSource === "import" ? arrivalDate : undefined,
      requiredOperations,
      transportSource,
      transportProviderId: transportSource === "external" ? transportProviderId : undefined,
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
          <label>Fecha planificada<input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} required /></label>
          <label>Cantidad de pallets<input type="number" min={order.delivered} step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></label>
          <label>Etapa<select name="stage" defaultValue={getOrderStage(order)}>{editableStages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
          <fieldset className="field-wide assignment-fieldset"><legend>Producción</legend>
            <label>Origen<select value={productionSource} onChange={(event) => { setProductionSource(event.target.value as ProductionSource); setProducerProviderId(""); }}><option value="internal">Producción interna</option><option value="sawmill">Otro aserradero</option><option value="import">Importación</option></select></label>
            {productionSource !== "internal" && <label>{productionSource === "sawmill" ? "Aserradero" : "Importador"}<select value={producerProviderId} onChange={(event) => setProducerProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{producers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
            {productionSource === "import" ? <label>Fecha prevista de llegada<input type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} required /></label> : <label>Fecha de producción<input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} required /></label>}
            <div className="operation-options"><strong>Operaciones requeridas</strong>{(["assembly", "marking", "ht"] as CapacityOperation[]).map((operation) => <label key={operation}><input type="checkbox" checked={requiredOperations.includes(operation)} onChange={(event) => setRequiredOperations((current) => event.target.checked ? [...new Set([...current, operation])] : current.filter((item) => item !== operation))} />{capacityOperationLabels[operation]}</label>)}</div>
            <CapacityHint date={productionSource === "import" ? arrivalDate : productionDate} source={productionSource} providerId={producerProviderId} operations={requiredOperations} quantity={quantity} />
          </fieldset>
          <fieldset className="field-wide assignment-fieldset"><legend>Transporte</legend>
            <label>Origen<select value={transportSource} onChange={(event) => setTransportSource(event.target.value as TransportSource)}><option value="internal">Transporte interno</option><option value="external">Transportista externo</option></select></label>
            {transportSource === "external" && <label>Transportista<select value={transportProviderId} onChange={(event) => setTransportProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
            <CapacityHint date={plannedDate} source={transportSource} providerId={transportProviderId} quantity={quantity} transport />
          </fieldset>
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
  const stagePriority: Record<OperationStage, number> = { negociacion: 0, produccion: 1, logistica: 2, reorganizando: 3, atrasado: 4, pospuesto: 5, cancelado: 6, completado: 7 };
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
            <div><small className="column-label">Cantidad de pallets</small><strong>{number.format(order.requested)}</strong></div>
            <div className={dateChanged ? "plan-date changed" : "plan-date"}><small className="column-label">Fecha planificada</small><strong>{order.dateLabel}</strong></div>
            <div><small className="column-label">Etapa</small><StageBadge stage={getOrderStage(order)} /></div>
            <div><small className="column-label">Transportista</small><strong>{order.transport}</strong></div>
            <button type="button" className="plan-edit" onClick={() => onEdit(order)} aria-label={`Editar pedido de ${order.client}`}><Pencil size={17} aria-hidden="true" /></button>
          </article>;
        })}
      </div>
    </section>
  );
}

function CapacityHint({ date, source, providerId, operations, quantity, transport = false }: { date: string; source: ProductionSource | TransportSource; providerId?: string; operations?: CapacityOperation[]; quantity: number; transport?: boolean }) {
  const [snapshot, setSnapshot] = useState<CapacitySnapshot | null>(null);
  const [loadedDate, setLoadedDate] = useState("");
  useEffect(() => {
    if (!date) return;
    let active = true;
    fetch(`/api/capacity?from=${date}&to=${date}`).then((response) => response.json()).then((payload: { capacity?: CapacitySnapshot }) => { if (active) { setSnapshot(payload.capacity ?? null); setLoadedDate(date); } }).catch(() => { if (active) { setSnapshot(null); setLoadedDate(date); } });
    return () => { active = false; };
  }, [date]);
  if (!date || loadedDate !== date || !snapshot?.days[0] || !Number.isFinite(quantity) || quantity <= 0) return null;
  const day = snapshot.days[0];
  let capacity: number | undefined;
  let used = 0;
  if (transport) {
    const entries = day.transport.filter((entry) => entry.source === source && (source === "internal" || entry.providerId === providerId));
    const capacities = entries.map((entry) => entry.capacity).filter((value): value is number => value !== undefined);
    capacity = entries.length > 0 && capacities.length === entries.length ? capacities.reduce((sum, value) => sum + value, 0) : undefined;
    used = entries.reduce((sum, entry) => sum + entry.committed, 0);
  } else if (source === "internal") {
    const selected = day.internalProduction.filter((entry) => (operations ?? []).includes(entry.operation));
    const capacities = selected.map((entry) => entry.capacity).filter((value): value is number => value !== undefined);
    capacity = selected.length > 0 && capacities.length === selected.length ? Math.min(...capacities) : undefined;
    used = selected.reduce((maximum, entry) => Math.max(maximum, entry.committed), 0);
  } else if (source === "sawmill") {
    const entries = day.externalProduction.filter((entry) => entry.providerId === providerId && (operations ?? []).includes(entry.operation));
    const capacities = entries.map((entry) => entry.capacity).filter((value): value is number => value !== undefined);
    capacity = entries.length > 0 && capacities.length === entries.length ? Math.min(...capacities) : undefined;
    used = entries.reduce((maximum, entry) => Math.max(maximum, entry.committed), 0);
  } else return <div className="capacity-hint neutral">La importación se registra como ingreso previsto y no consume producción.</div>;
  if (capacity === undefined || capacity === 0) return <div className="capacity-hint warning"><AlertTriangle size={16} />Capacidad sin cargar para esa fecha. El pedido se puede guardar.</div>;
  const remaining = capacity - used;
  const overload = quantity > remaining;
  return <div className={`capacity-hint ${overload ? "danger" : "ok"}`}><strong>Capacidad: {number.format(capacity)}</strong><strong>Utilizada: {number.format(used)}</strong><strong>Restante: {number.format(Math.max(remaining, 0))}</strong>{overload && <p><AlertTriangle size={16} />Supera el límite por {number.format(quantity - remaining)} palets. Se puede guardar igualmente.</p>}</div>;
}

function AddOrderModal({ clientOptions, products, providers, onClose, onCreated }: { clientOptions: string[]; products: Product[]; providers: Provider[]; onClose: () => void; onCreated: (order: OperationOrder) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [productId, setProductId] = useState("");
  const [productionSource, setProductionSource] = useState<ProductionSource>("internal");
  const [transportSource, setTransportSource] = useState<TransportSource>("internal");
  const [producerProviderId, setProducerProviderId] = useState("");
  const [transportProviderId, setTransportProviderId] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [requiredOperations, setRequiredOperations] = useState<CapacityOperation[]>(["assembly"]);
  const clientInputRef = useRef<HTMLSelectElement>(null);

  const selectedProduct = products.find((product) => product.id === productId);
  const producers = providers.filter((provider) => provider.type === (productionSource === "sawmill" ? "Aserradero" : "Importador"));
  const transporters = providers.filter((provider) => provider.type === "Transporte");

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
        zetaCode: form.get("zetaCode"),
        product: selectedProduct ? productOptionLabel(selectedProduct) : "",
        requested: Number(form.get("requested")),
        orderDate: form.get("orderDate"),
        requestedDeliveryDate: form.get("requestedDeliveryDate"),
        plannedDate: deliveryDate,
        stage: form.get("stage"),
        productionSource,
        producerProviderId: productionSource === "internal" ? undefined : producerProviderId,
        productionDate: productionSource === "import" ? undefined : productionDate,
        importArrivalDate: productionSource === "import" ? arrivalDate : undefined,
        requiredOperations,
        transportSource,
        transportProviderId: transportSource === "external" ? transportProviderId : undefined,
        deliveryAddress: form.get("deliveryAddress"),
        notes: form.get("notes"),
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
          <label>Cliente<select ref={clientInputRef} name="client" required defaultValue=""><option value="" disabled>Seleccionar cliente</option>{clientOptions.map((client) => <option key={client} value={client}>{client}</option>)}</select></label>
          <label>Orden o referencia<input name="reference" placeholder="Ej. Orden 184834" /></label>
          <label>Código Zeta<input name="zetaCode" placeholder="Ej. 184833" /></label>
          <label>Fecha del pedido<input name="orderDate" type="date" required /></label>
          <label className="field-wide">Producto<select required value={productId} onChange={(event) => { const nextId = event.target.value; const nextProduct = products.find((product) => product.id === nextId); const suggested: CapacityOperation[] = ["assembly"]; if (nextProduct?.treatment?.includes("Marcado")) suggested.push("marking"); if (nextProduct?.treatment?.includes("HT")) suggested.push("ht"); setProductId(nextId); setRequiredOperations(suggested); }}><option value="" disabled>Seleccionar producto</option>{products.map((product) => <option key={product.id} value={product.id}>{productOptionLabel(product)}</option>)}</select></label>
          <label>Cantidad<input name="requested" type="number" min="1" step="1" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value))} required /></label>
          <label>Fecha solicitada<input name="requestedDeliveryDate" type="date" required /></label>
          <label>Fecha de entrega<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} required /></label>
          <label>Etapa<select name="stage" required defaultValue="negociacion">{editableStages.filter((stage) => stage !== "completado").map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
          <fieldset className="field-wide assignment-fieldset"><legend>Producción</legend>
            <label>Origen de producción<select value={productionSource} onChange={(event) => { setProductionSource(event.target.value as ProductionSource); setProducerProviderId(""); }}><option value="internal">Producción interna</option><option value="sawmill">Otro aserradero</option><option value="import">Importación</option></select></label>
            {productionSource !== "internal" && <label>{productionSource === "sawmill" ? "Aserradero" : "Importador"}<select value={producerProviderId} onChange={(event) => setProducerProviderId(event.target.value)} required><option value="" disabled>Seleccionar proveedor</option>{producers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
            {productionSource === "import" ? <label>Fecha prevista de llegada<input type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} required /></label> : <label>Fecha de producción<input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} required /></label>}
            <div className="operation-options"><strong>Operaciones requeridas</strong>{(["assembly", "marking", "ht"] as CapacityOperation[]).map((operation) => <label key={operation}><input type="checkbox" checked={requiredOperations.includes(operation)} onChange={(event) => setRequiredOperations((current) => event.target.checked ? [...new Set([...current, operation])] : current.filter((item) => item !== operation))} />{capacityOperationLabels[operation]}</label>)}</div>
            <CapacityHint date={productionSource === "import" ? arrivalDate : productionDate} source={productionSource} providerId={producerProviderId} operations={requiredOperations} quantity={quantity} />
          </fieldset>
          <fieldset className="field-wide assignment-fieldset"><legend>Transporte</legend>
            <label>Origen del transporte<select value={transportSource} onChange={(event) => setTransportSource(event.target.value as TransportSource)}><option value="internal">Transporte interno</option><option value="external">Transportista externo</option></select></label>
            {transportSource === "external" && <label>Transportista<select value={transportProviderId} onChange={(event) => setTransportProviderId(event.target.value)} required><option value="" disabled>Seleccionar transportista</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
            <CapacityHint date={deliveryDate} source={transportSource} providerId={transportProviderId} quantity={quantity} transport />
          </fieldset>
          <label className="field-wide">Dirección de entrega<input name="deliveryAddress" autoComplete="street-address" /></label>
          <label className="field-wide">Observaciones<textarea name="notes" rows={3} /></label>
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
  const [kpiPeriod, setKpiPeriod] = useState<KpiPeriod>("week");
  const [orderRows, setOrderRows] = useState<OperationOrder[]>(initialOrders);
  const [providerRows, setProviderRows] = useState<Provider[]>(initialProviders);
  const [productRows, setProductRows] = useState<Product[]>(initialProducts);
  const [registeredClients, setRegisteredClients] = useState<Array<Pick<ClientSummary, "name" | "address" | "department">>>([]);
  const [selectedId, setSelectedId] = useState(initialOrders[0].id);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingPlanOrder, setEditingPlanOrder] = useState<OperationOrder | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<OperationOrder | null>(null);
  const [trackingRevision, setTrackingRevision] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    Promise.all([fetch("/api/orders"), fetch("/api/history"), fetch("/api/providers"), fetch("/api/products"), fetch("/api/clients")])
      .then(async ([ordersResponse, historyResponse, providersResponse, productsResponse, clientsResponse]) => {
        const [ordersPayload, historyPayload, providersPayload, productsPayload, clientsPayload] = await Promise.all([
          ordersResponse.json() as Promise<{ orders?: OperationOrder[] }>,
          historyResponse.json() as Promise<{ history?: OperationOrder[] }>,
          providersResponse.json() as Promise<{ providers?: Provider[] }>,
          productsResponse.json() as Promise<{ products?: Product[] }>,
          clientsResponse.json() as Promise<{ clients?: ClientSummary[] }>,
        ]);
        return {
          orders: [...(ordersPayload.orders ?? []), ...(historyPayload.history ?? [])],
          providers: providersPayload.providers ?? [],
          products: productsPayload.products ?? [],
          clients: clientsPayload.clients ?? [],
        };
      })
      .then(({ orders, providers, products, clients }) => {
        setOrderRows(orders);
        setProviderRows(providers);
        setProductRows(products);
        setRegisteredClients(clients.map((client) => ({ name: client.name, address: client.address, department: client.department })));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (window.location.hash || window.location.pathname === "/") {
      window.history.replaceState({}, "", sectionPaths[initialSection]);
    }
  }, [initialSection]);

  const activeOrders = useMemo(() => orderRows.filter((order) => getOrderStage(order) !== "completado"), [orderRows]);
  const historyOrders = useMemo(() => orderRows.filter((order) => getOrderStage(order) === "completado"), [orderRows]);
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
  const completed = historyOrders.length;
  const kpiOrders = useMemo(() => orderRows.filter((order) => isOrderInPeriod(order, kpiPeriod, today)), [kpiPeriod, orderRows, today]);
  const kpiActiveOrders = kpiOrders.filter((order) => getOrderStage(order) !== "completado");
  const palletsInProgress = kpiActiveOrders
    .filter((order) => ["produccion", "logistica"].includes(getOrderStage(order)))
    .reduce((sum, order) => sum + order.pending, 0);
  const palletsWaiting = kpiActiveOrders
    .filter((order) => getOrderStage(order) === "negociacion")
    .reduce((sum, order) => sum + order.pending, 0);
  const totalPallets = kpiActiveOrders.reduce((sum, order) => sum + order.requested, 0);
  const periodRequested = kpiOrders.reduce((sum, order) => sum + order.requested, 0);
  const periodDelivered = kpiOrders.reduce((sum, order) => sum + order.delivered, 0);
  const deliveryRate = periodRequested ? Math.round(periodDelivered / periodRequested * 100) : 0;
  const clients = useMemo<ClientSummary[]>(() => {
    const summaries = new Map<string, ClientSummary>();
    orderRows.forEach((order) => {
      const current = summaries.get(order.client) ?? { name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0, activePallets: 0 };
      current.orders += 1;
      current.requested += order.requested;
      current.delivered += order.delivered;
      current.pending += order.pending;
      if (getOrderStage(order) !== "completado") { current.activeOrders += 1; current.activePallets += order.requested; }
      summaries.set(order.client, current);
    });
    registeredClients.forEach((client) => {
      const current = summaries.get(client.name);
      if (current) Object.assign(current, { address: client.address, department: client.department });
      else summaries.set(client.name, { ...client, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0, activePallets: 0 });
    });
    return [...summaries.values()].sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "es"));
  }, [orderRows, registeredClients]);

  const selectOrder = (id: string) => {
    setSelectedId(id);
  };

  const openClientOrders = (client: string) => {
    const clientOrders = orderRows.filter((order) => order.client === client);
    const firstActiveOrder = clientOrders.find((order) => getOrderStage(order) !== "completado");
    const nextSection: DashboardSection = firstActiveOrder ? "pedidos" : "historial";
    setSection(nextSection);
    window.history.pushState({}, "", sectionPaths[nextSection]);
    setQuery(client);
    setSelectedId(firstActiveOrder?.id ?? clientOrders[0]?.id ?? activeOrders[0]?.id ?? historyOrders[0]?.id ?? "");
  };

  const openOrder = (id: string) => {
    const order = orderRows.find((item) => item.id === id);
    const nextSection: DashboardSection = getOrderStage(order ?? { stage: "negociacion" } as OperationOrder) === "completado" ? "historial" : "pedidos";
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

  const recordUpdate = async (id: string, update: TrackingUpdate) => {
    setUpdateError("");
    const response = await fetch(`/api/orders/${id}/updates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    });
    const payload = (await response.json()) as { order?: OperationOrder; error?: string };
    if (!response.ok || !payload.order) {
      setUpdateError(payload.error ?? "No se pudo guardar la actualización.");
      return false;
    }
    setOrderRows((current) => current.map((order) => order.id === id ? payload.order! : order));
    setTrackingRevision((current) => current + 1);
    return true;
  };

  const updateProduct = async (id: string, changes: ProductChanges) => {
    const currentProduct = productRows.find((product) => product.id === id);
    if (!currentProduct) return false;
    const response = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    });
    const payload = (await response.json()) as { product?: Product; error?: string };
    if (!response.ok || !payload.product) return false;
    setProductRows((current) => current.map((product) => product.id === id ? payload.product! : product));
    return true;
  };

  const removeProduct = async (id: string) => {
    const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (!response.ok) return false;
    setProductRows((current) => current.filter((product) => product.id !== id));
    return true;
  };

  const addProduct = async (changes: ProductChanges) => {
    const response = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) });
    const payload = (await response.json()) as { product?: Product };
    if (!response.ok || !payload.product) return false;
    setProductRows((current) => [...current, payload.product!].sort((a, b) => productOptionLabel(a).localeCompare(productOptionLabel(b), "es")));
    return true;
  };

  const addClient = async (input: { name: string; address: string; department: string }) => {
    const response = await fetch("/api/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const payload = (await response.json()) as { client?: { name: string; address?: string; department?: string } };
    if (!response.ok || !payload.client) return false;
    setRegisteredClients((current) => [...current.filter((client) => client.name !== payload.client!.name), payload.client!].sort((a, b) => a.name.localeCompare(b.name, "es")));
    return true;
  };

  const sectionCopy: Record<DashboardSection, string> = {
    pedidos: "Control operativo",
    plan: "Plan",
    calendario: "Calendario",
    logistica: "Cap. Logística",
    capacidad: "Cap. Producción",
    clientes: "Clientes",
    productos: "Productos",
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
              <Truck size={17} aria-hidden="true" /><small>Cap. Logística</small>
            </a>
            <a className={section === "capacidad" ? "active" : ""} href="/capacidad" aria-current={section === "capacidad" ? "page" : undefined}>
              <Gauge size={17} aria-hidden="true" /><small>Cap. Producción</small>
            </a>
            <a className={section === "clientes" ? "active" : ""} href="/clientes" aria-current={section === "clientes" ? "page" : undefined}>
              <Users size={17} aria-hidden="true" /><small>Clientes</small>
            </a>
            <a className={section === "productos" ? "active" : ""} href="/productos" aria-current={section === "productos" ? "page" : undefined}>
              <Package size={17} aria-hidden="true" /><small>Productos</small>
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
          {section === "pedidos" && <label className="kpi-period-filter">Período<select value={kpiPeriod} onChange={(event) => setKpiPeriod(event.target.value as KpiPeriod)} aria-label="Período de los indicadores"><option value="today">Hoy</option><option value="week">Esta semana</option></select></label>}
        </section>

        {section === "pedidos" && (
          <section className="dashboard-kpis" aria-label="Indicadores de pedidos">
            <article className="kpi-card kpi-yellow"><strong>{number.format(palletsInProgress)}</strong><small>Palets en marcha</small></article>
            <article className="kpi-card kpi-red"><strong>{number.format(palletsWaiting)}</strong><small>Palets en espera</small></article>
            <article className="kpi-card kpi-blue"><strong>{number.format(totalPallets)}</strong><small>Palets totales</small></article>
            <article className="kpi-card kpi-green"><strong>{deliveryRate}%</strong><small>Nivel de cumplimiento</small></article>
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
              <div>Cliente</div><div>Pedido</div><div>Palets</div><div>Fecha de entrega</div><div>Etapa</div><div />
            </div>

            <div className="order-list" aria-label={`${visibleOrders.length} pedidos`}>
              {visibleOrders.length > 0 ? visibleOrders.map((order) => {
                const active = order.id === selectedOrder?.id;
                return (
                  <button
                    type="button"
                    className={`order-row ${active ? "active" : ""}`}
                    key={order.id}
                    onClick={() => selectOrder(order.id)}
                    aria-pressed={active}
                  >
                    <div className="order-main">
                      <strong>{order.client}</strong>
                    </div>
                    <div className="order-product"><strong>{order.product}</strong></div>
                    <div className="order-quantities"><strong>{number.format(order.requested)}</strong></div>
                    <div className="order-date">
                      <strong>{formatOrderDate(order.requestedDeliveryDate ?? getOrderPlannedDate(order))}</strong>
                    </div>
                    <div className="order-stage"><StageBadge stage={getOrderStage(order)} /></div>
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

          <OrderTrackingPanel key={selectedOrder?.id ?? "empty"} order={selectedOrder} providers={providerRows} refreshKey={trackingRevision} onAdd={setUpdatingOrder} />
        </div> : section === "plan" ? <><PlanView orders={activeOrders} onEdit={setEditingPlanOrder} />{updateError && <p className="plan-error" role="alert">{updateError}</p>}</> : section === "calendario" ? <CalendarView orders={activeOrders} onOpen={openOrder} /> : section === "logistica" ? <LogisticsView orders={activeOrders} providers={providerRows} onOpen={openOrder} /> : section === "capacidad" ? <CapacityView providers={providerRows} /> : section === "productos" ? <ProductsView products={productRows} onEdit={setEditingProduct} onAdd={() => setShowAddProduct(true)} /> : section === "proveedores" ? <ProvidersView providers={providerRows} /> : <ClientsView clients={clients} onOpen={openClientOrders} onAdd={() => setShowAddClient(true)} />}
        </main>

      </div>
      {showAddOrder && <AddOrderModal clientOptions={clients.map((client) => client.name)} products={productRows} providers={providerRows} onClose={() => setShowAddOrder(false)} onCreated={addCreatedOrder} />}
      {showAddProduct && <AddProductModal onClose={() => setShowAddProduct(false)} onSave={addProduct} />}
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onSave={addClient} />}
      {editingPlanOrder && <EditPlanModal order={editingPlanOrder} providers={providerRows} onClose={() => setEditingPlanOrder(null)} onSave={(changes) => updateOrder(editingPlanOrder.id, changes)} />}
      {editingProduct && <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} onSave={updateProduct} onDelete={removeProduct} />}
      {updatingOrder && <OrderUpdateModal order={updatingOrder} onClose={() => setUpdatingOrder(null)} onSave={(update) => recordUpdate(updatingOrder.id, update)} />}
    </div>
  );
}
