"use client";

import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Factory,
  Package,
  MapPin,
  Pencil,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import AppNavigation, { MobileNavigationButton } from "./components/AppNavigation";
import type { ProductionWorkspaceView } from "./components/ProductionTabs";
import { AsyncButton, ConfirmDialog, EmptyState, FieldError, ModalShell, StatusBadge, WeekNavigator } from "./components/ui";
import {
  compareProductsByInternalCode,
  getOrderOperationalStatus,
  getOrderPlannedDate,
  isOrderClosed,
  isOrderOverdue,
  orderOperationalStatusLabels,
  orders as initialOrders,
  products as initialProducts,
  providers as initialProviders,
  type OperationOrder,
  type OrderOperationalStatus,
  type OrderChange,
  type OrderUpdateKind,
  type OrderLine,
  type Provider,
  type ProviderType,
  type Product,
  type Shipment,
} from "./data";
import type { CapacityOperation, ProductionSource, TransportSource } from "./data";
import type { CapacitySnapshot } from "./capacity";
import { capacityOperationLabels } from "./capacity";
import CapacityView, { DayLogisticsAdjustmentModal, GeneralTransport } from "./CapacityView";
import TreatmentView from "./TreatmentView";
import StockView from "./StockView";
import ClientMasterView, { type ClientSummary } from "./components/ClientMasterView";
import { OperationsCalendarView, OperationsLogisticsView } from "./components/OperationsCalendar";
import type { ClientProductOption } from "./master-data";
import { uruguayDepartments } from "./uruguay-departments";

