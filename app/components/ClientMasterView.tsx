"use client";

import { ChevronDown, FileText, Image as ImageIcon, Package, Plus, Save, Search, Trash2, Upload, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ProductLevel } from "../classification";
import type { Product } from "../data";
import { productLabel, type ClientDetail, type ClientProduct } from "../master-data";
import { uruguayDepartments } from "../uruguay-departments";
import { AsyncButton, ConfirmDialog, EmptyState, FieldError, LoadingState, ModalShell, RowDeleteButton } from "./ui";
import ColumnFilter from "./ColumnFilter";
import { ProductDraftFields, draftFromProduct, draftPayload, validateDraft, type ProductDraft } from "./ProductFields";
import { AppLink, useNavigate } from "../navigation-client";

export type ClientSummary = {
  id?: string;
  name: string;
  address?: string;
  department?: string;
  active?: boolean;
  orders: number;
  requested: number;
  delivered: number;
  pending: number;
  activeOrders: number;
  activePallets: number;
};

const number = new Intl.NumberFormat("es-UY");

async function payloadOf<T>(response: Response) {
  return response.json() as Promise<T & { error?: string }>;
}

function ProductCard({ item, onChanged }: { item: ClientProduct; onChanged: (next: ClientProduct) => void }) {
  const [editing, setEditing] = useState(false);
  const [controls, setControls] = useState(item.controls.map((control) => ({ title: control.title, detail: control.detail ?? "", active: control.active })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const primaryAsset = item.assets.find((asset) => asset.active && asset.isPrimary);
  const primaryAssetId = primaryAsset?.id;
  const primaryAssetMimeType = primaryAsset?.mimeType;
  const [preview, setPreview] = useState<{ assetId: string; url: string } | null>(null);
  const [selectedAssetName, setSelectedAssetName] = useState("");
  const previewUrl = preview?.assetId === String(primaryAssetId) ? preview.url : "";
  const productFormId = `client-product-editor-${item.id}`;
  const assetFormId = `client-product-asset-${item.id}`;

  useEffect(() => {
    let cancelled = false;
    if (primaryAssetId === undefined || primaryAssetMimeType === "application/pdf") return;
    fetch(`/api/client-product-assets/${primaryAssetId}/signed-url`, { method: "POST" })
      .then((response) => payloadOf<{ url?: string }>(response).then((payload) => ({ response, payload })))
      .then(({ response, payload }) => { if (!cancelled && response.ok && payload.url) setPreview({ assetId: String(primaryAssetId), url: payload.url }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [primaryAssetId, primaryAssetMimeType]);

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const controlsToSave = controls.map((control, index) => ({ ...control, title: String(form.get(`control-${index}`) ?? "").trim() })).filter((control) => control.title);
    const response = await fetch(`/api/client-products/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationalName: form.get("operationalName"), displayOrder: item.displayOrder, active: item.active }) });
    const payload = await payloadOf<{ product?: ClientProduct }>(response);
    if (!response.ok || !payload.product) { setSaving(false); return setError(payload.error ?? "No se pudo guardar."); }
    const controlsResponse = await fetch(`/api/client-products/${item.id}/controls`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ controls: controlsToSave }) });
    const controlsPayload = await payloadOf<{ product?: ClientProduct }>(controlsResponse); setSaving(false);
    if (!controlsResponse.ok || !controlsPayload.product) return setError(controlsPayload.error ?? "No se pudieron guardar los puntos de control.");
    setControls(controlsPayload.product.controls.map((control) => ({ title: control.title, detail: control.detail ?? "", active: control.active })));
    onChanged(controlsPayload.product); setEditing(false);
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/client-products/${item.id}/assets`, { method: "POST", body: form });
    const payload = await payloadOf<{ asset?: unknown }>(response); setSaving(false);
    if (!response.ok) return setError(payload.error ?? "No se pudo cargar el archivo.");
    const refresh = await fetch(`/api/clients/${item.clientId}`);
    const detail = await payloadOf<ClientDetail>(refresh);
    const next = detail.products?.find((product) => String(product.id) === String(item.id));
    if (next) onChanged(next);
    event.currentTarget.reset(); setSelectedAssetName("");
  };

  const openAsset = async (assetId: number | string) => {
    setError("");
    const response = await fetch(`/api/client-product-assets/${assetId}/signed-url`, { method: "POST" });
    const payload = await payloadOf<{ url?: string }>(response);
    if (!response.ok || !payload.url) return setError(payload.error ?? "No se pudo abrir el archivo.");
    window.open(payload.url, "_blank", "noopener,noreferrer");
  };

  const removeAsset = async (assetId: number | string) => {
    if (!window.confirm("¿Retirar este archivo de la ficha? El registro histórico se conserva.")) return;
    const response = await fetch(`/api/client-product-assets/${assetId}`, { method: "DELETE" });
    if (!response.ok) return setError("No se pudo retirar el archivo.");
    onChanged({ ...item, assets: item.assets.filter((asset) => String(asset.id) !== String(assetId)) });
  };

  const zetaCode = item.product.zetaCode ?? item.zetaCode;
  return <details className="client-product-card">
    <summary><span><ChevronDown size={17} aria-hidden="true" /><strong>{productLabel(item.product, item.operationalName)}</strong>{zetaCode && <small>Código {zetaCode}</small>}</span></summary>
    <div className="client-product-body">
      <div className="client-product-details">
        <section className="client-product-section">
        <div className="client-product-section-heading"><h4>Información del producto</h4>{editing ? <AsyncButton type="submit" form={productFormId} className="product-save-button" loading={saving} loadingLabel="Guardando…"><Save size={16} />Guardar</AsyncButton> : <button type="button" className="text-button" onClick={() => { if (!controls.length) setControls([{ title: "", detail: "", active: true }]); setEditing(true); }}>Editar</button>}</div>
        {editing ? <form id={productFormId} className="client-product-settings" onSubmit={saveProduct}>
          <label>Nombre operativo<input name="operationalName" defaultValue={item.operationalName} /></label>
          <div className="readonly-product-field"><span>Tipo</span><strong>{item.product.kind}</strong></div>
          <div className="readonly-product-field"><span>Medidas</span><strong>{item.product.measure ?? "Sin medida"}</strong></div>
          <div className="readonly-product-field"><span>Código</span><strong>{zetaCode || "—"}</strong></div>
          <fieldset className="control-editor"><legend>Puntos de control</legend>{controls.map((control, index) => <input key={index} name={`control-${index}`} defaultValue={control.title} aria-label={`Punto de control ${index + 1}`} />)}<button type="button" className="add-control-button" aria-label="Agregar punto de control" onClick={() => setControls((current) => [...current, { title: "", detail: "", active: true }])}><Plus size={18} aria-hidden="true" /></button></fieldset>
        </form> : <dl className="client-product-facts"><div><dt>Nombre operativo</dt><dd>{item.operationalName?.trim() || item.product.stockName || "—"}</dd></div><div><dt>Tipo</dt><dd>{item.product.kind}</dd></div><div><dt>Medidas</dt><dd>{item.product.measure ?? "Sin medida"}</dd></div><div><dt>Código</dt><dd>{zetaCode || "—"}</dd></div><div><dt>Puntos de control</dt><dd>{controls.length ? <ul>{controls.map((control, index) => <li key={index}>{control.title}</li>)}</ul> : "—"}</dd></div></dl>}
        </section>
      </div>

      <aside className="client-product-media" aria-label={`Plano o fotografía de ${productLabel(item.product, item.operationalName)}`}>
        <div className="client-product-section-heading"><h4>Plano o fotografía</h4><small>JPG, PNG, WebP o PDF · máximo 6 MB.</small></div>
        {primaryAsset ? <button type="button" className="primary-asset-preview" onClick={() => openAsset(primaryAsset.id)}>{primaryAsset.mimeType === "application/pdf" ? <><FileText size={38} /><strong>{primaryAsset.fileName}</strong><small>Abrir plano</small></> : previewUrl ? <img src={previewUrl} alt={primaryAsset.altText} /> : <><ImageIcon size={38} /><strong>{primaryAsset.fileName}</strong></>}<span className="sr-only">Abrir archivo</span></button> : <label className="primary-asset-placeholder asset-picker"><ImageIcon size={38} aria-hidden="true" /><strong>Sin foto o plano</strong><small>Agregá una referencia visual si este producto la necesita.</small><span className="secondary-button"><Upload size={15} />{selectedAssetName || "Seleccionar archivo"}</span><input form={assetFormId} name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(event) => setSelectedAssetName(event.currentTarget.files?.[0]?.name ?? "")} /></label>}
        {item.assets.length > 1 && <div className="asset-list">{item.assets.filter((asset) => asset.id !== primaryAsset?.id).map((asset) => <div key={asset.id}><button type="button" onClick={() => openAsset(asset.id)}>{asset.mimeType === "application/pdf" ? <FileText size={15} /> : <ImageIcon size={15} />}{asset.fileName}</button><button type="button" aria-label={`Retirar ${asset.fileName}`} onClick={() => removeAsset(asset.id)}><Trash2 size={14} /></button></div>)}</div>}
        <form id={assetFormId} className="asset-upload" onSubmit={upload}>{primaryAsset && <label className="asset-file-select secondary-button"><Upload size={15} />{selectedAssetName || "Seleccionar archivo"}<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(event) => setSelectedAssetName(event.currentTarget.files?.[0]?.name ?? "")} /></label>}<label>Descripción<input name="altText" required placeholder="Ej. Vista superior y puntos críticos" /></label><label>Tipo<select name="assetType" defaultValue="plan"><option value="plan">Plano</option><option value="photo">Fotografía</option></select></label><AsyncButton type="submit" className="secondary-button" loading={saving}><Save size={15} />Guardar</AsyncButton></form>
      </aside>
      <FieldError id={`product-${item.id}-error`}>{error}</FieldError>
    </div>
  </details>;
}

function AddClientProductDialog({ products, levels, assignedProductIds, clientId, onClose, onAdded }: { products: Product[]; levels: ProductLevel[]; assignedProductIds: Set<string>; clientId: string; onClose: () => void; onAdded: (items: ClientProduct[], created?: Product) => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [draft, setDraftState] = useState(() => draftFromProduct(undefined, products, levels));
  const setDraft: Dispatch<SetStateAction<ProductDraft>> = (value) => { setDirty(true); setError(""); setDraftState(value); };
  const normalized = query.trim().toLocaleLowerCase("es");
  const available = products.filter((product) => product.stockActive !== false && !assignedProductIds.has(product.id)).filter((product) => !normalized || [product.zetaCode, product.stockName, product.kind, product.measure].some((value) => value?.toLocaleLowerCase("es").includes(normalized)));

  const reloadLinks = async () => {
    const response = await fetch(`/api/clients/${clientId}`);
    const detail = await payloadOf<ClientDetail>(response);
    return detail.products ?? [];
  };

  const addExisting = async () => {
    setSaving(true); setError("");
    try {
      for (const productId of selected) {
        const response = await fetch(`/api/clients/${clientId}/products`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) });
        const payload = await payloadOf<{ product?: ClientProduct }>(response);
        if (!response.ok) throw new Error(payload.error ?? "No se pudo asociar el producto.");
      }
      onAdded(await reloadLinks());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo asociar el producto."); }
    finally { setSaving(false); }
  };

  const createNew = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateDraft(draft, products);
    if (problem) { setError(problem); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draftPayload(draft, levels, [clientId])) });
      const payload = await payloadOf<{ product?: Product }>(response);
      if (!response.ok || !payload.product) throw new Error(payload.error ?? "No se pudo crear el producto.");
      onAdded(await reloadLinks(), payload.product);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo crear el producto."); }
    finally { setSaving(false); }
  };

  return <ModalShell title="Agregar productos al cliente" description="Elegí productos del catálogo o creá uno nuevo; quedan habilitados para pedidos." onClose={onClose} initialFocusRef={searchRef} dirty={dirty && !saving} className="client-product-modal product-sheet">
    <div className="segmented full" role="tablist" aria-label="Origen del producto"><button type="button" role="tab" aria-selected={mode === "existing"} className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>Del catálogo</button><button type="button" role="tab" aria-selected={mode === "new"} className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>Producto nuevo</button></div>
    {mode === "existing" ? <div className="sheet-form">
      <label className="search-field compact"><Search size={15} aria-hidden="true" /><input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, nombre o medida" aria-label="Buscar producto" /></label>
      <div className="client-picker-options tall" role="group" aria-label="Productos del catálogo">{available.map((product) => { const checked = selected.includes(product.id); return <label key={product.id} className={checked ? "checked" : ""}><input type="checkbox" checked={checked} onChange={() => { setDirty(true); setSelected((current) => checked ? current.filter((item) => item !== product.id) : [...current, product.id]); }} /><span><strong>{product.zetaCode ?? "—"}</strong> · {productLabel(product)}</span></label>; })}{!available.length && <small>No hay más productos para asociar. Creá uno nuevo.</small>}</div>
      <FieldError id="add-client-product-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="button" className="primary-button" loading={saving} loadingLabel="Agregando…" disabled={!selected.length} onClick={() => void addExisting()}><Plus size={16} />{selected.length > 1 ? `Agregar ${selected.length} productos` : "Agregar producto"}</AsyncButton></div>
    </div> : <form className="sheet-form" onSubmit={createNew}>
      <ProductDraftFields draft={draft} setDraft={setDraft} levels={levels} />
      <FieldError id="create-client-product-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving} loadingLabel="Creando…"><Plus size={16} />Crear y asociar</AsyncButton></div>
    </form>}
  </ModalShell>;
}

