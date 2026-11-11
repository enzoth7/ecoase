"use client";

import {
  Archive,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Factory,
  Package,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from "react";
import AppNavigation, { MobileNavigationButton } from "./components/AppNavigation";
import OperationHome from "./components/OperationHome";
import ColumnFilter from "./components/ColumnFilter";
import ProductionPlanningView, { PlanProductionWizard, productionRangeLabel } from "./components/ProductionPlanner";
import { DryingPlanModal, SecaderoPlanView, orderNeedsDrying } from "./components/PhaseViews";
import { DryingRulesView } from "./components/DryingCalendar";
import { findArea } from "./navigation";
import { useNavigate } from "./navigation-client";
import { LOGO_LEVEL, MEASURE_LEVEL, TREATMENT_LEVEL, defaultProductLevels, hasClassification, kindNames, levelValue, productHeatTreatmentLabel, type ProductLevel } from "./classification";
import { classifyPallet, type PalletClass } from "./logistics";
import { ProductDraftFields, draftFromProduct, draftPayload, validateDraft, type ProductDraft } from "./components/ProductFields";
import { AsyncButton, ConfirmDialog, EmptyState, FieldError, LoadingState, ModalShell, RowDeleteButton, StatusBadge, WeekNavigator } from "./components/ui";
import {
  compareProductsByInternalCode,
  getOrderOperationalStatus,
  getOrderPlannedDate,
  isActiveProvider,
  isOrderClosed,
  isOrderOverdue,
  orderOperationalStatusLabels,
  type OperationOrder,
  type OrderOperationalStatus,
  type OrderChange,
  type OrderUpdateKind,
  type Provider,
  type ProviderType,
  type Product,
  type Shipment,
} from "./data";
import type { CapacityOperation, ProductionSource, TransportSource } from "./data";
import type { CapacitySnapshot } from "./capacity";
import type { ProductionAssignmentSummary } from "./production-capacity";
import type { RecordedProductionResult } from "./components/ProductionResultModal";
import { capacityOperationLabels } from "./capacity";
import CapacityView, { DayLogisticsAdjustmentModal, GeneralTransport } from "./CapacityView";
import type { ClientSummary } from "./components/ClientMasterView";
import type { ClientProductOption } from "./master-data";
import { uruguayDepartments } from "./uruguay-departments";

const LevelsView = lazy(() => import("./components/LevelsView"));
const TreatmentView = lazy(() => import("./TreatmentView"));
const StockView = lazy(() => import("./StockView"));
const StockWorkspace = lazy(() => import("./StockWorkspace"));
const ClientMasterView = lazy(() => import("./components/ClientMasterView"));
const OperationsCalendarView = lazy(() => import("./components/OperationsCalendar").then((module) => ({ default: module.OperationsCalendarView })));
const LogisticsWorkspace = lazy(() => import("./components/LogisticsWorkspace"));

const number = new Intl.NumberFormat("es-UY");
const shipmentStatusLabels: Record<Shipment["status"], string> = {
  planned: "Planificado",
  ready: "Pronto",
  loaded: "Cargado",
  dispatched: "En viaje",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
export type DashboardSection = "inicio" | "pedidos" | "plan" | "calendario" | "logistica" | "produccion" | "secadero" | "stock" | "clientes" | "historial" | "proveedores" | "productos" | "niveles";

const sectionPaths: Record<DashboardSection, string> = {
  inicio: "/",
  pedidos: "/pedidos",
  plan: "/plan",
  calendario: "/calendario",
  logistica: "/viajes",
  produccion: "/produccion",
  secadero: "/secadero",
  stock: "/stock",
  clientes: "/clientes",
  historial: "/historial",
  proveedores: "/proveedores",
  productos: "/productos",
  niveles: "/niveles",
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
      <div className="products-scroll">
        <div className="providers-board clients-board provider-table" aria-label={`${visibleProviders.length} proveedores`}>
          <div className="data-heading clients-heading providers-heading">
            <div>Proveedor</div>
            <ColumnFilter label="Tipo de proveedor" value={providerType} onChange={(value) => setProviderType(value as ProviderType | "")} options={["Aserradero", "Transporte", "Importador"].map((value) => ({ value, label: value }))} />
            <div>Qué provee</div>
            <div className="sr-only">Acciones</div>
          </div>
          {visibleProviders.length > 0 ? (
            visibleProviders.map((provider) => (
              <article className="client-table-row provider-table-row" key={provider.id}>
                <div>
                  <small className="column-label">Proveedor</small>
                  <button type="button" className="row-link" onClick={() => onEdit(provider)}>{provider.name}</button>
                </div>
                <div>
                  <small className="column-label">Tipo de proveedor</small>
                  <span>{provider.type}</span>
                </div>
                <div>
                  <small className="column-label">Qué provee</small>
                  <span className={provider.supplies ? undefined : "product-client-empty"}>{provider.supplies || "—"}</span>
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

type ProductChanges = ReturnType<typeof draftPayload>;

function productDisplayName(product: Product) {
  if (hasClassification(product) && product.stockName?.trim()) return product.stockName.trim();
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

function productTypeLabel(kind: Product["kind"]) {
  return kind === "Pallet" ? "Pallets" : kindNames[kind];
}

function ProductsView({ products, levels, logisticsClasses, sizeError, onEdit, onDelete, onAdd }: { products: Product[]; levels: ProductLevel[]; logisticsClasses: Record<string, PalletClass> | null; sizeError: boolean; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onAdd: () => void }) {
  const catalog = useMemo(() => products.filter((product) => product.stockActive !== false), [products]);
  const sizeFor = useCallback((product: Product) => {
    if (!logisticsClasses) return sizeError ? "No disponible" : "Cargando";
    const classification = classifyPallet(product, logisticsClasses[product.id]);
    if (classification === "small") return "Chico";
    if (classification === "large") return "Grande";
    return product.kind === "Pallet" ? "Sin clasificar" : "No aplica";
  }, [logisticsClasses, sizeError]);
  // Cada relación producto/cliente corresponde a una fila del árbol; una ficha puede ser compartida.
  const catalogRows = useMemo(() => catalog.flatMap((product) =>
    (product.clientNames?.length ? product.clientNames : [""]).map((clientName) => ({ product, clientName }))), [catalog]);
  const [productQuery, setProductQuery] = useState("");
  const [productKind, setProductKind] = useState<Product["kind"] | "">("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  // Una columna por nivel que algún producto use; Medida, Tratamiento y Logo propio siempre se muestran.
  const columns = useMemo(() => levels.filter((level) => level.id === MEASURE_LEVEL || level.id === TREATMENT_LEVEL || level.id === LOGO_LEVEL || catalog.some((product) => levelValue(product, level.id))), [levels, catalog]);
  const filterOptions = useMemo(() => Object.fromEntries(columns.map((level) => [level.id, [...new Set(catalog.map((product) => levelValue(product, level.id)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))])) as Record<string, string[]>, [columns, catalog]);
  const codeOptions = useMemo(() => [...new Set(catalog.map((product) => product.zetaCode).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })).map((value) => ({ value, label: value })), [catalog]);
  const typeOptions = useMemo(() => [...new Set(catalog.map((product) => product.kind))].map((value) => ({ value, label: productTypeLabel(value) })), [catalog]);
  const sizeOptions = ["Chico", "Grande", "Sin clasificar", "No aplica"].map((value) => ({ value, label: value }));
  const clientOptions = useMemo(() => [...new Set(catalogRows.map((row) => row.clientName || "Sin identificar"))].sort((a, b) => a.localeCompare(b, "es")).map((value) => ({ value, label: value })), [catalogRows]);
  const activeFilters = Object.values(filters).filter(Boolean).length + (productKind ? 1 : 0) + (productQuery.trim() ? 1 : 0);
  const visibleProducts = useMemo(() => {
    const normalized = productQuery.trim().toLocaleLowerCase("es");
    return catalogRows.filter(({ product, clientName }) => {
      if (productKind && product.kind !== productKind) return false;
      if (filters.codigo && product.zetaCode !== filters.codigo) return false;
      if (filters.tamano && sizeFor(product) !== filters.tamano) return false;
      if (filters.cliente && (clientName || "Sin identificar") !== filters.cliente) return false;
      if (columns.some((level) => filters[level.id] && levelValue(product, level.id) !== filters[level.id])) return false;
      return !normalized || [product.stockName, product.zetaCode, product.kind, sizeFor(product), ...levels.map((level) => levelValue(product, level.id)), clientName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
    }).sort((a, b) => compareProductsByInternalCode(a.product, b.product) || a.clientName.localeCompare(b.clientName, "es"));
  }, [catalogRows, columns, filters, levels, productKind, productQuery, sizeFor]);
  const clearFilters = () => { setProductQuery(""); setProductKind(""); setFilters({}); };
  const minimumLevelWidth: Record<string, number> = {
    Medida: 82, Modelo: 84, Taco: 64, Refuerzo: 96, Identificación: 120,
    "Corte esquina": 88, Terminación: 118, Tratamiento: 118, "Logo propio": 85,
  };
  const levelColumns = columns.flatMap((level) => [`minmax(${minimumLevelWidth[level.label] ?? 80}px, ${level.label === "Identificación" ? 1.2 : 1}fr)`, ...(level.id === MEASURE_LEVEL ? ["minmax(86px, 1fr)"] : [])]).join(" ");
  const compactLevelColumns = columns.flatMap((level) => [`minmax(${["Identificación", "Terminación", "Tratamiento", "Corte esquina"].includes(level.label) ? 90 : 64}px, 1fr)`, ...(level.id === MEASURE_LEVEL ? ["minmax(70px, 1fr)"] : [])]).join(" ");
  const boardStyle = { "--product-columns": `78px minmax(64px, 1fr) ${levelColumns} minmax(90px, 1fr) 96px`, "--product-columns-compact": `70px minmax(58px, 1fr) ${compactLevelColumns} minmax(72px, 1fr) 96px`, "--products-min-width": "0px" } as CSSProperties;

  return (
    <section className="module-surface products-surface" aria-labelledby="products-page-title">
      <div className="module-toolbar products-toolbar">
        <div><h2 id="products-page-title">Catálogo</h2><small>{visibleProducts.length === catalogRows.length ? `${catalogRows.length} productos` : `${visibleProducts.length} de ${catalogRows.length} productos`}</small></div>
        <div className="module-toolbar-actions">
          <label className="search-field">
            <i className="sr-only">Buscar por código, medida, nivel o cliente</i><Search size={17} aria-hidden="true" />
            <input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto, medida, cliente…" />
            {productQuery && <button type="button" onClick={() => setProductQuery("")} aria-label="Limpiar búsqueda"><X size={15} aria-hidden="true" /></button>}
          </label>
          <button type="button" className="add-order-button" onClick={onAdd}><Plus size={17} aria-hidden="true" />Nuevo producto</button>
        </div>
      </div>
      {sizeError && <p className="form-error" role="alert">No se pudo cargar el tamaño logístico.</p>}
      <div className="products-scroll">
        <div className="products-board" style={boardStyle} aria-label={`${visibleProducts.length} productos`}>
          <div className="data-heading products-heading">
            <ColumnFilter label="Código" value={filters.codigo ?? ""} onChange={(value) => setFilters((current) => ({ ...current, codigo: value }))} options={codeOptions} />
            <ColumnFilter label="Tipo" value={productKind} onChange={(value) => setProductKind(value as Product["kind"] | "")} options={typeOptions} />
            {columns.flatMap((level) => [<ColumnFilter key={level.id} label={level.label} value={filters[level.id] ?? ""} onChange={(value) => setFilters((current) => ({ ...current, [level.id]: value }))} options={filterOptions[level.id].map((value) => ({ value, label: value }))} />, ...(level.id === MEASURE_LEVEL ? [<ColumnFilter key="tamano" label="Tamaño" value={filters.tamano ?? ""} onChange={(value) => setFilters((current) => ({ ...current, tamano: value }))} options={sizeOptions} />] : [])])}
            <ColumnFilter label="Cliente" value={filters.cliente ?? ""} onChange={(value) => setFilters((current) => ({ ...current, cliente: value }))} options={clientOptions} /><div className="sr-only">Acciones</div>
          </div>
          {visibleProducts.length > 0 ? visibleProducts.map(({ product, clientName }) => (
            <article className="product-row" key={`${product.id}:${clientName}`}>
              <div><small className="column-label">Código</small><strong className="product-code">{product.zetaCode ?? "—"}</strong></div>
              <div><small className="column-label">Tipo</small><button type="button" className="row-link" onClick={() => onEdit(product)} aria-label={`Editar ${product.stockName || productTypeLabel(product.kind)}`}>{productTypeLabel(product.kind)}</button></div>
              {columns.flatMap((level) => { const value = levelValue(product, level.id); return [<div key={level.id}><small className="column-label">{level.label}</small><strong className={value ? undefined : "product-client-empty"}>{value || (level.id === TREATMENT_LEVEL ? "" : "—")}</strong></div>, ...(level.id === MEASURE_LEVEL ? [<div key="tamano"><small className="column-label">Tamaño</small><strong>{sizeFor(product)}</strong></div>] : [])]; })}
              <div><small className="column-label">Cliente</small>{clientName ? <span className="chip-list"><span className="chip">{clientName}</span></span> : <strong className="product-client-empty">Sin identificar</strong>}</div>
              <span className="product-row-actions">
                <button type="button" className="product-edit" onClick={() => onEdit(product)} aria-label={`Editar ${product.kind}${product.measure ? ` ${product.measure}` : ""}`}><Pencil size={17} aria-hidden="true" /></button>
                <RowDeleteButton label={`Eliminar ${productDisplayName(product)}`} onClick={() => onDelete(product)} iconOnly />
              </span>
            </article>
          )) : <EmptyState icon={Package} title="No hay productos para ese filtro" action={activeFilters ? <button type="button" onClick={clearFilters}>Limpiar filtros</button> : undefined} />}
        </div>
      </div>
    </section>
  );
}

function ClientPicker({ clients, selected, onChange }: { clients: Array<Pick<ClientSummary, "id" | "name">>; selected: string[]; onChange: (next: string[]) => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("es");
  const options = clients.filter((client): client is { id: string; name: string } => Boolean(client.id)).filter((client) => !normalized || client.name.toLocaleLowerCase("es").includes(normalized));
  const names = new Map(clients.map((client) => [client.id, client.name]));
  return <div className="client-picker">
    <div className="chip-list editable" aria-live="polite">{selected.length ? selected.map((id) => <span className="chip" key={id}>{names.get(id) ?? id}<button type="button" onClick={() => onChange(selected.filter((item) => item !== id))} aria-label={`Quitar ${names.get(id) ?? "cliente"}`}><X size={12} aria-hidden="true" /></button></span>) : <small>Ningún cliente asociado todavía.</small>}</div>
    <label className="search-field compact"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente para asociar" aria-label="Buscar cliente para asociar" /></label>
    <div className="client-picker-options" role="group" aria-label="Clientes">{options.map((client) => { const checked = selected.includes(client.id); return <label key={client.id} className={checked ? "checked" : ""}><input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((item) => item !== client.id) : [...selected, client.id])} /><span>{client.name}</span></label>; })}{!options.length && <small>No hay clientes con ese nombre.</small>}</div>
  </div>;
}

/** Alta y edición de producto: un desplegable por nivel de la clasificación, más los clientes asociados. */
function ProductFormModal({ product, products, levels, clients, palletClass = "auto", classesReady = true, onClose, onSave, onDelete }: { product?: Product; products: Product[]; levels: ProductLevel[]; clients: Array<Pick<ClientSummary, "id" | "name">>; palletClass?: PalletClass | "auto"; classesReady?: boolean; onClose: () => void; onSave: (changes: ProductChanges, palletClass: PalletClass | "auto") => Promise<void>; onDelete?: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [draft, setDraftState] = useState(() => draftFromProduct(product, products, levels));
  const [palletClassDraft, setPalletClassDraft] = useState<PalletClass | "auto">(palletClass);
  useEffect(() => { if (classesReady) setPalletClassDraft(palletClass); }, [classesReady, palletClass]);
  const setDraft: Dispatch<SetStateAction<ProductDraft>> = (value) => { setDirty(true); setError(""); setDraftState(value); };
  const clientIdsByName = new Map(clients.map((client) => [client.name, client.id]));
  const [clientIds, setClientIds] = useState<string[]>(() => (product?.clientNames ?? []).map((name) => clientIdsByName.get(name)).filter((id): id is string => Boolean(id)));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateDraft(draft, products, product?.id);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(draftPayload(draft, levels, clientIds), palletClassDraft);
      setDirty(false);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setSaving(true);
    setError("");
    try {
      await onDelete();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo eliminar el producto.");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <ModalShell title={product ? "Producto" : "Nuevo producto"} description={product ? `${product.zetaCode ?? "Sin código"}: ${productDisplayName(product)}` : undefined} className="edit-product-modal product-sheet" onClose={onClose} dirty={dirty && !saving}>
      <form onSubmit={save}>
        <ProductDraftFields draft={draft} setDraft={setDraft} levels={levels} />
        {product?.kind === "Pallet" && <fieldset className="sheet-group field-wide"><legend>Logística</legend>
          <label className="option-field"><span>Tamaño logístico</span><select value={palletClassDraft} onChange={(event) => { setPalletClassDraft(event.target.value as PalletClass | "auto"); setDirty(true); }} disabled={!classesReady}>
            <option value="auto">Automático según superficie</option>
            <option value="small">Chico</option>
            <option value="large">Grande</option>
            <option value="unclassified">Sin clasificar</option>
          </select></label>
          <small className="field-help">Automático: hasta 1,20 m² es chico; más de 1,20 m² es grande.</small>
        </fieldset>}
        <fieldset className="sheet-group field-wide"><legend>Clientes</legend>
          <ClientPicker clients={clients} selected={clientIds} onChange={(next) => { setClientIds(next); setDirty(true); }} />
          <small className="field-help">Quedan habilitados para tomar pedidos de este producto.</small>
        </fieldset>
        <FieldError id="product-form-error">{error}</FieldError>
        <div className="modal-actions">{product && onDelete ? <button type="button" className="delete-button" onClick={() => setConfirmDelete(true)} disabled={saving}>Eliminar producto</button> : <span />}<div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving} error={Boolean(error)}>{product ? "Guardar cambios" : "Agregar producto"}</AsyncButton></div></div>
      </form>
      {confirmDelete && <ConfirmDialog title="¿Eliminar este producto?" description="Se quitan también sus asociaciones con clientes. Si figura en pedidos, no se podrá eliminar." confirmLabel="Eliminar" destructive onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}
    </ModalShell>
  );
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
          <div /><div>Cliente y pedido</div><div>Fecha</div><div>Transporte</div><div>Estado</div>
        </div>
        {weekOrders.map((order) => (
          <button type="button" className="logistics-order" key={order.id} onClick={() => onOpen(order.id)}>
            <i className="logistics-icon"><Truck size={18} aria-hidden="true" /></i>
            <div><strong>{order.client}</strong><small>{[visibleReference(order), order.product].filter(Boolean).join(" · ")}</small></div>
            <div><small className="column-label">Fecha</small><strong>{order.dateLabel}</strong></div>
            <div><small className="column-label">Transporte</small><strong>{order.transport}</strong></div>
            <OrderStatusBadge order={order} />
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

function OrderTrackingPanel({ order, refreshKey, onAdd, onCancel, onDelete, onClose, onPlanProduction, onAssignTransport, onPlanDrying }: { order?: OperationOrder; refreshKey: number; onAdd: (order: OperationOrder) => void; onCancel: (id: string) => Promise<boolean>; onDelete: (order: OperationOrder) => void; onClose: () => void; onPlanProduction: (order: OperationOrder) => void; onAssignTransport: (order: OperationOrder) => void; onPlanDrying?: (order: OperationOrder) => void }) {
  const [history, setHistory] = useState<OrderChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"summary" | "production" | "shipments">("summary");
  const [runShipmentIds, setRunShipmentIds] = useState<Set<string>>(() => new Set());
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
    const controller = new AbortController();
    fetch(`/api/logistics/runs?orderId=${encodeURIComponent(orderId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ runs: Array<{ shipmentId?: string | number }> }> : Promise.reject())
      .then(({ runs }) => setRunShipmentIds(new Set(runs.map((run) => String(run.shipmentId)).filter((id) => id !== "undefined"))))
      .catch(() => { if (!controller.signal.aborted) setRunShipmentIds(new Set()); });
    return () => controller.abort();
  }, [orderId, refreshKey]);

  useEffect(() => {
    if (!orderId) return;
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [orderId]);

  if (!order) {
    return <aside className="detail-column order-tracking-panel empty-order-detail" aria-label="Seguimiento del pedido"><strong>Seleccione un pedido</strong></aside>;
  }
  const producedForClient = order.lines.reduce((total, line) => total + (line.productionAllocations ?? []).reduce((lineTotal, allocation) => lineTotal + (allocation.status === "completed" && allocation.resultDestination !== "stock" ? Math.max(allocation.actualQuantity ?? 0, 0) : 0), 0), 0);
  const producedPhysical = order.lines.reduce((total, line) => total + (line.productionAllocations ?? []).reduce((lineTotal, allocation) => lineTotal + (allocation.status === "completed" ? Math.max(allocation.actualQuantity ?? 0, 0) : 0), 0), 0);
  const pendingProduction = Math.max(order.requested - Math.max(producedPhysical, order.delivered), 0);
  const visibleShipments = (order.shipments ?? []).filter((shipment) => runShipmentIds.has(String(shipment.id)) || !(shipment.status === "planned" && shipment.events.length === 1 && shipment.events[0]?.responsible === "Sistema"));

  return (
    <aside ref={panelRef} className="detail-column order-tracking-panel" aria-labelledby="tracking-title" tabIndex={-1}>
      <div className="tracking-heading">
        <div><h2 id="tracking-title">{order.client}</h2><p>{order.product}</p></div>
        <div className="tracking-heading-actions"><OrderStatusBadge order={order} /><button type="button" className="tracking-close-button" onClick={onClose} aria-label="Cerrar seguimiento del pedido" title="Cerrar detalle"><X size={18} aria-hidden="true" /></button></div>
      </div>
      <div className="tracking-actions" role="group" aria-label="Acciones del pedido">
        {!isOrderClosed(order) && <button type="button" onClick={() => setConfirmCancel(true)}><Ban size={16} aria-hidden="true" />Cancelar pedido</button>}
          <button type="button" className="danger" onClick={() => onDelete(order)}><Trash2 size={16} aria-hidden="true" />Eliminar pedido</button>
      </div>
      <nav className="tracking-tabs" aria-label="Secciones del pedido"><button type="button" className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Resumen</button><button type="button" className={tab === "production" ? "active" : ""} onClick={() => setTab("production")}>Producción</button><button type="button" className={tab === "shipments" ? "active" : ""} onClick={() => setTab("shipments")}>Viajes <span>{visibleShipments.length}</span></button></nav>
      {tab === "summary" && <>
      <div className="tracking-summary" aria-label="Resumen de cantidades">
        <div className="tracking-kpi-ordered" data-kpi="ordered"><small>Pedido</small><strong>{number.format(order.requested)}</strong></div>
        <div className="tracking-kpi-produced" data-kpi="produced"><small>Producido</small><strong>{number.format(producedPhysical)}</strong></div>
        <div className="tracking-kpi-pending" data-kpi="pending-production"><small>Por producir</small><strong>{number.format(pendingProduction)}</strong></div>
        <div className="tracking-kpi-delivered" data-kpi="delivered"><small>Entregado</small><strong>{number.format(order.delivered)}</strong></div>
      </div>
      {producedPhysical > 0 && <p className="tracking-stock-allocation">Del stock producido: {number.format(producedForClient)} asignados a {order.client}, {number.format(Math.max(producedPhysical - producedForClient, 0))} en stock general.</p>}
      <section className="phase-steps" aria-label="Fases del pedido">
        <button type="button" className={order.productionDefined === false ? "pending" : "done"} onClick={() => onPlanProduction(order)}><small>Producción</small><strong>{productionRangeLabel(order)}</strong><em>{order.productionDefined === false ? "Planificar" : "Replanificar"}</em></button>
        {onPlanDrying && <button type="button" className={order.dryingStartDate ? "done" : "pending"} onClick={() => onPlanDrying(order)}><small>Secadero</small><strong>{order.dryingStartDate ? (order.dryingEndDate && order.dryingEndDate !== order.dryingStartDate ? `${formatOrderDate(order.dryingStartDate)} → ${formatOrderDate(order.dryingEndDate)}` : formatOrderDate(order.dryingStartDate)) : "Sin programar"}</strong><em>{order.dryingStartDate ? "Cambiar" : "Programar"}</em></button>}
        <button type="button" className={visibleShipments.some((shipment) => shipment.status !== "cancelled") ? "done" : "pending"} onClick={() => onAssignTransport(order)}><small>Transporte</small><strong>{visibleShipments.some((shipment) => shipment.status !== "cancelled") ? "Salida planificada" : "A planificar"}</strong><em>Ir a Planificación</em></button>
      </section>
      <section className="tracking-order-data" aria-label="Datos del pedido">
        <div><small>Fecha del pedido</small><strong>{formatOrderDate(order.orderDate)}</strong></div>
        <div><small>Fecha de entrega</small><strong>{formatOrderDate(getOrderPlannedDate(order))}</strong></div>
        <div><small>Comentario de entrega</small><strong>{order.deliveryDateNote || "—"}</strong></div>
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
      </>}
      {tab === "production" && <section className="tracking-operation-list production-table-panel" aria-labelledby="production-allocations-title">
        <header><h3 id="production-allocations-title">Producción por producto</h3></header>
        <div className="production-table-wrap"><table className="production-tracking-table" data-column-filters="off">
          <thead><tr>
            <th scope="col">Producto del pedido</th>
            <th scope="col">Total palets</th>
            <th scope="col">Producido</th>
            <th scope="col">Pendiente de producir</th>
            <th scope="col">HT realizado</th>
            <th scope="col">Listo para entregar</th>
            <th scope="col">Fechas</th>
            <th scope="col"><span className="sr-only">Acción</span></th>
          </tr></thead>
          <tbody>{order.lines.map((line) => {
            const allocations = line.productionAllocations ?? [];
            const produced = allocations.reduce((sum, allocation) => sum + (allocation.status === "completed" ? Math.max(allocation.actualQuantity ?? 0, 0) : 0), 0);
            const assignedToClient = allocations.reduce((sum, allocation) => sum + (allocation.status === "completed" && allocation.resultDestination !== "stock" ? Math.max(allocation.actualQuantity ?? 0, 0) : 0), 0);
            const delivered = (order.shipments ?? []).flatMap((shipment) => shipment.lines).filter((entry) => entry.orderLineId === line.id).reduce((sum, entry) => sum + entry.deliveredQuantity, 0);
            const pending = Math.max(line.quantity - Math.max(produced, delivered), 0);
            const requiresHT = productHeatTreatmentLabel(line.product) === "Con HT" || line.treatment === "Marcado" || line.treatment === "HT" || line.treatment === "Marcado y HT";
            const ready = Math.min(
              Math.max(line.quantity - delivered, 0),
              requiresHT
                ? Math.max((line.treatedQuantity ?? 0) - delivered, 0)
                : Math.max(assignedToClient - delivered, line.readyReservedQuantity ?? 0, 0),
            );
            const dates = [...new Set(allocations.filter((allocation) => allocation.status !== "cancelled").map((allocation) => allocation.plannedDate))].sort();
            return <tr key={line.id}>
              <th scope="row">{line.product}</th>
              <td className="numeric-cell">{number.format(line.quantity)}</td>
              <td className="numeric-cell">{number.format(produced)}</td>
              <td className="numeric-cell">{number.format(pending)}</td>
              <td className="numeric-cell">{requiresHT ? number.format(line.treatedQuantity ?? 0) : "—"}</td>
              <td className="numeric-cell">{number.format(ready)}</td>
              <td>{dates.length ? <div className="production-table-dates">{dates.map((date) => <span key={date}>{formatOrderDate(date)}</span>)}</div> : "—"}</td>
              <td className="production-table-action"><button type="button" className="secondary-button" onClick={() => onPlanProduction(order)}>Planificar</button></td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>}
      {tab === "shipments" && <section className="tracking-operation-list shipment-table-panel" aria-labelledby="tracking-shipments-title"><header><div><h3 id="tracking-shipments-title">Viajes del pedido</h3><small>Entregas parciales y remitos</small></div></header>{visibleShipments.length ? <div className="production-table-wrap shipment-table-wrap"><table className="production-tracking-table shipment-tracking-table"><thead><tr><th scope="col">Entrega</th><th scope="col">Transporte</th><th scope="col">Palets</th><th scope="col">Entregados</th><th scope="col">Estado</th><th scope="col">Productos</th><th scope="col">Remito</th><th scope="col"><span className="sr-only">Acción</span></th></tr></thead><tbody>{visibleShipments.map((shipment) => { const products = Array.from(new Set(shipment.lines.map((line) => line.product))); return <tr key={shipment.id}><th scope="row">{formatOrderDate(shipment.plannedDate)}</th><td>{shipment.transportLabel}</td><td className="numeric-cell">{number.format(shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0))}</td><td className="numeric-cell">{number.format(shipment.lines.reduce((sum, line) => sum + line.deliveredQuantity, 0))}</td><td><span className={`shipment-table-status ${shipment.status}`}>{shipmentStatusLabels[shipment.status]}</span></td><td><div className="shipment-table-products">{products.map((product) => <strong key={product}>{product}</strong>)}</div></td><td><span className={shipment.remittance ? undefined : "shipment-remittance-pending"}>{shipment.remittance || "Pendiente"}</span></td><td className="production-table-action"><button type="button" className="secondary-button" onClick={() => onAssignTransport(order)}>Planificar transporte</button></td></tr>; })}</tbody></table></div> : <div className="tracking-empty tracking-empty-action"><span>Todavía no hay viajes.</span><button type="button" className="secondary-button" onClick={() => onAssignTransport(order)}>Planificar transporte</button></div>}</section>}
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

function AddOrderModal({ clientOptions, products, initialDeliveryDate, onClose, onCreated }: { clientOptions: ClientSummary[]; products: Product[]; initialDeliveryDate?: string; onClose: () => void; onCreated: (order: OperationOrder) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientProducts, setClientProducts] = useState<ClientProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [deliveryDate, setDeliveryDate] = useState(initialDeliveryDate ?? "");
  const [dirty, setDirty] = useState(false);
  const clientInputRef = useRef<HTMLSelectElement>(null);
  const today = dateKey(new Date());

  const selectedLines = clientProducts.filter((product) => (quantities[String(product.id)] ?? 0) > 0);
  const quantity = selectedLines.reduce((sum, product) => sum + (quantities[String(product.id)] ?? 0), 0);
  const needsTreatment = selectedLines.some((item) => item.treatmentRequired || products.find((product) => product.id === item.productId)?.requiresTreatment);

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    fetch(`/api/clients/${clientId}/products?active=true`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { products?: ClientProductOption[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar los productos.");
      setClientProducts(payload.products ?? []);
    }).catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); }).finally(() => setLoadingProducts(false));
    return () => controller.abort();
  }, [clientId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLines.length) { setError("Indicá la cantidad de al menos un producto."); return; }
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: selectedLines.map((product) => ({ clientProductId: product.id, quantity: quantities[String(product.id)] })),
        orderDate: form.get("orderDate"),
        plannedDate: deliveryDate,
        deliveryDateNote: form.get("deliveryDateNote"),
        requiredOperations: needsTreatment ? ["assembly", "treatment"] : ["assembly"],
        notes: form.get("notes"),
      }),
    });
    const payload = (await response.json()) as { order?: OperationOrder; error?: string };
    setSaving(false);
    if (!response.ok || !payload.order) {
      setError(payload.error ?? "No se pudo agregar el pedido.");
      return;
    }
    setDirty(false);
    onCreated(payload.order);
  };

  const selectedClient = clientOptions.find((client) => client.id === clientId);
  return (
    <ModalShell title="Agregar pedido" description="Producción y transporte se definen después, en sus pestañas." className="add-order-modal order-sheet" onClose={onClose} initialFocusRef={clientInputRef} dirty={dirty && !saving}>
      <form onSubmit={submit} onChange={() => setDirty(true)}>
        <fieldset className="sheet-group"><legend>Cliente</legend>
          <label>Cliente<select ref={clientInputRef} required value={clientId} onChange={(event) => { setClientId(event.target.value); setClientProducts([]); setQuantities({}); setLoadingProducts(true); setError(""); }}><option value="" disabled>Seleccionar cliente</option>{clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label>Fecha del pedido<input name="orderDate" type="date" required defaultValue={today} /></label>
        </fieldset>
        <fieldset className="sheet-group field-wide order-products"><legend>Productos habilitados {clientId && !loadingProducts ? <small>{clientProducts.length} {clientProducts.length === 1 ? "producto" : "productos"}</small> : null}</legend>
          {!clientId && <p className="sheet-placeholder">Elegí un cliente para ver todos sus productos habilitados.</p>}
          {clientId && loadingProducts && <LoadingState label="Cargando productos" rows={2} />}
          {clientId && !loadingProducts && clientProducts.length === 0 && <p className="sheet-placeholder">Este cliente no tiene productos habilitados. <a href={`/clientes/${encodeURIComponent(clientId)}`}>Agregar productos al cliente</a></p>}
          {clientProducts.map((product) => { const id = String(product.id); const value = quantities[id] ?? 0; return <label key={id} className={`order-product-row ${value > 0 ? "selected" : ""}`}>
            <span><strong>{product.label}</strong><small>Código {product.zetaCode || "—"}{product.treatmentRequired && !productHeatTreatmentLabel(product.label) ? " / Con HT" : ""}</small></span>
            <input type="number" min="0" step="1" inputMode="numeric" aria-label={`Cantidad de ${product.label}`} value={value || ""} placeholder="0" onChange={(event) => setQuantities((current) => ({ ...current, [id]: Math.max(Number(event.target.value) || 0, 0) }))} />
          </label>; })}
          {clientProducts.length > 0 && <output className="order-lines-total">Total del pedido: <strong>{number.format(quantity)} palets</strong></output>}
        </fieldset>
        <fieldset className="sheet-group"><legend>Entrega</legend>
          <label>Fecha de entrega<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} required /></label>
          <label>Comentario de la fecha<input name="deliveryDateNote" placeholder="Ej. antes de las 10 h, coordinar con portería" /></label>
          <label className="field-wide">Dirección de entrega<output className="readonly-value">{selectedClient?.address || clientProducts[0]?.clientAddress || "—"}</output></label>
        </fieldset>
        <label className="field-wide">Observaciones<textarea name="notes" rows={2} /></label>
        <FieldError id="add-order-error">{error}</FieldError>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <AsyncButton type="submit" className="primary-button" loading={saving} disabled={!selectedLines.length}>Agregar pedido</AsyncButton>
        </div>
      </form>
    </ModalShell>
  );
}

export type ProductionWorkspaceView = "planning" | "weekly" | "resources" | "rules";
export type LogisticsWorkspaceView = "transport" | "trips" | "map" | "limits";
export type SecaderoWorkspaceView = "plan" | "registry" | "rules";
export type StockWorkspaceView = "inventory" | "pamer" | "movements";

function activeHrefFor(section: DashboardSection, production: ProductionWorkspaceView, logistics: LogisticsWorkspaceView, secadero: SecaderoWorkspaceView, stock: StockWorkspaceView = "inventory") {
  if (section === "produccion") return production === "planning" ? "/produccion" : production === "weekly" ? "/produccion-real" : production === "rules" ? "/reglas-produccion" : "/recursos";
  if (section === "logistica") return logistics === "trips" ? "/viajes" : logistics === "map" ? "/mapa-logistica" : logistics === "limits" ? "/limites-logistica" : "/logistica";
  if (section === "secadero") return secadero === "registry" ? "/registro-ht" : secadero === "rules" ? "/reglas-secadero" : "/secadero";
  if (section === "stock") return stock === "pamer" ? "/stock-pamer" : stock === "movements" ? "/movimientos" : "/stock";
  if (section === "plan") return "/pedidos";
  return sectionPaths[section];
}

export type DashboardInitialData = {
  orders: OperationOrder[];
  providers: Provider[];
  products: Product[];
  levels?: ProductLevel[];
  clients: Array<Pick<ClientSummary, "id" | "name" | "address" | "department" | "active">>;
  failed?: boolean;
};

type SharedDataKey = "orders" | "providers" | "products" | "clients" | "levels";
type DeleteTarget = { kind: "orders" | "products" | "clients"; id: string; label: string };
const deleteCopy = {
  orders: { name: "pedido", description: "Se eliminarán también sus viajes y su plan de producción. Para conservar el pedido en el historial, usá Cancelar pedido desde el detalle." },
  products: { name: "producto", description: "Se eliminarán también sus asociaciones con clientes. Esta acción es permanente." },
  clients: { name: "cliente", description: "Se eliminarán también sus asociaciones con productos. Esta acción es permanente." },
} satisfies Record<DeleteTarget["kind"], { name: string; description: string }>;

const requiredData: Record<DashboardSection, SharedDataKey[]> = {
  inicio: ["orders", "products"],
  calendario: [], pedidos: ["orders", "products"], historial: ["orders"],
  productos: ["products", "levels"], niveles: ["levels"], clientes: ["clients", "orders", "products", "levels"], proveedores: ["providers"],
  produccion: ["orders", "providers", "products"], plan: ["orders"], stock: [], secadero: ["orders", "products"], logistica: ["orders", "providers"],
};

export default function Dashboard({ initialData, initialSection = "inicio", initialClientId, initialProductionView = "planning", initialProductionDate, initialRulesClientId, initialRulesProductIds, initialRulesDate, initialStockView = "inventory", initialStockProductId, initialLogisticsView = "transport", initialSecaderoView = "plan" }: { initialData?: DashboardInitialData; initialSection?: DashboardSection; initialClientId?: string; initialProductionView?: ProductionWorkspaceView; initialProductionDate?: string; initialRulesClientId?: string; initialRulesProductIds?: string[]; initialRulesDate?: string; initialStockView?: StockWorkspaceView; initialStockProductId?: string; initialLogisticsView?: LogisticsWorkspaceView; initialSecaderoView?: SecaderoWorkspaceView }) {
  const navigate = useNavigate();
  const section = initialSection;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orderKpiFilter, setOrderKpiFilter] = useState<"in-progress" | "waiting" | "total" | "compliance" | "">("");
  const kpiPeriod: KpiPeriod = "week";
  const [orderRows, setOrderRows] = useState<OperationOrder[]>(() => initialData?.orders ?? []);
  const [providerRows, setProviderRows] = useState<Provider[]>(() => (initialData?.providers ?? []).filter(isActiveProvider));
  const [productRows, setProductRows] = useState<Product[]>(() => [...(initialData?.products ?? [])].sort(compareProductsByInternalCode));
  const [logisticsClasses, setLogisticsClasses] = useState<Record<string, PalletClass> | null>(null);
  const [sizeError, setSizeError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/logistics/config", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo cargar la clasificación logística.");
      const data = await response.json() as { classes?: Record<string, PalletClass> };
      setLogisticsClasses(data.classes ?? {});
      setSizeError(false);
    }).catch((error: unknown) => { if (error instanceof Error && error.name === "AbortError") return; setSizeError(true); });
    return () => controller.abort();
  }, []);
  const [levels, setLevels] = useState<ProductLevel[]>(() => initialData?.levels?.length ? initialData.levels : defaultProductLevels);
  const [registeredClients, setRegisteredClients] = useState<Array<Pick<ClientSummary, "id" | "name" | "address" | "department" | "active">>>(() => initialData?.clients ?? []);
  const [selectedId, setSelectedId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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
  const [planningOrder, setPlanningOrder] = useState<{ order: OperationOrder; pendingOnly: boolean } | null>(null);
  const openProductionPlan = (order: OperationOrder) => setPlanningOrder({ order, pendingOnly: false });
  const openPendingProductionPlan = (order: OperationOrder) => setPlanningOrder({ order, pendingOnly: true });
  const [dryingOrder, setDryingOrder] = useState<OperationOrder | null>(null);
  const [planningRevision, setPlanningRevision] = useState(0);
  const [trackingRevision, setTrackingRevision] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const [toast, setToast] = useState("");
  const today = useMemo(() => new Date(), []);
  const [loaded, setLoaded] = useState<Record<SharedDataKey, boolean>>(() => ({ orders: Boolean(initialData && !initialData.failed), providers: Boolean(initialData && !initialData.failed), products: Boolean(initialData && !initialData.failed), clients: Boolean(initialData && !initialData.failed), levels: Boolean(initialData && !initialData.failed) }));
  const [loadErrors, setLoadErrors] = useState<Partial<Record<SharedDataKey, string>>>({});

  const loadSharedData = useCallback(() => {
    const get = async <T,>(path: string): Promise<T> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<T>;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
        }
      }
      throw new Error("No se pudieron cargar los datos.");
    };
    const load = (key: SharedDataKey, task: Promise<void>) => task.then(() => {
      setLoaded((current) => ({ ...current, [key]: true }));
      setLoadErrors((current) => ({ ...current, [key]: undefined }));
    }).catch(() => setLoadErrors((current) => ({ ...current, [key]: "No se pudieron cargar los datos." })));
    void Promise.all([
      load("orders", Promise.all([get<{ orders?: OperationOrder[] }>("/api/orders"), get<{ history?: OperationOrder[] }>("/api/history")]).then(([orders, history]) => setOrderRows([...(orders.orders ?? []), ...(history.history ?? [])]))),
      load("providers", get<{ providers?: Provider[] }>("/api/providers").then((payload) => setProviderRows((payload.providers ?? []).filter(isActiveProvider)))),
      load("products", get<{ products?: Product[] }>("/api/products").then((payload) => setProductRows([...(payload.products ?? [])].sort(compareProductsByInternalCode)))),
      load("clients", get<{ clients?: ClientSummary[] }>("/api/clients").then((payload) => setRegisteredClients((payload.clients ?? []).map((client) => ({ id: client.id, name: client.name, address: client.address, department: client.department, active: client.active }))))),
      load("levels", get<{ levels?: ProductLevel[] }>("/api/product-levels").then((payload) => { if (payload.levels?.length) setLevels(payload.levels); })),
    ]);
  }, []);

  useEffect(() => { if (!initialData || initialData.failed) loadSharedData(); }, [initialData, loadSharedData]);
  useEffect(() => {
    if (!Object.values(loadErrors).some(Boolean)) return;
    const retryWhenVisible = () => { if (document.visibilityState === "visible") loadSharedData(); };
    window.addEventListener("online", retryWhenVisible);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retryWhenVisible);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [loadErrors, loadSharedData]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeOrders = useMemo(() => orderRows.filter((order) => !isOrderClosed(order)), [orderRows]);
  const historyOrders = useMemo(() => orderRows.filter(isOrderClosed), [orderRows]);
  const productsRequiringTreatment = useMemo(() => new Set(productRows.filter((product) => product.requiresTreatment).map((product) => product.id)), [productRows]);
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
      return [order.client, order.product, order.transport]
        .some((value) => value.toLocaleLowerCase("es").includes(normalized));
    });
  }, [activeOrders, historyOrders, isHistory, kpiPeriod, orderKpiFilter, query, today]);

  const selectedOrder = visibleOrders.find((order) => order.id === selectedId);
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
  const deliveryRate = periodRequested ? Math.round(periodDelivered / periodRequested * 100) : null;
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
  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name, "es")), [clients]);

  const selectOrder = (id: string) => {
    setSelectedId(id);
  };

  const openOrder = (id: string) => {
    const order = orderRows.find((item) => item.id === id);
    const nextSection: DashboardSection = order && isOrderClosed(order) ? "historial" : "pedidos";
    navigate(sectionPaths[nextSection]);
    setQuery("");
    setSelectedId(id);
  };

  const replaceOrder = (order: OperationOrder) => setOrderRows((current) => current.map((item) => item.id === order.id ? order : item));

  const applyProductionResult = (assignment: ProductionAssignmentSummary, result: RecordedProductionResult) => {
    setOrderRows((current) => current.map((order) => order.id !== assignment.orderId ? order : {
      ...order,
      lines: order.lines.map((line) => line.id !== assignment.orderLineId ? line : {
        ...line,
        productionAllocations: line.productionAllocations?.map((allocation) => String(allocation.id) === String(assignment.id)
          ? { ...allocation, ...result, status: "completed" }
          : allocation),
      }),
    }));
  };

  const refreshOrder = async (id: string) => {
    const response = await fetch(`/api/orders/${id}`);
    const payload = await response.json() as { order?: OperationOrder };
    if (response.ok && payload.order) { replaceOrder(payload.order); setTrackingRevision((current) => current + 1); }
  };

  const addCreatedOrder = (order: OperationOrder) => {
    setOrderRows((current) => [order, ...current.filter((item) => item.id !== order.id)]);
    setSelectedId(order.id);
    setQuery("");
    setToast("Pedido agregado. Falta planificar producción y asignar transporte.");
    if (addOrderDate) {
      setShowAddOrder(false);
      setAddOrderDate(undefined);
      setCalendarRevision((current) => current + 1);
      return;
    }
    navigate(sectionPaths.pedidos, true);
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
    replaceOrder(payload.order);
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
    replaceOrder(payload.order);
    setToast("Pedido cancelado. Quedó en el historial.");
    return true;
  };

  const requestDelete = (target: DeleteTarget) => {
    setDeleteError("");
    setDeleteTarget(target);
  };
  const requestOrderDelete = (order: OperationOrder) =>
    requestDelete({ kind: "orders", id: order.id, label: [order.client, order.reference, order.product].filter(Boolean).join(" · ") });

  const clientDeleted = (id: string) => {
    const name = registeredClients.find((client) => client.id === id)?.name;
    setRegisteredClients((current) => current.filter((client) => client.id !== id));
    if (name) {
      setProductRows((current) => current.map((product) => product.clientNames?.includes(name)
        ? { ...product, clientNames: product.clientNames.filter((clientName) => clientName !== name) }
        : product));
    }
  };

  const deleteSelectedRecord = async () => {
    if (!deleteTarget || deletingRecord) return;
    const { kind, id } = deleteTarget;
    const { name } = deleteCopy[kind];
    setDeletingRecord(true);
    setDeleteError("");
    try {
      if (kind === "products") {
        await removeProduct(id);
      } else {
        const response = await fetch(`/api/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error ?? `No se pudo eliminar el ${name}.`);
        }
        if (kind === "clients") {
          clientDeleted(id);
          setToast("Cliente eliminado.");
        } else {
          setOrderRows((current) => current.filter((order) => order.id !== id));
          setSelectedId((current) => current === id ? "" : current);
          setCalendarRevision((current) => current + 1);
          setTrackingRevision((current) => current + 1);
          setToast("Pedido eliminado.");
        }
      }
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : `No se pudo eliminar el ${name}.`);
    } finally {
      setDeletingRecord(false);
    }
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
    replaceOrder(payload.order);
    setTrackingRevision((current) => current + 1);
    return true;
  };

  const refreshLevels = async () => {
    try {
      const response = await fetch("/api/product-levels");
      const payload = await response.json() as { levels?: ProductLevel[] };
      if (response.ok && payload.levels?.length) setLevels(payload.levels);
    } catch { /* las opciones nuevas aparecen al recargar */ }
  };

  const saveProduct = async (id: string | undefined, changes: ProductChanges, palletClass: PalletClass | "auto") => {
    const classChanged = Boolean(id && logisticsClasses && palletClass !== (logisticsClasses[id] ?? "auto"));
    const response = await fetch(id ? `/api/products/${id}` : "/api/products", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) });
    const payload = (await response.json()) as { product?: Product; error?: string };
    if (!response.ok || !payload.product) throw new Error(payload.error ?? "No se pudo guardar el producto.");
    setProductRows((current) => [...current.filter((product) => product.id !== payload.product!.id), payload.product!].sort(compareProductsByInternalCode));
    if (id && classChanged) {
      const classResponse = await fetch("/api/logistics/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "class", productId: id, palletClass }) });
      const classResult = await classResponse.json() as { error?: string };
      if (!classResponse.ok) throw new Error(`El producto se guardó, pero el tamaño logístico no: ${classResult.error ?? "Intentá de nuevo."}`);
      setLogisticsClasses((current) => {
        const next = { ...current };
        if (palletClass === "auto") delete next[id];
        else next[id] = palletClass;
        return next;
      });
    }
    setToast(id ? "Producto actualizado." : "Producto agregado.");
    void refreshLevels();
  };

  const removeProduct = async (id: string) => {
    const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "No se pudo eliminar el producto.");
    setProductRows((current) => current.filter((product) => product.id !== id));
    setToast("Producto eliminado.");
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

  const onPhaseSaved = (order: OperationOrder, message: string) => {
    replaceOrder(order);
    setPlanningRevision((current) => current + 1);
    setTrackingRevision((current) => current + 1);
    setToast(message);
    if (order.transportProviderId && !providerRows.some((provider) => provider.id === order.transportProviderId)) {
      fetch("/api/providers").then((response) => response.json() as Promise<{ providers?: Provider[] }>).then((payload) => { if (payload.providers) setProviderRows(payload.providers.filter(isActiveProvider)); }).catch(() => undefined);
    }
  };

  const sectionCopy: Record<DashboardSection, string> = {
    inicio: "Inicio",
    pedidos: "Pedidos",
    plan: "Plan",
    calendario: "Calendario",
    logistica: "Logística",
    produccion: "Producción",
    secadero: "Secadero",
    stock: "Stock",
    clientes: "Clientes",
    productos: "Productos",
    niveles: "Niveles",
    historial: "Historial",
    proveedores: "Proveedores",
  };
  const activeHref = activeHrefFor(section, initialProductionView, initialLogisticsView, initialSecaderoView, initialStockView);
  const area = findArea(activeHref);
  const page = area.pages.find((item) => item.href === activeHref);
  const pageTitle = page?.label ?? sectionCopy[section];
  const pendingData = requiredData[section].filter((key) => !loaded[key]);
  const dataError = pendingData.some((key) => Boolean(loadErrors[key]));

  useEffect(() => { document.title = `${pageTitle} | Operaciones`; }, [pageTitle]);

  return (
    <div className="dashboard-shell">
      <button className="skip-link" type="button" onClick={() => document.getElementById("main-content")?.focus()}>Saltar al contenido</button>

      <AppNavigation activeHref={activeHref} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} onNewOrder={() => { setAddOrderDate(undefined); setShowAddOrder(true); setMobileNavOpen(false); }} />

      <div className="workspace">
        <MobileNavigationButton open={mobileNavOpen} onClick={() => setMobileNavOpen((current) => !current)} />
        <main id="main-content" className={`dashboard-main section-${section}`} tabIndex={-1}>
        {section !== "inicio" && <div className="workspace-title"><h1 className="sr-only">{section === "calendario" ? "Calendario" : area.name}</h1></div>}
        {dataError ? <div className="empty-state" role="alert"><strong>No se pudieron cargar los datos de esta sección.</strong><button type="button" onClick={loadSharedData}>Reintentar</button></div>
        : pendingData.length ? <LoadingState label={`Cargando ${pageTitle.toLocaleLowerCase("es")}…`} />
        : <Suspense fallback={<LoadingState label={`Abriendo ${pageTitle.toLocaleLowerCase("es")}…`} />}>

        {section === "pedidos" && (
          <section className="dashboard-kpis" aria-label="Filtros rápidos de pedidos">
            <button type="button" className="kpi-card kpi-yellow" data-kpi="in-progress" aria-pressed={orderKpiFilter === "in-progress"} onClick={() => toggleOrderKpiFilter("in-progress")}><strong>{number.format(palletsInProgress)}</strong><small>Palets en marcha</small></button>
            <button type="button" className="kpi-card kpi-red" data-kpi="waiting" aria-pressed={orderKpiFilter === "waiting"} onClick={() => toggleOrderKpiFilter("waiting")}><strong>{number.format(palletsWaiting)}</strong><small>Palets en espera</small></button>
            <button type="button" className="kpi-card kpi-blue" data-kpi="total" aria-pressed={orderKpiFilter === "total"} onClick={() => toggleOrderKpiFilter("total")}><strong>{number.format(totalPallets)}</strong><small>Palets totales</small></button>
            <button type="button" className="kpi-card kpi-green" data-kpi="compliance" aria-pressed={orderKpiFilter === "compliance"} onClick={() => toggleOrderKpiFilter("compliance")}><strong>{deliveryRate === null ? "—" : `${deliveryRate}%`}</strong><small>Nivel de cumplimiento</small></button>
          </section>
        )}

        {section === "inicio" ? <OperationHome orders={orderRows} treatmentProductIds={productsRequiringTreatment} onOpenOrder={openOrder} onNewOrder={() => { setAddOrderDate(undefined); setShowAddOrder(true); }} />
        : (section === "pedidos" || section === "historial") ? <div className={`operations-layout ${selectedOrder ? "detail-open" : ""}`}>
          <section className="orders-surface" aria-labelledby="orders-title">
            <div className="orders-toolbar">
              <div>
                <h2 id="orders-title">{isHistory ? "Historial" : "Pedidos activos"}</h2>
              </div>
              <div className="orders-actions">
              <label className="search-field">
                <i className="sr-only">Buscar cliente, producto o transporte</i>
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
              </div>
            </div>

            <div className={`list-heading${isHistory ? "" : " with-row-actions"}`} aria-hidden="true">
              <div>Cliente</div><div>Pedido</div><div>Palets</div><div>Fecha de entrega</div><div>Estado</div><div>{!isHistory && "Acciones"}</div>
            </div>

            <div className="order-list" aria-label={`${visibleOrders.length} pedidos`}>
              {visibleOrders.length > 0 ? visibleOrders.map((order) => {
                const active = order.id === selectedOrder?.id;
                return (
                  <div className={`order-list-item${isHistory ? "" : " with-row-actions"}`} key={order.id}>
                  <button
                    type="button"
                    className={`order-row ${active ? "active" : ""}`}
                    onClick={() => selectOrder(order.id)}
                    aria-pressed={active}
                  >
                    <div className="order-main">
                      <strong>{order.client}</strong>
                      {!isHistory && (order.productionDefined === false || order.transportDefined === false) && <small className="order-flags">{[order.productionDefined === false ? "Sin producción" : "", order.transportDefined === false ? "Sin transporte" : ""].filter(Boolean).join(" · ")}</small>}
                    </div>
                    <div className="order-product"><strong>{order.product}</strong></div>
                    <div className="order-quantities"><strong>{number.format(order.requested)}</strong></div>
                    <div className="order-date">
                      <strong>{formatOrderDate(getOrderPlannedDate(order))}</strong>
                      {order.deliveryDateNote && <small>{order.deliveryDateNote}</small>}
                    </div>
                    <div className="order-stage"><OrderStatusBadge order={order} today={today} /></div>
                  </button>
                  {!isHistory && <RowDeleteButton label={`Eliminar pedido de ${order.client} · ${order.product}`} onClick={() => requestOrderDelete(order)} />}
                  </div>
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

          <div className={`order-detail-slot ${selectedOrder ? "open" : ""}`} aria-hidden={!selectedOrder}>{selectedOrder && <OrderTrackingPanel key={selectedOrder.id} order={selectedOrder} refreshKey={trackingRevision} onAdd={setUpdatingOrder} onCancel={cancelOrder} onDelete={requestOrderDelete} onClose={() => setSelectedId("")} onPlanProduction={openProductionPlan} onAssignTransport={(order) => navigate(`/viajes?pedido=${encodeURIComponent(order.id)}`)} onPlanDrying={orderNeedsDrying(selectedOrder, productsRequiringTreatment) ? setDryingOrder : undefined} />}</div>
        </div>
        : section === "plan" ? <><PlanView orders={activeOrders} onEdit={setEditingPlanOrder} />{updateError && <p className="plan-error" role="alert">{updateError}</p>}</>
        : section === "calendario" ? <OperationsCalendarView key={calendarRevision} onOpen={openOrder} onAdd={(date) => { setAddOrderDate(date); setShowAddOrder(true); }} onChanged={refreshOrder} />
        : section === "logistica" ? <LogisticsWorkspace view={initialLogisticsView} onOpenOrder={openOrder} onChanged={refreshOrder} />
        : section === "produccion" ? initialProductionView === "planning" ? <ProductionPlanningView orders={activeOrders} products={productRows} levels={levels} refreshKey={planningRevision} onPlan={openProductionPlan} onPlanPending={openPendingProductionPlan} onOpenOrder={openOrder} onOrderChanged={refreshOrder} /> : <CapacityView key={planningRevision} providers={providerRows} products={productRows} clients={registeredClients} selectedClientId={initialRulesClientId} focusProductIds={initialRulesProductIds} validFrom={initialRulesDate} view={initialProductionView === "weekly" ? "production" : initialProductionView} initialDate={initialProductionDate} onResultSaved={applyProductionResult} onPlan={(orderId) => { const order = orderRows.find((item) => item.id === orderId); if (order) openProductionPlan(order); }} />
        : section === "secadero" ? initialSecaderoView === "registry" ? <TreatmentView orders={orderRows} products={productRows} productsRequiringTreatment={productsRequiringTreatment} initialDate={initialProductionDate} onOrderChanged={refreshOrder} /> : initialSecaderoView === "rules" ? <DryingRulesView /> : <SecaderoPlanView orders={activeOrders} products={productRows} productsRequiringTreatment={productsRequiringTreatment} onPlan={setDryingOrder} onSaved={(order) => onPhaseSaved(order, "Secado reprogramado.")} onOpenRegistry={() => navigate("/registro-ht")} />
        : section === "stock" ? initialStockView === "movements" ? <StockWorkspace initialProductId={initialStockProductId} /> : <StockView scope={initialStockView === "pamer" ? "pamer" : "general"} focusProductId={initialStockProductId} />
        : section === "productos" ? <ProductsView products={productRows} levels={levels} logisticsClasses={logisticsClasses} sizeError={sizeError} onEdit={setEditingProduct} onDelete={(product) => requestDelete({ kind: "products", id: product.id, label: productDisplayName(product) })} onAdd={() => setShowAddProduct(true)} />
        : section === "niveles" ? <LevelsView levels={levels} onSaved={setLevels} />
        : section === "proveedores" ? <ProvidersView providers={providerRows} onEdit={setEditingProvider} onAdd={() => setShowAddProvider(true)} />
        : <ClientMasterView clients={clients} products={productRows} levels={levels} initialClientId={initialClientId} onAdd={() => setShowAddClient(true)} onDelete={(id, name) => requestDelete({ kind: "clients", id, label: name })} onClientDeleted={clientDeleted} onClientUpdated={(updated) => setRegisteredClients((current) => current.map((client) => client.id === updated.id ? { ...client, name: updated.name, address: updated.address, department: updated.department, active: updated.active } : client))} onProductCreated={(product) => { setProductRows((current) => [...current.filter((item) => item.id !== product.id), product].sort(compareProductsByInternalCode)); void refreshLevels(); }} />}
        </Suspense>}
        </main>

      </div>
      {showAddOrder && <AddOrderModal clientOptions={sortedClients.filter((client) => client.id && client.active)} products={productRows} initialDeliveryDate={addOrderDate} onClose={() => { setShowAddOrder(false); setAddOrderDate(undefined); }} onCreated={addCreatedOrder} />}
      {showAddProduct && <ProductFormModal products={productRows} levels={levels} clients={sortedClients} onClose={() => setShowAddProduct(false)} onSave={(changes, palletClass) => saveProduct(undefined, changes, palletClass)} />}
      {showAddProvider && <AddProviderModal onClose={() => setShowAddProvider(false)} onSave={addProvider} />}
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onSave={addClient} />}
      {editingPlanOrder && <EditPlanModal order={editingPlanOrder} providers={providerRows} onClose={() => setEditingPlanOrder(null)} onSave={(changes) => updateOrder(editingPlanOrder.id, changes)} />}
      {editingProduct && <ProductFormModal product={editingProduct} products={productRows} levels={levels} clients={sortedClients} palletClass={logisticsClasses?.[editingProduct.id] ?? "auto"} classesReady={Boolean(logisticsClasses)} onClose={() => setEditingProduct(null)} onSave={(changes, palletClass) => saveProduct(editingProduct.id, changes, palletClass)} onDelete={() => removeProduct(editingProduct.id)} />}
      {editingProvider && <EditProviderModal provider={editingProvider} onClose={() => setEditingProvider(null)} onSave={updateProvider} onDelete={removeProvider} />}
      {updatingOrder && <OrderUpdateModal order={updatingOrder} onClose={() => setUpdatingOrder(null)} onSave={(update) => recordUpdate(updatingOrder.id, update)} />}
      {planningOrder && <PlanProductionWizard order={orderRows.find((item) => item.id === planningOrder.order.id) ?? planningOrder.order} products={productRows} pendingOnly={planningOrder.pendingOnly} onClose={() => setPlanningOrder(null)} onSaved={(order) => { setPlanningOrder(null); onPhaseSaved(order, "Producción planificada."); }} onConfigure={(clientId, productIds, validFrom) => { const selectedClient = clientId || registeredClients.find((client) => client.name === planningOrder.order.client)?.id || ""; navigate(`/reglas-produccion?cliente=${encodeURIComponent(selectedClient)}&productos=${productIds.map(String).map(encodeURIComponent).join(",")}&desde=${encodeURIComponent(validFrom)}`); }} />}
      {dryingOrder && <DryingPlanModal order={dryingOrder} products={productRows} productsRequiringTreatment={productsRequiringTreatment} onClose={() => setDryingOrder(null)} onOpenOrder={openOrder} onSaved={(order) => { setDryingOrder(null); onPhaseSaved(order, "Secado programado."); }} />}
      {deleteTarget && <ConfirmDialog
        title={`¿Eliminar ${deleteCopy[deleteTarget.kind].name} «${deleteTarget.label}»?`}
        description={deleteCopy[deleteTarget.kind].description}
        confirmLabel={`Eliminar ${deleteCopy[deleteTarget.kind].name}`}
        destructive
        busy={deletingRecord}
        error={deleteError}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteSelectedRecord()}
      />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