const number = new Intl.NumberFormat("es-UY");
const shipmentStatusLabels: Record<Shipment["status"], string> = {
  planned: "Planificado",
  ready: "Pronto",
  loaded: "Cargado",
  dispatched: "En viaje",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
export type DashboardSection = "pedidos" | "plan" | "calendario" | "logistica" | "produccion" | "stock" | "clientes" | "historial" | "proveedores" | "productos";

const sectionPaths: Record<DashboardSection, string> = {
  pedidos: "/pedidos",
  plan: "/plan",
  calendario: "/calendario",
  logistica: "/logistica",
  produccion: "/produccion",
  stock: "/stock",
  clientes: "/clientes",
  historial: "/historial",
  proveedores: "/proveedores",
  productos: "/productos",
};

function visibleReference(order: OperationOrder) {
  return order.reference.startsWith("Plan ") ? "" : order.reference;
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

function ProvidersView({ providers, onEdit, onAdd }: { providers: Provider[]; onEdit: (provider: Provider) => void; onAdd: () => void }) {
  const [providerQuery, setProviderQuery] = useState("");
  const [providerType, setProviderType] = useState<ProviderType | "">("");

  const visibleProviders = useMemo(() => {
    const normalized = providerQuery.trim().toLocaleLowerCase("es");
    return providers.filter((provider) => {
      const typeMatches = !providerType || provider.type === providerType;
      const queryMatches = !normalized || [provider.name, provider.type, provider.supplies]
        .some((val) => val.toLocaleLowerCase("es").includes(normalized));
      return typeMatches && queryMatches;
    });
  }, [providerQuery, providerType, providers]);

  return (
    <section className="module-surface providers-surface" aria-labelledby="providers-page-title">
      <div className="module-toolbar products-toolbar">
        <div>
          <h2 id="providers-page-title">Proveedores</h2>
          <small>{visibleProviders.length} de {providers.length} proveedores registrados</small>
        </div>
        <div className="module-toolbar-actions">
          <label className="search-field">
            <i className="sr-only">Buscar por proveedor, tipo o insumos</i>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={providerQuery}
              onChange={(event) => setProviderQuery(event.target.value)}
              placeholder="Buscar proveedor, tipo, qué provee…"
            />
            {providerQuery && (
              <button type="button" onClick={() => setProviderQuery("")} aria-label="Limpiar búsqueda">
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </label>
          <button type="button" className="add-order-button" onClick={onAdd}>
            <Plus size={17} aria-hidden="true" />
            Agregar proveedor
          </button>
        </div>
      </div>
      <div className="providers-board" aria-label="Listado de proveedores">
        <div className="data-heading providers-heading" aria-hidden="true">
          <div>Proveedor</div>
          <label className="table-filter">
            <i className="sr-only">Filtrar por tipo</i>
            <select
              value={providerType}
              onChange={(event) => setProviderType(event.target.value as ProviderType | "")}
              aria-label="Filtrar por tipo de proveedor"
            >
              <option value="">Tipo de proveedor</option>
              <option value="Aserradero">Aserradero</option>
              <option value="Transporte">Transporte</option>
              <option value="Importador">Importador</option>
            </select>
          </label>
          <div>Qué provee</div>
          <div className="sr-only">Acciones</div>
        </div>
        {visibleProviders.length > 0 ? (
          visibleProviders.map((provider) => (
            <article className="provider-row" key={provider.id}>
              <div className="provider-name">
                <i className={`provider-icon ${provider.type === "Transporte" ? "transport" : ""}`} aria-hidden="true">
                  {provider.type === "Transporte" ? <Truck size={18} /> : <Factory size={18} />}
                </i>
                <strong>{provider.name}</strong>
              </div>
              <div>
                <small className="column-label">Tipo de proveedor</small>
                <strong>{provider.type}</strong>
              </div>
              <div>
                <small className="column-label">Qué provee</small>
                <strong>{provider.supplies}</strong>
              </div>
              <button
                type="button"
                className="product-edit"
                onClick={() => onEdit(provider)}
                aria-label={`Editar ${provider.name}`}
              >
                <Pencil size={17} aria-hidden="true" />
              </button>
            </article>
          ))
        ) : (
          <EmptyState
            icon={Factory}
            title="No hay proveedores para ese filtro"
            action={
              <button
                type="button"
                onClick={() => {
                  setProviderQuery("");
                  setProviderType("");
                }}
              >
                Limpiar filtros
              </button>
            }
          />
        )}
      </div>
    </section>
  );
}

function AddProviderModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: { name: string; type: ProviderType; supplies: string }) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const saved = await onSave({
        name: String(form.get("name") ?? "").trim(),
        type: String(form.get("type") ?? "Aserradero") as ProviderType,
        supplies: String(form.get("supplies") ?? "").trim(),
      });
      if (saved) {
        setDirty(false);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el proveedor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Agregar proveedor"
      className="edit-product-modal"
      onClose={onClose}
      initialFocusRef={inputRef}
      dirty={dirty && !saving}
    >
      <form onSubmit={submit} onChange={() => setDirty(true)}>
        <label>
          Nombre del proveedor
          <input ref={inputRef} name="name" required placeholder="Ej. Mirasol" />
        </label>
        <label>
          Tipo de proveedor
          <select name="type" defaultValue="Aserradero">
            <option value="Aserradero">Aserradero</option>
            <option value="Transporte">Transporte</option>
            <option value="Importador">Importador</option>
          </select>
        </label>
        <label>
          Qué provee
          <input name="supplies" required placeholder="Ej. Pallets y mercadería de terceros" />
        </label>
        <FieldError id="add-provider-error">{error}</FieldError>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton type="submit" className="primary-button" loading={saving} error={Boolean(error)}>
            Agregar proveedor
          </AsyncButton>
        </div>
      </form>
    </ModalShell>
  );
}

function EditProviderModal({
  provider,
  onClose,
  onSave,
  onDelete,
}: {
  provider: Provider;
  onClose: () => void;
  onSave: (id: string, changes: { name?: string; type?: ProviderType; supplies?: string }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const saved = await onSave(provider.id, {
        name: String(form.get("name") ?? "").trim(),
        type: String(form.get("type") ?? provider.type) as ProviderType,
        supplies: String(form.get("supplies") ?? "").trim(),
      });
      if (saved) {
        setDirty(false);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError("");
    try {
      const deleted = await onDelete(provider.id);
      if (deleted) {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el proveedor.");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <ModalShell
      title="Editar proveedor"
      className="edit-product-modal"
      onClose={onClose}
      initialFocusRef={inputRef}
      dirty={dirty && !saving}
    >
      <form onSubmit={save} onChange={() => setDirty(true)}>
        <label>
          Nombre del proveedor
          <input ref={inputRef} name="name" required defaultValue={provider.name} />
        </label>
        <label>
          Tipo de proveedor
          <select name="type" defaultValue={provider.type}>
            <option value="Aserradero">Aserradero</option>
            <option value="Transporte">Transporte</option>
            <option value="Importador">Importador</option>
          </select>
        </label>
        <label>
          Qué provee
          <input name="supplies" required defaultValue={provider.supplies} />
        </label>
        <FieldError id="edit-provider-error">{error}</FieldError>
        <div className="modal-actions">
          <button type="button" className="delete-button" onClick={() => setConfirmDelete(true)} disabled={saving}>
            Eliminar proveedor
          </button>
          <div>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <AsyncButton type="submit" className="primary-button" loading={saving} error={Boolean(error)}>
              Guardar cambios
            </AsyncButton>
          </div>
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title={`¿Eliminar "${provider.name}"?`}
          description="Se verificará que no existan órdenes ni recursos vinculados antes de eliminarlo."
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        />
      )}
    </ModalShell>
  );
}

type ProductChanges = Pick<Product, "kind"> & {
  measure?: string;
  requiresTreatment: boolean;
  zetaCode: string;
  stockName?: string;
  clientId?: string;
};

function productDisplayName(product: Product) {
  let label = product.stockName?.trim() || product.kind;
  for (const clientName of [...(product.clientNames ?? [])].sort((a, b) => b.length - a.length)) {
    const escaped = clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    label = label.replace(new RegExp(escaped, "giu"), " ");
  }
  label = label
    .replace(/\(?\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\b\)?/giu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s·—–(),-]+|[\s·—–(),-]+$/g, "")
    .trim();
  return label || product.kind;
}

function ProductsView({ products, onEdit, onAdd }: { products: Product[]; onEdit: (product: Product) => void; onAdd: () => void }) {
  const [productQuery, setProductQuery] = useState("");
  const [productKind, setProductKind] = useState<Product["kind"] | "">("");
  const visibleProducts = useMemo(() => {
    const normalized = productQuery.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      const kindMatches = !productKind || product.kind === productKind;
      const queryMatches = !normalized || [product.stockName, product.zetaCode, product.kind, product.measure, ...(product.clientNames ?? []), product.requiresTreatment ? "Marcado" : "Sin marcado"]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
      return kindMatches && queryMatches;
    }).sort(compareProductsByInternalCode);
  }, [productKind, productQuery, products]);

  return (
    <section className="module-surface products-surface" aria-labelledby="products-page-title">
      <div className="module-toolbar products-toolbar">
        <div><h2 id="products-page-title">Productos</h2><small>{products.length} productos</small></div>
        <div className="module-toolbar-actions"><label className="search-field">
          <i className="sr-only">Buscar por producto, medida, tipo, cliente o marcado</i><Search size={17} aria-hidden="true" />
          <input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto, medida, cliente…" />
          {productQuery && <button type="button" onClick={() => setProductQuery("")} aria-label="Limpiar búsqueda"><X size={15} aria-hidden="true" /></button>}
        </label><button type="button" className="add-order-button" onClick={onAdd}><Plus size={17} aria-hidden="true" />Agregar producto</button></div>
      </div>
      <div className="products-board" aria-label={`${visibleProducts.length} productos`}>
        <div className="data-heading products-heading"><div>Código Zeta</div><div>Producto</div><div>Medida</div><label className="table-filter"><i className="sr-only">Filtrar por tipo</i><select value={productKind} onChange={(event) => setProductKind(event.target.value as Product["kind"] | "")} aria-label="Filtrar productos por tipo"><option value="">Tipo</option><option value="Pallet">Pallet</option><option value="Piso">Piso</option><option value="Bin">Bin</option></select></label><div>Cliente</div><div>Marcado</div><div className="sr-only">Acciones</div></div>
        {visibleProducts.length > 0 ? visibleProducts.map((product) => (
          <article className="product-row" key={product.id}>
            <div><small className="column-label">Código Zeta</small><strong className="product-code">{product.zetaCode ?? "—"}</strong></div>
            <div><small className="column-label">Producto</small><strong>{productDisplayName(product)}</strong></div>
            <div><small className="column-label">Medida</small><strong>{product.measure ?? "Sin medida"}</strong></div>
            <div><small className="column-label">Tipo</small><strong>{product.kind}</strong></div>
            <div><small className="column-label">Cliente</small><strong className={product.clientNames?.length ? "product-client-names" : "product-client-empty"}>{product.clientNames?.length ? product.clientNames.join(", ") : "Sin cliente asignado"}</strong></div>
            <div><small className="column-label">Marcado</small><strong>{product.requiresTreatment ? "Requiere" : "No requiere"}</strong></div>
            <button type="button" className="product-edit" onClick={() => onEdit(product)} aria-label={`Editar ${product.kind}${product.measure ? ` ${product.measure}` : ""}`}><Pencil size={17} aria-hidden="true" /></button>
          </article>
        )) : <EmptyState icon={Package} title="No hay productos para ese filtro" action={<button type="button" onClick={() => { setProductQuery(""); setProductKind(""); }}>Limpiar filtros</button>} />}
      </div>
    </section>
  );
}

function EditProductModal({ product, clients, onClose, onSave, onDelete }: { product: Product; clients: Array<Pick<ClientSummary, "id" | "name">>; onClose: () => void; onSave: (id: string, changes: ProductChanges) => Promise<boolean>; onDelete: (id: string) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const availableClients = clients.filter((client) => client.id && !(product.clientNames ?? []).includes(client.name));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    const saved = await onSave(product.id, {
      kind: String(form.get("kind") ?? "Pallet") as Product["kind"],
      measure: String(form.get("measure") ?? ""),
      requiresTreatment: form.has("requiresTreatment"),
      zetaCode: String(form.get("zetaCode") ?? ""),
      stockName: String(form.get("stockName") ?? ""),
      clientId: String(form.get("clientId") ?? "") || undefined,
    });
    setSaving(false);
    if (saved) { setDirty(false); onClose(); } else setError("No se pudo guardar el producto.");
  };

  const remove = async () => {
    setSaving(true);
    setError("");
    const deleted = await onDelete(product.id);
    setSaving(false);
    if (deleted) onClose(); else setError("No se pudo eliminar el producto.");
  };

  return (
    <ModalShell title="Editar producto" className="edit-product-modal" onClose={onClose} initialFocusRef={inputRef} dirty={dirty && !saving}>
        <form onSubmit={save} onChange={() => setDirty(true)}>
          <label>Código Zeta<input name="zetaCode" required defaultValue={product.zetaCode ?? ""} /><small className="field-help">Se comparte automáticamente con cada cliente que use este producto.</small></label>
          <label>Nombre del producto<input ref={inputRef} name="stockName" required defaultValue={product.stockName ?? productDisplayName(product)} /><small className="field-help">Escribí sólo el producto, sin cliente ni medida.</small></label>
          <label>Tipo<select name="kind" defaultValue={product.kind}><option value="Pallet">Pallet</option><option value="Piso">Piso</option><option value="Bin">Bin</option></select></label>
          <label>Medida<input name="measure" defaultValue={product.measure ?? ""} /></label>
          <label className="field-wide">Clientes asignados<output className="readonly-value">{product.clientNames?.length ? product.clientNames.join(" · ") : "Ninguno"}</output></label>
          <label className="field-wide">Asignar otro cliente<select name="clientId" defaultValue="" disabled={!availableClients.length}><option value="">{availableClients.length ? "No agregar otro cliente" : "Todos los clientes ya están asignados"}</option>{availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><small className="field-help">El cliente recibe el Código Zeta del producto y sólo debe completar sus controles operativos.</small></label>
          <label className="product-treatment-toggle"><input aria-label="Requiere Marcado" type="checkbox" name="requiresTreatment" defaultChecked={product.requiresTreatment} /><span><strong>Requiere Marcado</strong><small>Las unidades producidas quedarán pendientes hasta registrar el marcado.</small></span></label>
          <FieldError id="edit-product-error">{error}</FieldError>
          <div className="modal-actions"><button type="button" className="delete-button" onClick={() => setConfirmDelete(true)} disabled={saving}>Eliminar producto</button><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving} error={Boolean(error)}>Guardar cambios</AsyncButton></div></div>
        </form>
        {confirmDelete && <ConfirmDialog title="¿Eliminar este producto?" description="La acción no se puede deshacer." confirmLabel="Eliminar" destructive onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}
    </ModalShell>
  );
}

function AddProductModal({ onClose, onSave }: { onClose: () => void; onSave: (changes: ProductChanges) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLSelectElement>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    const saved = await onSave({ kind: String(form.get("kind")) as Product["kind"], measure: String(form.get("measure") ?? ""), requiresTreatment: form.has("requiresTreatment"), zetaCode: String(form.get("zetaCode") ?? "") });
    setSaving(false);
    if (saved) { setDirty(false); onClose(); } else setError("No se pudo agregar el producto.");
  };
  return <ModalShell title="Agregar producto" className="edit-product-modal" onClose={onClose} initialFocusRef={inputRef} dirty={dirty && !saving}><form onSubmit={submit} onChange={() => setDirty(true)}><label>Tipo<select ref={inputRef} name="kind" defaultValue="Pallet"><option value="Pallet">Pallet</option><option value="Piso">Piso</option><option value="Bin">Bin</option></select></label><label>Medida<input name="measure" placeholder="Ej. 120 × 100" /></label><label>Código Zeta<input name="zetaCode" required placeholder="Ej. X" /></label><label className="product-treatment-toggle"><input aria-label="Requiere Marcado" type="checkbox" name="requiresTreatment" /><span><strong>Requiere Marcado</strong><small>Las unidades quedarán pendientes hasta registrar el marcado.</small></span></label><FieldError id="add-product-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving} error={Boolean(error)}>Agregar producto</AsyncButton></div></form></ModalShell>;
}

function AddClientModal({ onClose, onSave }: { onClose: () => void; onSave: (input: { name: string; address: string; department: string }) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const saved = await onSave({ name: String(form.get("name") ?? ""), address: String(form.get("address") ?? ""), department: String(form.get("department") ?? "") });
    setSaving(false);
    if (saved) { setDirty(false); onClose(); } else setError("No se pudo agregar el cliente.");
  };
  return <ModalShell title="Agregar cliente" className="add-client-modal" onClose={onClose} initialFocusRef={inputRef} dirty={dirty && !saving}><form onSubmit={submit} onChange={() => setDirty(true)}><label className="field-wide">Nombre de la empresa <span aria-hidden="true">*</span><input ref={inputRef} name="name" required aria-required="true" /></label><label>Dirección<input name="address" autoComplete="street-address" /></label><label>Departamento<select name="department" defaultValue=""><option value="">Seleccionar departamento</option>{uruguayDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label><FieldError id="add-client-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving} error={Boolean(error)}>Agregar cliente</AsyncButton></div></form></ModalShell>;
}

export function CalendarView({ orders, onOpen }: { orders: OperationOrder[]; onOpen: (id: string) => void }) {
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
        <WeekNavigator label={formatCalendarRange(weekStart)} onPrevious={() => moveWeek(-1)} onNext={() => moveWeek(1)} />
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
                    <OrderStatusBadge order={order} /><strong>{order.client}</strong>{visibleReference(order) && <small>{visibleReference(order)}</small>}<small>{number.format(order.requested)} unidades</small>
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

export function LogisticsView({ orders, providers, onOpen }: { orders: OperationOrder[]; providers: Provider[]; onOpen: (id: string) => void }) {
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
          <WeekNavigator label={formatCalendarRange(weekStart)} onPrevious={() => moveWeek(-1)} onNext={() => moveWeek(1)} />
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
            <OrderStatusBadge order={order} />
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

const orderStatusIcons = {
  planned: Package,
  preparation: Factory,
  ready_for_delivery: CheckCircle2,
  in_transit: Truck,
  partial_delivery: Package,
  delivered: CheckCircle2,
  cancelled: X,
} satisfies Record<OrderOperationalStatus, typeof Package>;

function OrderStatusBadge({ order, today }: { order: OperationOrder; today?: Date }) {
  const status = getOrderOperationalStatus(order);
  return <span className="order-status-stack"><StatusBadge label={orderOperationalStatusLabels[status]} tone={status} icon={orderStatusIcons[status]} />{isOrderOverdue(order, today) && <StatusBadge label="Atrasado" tone="overdue" icon={AlertTriangle} />}</span>;
}

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

function ProductionAllocationModal({ line, providers, onClose, onSaved }: { line: OrderLine; providers: Provider[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const editable = (line.productionAllocations ?? []).filter((item) => item.status === "draft");
  const [rows, setRows] = useState(() => editable.length ? editable.map((item) => ({ plannedDate: item.plannedDate, plannedQuantity: item.plannedQuantity, resourceId: item.resourceId ?? "internal", status: item.status === "confirmed" ? "confirmed" as const : "draft" as const, note: item.note ?? "" })) : [{ plannedDate: "", plannedQuantity: line.quantity, resourceId: "internal", status: "draft" as const, note: "" }]);
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const resources = [{ id: "internal", name: "Fábrica / cuadrillas" }, ...providers.filter((provider) => provider.type === "Aserradero").map((provider) => ({ id: provider.id, name: provider.name }))];
  const total = rows.reduce((sum, row) => sum + (row.plannedQuantity || 0), 0);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(""); const response = await fetch(`/api/order-lines/${line.id}/production-allocations`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ allocations: rows }) }); const body = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(body.error ?? "No se pudo guardar la distribución."); await onSaved(); onClose(); };
  return <ModalShell title="Distribuir producción" description={`${line.product} · ${number.format(line.quantity)} palets`} className="order-operation-modal allocation-modal" onClose={onClose}><form className="order-operation-form allocation-modal-form" onSubmit={submit}>
    <p className="allocation-draft-note">Las nuevas asignaciones se guardan en borrador. La confirmación se realiza desde Capacidad cuando exista una regla vigente.</p>
    <fieldset className="order-dialog-section allocation-days"><legend>Planificación por día</legend><div className="allocation-editor">{rows.map((row, index) => <div key={index}>
        <label>Fecha<input type="date" required value={row.plannedDate} onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, plannedDate: event.target.value } : item))} /></label>
        <label>Cantidad<input type="number" min="1" step="1" required value={row.plannedQuantity || ""} onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, plannedQuantity: Number(event.target.value) } : item))} /></label>
        <label>Recurso<select value={row.resourceId} onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, resourceId: event.target.value } : item))}>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
        {rows.length > 1 && <button type="button" className="icon-button allocation-remove" onClick={() => setRows((current) => current.filter((_, position) => position !== index))} aria-label="Quitar día"><X size={16} /></button>}
      </div>)}</div><div className="allocation-footer"><button type="button" className="secondary-button" onClick={() => setRows((current) => [...current, { plannedDate: "", plannedQuantity: 0, resourceId: "internal", status: "draft", note: "" }])}><Plus size={16} />Agregar otro día</button><output className={`allocation-total ${total > line.quantity ? "danger" : ""}`}><span>Asignado</span><strong>{number.format(total)} de {number.format(line.quantity)}</strong></output></div></fieldset>
    <FieldError id="allocation-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving} disabled={total > line.quantity || total <= 0}>Guardar distribución</AsyncButton></div>
  </form></ModalShell>;
}