function ClientPanel({ clientId, products, levels, onProductCreated, onClientDeleted, onClientUpdated }: { clientId: string; products: Product[]; levels: ProductLevel[]; onProductCreated?: (product: Product) => void; onClientDeleted?: (id: string) => void; onClientUpdated?: (client: ClientDetail["client"]) => void }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingClient, setSavingClient] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [clientError, setClientError] = useState("");
  const [showAddProduct, setShowAddProduct] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/clients/${clientId}`, { signal: controller.signal }).then(async (response) => {
      const payload = await payloadOf<ClientDetail>(response);
      setLoading(false);
      if (response.ok) setDetail(payload); else setLoadError(payload.error ?? "No se pudo cargar el cliente.");
    }).catch((caught) => { if (caught.name !== "AbortError") { setLoading(false); setLoadError("No se pudo cargar el cliente."); } });
    return () => controller.abort();
  }, [clientId]);

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingClient(true); setClientError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: form.get("address"), department: form.get("department"), active: form.get("active") === "on" }) });
    const payload = await payloadOf<{ client?: ClientDetail["client"] }>(response); setSavingClient(false);
    if (!response.ok || !payload.client) return setClientError(payload.error ?? "No se pudo guardar el cliente.");
    setDetail((current) => current ? { ...current, client: payload.client! } : current);
    onClientUpdated?.(payload.client);
  };
  const removeClient = async () => {
    setDeletingClient(true);
    setClientError("");
    try {
      const response = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const payload = await payloadOf<{ ok?: boolean }>(response);
      setDeletingClient(false);
      if (!response.ok || !payload.ok) {
        setClientError(payload.error ?? "No se pudo eliminar el cliente.");
        setConfirmDelete(false);
        return;
      }
      onClientDeleted?.(clientId);
      navigate("/clientes");
    } catch {
      setDeletingClient(false);
      setClientError("Error de conexión al eliminar el cliente.");
      setConfirmDelete(false);
    }
  };
  if (loading) return <LoadingState label="Cargando ficha del cliente" />;
  if (!detail) return <FieldError id={`client-${clientId}-error`}>{loadError}</FieldError>;
  const visibleProducts = detail.products.filter((item) => item.active && item.product.stockActive !== false);
  return <div className="client-master-panel">
    <section className="client-panel-section" aria-labelledby="client-information-title">
      <h3 id="client-information-title">Información del cliente</h3>
      <form className="client-address-editor" onSubmit={saveClient}>
        <label>Nombre<input value={detail.client.name} readOnly /></label>
        <label>Dirección<input name="address" defaultValue={detail.client.address} /></label>
        <label>Departamento<select name="department" defaultValue={detail.client.department ?? ""}><option value="">Seleccionar departamento</option>{uruguayDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
        <label className="checkbox-line"><input name="active" type="checkbox" defaultChecked={detail.client.active} />Disponible para pedidos</label>
        <FieldError id={`client-${clientId}-action-error`}>{clientError}</FieldError>
        <div className="client-address-actions">
          <AsyncButton type="submit" className="secondary-button" loading={savingClient}>
            <Save size={15} />Guardar información
          </AsyncButton>
          <button
            type="button"
            className="delete-button"
            onClick={() => { setClientError(""); setConfirmDelete(true); }}
            disabled={savingClient || deletingClient}
          >
            <Trash2 size={15} />Eliminar cliente
          </button>
        </div>
      </form>
    </section>
    <section className="client-panel-section" aria-labelledby="client-products-title"><div className="client-panel-section-heading"><h3 id="client-products-title">Productos</h3><button type="button" className="primary-button" onClick={() => setShowAddProduct(true)}><Plus size={16} />Agregar productos</button></div><div className="client-product-list">{visibleProducts.length ? visibleProducts.map((item) => <ProductCard key={item.id} item={item} onChanged={(next) => setDetail((current) => current ? { ...current, products: current.products.map((entry) => String(entry.id) === String(next.id) ? next : entry) } : current)} />) : <EmptyState icon={Package} title="Este cliente todavía no tiene productos" description="Agregá un producto para que luego aparezca en el alta de pedidos." />}</div></section>
    {showAddProduct && <AddClientProductDialog products={products} levels={levels} clientId={clientId} assignedProductIds={new Set(detail.products.filter((item) => item.active).map((item) => item.productId))} onClose={() => setShowAddProduct(false)} onAdded={(items, created) => { setDetail((current) => current ? { ...current, products: items } : current); if (created) onProductCreated?.(created); setShowAddProduct(false); }} />}
    {confirmDelete && (
      <ConfirmDialog
        title={`¿Eliminar al cliente ${detail.client.name}?`}
        description="Esta acción eliminará la ficha del cliente y sus asociaciones de productos. Esta acción no se puede deshacer."
        confirmLabel="Eliminar cliente"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void removeClient()}
      />
    )}
  </div>;
}

export default function ClientMasterView({ clients, products, levels, onAdd, onDelete, initialClientId, onProductCreated, onClientDeleted, onClientUpdated }: { clients: ClientSummary[]; products: Product[]; levels: ProductLevel[]; onAdd: () => void; onDelete: (id: string, name: string) => void; initialClientId?: string; onProductCreated?: (product: Product) => void; onClientDeleted?: (id: string) => void; onClientUpdated?: (client: ClientDetail["client"]) => void }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const productCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) for (const name of product.clientNames ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);
    return counts;
  }, [products]);
  const departments = useMemo(() => [...new Set(clients.map((client) => client.department).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "es")), [clients]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return clients
      .filter((client) => (!department || client.department === department) && (!status || (status === "active") === (client.active !== false)) && (!normalized || [client.name, client.address, client.department].some((value) => value?.toLocaleLowerCase("es").includes(normalized))))
      .sort((a, b) => b.activePallets - a.activePallets || a.name.localeCompare(b.name, "es"));
  }, [clients, department, query, status]);
  if (initialClientId) {
    const client = clients.find((item) => item.id === initialClientId);
    return <section className="clients-surface client-detail-surface" aria-labelledby="client-detail-title">
      <nav className="client-subtabs" aria-label="Ubicación en clientes">
        <AppLink href="/clientes" className="client-subtab">Clientes</AppLink>
        <span className="client-subtab active" aria-current="page">{client?.name ?? "Ficha del cliente"}</span>
      </nav>
      <header className="client-detail-overview">
        <i className="client-avatar" aria-hidden="true">{client?.name.slice(0, 1) ?? "C"}</i>
        <div><h2 id="client-detail-title">{client?.name ?? "Ficha del cliente"}</h2>{(client?.address || client?.department) && <small>{[client.address, client.department].filter(Boolean).join(" · ")}</small>}</div>
        {client && <span><strong>{number.format(client.activePallets)}</strong><small>palets activos</small></span>}
      </header>
      <ClientPanel clientId={initialClientId} products={products} levels={levels} onProductCreated={onProductCreated} onClientDeleted={onClientDeleted} onClientUpdated={onClientUpdated} />
    </section>;
  }

  return (
    <section className="clients-surface" aria-labelledby="clients-title">
      <div className="module-toolbar products-toolbar">
        <div><h2 id="clients-title">Clientes</h2><small>{visible.length === clients.length ? `${clients.length} clientes` : `${visible.length} de ${clients.length} clientes`}</small></div>
        <div className="module-toolbar-actions">
          <label className="search-field">
            <i className="sr-only">Buscar cliente por nombre, dirección o departamento</i><Search size={17} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente…" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={15} aria-hidden="true" /></button>}
          </label>
          <button type="button" className="add-order-button" onClick={onAdd}><Plus size={17} aria-hidden="true" />Nuevo cliente</button>
        </div>
      </div>
      <div className="products-scroll">
        <div className="clients-board" aria-label={`${visible.length} clientes`}>
          <div className="data-heading clients-heading">
            <div>Cliente</div><div>Dirección</div>
            <ColumnFilter label="Departamento" value={department} onChange={setDepartment} options={departments.map((value) => ({ value, label: value }))} />
            <div>Productos</div><div>Pedidos activos</div><div>Palets activos</div>
            <ColumnFilter label="Estado" value={status} onChange={(value) => setStatus(value as "" | "active" | "inactive")} options={[{ value: "active", label: "Disponible" }, { value: "inactive", label: "No disponible" }]} />
            <div className="sr-only">Acciones</div>
          </div>
          {visible.length > 0 ? visible.map((client) => {
            const cells = <>
              <div><small className="column-label">Cliente</small><strong>{client.name}</strong></div>
              <div><small className="column-label">Dirección</small><span className={client.address ? undefined : "product-client-empty"}>{client.address || "—"}</span></div>
              <div><small className="column-label">Departamento</small><span className={client.department ? undefined : "product-client-empty"}>{client.department || "—"}</span></div>
              <div><small className="column-label">Productos</small><span className={productCounts.get(client.name) ? undefined : "product-client-empty"}>{productCounts.get(client.name) ?? 0}</span></div>
              <div><small className="column-label">Pedidos activos</small><span className="numeric">{number.format(client.activeOrders)}</span></div>
              <div><small className="column-label">Palets activos</small><span className="numeric">{number.format(client.activePallets)}</span></div>
              <div><small className="column-label">Estado</small><span className={`client-state ${client.active === false ? "off" : ""}`}>{client.active === false ? "No disponible" : "Disponible"}</span></div>
            </>;
            const { id, name } = client;
            return <div key={id ?? name} className="client-list-item">
              {id ? <>
                <AppLink href={`/clientes/${encodeURIComponent(id)}`} className="client-table-row" aria-label={`Abrir ficha de ${name}`}>{cells}</AppLink>
                <RowDeleteButton label={`Eliminar cliente ${name}`} onClick={() => onDelete(id, name)} />
              </> : <div className="client-table-row unavailable" aria-disabled="true">{cells}</div>}
            </div>;
          }) : <EmptyState icon={Users} title="No hay clientes para ese filtro" action={(query || department || status) ? <button type="button" onClick={() => { setQuery(""); setDepartment(""); setStatus(""); }}>Limpiar filtros</button> : undefined} />}
        </div>
      </div>
    </section>
  );
}