function ShipmentEditorModal({ order, shipment, providers, onClose, onSaved }: { order: OperationOrder; shipment?: Shipment; providers: Provider[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [date, setDate] = useState(shipment?.plannedDate ?? getOrderPlannedDate(order)); const [source, setSource] = useState<TransportSource>(shipment?.transportSource ?? "internal"); const [providerId, setProviderId] = useState(shipment?.transportProviderId ?? ""); const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((line) => [line.id, shipment?.lines.find((item) => item.orderLineId === line.id)?.plannedQuantity ?? 0]))); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const transporters = providers.filter((provider) => provider.type === "Transporte");
  const maxFor = (line: OrderLine) => line.quantity - (order.shipments ?? []).filter((item) => item.status !== "cancelled" && String(item.id) !== String(shipment?.id)).flatMap((item) => item.lines).filter((item) => item.orderLineId === line.id).reduce((sum, item) => sum + item.plannedQuantity, 0);
  const submit = async (event: FormEvent) => { event.preventDefault(); const lines = order.lines.map((line) => ({ orderLineId: line.id, plannedQuantity: quantities[line.id] || 0 })).filter((line) => line.plannedQuantity > 0); setSaving(true); setError(""); const response = await fetch(shipment ? `/api/shipments/${shipment.id}` : `/api/orders/${order.id}/shipments`, { method: shipment ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plannedDate: date, transportSource: source, transportProviderId: source === "external" ? providerId : undefined, lines, responsible: "Detalle del pedido" }) }); const body = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(body.error ?? "No se pudo guardar el viaje."); await onSaved(); onClose(); };
  return <ModalShell title={shipment ? "Editar viaje" : "Agregar viaje"} description={`${order.client} · ${number.format(order.requested)} palets`} className="order-operation-modal shipment-editor-modal" onClose={onClose}><form className="order-operation-form shipment-editor-form" onSubmit={submit}><div className="order-dialog-fields"><label>Fecha de entrega<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Transporte<select value={source} onChange={(event) => setSource(event.target.value as TransportSource)}><option value="internal">Transporte interno</option><option value="external">Transportista externo</option></select></label>{source === "external" && <label className="field-wide">Transportista<select value={providerId} onChange={(event) => setProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}</div><fieldset className="order-dialog-section delivered-lines"><legend>Productos del viaje</legend>{order.lines.map((line) => <label key={line.id}><span><strong>{line.product}</strong><small>{number.format(maxFor(line))} disponibles</small></span><input aria-label={`Cantidad de ${line.product}`} type="number" min="0" max={maxFor(line)} value={quantities[line.id] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: Number(event.target.value) }))} /></label>)}</fieldset><FieldError id="shipment-editor-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>{shipment ? "Guardar cambios" : "Guardar viaje"}</AsyncButton></div></form></ModalShell>;
}

function ShipmentDistributionModal({ order, onClose, onNew, onEdit }: { order: OperationOrder; onClose: () => void; onNew: () => void; onEdit: (shipment: Shipment) => void }) {
  const planned = (order.shipments ?? []).filter((shipment) => shipment.status === "planned");
  return <ModalShell title="Distribuir viajes" description={`${order.client} · ${number.format(order.requested)} palets`} className="order-operation-modal shipment-distribution-modal" onClose={onClose}><div className="shipment-distribution-content"><div className="shipment-distribution-heading"><div><strong>Viajes planificados</strong><small>Agregá un viaje o editá la distribución de uno existente.</small></div><button type="button" className="primary-button" onClick={onNew}><Plus size={16} />Agregar viaje</button></div>{planned.length ? <div className="shipment-distribution-list">{planned.map((shipment) => <article key={shipment.id}><div><strong>{formatOrderDate(shipment.plannedDate)}</strong><small>{shipment.transportLabel}</small></div><span>{number.format(shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0))} palets</span><button type="button" className="secondary-button" onClick={() => onEdit(shipment)}>Editar</button></article>)}</div> : <p className="tracking-empty">Todavía no hay viajes planificados.</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div></div></ModalShell>;
}

function OrderTrackingPanel({ order, providers, refreshKey, onAdd, onChanged, onCancel, onClose }: { order?: OperationOrder; providers: Provider[]; refreshKey: number; onAdd: (order: OperationOrder) => void; onChanged: (id: string) => Promise<void>; onCancel: (id: string) => Promise<boolean>; onClose: () => void }) {
  const [history, setHistory] = useState<OrderChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"summary" | "production" | "shipments">("summary");
  const [allocationLine, setAllocationLine] = useState<OrderLine | null>(null);
  const [showShipmentDistribution, setShowShipmentDistribution] = useState(false);
  const [shipmentEditor, setShipmentEditor] = useState<Shipment | "new" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const orderId = order?.id;

  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/orders/${orderId}/history`)
      .then((response) => response.ok ? response.json() : { history: [] })
      .then((payload: { history?: OrderChange[] }) => setHistory(payload.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [orderId, refreshKey]);

  useEffect(() => {
    if (!orderId) return;
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [orderId]);

  if (!order) {
    return <aside className="detail-column order-tracking-panel empty-order-detail" aria-label="Seguimiento del pedido"><strong>Seleccione un pedido</strong></aside>;
  }
  const productionSourceLabel = order.productionSource === "sawmill" ? "Otro aserradero" : order.productionSource === "import" ? "Importación" : "Producción interna";
  const producer = order.productionSource === "internal" ? "Ecoase" : providers.find((provider) => provider.id === order.producerProviderId)?.name ?? "—";
  const transportOrigin = order.transportSource === "internal" ? "Interno" : "Externo";
  const stockAlerts = order.lines.filter((line) => line.stockRisk && ["red", "orange", "yellow"].includes(line.stockRisk.level));

  return (
    <aside ref={panelRef} className="detail-column order-tracking-panel" aria-labelledby="tracking-title" tabIndex={-1}>
      <div className="tracking-heading">
        <div><small>Seguimiento del pedido</small><h2 id="tracking-title">{order.client}</h2><p>{order.product}</p></div>
        <div className="tracking-heading-actions"><OrderStatusBadge order={order} /><button type="button" className="tracking-close-button" onClick={onClose} aria-label="Cerrar seguimiento del pedido" title="Cerrar detalle"><X size={18} aria-hidden="true" /></button></div>
      </div>
      <nav className="tracking-tabs" aria-label="Secciones del pedido"><button type="button" className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Resumen</button><button type="button" className={tab === "production" ? "active" : ""} onClick={() => setTab("production")}>Producción</button><button type="button" className={tab === "shipments" ? "active" : ""} onClick={() => setTab("shipments")}>Viajes <span>{order.shipments?.length ?? 0}</span></button></nav>
      {tab === "summary" && <>
      <div className="tracking-summary" aria-label="Resumen de cantidades">
        <div><small>Pedido</small><strong>{number.format(order.requested)}</strong></div>
        <div><small>Entregado</small><strong>{number.format(order.delivered)}</strong></div>
        <div><small>Saldo</small><strong>{number.format(order.pending)}</strong></div>
      </div>
      {stockAlerts.length > 0 && <section className="order-stock-alerts" aria-label="Alertas de stock"><AlertTriangle size={17} /><div><strong>{stockAlerts.length === 1 ? "1 producto con riesgo de stock" : `${stockAlerts.length} productos con riesgo de stock`}</strong>{stockAlerts.map((line) => <span key={line.id}>{line.product}: {number.format(line.stockRisk!.available)} disponibles{line.stockRisk!.daysToBreak === undefined ? " · sin consumo informado" : ` · ${number.format(line.stockRisk!.daysToBreak)} días de cobertura`}</span>)}</div><a href="/stock">Ver stock</a></section>}
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
      <button type="button" className="tracking-cancel-button" onClick={() => setConfirmCancel(true)}>Cancelar pedido</button>
      </>}
      {tab === "production" && <section className="tracking-operation-list production-table-panel" aria-labelledby="production-allocations-title"><header><div><h3 id="production-allocations-title">Plan de producción</h3><small>Una fila por producto</small></div></header><div className="production-table-wrap"><table className="production-tracking-table"><thead><tr><th scope="col">Producto del pedido</th><th scope="col">Total palets</th><th scope="col">Marcados</th><th scope="col">Pend. marcado</th><th scope="col">Listo</th><th scope="col">Planificación</th><th scope="col"><span className="sr-only">Acción</span></th></tr></thead><tbody>{order.lines.map((line) => { const requiresTreatment = order.requiredOperations?.includes("treatment"); const allocations = line.productionAllocations ?? []; return <tr key={line.id}><th scope="row">{line.product}</th><td className="numeric-cell">{number.format(line.quantity)}</td><td className="numeric-cell">{requiresTreatment ? number.format(line.treatedQuantity ?? 0) : "—"}</td><td className="numeric-cell">{requiresTreatment ? number.format(line.treatmentPendingQuantity ?? line.quantity) : "—"}</td><td className="numeric-cell">{requiresTreatment ? number.format(line.readyReservedQuantity ?? 0) : "—"}</td><td>{allocations.length ? <div className="production-table-allocations">{allocations.map((allocation) => <span key={allocation.id}><strong>{formatOrderDate(allocation.plannedDate)}</strong><small>{number.format(allocation.plannedQuantity)} · {allocation.resourceId ?? "Sin recurso"} · {allocation.status === "confirmed" ? "Confirmado" : allocation.status === "completed" ? "Completado" : "Borrador"}</small></span>)}</div> : <span className="production-unplanned">Sin distribuir</span>}</td><td className="production-table-action"><button type="button" className="secondary-button" onClick={() => setAllocationLine(line)}>Distribuir</button></td></tr>; })}</tbody></table></div></section>}
      {tab === "shipments" && <section className="tracking-operation-list shipment-table-panel" aria-labelledby="tracking-shipments-title"><header><div><h3 id="tracking-shipments-title">Viajes del pedido</h3><small>Entregas parciales y remitos</small></div></header>{(order.shipments ?? []).length ? <div className="production-table-wrap shipment-table-wrap"><table className="production-tracking-table shipment-tracking-table"><thead><tr><th scope="col">Entrega</th><th scope="col">Transporte</th><th scope="col">Palets</th><th scope="col">Entregados</th><th scope="col">Estado</th><th scope="col">Productos</th><th scope="col">Remito</th><th scope="col"><span className="sr-only">Acción</span></th></tr></thead><tbody>{(order.shipments ?? []).map((shipment) => { const products = Array.from(new Set(shipment.lines.map((line) => line.product))); return <tr key={shipment.id}><th scope="row">{formatOrderDate(shipment.plannedDate)}</th><td>{shipment.transportLabel}</td><td className="numeric-cell">{number.format(shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0))}</td><td className="numeric-cell">{number.format(shipment.lines.reduce((sum, line) => sum + line.deliveredQuantity, 0))}</td><td><span className={`shipment-table-status ${shipment.status}`}>{shipmentStatusLabels[shipment.status]}</span></td><td><div className="shipment-table-products">{products.map((product) => <strong key={product}>{product}</strong>)}</div></td><td><span className={shipment.remittance ? undefined : "shipment-remittance-pending"}>{shipment.remittance || "Pendiente"}</span></td><td className="production-table-action"><button type="button" className="secondary-button" onClick={() => setShowShipmentDistribution(true)}>Distribuir</button></td></tr>; })}</tbody></table></div> : <div className="tracking-empty tracking-empty-action"><span>Todavía no hay viajes.</span><button type="button" className="secondary-button" onClick={() => setShowShipmentDistribution(true)}>Distribuir</button></div>}</section>}
      {allocationLine && <ProductionAllocationModal line={allocationLine} providers={providers} onClose={() => setAllocationLine(null)} onSaved={() => onChanged(order.id)} />}
      {showShipmentDistribution && <ShipmentDistributionModal order={order} onClose={() => setShowShipmentDistribution(false)} onNew={() => { setShowShipmentDistribution(false); setShipmentEditor("new"); }} onEdit={(shipment) => { setShowShipmentDistribution(false); setShipmentEditor(shipment); }} />}
      {shipmentEditor && <ShipmentEditorModal order={order} shipment={shipmentEditor === "new" ? undefined : shipmentEditor} providers={providers} onClose={() => setShipmentEditor(null)} onSaved={() => onChanged(order.id)} />}
      {confirmCancel && <ConfirmDialog title="¿Cancelar este pedido?" description="El pedido dejará de aparecer entre los activos. Su información permanecerá disponible en el historial." confirmLabel="Cancelar pedido" destructive onCancel={() => setConfirmCancel(false)} onConfirm={() => void onCancel(order.id).then((saved) => { if (saved) onClose(); else setConfirmCancel(false); })} />}
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
          {kind === "despacho" && <><label>Fecha y hora de salida<input name="dispatchedAt" type="datetime-local" /></label><label>Remito<input name="remittance" defaultValue={order.remittance ?? ""} placeholder="Ej. 603" required /></label></>}
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
    const saved = await onSave({
      plannedDate,
      requested: quantity,
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
          <fieldset className="field-wide assignment-fieldset"><legend>Producción</legend>
            <label>Origen<select value={productionSource} onChange={(event) => { setProductionSource(event.target.value as ProductionSource); setProducerProviderId(""); }}><option value="internal">Producción interna</option><option value="sawmill">Otro aserradero</option><option value="import">Importación</option></select></label>
            {productionSource !== "internal" && <label>{productionSource === "sawmill" ? "Aserradero" : "Importador"}<select value={producerProviderId} onChange={(event) => setProducerProviderId(event.target.value)} required><option value="" disabled>Seleccionar</option>{producers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
            {productionSource === "import" ? <label>Fecha prevista de llegada<input type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} required /></label> : <label>Fecha de producción<input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} required /></label>}
            <div className="operation-options"><strong>Operaciones requeridas</strong>{(["assembly", "treatment"] as CapacityOperation[]).map((operation) => <label key={operation}><input type="checkbox" checked={requiredOperations.includes(operation)} onChange={(event) => setRequiredOperations((current) => event.target.checked ? [...new Set([...current, operation])] : current.filter((item) => item !== operation))} />{capacityOperationLabels[operation]}</label>)}</div>
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
  const statusPriority: Record<OrderOperationalStatus, number> = { planned: 0, preparation: 1, ready_for_delivery: 2, in_transit: 3, partial_delivery: 4, delivered: 5, cancelled: 6 };
  const planOrders = [...orders].sort((a, b) => statusPriority[getOrderOperationalStatus(a)] - statusPriority[getOrderOperationalStatus(b)] || a.client.localeCompare(b.client, "es"));

  return (
    <section className="module-surface plan-surface" aria-labelledby="plan-title">
      <div className="module-toolbar"><div><h2 id="plan-title">Plan</h2></div></div>
      <div className="plan-board" aria-label="Plan operativo">
        <div className="data-heading plan-heading" aria-hidden="true"><div>Cliente</div><div>Cantidad de pallets</div><div>Fecha planificada</div><div>Estado</div><div>Transportista</div><div /></div>
        {planOrders.map((order) => {
          const dateChanged = Boolean(order.originalPlannedDate && order.originalPlannedDate !== getOrderPlannedDate(order));
          return <article className="plan-row" key={order.id}>
            <div className="plan-client"><strong>{order.client}</strong></div>
            <div><small className="column-label">Cantidad de pallets</small><strong>{number.format(order.requested)}</strong></div>
            <div className={dateChanged ? "plan-date changed" : "plan-date"}><small className="column-label">Fecha planificada</small><strong>{order.dateLabel}</strong></div>
            <div><small className="column-label">Estado</small><OrderStatusBadge order={order} /></div>
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

function AddOrderModal({ clientOptions, products, providers, initialDeliveryDate, onClose, onCreated }: { clientOptions: ClientSummary[]; products: Product[]; providers: Provider[]; initialDeliveryDate?: string; onClose: () => void; onCreated: (order: OperationOrder) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientProducts, setClientProducts] = useState<ClientProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [orderLines, setOrderLines] = useState<Array<{ clientProductId: string; quantity: number }>>([{ clientProductId: "", quantity: 0 }]);
  const [productionSource, setProductionSource] = useState<ProductionSource>("internal");
  const [transportSource, setTransportSource] = useState<TransportSource>("internal");
  const [producerProviderId, setProducerProviderId] = useState("");
  const [transportProviderId, setTransportProviderId] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(initialDeliveryDate ?? "");
  const [requiredOperations, setRequiredOperations] = useState<CapacityOperation[]>(["assembly"]);
  const clientInputRef = useRef<HTMLSelectElement>(null);

  const selectedClientProduct = clientProducts.find((product) => String(product.id) === orderLines[0]?.clientProductId);
  const quantity = orderLines.reduce((sum, line) => sum + (Number.isFinite(line.quantity) ? line.quantity : 0), 0);
  const producers = providers.filter((provider) => provider.type === (productionSource === "sawmill" ? "Aserradero" : "Importador"));
  const transporters = providers.filter((provider) => provider.type === "Transporte");

  useEffect(() => {
    clientInputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    fetch(`/api/clients/${clientId}/products?active=true`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { products?: ClientProductOption[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar los productos.");
      const options = payload.products ?? [];
      setClientProducts(options);
      if (options.length === 1) {
        setOrderLines([{ clientProductId: String(options[0].id), quantity: 0 }]);
        const product = products.find((item) => item.id === options[0].productId);
        const suggested: CapacityOperation[] = ["assembly"];
        if (product?.requiresTreatment) suggested.push("treatment");
        setRequiredOperations(suggested);
      }
    }).catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); }).finally(() => setLoadingProducts(false));
    return () => controller.abort();
  }, [clientId, products]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: orderLines,
        reference: form.get("reference"),
        orderDate: form.get("orderDate"),
        requestedDeliveryDate: form.get("requestedDeliveryDate"),
        plannedDate: deliveryDate,
        productionSource,
        producerProviderId: productionSource === "internal" ? undefined : producerProviderId,
        productionDate: productionSource === "import" ? undefined : productionDate,
        importArrivalDate: productionSource === "import" ? arrivalDate : undefined,
        requiredOperations,
        transportSource,
        transportProviderId: transportSource === "external" ? transportProviderId : undefined,
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
          <label>Cliente<select ref={clientInputRef} required value={clientId} onChange={(event) => { setClientId(event.target.value); setClientProducts([]); setOrderLines([{ clientProductId: "", quantity: 0 }]); setLoadingProducts(true); setError(""); }}><option value="" disabled>Seleccionar cliente</option>{clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label>Orden o referencia<input name="reference" placeholder="Ej. Orden 184834" /></label>
          <label>Códigos Zeta<output className="readonly-value">{orderLines.map((line) => clientProducts.find((item) => String(item.id) === line.clientProductId)?.zetaCode).filter(Boolean).join(" · ") || "Se completan al elegir los productos"}</output></label>
          <label>Fecha del pedido<input name="orderDate" type="date" required /></label>
          <fieldset className="field-wide order-lines-fieldset"><legend>Productos y cantidades</legend>
            {orderLines.map((line, index) => <div className="order-line-editor" key={index}>
              <label>Producto habilitado<select required disabled={!clientId || loadingProducts} value={line.clientProductId} onChange={(event) => { const next = [...orderLines]; next[index] = { ...next[index], clientProductId: event.target.value }; setOrderLines(next); const selected = clientProducts.filter((item) => next.some((entry) => entry.clientProductId === String(item.id))); const suggested: CapacityOperation[] = ["assembly"]; if (selected.some((item) => products.find((product) => product.id === item.productId)?.requiresTreatment)) suggested.push("treatment"); setRequiredOperations(suggested); }}><option value="" disabled>{loadingProducts ? "Cargando…" : "Seleccionar producto"}</option>{clientProducts.filter((item) => !orderLines.some((entry, position) => position !== index && entry.clientProductId === String(item.id))).map((product) => <option key={product.id} value={String(product.id)}>{product.label}</option>)}</select></label>
              <label>Cantidad<input type="number" min="1" step="1" value={line.quantity || ""} onChange={(event) => { const next = [...orderLines]; next[index] = { ...next[index], quantity: Number(event.target.value) }; setOrderLines(next); }} required /></label>
              {orderLines.length > 1 && <button type="button" className="icon-button" onClick={() => setOrderLines((current) => current.filter((_, position) => position !== index))} aria-label="Quitar producto"><X size={16} /></button>}
            </div>)}
            {clientId && orderLines.length < clientProducts.length && <button type="button" className="secondary-button add-order-line" onClick={() => setOrderLines((current) => [...current, { clientProductId: "", quantity: 0 }])}><Plus size={16} />Agregar otro producto</button>}
            {clientId && !loadingProducts && clientProducts.length === 0 && <small className="field-help">Este cliente no tiene productos disponibles.</small>}
            <output className="order-lines-total">Total del pedido: <strong>{number.format(quantity)} palets</strong></output>
          </fieldset>
          <label>Fecha solicitada<input name="requestedDeliveryDate" type="date" defaultValue={initialDeliveryDate} required /></label>
          <label>Fecha de entrega<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} required /></label>
          <fieldset className="field-wide assignment-fieldset"><legend>Producción</legend>
            <label>Origen de producción<select value={productionSource} onChange={(event) => { setProductionSource(event.target.value as ProductionSource); setProducerProviderId(""); }}><option value="internal">Producción interna</option><option value="sawmill">Otro aserradero</option><option value="import">Importación</option></select></label>
            {productionSource !== "internal" && <label>{productionSource === "sawmill" ? "Aserradero" : "Importador"}<select value={producerProviderId} onChange={(event) => setProducerProviderId(event.target.value)} required><option value="" disabled>Seleccionar proveedor</option>{producers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
            {productionSource === "import" ? <label>Fecha prevista de llegada<input type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} required /></label> : <label>Fecha de producción<input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} required /></label>}
            <div className="operation-options"><strong>Operaciones requeridas</strong>{(["assembly", "treatment"] as CapacityOperation[]).map((operation) => <label key={operation}><input type="checkbox" checked={requiredOperations.includes(operation)} onChange={(event) => setRequiredOperations((current) => event.target.checked ? [...new Set([...current, operation])] : current.filter((item) => item !== operation))} />{capacityOperationLabels[operation]}</label>)}</div>
            <CapacityHint date={productionSource === "import" ? arrivalDate : productionDate} source={productionSource} providerId={producerProviderId} operations={requiredOperations} quantity={quantity} />
          </fieldset>
          <fieldset className="field-wide assignment-fieldset"><legend>Transporte</legend>
            <label>Origen del transporte<select value={transportSource} onChange={(event) => setTransportSource(event.target.value as TransportSource)}><option value="internal">Transporte interno</option><option value="external">Transportista externo</option></select></label>
            {transportSource === "external" && <label>Transportista<select value={transportProviderId} onChange={(event) => setTransportProviderId(event.target.value)} required><option value="" disabled>Seleccionar transportista</option>{transporters.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}
            <CapacityHint date={deliveryDate} source={transportSource} providerId={transportProviderId} quantity={quantity} transport />
          </fieldset>
          <label className="field-wide">Dirección de entrega<output className="readonly-value">{selectedClientProduct?.clientAddress || "—"}</output></label>
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

export default function Dashboard({ initialSection = "calendario", initialClientId, initialProductionView = "production", initialProductionDate, initialStockRiskFilter }: { initialSection?: DashboardSection; initialClientId?: string; initialProductionView?: ProductionWorkspaceView; initialProductionDate?: string; initialStockRiskFilter?: "alert" }) {
  const [section, setSection] = useState<DashboardSection>(initialSection);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orderKpiFilter, setOrderKpiFilter] = useState<"in-progress" | "waiting" | "total" | "compliance" | "">("");
  const kpiPeriod: KpiPeriod = "week";
  const [orderRows, setOrderRows] = useState<OperationOrder[]>(initialOrders);
  const [providerRows, setProviderRows] = useState<Provider[]>(initialProviders);
  const [productRows, setProductRows] = useState<Product[]>(() => [...initialProducts].sort(compareProductsByInternalCode));
  const [registeredClients, setRegisteredClients] = useState<Array<Pick<ClientSummary, "id" | "name" | "address" | "department" | "active">>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [addOrderDate, setAddOrderDate] = useState<string | undefined>();
  const [calendarRevision, setCalendarRevision] = useState(0);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingPlanOrder, setEditingPlanOrder] = useState<OperationOrder | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
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
        setProductRows([...products].sort(compareProductsByInternalCode));
        setRegisteredClients(clients.map((client) => ({ id: client.id, name: client.name, address: client.address, department: client.department, active: client.active })));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (window.location.hash || window.location.pathname === "/") {
      window.history.replaceState({}, "", sectionPaths[initialSection]);
    }
  }, [initialSection]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const activeOrders = useMemo(() => orderRows.filter((order) => !isOrderClosed(order)), [orderRows]);
  const historyOrders = useMemo(() => orderRows.filter(isOrderClosed), [orderRows]);
  const isHistory = section === "historial";
  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return (isHistory ? historyOrders : activeOrders).filter((order) => {
      if (!isHistory && orderKpiFilter) {
        if (!isOrderInPeriod(order, kpiPeriod, today)) return false;
        const status = getOrderOperationalStatus(order);
        if (orderKpiFilter === "in-progress" && !["preparation", "ready_for_delivery", "in_transit", "partial_delivery"].includes(status)) return false;
        if (orderKpiFilter === "waiting" && status !== "planned") return false;
        if (orderKpiFilter === "compliance" && order.delivered <= 0) return false;
      }
      if (!normalized) return true;
      return [order.client, order.reference, order.product, order.transport]
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
    });
  }, [activeOrders, historyOrders, isHistory, kpiPeriod, orderKpiFilter, query, today]);

  const selectedOrder = visibleOrders.find((order) => order.id === selectedId);
  const completed = historyOrders.length;
  const kpiOrders = useMemo(() => orderRows.filter((order) => isOrderInPeriod(order, kpiPeriod, today)), [kpiPeriod, orderRows, today]);
  const kpiActiveOrders = kpiOrders.filter((order) => !isOrderClosed(order));
  const palletsInProgress = kpiActiveOrders
    .filter((order) => ["preparation", "ready_for_delivery", "in_transit", "partial_delivery"].includes(getOrderOperationalStatus(order)))
    .reduce((sum, order) => sum + order.pending, 0);
  const palletsWaiting = kpiActiveOrders
    .filter((order) => getOrderOperationalStatus(order) === "planned")
    .reduce((sum, order) => sum + order.pending, 0);
  const totalPallets = kpiActiveOrders.reduce((sum, order) => sum + order.requested, 0);
  const periodRequested = kpiOrders.reduce((sum, order) => sum + order.requested, 0);
  const periodDelivered = kpiOrders.reduce((sum, order) => sum + order.delivered, 0);
  const deliveryRate = periodRequested ? Math.round(periodDelivered / periodRequested * 100) : 0;
  const toggleOrderKpiFilter = (filter: Exclude<typeof orderKpiFilter, "">) => {
    setOrderKpiFilter((current) => current === filter ? "" : filter);
    setSelectedId("");
  };
  const clients = useMemo<ClientSummary[]>(() => {
    const summaries = new Map<string, ClientSummary>();
    orderRows.forEach((order) => {
      const current = summaries.get(order.client) ?? { id: order.clientId, name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0, activePallets: 0 };
      current.orders += 1;
      current.requested += order.requested;
      current.delivered += order.delivered;
      current.pending += order.pending;
      if (!isOrderClosed(order)) { current.activeOrders += 1; current.activePallets += order.requested; }
      summaries.set(order.client, current);
    });
    registeredClients.forEach((client) => {
      const current = summaries.get(client.name);
      if (current) Object.assign(current, { id: client.id, address: client.address, department: client.department, active: client.active });
      else summaries.set(client.name, { ...client, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0, activePallets: 0 });
    });
    return [...summaries.values()].sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "es"));
  }, [orderRows, registeredClients]);

  const selectOrder = (id: string) => {
    setSelectedId(id);
  };

  const openOrder = (id: string) => {
    const order = orderRows.find((item) => item.id === id);
    const nextSection: DashboardSection = order && isOrderClosed(order) ? "historial" : "pedidos";
    setSection(nextSection);
    window.history.pushState({}, "", sectionPaths[nextSection]);
    setQuery("");
    setSelectedId(id);
  };

  const refreshOrder = async (id: string) => {
    const response = await fetch(`/api/orders/${id}`);
    const payload = await response.json() as { order?: OperationOrder };
    if (response.ok && payload.order) setOrderRows((current) => current.map((order) => order.id === id ? payload.order! : order));
  };

  const addCreatedOrder = (order: OperationOrder) => {
    setOrderRows((current) => [order, ...current.filter((item) => item.id !== order.id)]);
    setSelectedId(order.id);
    setQuery("");
    if (addOrderDate) {
      setShowAddOrder(false);
      setAddOrderDate(undefined);
      setCalendarRevision((current) => current + 1);
      return;
    }
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

  const cancelOrder = async (id: string) => {
    setUpdateError("");
    const response = await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cancelled: true }) });
    const payload = await response.json() as { order?: OperationOrder; error?: string };
    if (!response.ok || !payload.order) {
      setUpdateError(payload.error ?? "No se pudo cancelar el pedido.");
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
    setProductRows((current) => current.map((product) => product.id === id ? payload.product! : product).sort(compareProductsByInternalCode));
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
    setProductRows((current) => [...current, payload.product!].sort(compareProductsByInternalCode));
    return true;
  };

  const addProvider = async (input: { name: string; type: ProviderType; supplies: string }) => {
    const response = await fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as { provider?: Provider; error?: string };
    if (!response.ok || !payload.provider) {
      throw new Error(payload.error || "No se pudo crear el proveedor.");
    }
    setProviderRows((current) => [...current, payload.provider!].sort((a, b) => a.name.localeCompare(b.name, "es")));
    return true;
  };

  const updateProvider = async (id: string, changes: { name?: string; type?: ProviderType; supplies?: string }) => {
    const response = await fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    });
    const payload = (await response.json()) as { provider?: Provider; error?: string };
    if (!response.ok || !payload.provider) {
      throw new Error(payload.error || "No se pudo actualizar el proveedor.");
    }
    setProviderRows((current) =>
      current.map((provider) => (provider.id === id ? payload.provider! : provider)).sort((a, b) => a.name.localeCompare(b.name, "es"))
    );
    return true;
  };

  const removeProvider = async (id: string) => {
    const response = await fetch(`/api/providers/${id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo eliminar el proveedor.");
    }
    setProviderRows((current) => current.filter((provider) => provider.id !== id));
    return true;
  };

  const addClient = async (input: { name: string; address: string; department: string }) => {
    const response = await fetch("/api/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const payload = (await response.json()) as { client?: { id?: string; name: string; address?: string; department?: string; active?: boolean } };
    if (!response.ok || !payload.client) return false;
    setRegisteredClients((current) => [...current.filter((client) => client.name !== payload.client!.name), payload.client!].sort((a, b) => a.name.localeCompare(b.name, "es")));
    return true;
  };

  const sectionCopy: Record<DashboardSection, string> = {
    pedidos: "Control operativo",
    plan: "Plan",
    calendario: "Calendario",
    logistica: "Cap. Logística",
    produccion: "Producción",
    stock: "Stock",
    clientes: "Clientes",
    productos: "Productos",
    historial: "Historial",
    proveedores: "Proveedores",
  };

  return (
    <div className="dashboard-shell">
      <button className="skip-link" type="button" onClick={() => document.getElementById("main-content")?.focus()}>Saltar al contenido</button>

      <AppNavigation section={section} completed={completed} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="workspace">
        <div className="mobile-header"><MobileNavigationButton open={mobileNavOpen} onClick={() => setMobileNavOpen((current) => !current)} /><div><strong>Ecoase</strong><small>{sectionCopy[section]}</small></div></div>
        <main id="main-content" className="dashboard-main" tabIndex={-1}>

        {section === "pedidos" && (
          <section className="dashboard-kpis" aria-label="Filtros rápidos de pedidos">
            <button type="button" className="kpi-card kpi-yellow" aria-pressed={orderKpiFilter === "in-progress"} onClick={() => toggleOrderKpiFilter("in-progress")}><strong>{number.format(palletsInProgress)}</strong><small>Palets en marcha</small></button>
            <button type="button" className="kpi-card kpi-red" aria-pressed={orderKpiFilter === "waiting"} onClick={() => toggleOrderKpiFilter("waiting")}><strong>{number.format(palletsWaiting)}</strong><small>Palets en espera</small></button>
            <button type="button" className="kpi-card kpi-blue" aria-pressed={orderKpiFilter === "total"} onClick={() => toggleOrderKpiFilter("total")}><strong>{number.format(totalPallets)}</strong><small>Palets totales</small></button>
            <button type="button" className="kpi-card kpi-green" aria-pressed={orderKpiFilter === "compliance"} onClick={() => toggleOrderKpiFilter("compliance")}><strong>{deliveryRate}%</strong><small>Nivel de cumplimiento</small></button>
          </section>
        )}

        {(section === "pedidos" || section === "historial") ? <div className={`operations-layout ${selectedOrder ? "detail-open" : ""}`}>
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
              {!isHistory && <button type="button" className="add-order-button" onClick={() => { setAddOrderDate(undefined); setShowAddOrder(true); }}><Plus size={17} aria-hidden="true" />Agregar pedido</button>}
              </div>
            </div>

            <div className="list-heading" aria-hidden="true">
              <div>Cliente</div><div>Pedido</div><div>Palets</div><div>Fecha de entrega</div><div>Estado</div><div />
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
                    <div className="order-stage"><OrderStatusBadge order={order} today={today} /></div>
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

          <div className={`order-detail-slot ${selectedOrder ? "open" : ""}`} aria-hidden={!selectedOrder}>{selectedOrder && <OrderTrackingPanel key={selectedOrder.id} order={selectedOrder} providers={providerRows} refreshKey={trackingRevision} onAdd={setUpdatingOrder} onChanged={refreshOrder} onCancel={cancelOrder} onClose={() => setSelectedId("")} />}</div>
        </div> : section === "plan" ? <><PlanView orders={activeOrders} onEdit={setEditingPlanOrder} />{updateError && <p className="plan-error" role="alert">{updateError}</p>}</> : section === "calendario" ? <OperationsCalendarView key={calendarRevision} onOpen={openOrder} onAdd={(date) => { setAddOrderDate(date); setShowAddOrder(true); }} onChanged={refreshOrder} /> : section === "logistica" ? <OperationsLogisticsView onOpen={openOrder} onChanged={refreshOrder} /> : section === "produccion" ? initialProductionView === "marking" ? <TreatmentView /> : <CapacityView providers={providerRows} view={initialProductionView} initialDate={initialProductionDate} /> : section === "stock" ? <StockView initialRiskFilter={initialStockRiskFilter} /> : section === "productos" ? <ProductsView products={productRows} onEdit={setEditingProduct} onAdd={() => setShowAddProduct(true)} /> : section === "proveedores" ? <ProvidersView providers={providerRows} onEdit={setEditingProvider} onAdd={() => setShowAddProvider(true)} /> : <ClientMasterView clients={clients} products={productRows} initialClientId={initialClientId} onAdd={() => setShowAddClient(true)} />}
        </main>

      </div>
      {showAddOrder && <AddOrderModal clientOptions={clients.filter((client) => client.id && client.active)} products={productRows} providers={providerRows} initialDeliveryDate={addOrderDate} onClose={() => { setShowAddOrder(false); setAddOrderDate(undefined); }} onCreated={addCreatedOrder} />}
      {showAddProduct && <AddProductModal onClose={() => setShowAddProduct(false)} onSave={addProduct} />}
      {showAddProvider && <AddProviderModal onClose={() => setShowAddProvider(false)} onSave={addProvider} />}
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onSave={addClient} />}
      {editingPlanOrder && <EditPlanModal order={editingPlanOrder} providers={providerRows} onClose={() => setEditingPlanOrder(null)} onSave={(changes) => updateOrder(editingPlanOrder.id, changes)} />}
      {editingProduct && <EditProductModal product={editingProduct} clients={clients} onClose={() => setEditingProduct(null)} onSave={updateProduct} onDelete={removeProduct} />}
      {editingProvider && <EditProviderModal provider={editingProvider} onClose={() => setEditingProvider(null)} onSave={updateProvider} onDelete={removeProvider} />}
      {updatingOrder && <OrderUpdateModal order={updatingOrder} onClose={() => setUpdatingOrder(null)} onSave={(update) => recordUpdate(updatingOrder.id, update)} />}
    </div>
  );
}
