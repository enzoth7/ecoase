"use client";

import { ArrowLeft, ChevronDown, ChevronRight, FileText, Image as ImageIcon, Package, Plus, Save, Trash2, TrendingDown, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Product } from "../data";
import { productLabel, type ClientDetail, type ClientProduct } from "../master-data";
import { uruguayDepartments } from "../uruguay-departments";
import { AsyncButton, ConfirmDialog, EmptyState, FieldError, LoadingState, ModalShell } from "./ui";
import ConsumptionRuleModal from "./ConsumptionRuleModal";

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

function ProductCard({ item, clientName, onChanged }: { item: ClientProduct; clientName: string; onChanged: (next: ClientProduct) => void }) {
  const [editing, setEditing] = useState(false);
  const [controls, setControls] = useState(item.controls.map((control) => ({ title: control.title, detail: control.detail ?? "", active: control.active })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const primaryAsset = item.assets.find((asset) => asset.active && asset.isPrimary);
  const primaryAssetId = primaryAsset?.id;
  const primaryAssetMimeType = primaryAsset?.mimeType;
  const [preview, setPreview] = useState<{ assetId: string; url: string } | null>(null);
  const [selectedAssetName, setSelectedAssetName] = useState("");
  const [showConsumption, setShowConsumption] = useState(false);
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
    <summary><span><ChevronDown size={17} aria-hidden="true" /><strong>{productLabel(item.product, item.operationalName)}</strong>{zetaCode && <small>Zeta {zetaCode}</small>}</span></summary>
    <div className="client-product-body">
      <div className="client-product-details">
        <section className="client-product-section">
        <div className="client-product-section-heading"><h4>Información del producto</h4>{editing ? <AsyncButton type="submit" form={productFormId} className="product-save-button" loading={saving} loadingLabel="Guardando…"><Save size={16} />Guardar</AsyncButton> : <button type="button" className="text-button" onClick={() => { if (!controls.length) setControls([{ title: "", detail: "", active: true }]); setEditing(true); }}>Editar</button>}</div>
        {editing ? <form id={productFormId} className="client-product-settings" onSubmit={saveProduct}>
          <label>Nombre operativo<input name="operationalName" defaultValue={item.operationalName} /></label>
          <div className="readonly-product-field"><span>Tipo</span><strong>{item.product.kind}</strong></div>
          <div className="readonly-product-field"><span>Medidas</span><strong>{item.product.measure ?? "Sin medida"}</strong></div>
          <div className="readonly-product-field"><span>Código Zeta</span><strong>{zetaCode || "—"}</strong></div>
          <fieldset className="control-editor"><legend>Puntos de control</legend>{controls.map((control, index) => <input key={index} name={`control-${index}`} defaultValue={control.title} aria-label={`Punto de control ${index + 1}`} />)}<button type="button" className="add-control-button" aria-label="Agregar punto de control" onClick={() => setControls((current) => [...current, { title: "", detail: "", active: true }])}><Plus size={18} aria-hidden="true" /></button></fieldset>
        </form> : <dl className="client-product-facts"><div><dt>Nombre operativo</dt><dd>{item.operationalName?.trim() || item.product.stockName || "—"}</dd></div><div><dt>Tipo</dt><dd>{item.product.kind}</dd></div><div><dt>Medidas</dt><dd>{item.product.measure ?? "Sin medida"}</dd></div><div><dt>Código Zeta</dt><dd>{zetaCode || "—"}</dd></div><div><dt>Puntos de control</dt><dd>{controls.length ? <ul>{controls.map((control, index) => <li key={index}>{control.title}</li>)}</ul> : "—"}</dd></div></dl>}
        </section>
        <section className="client-product-consumption">
          <div><TrendingDown size={18} aria-hidden="true" /><span><strong>Consumo del cliente</strong><small>Se utiliza para calcular los días de stock.</small></span></div>
          <button type="button" className="secondary-button" onClick={() => setShowConsumption(true)}>Cargar consumo</button>
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
    {showConsumption && <ConsumptionRuleModal productId={item.productId} fixedClient={{ id: item.clientId, name: clientName }} onClose={() => setShowConsumption(false)} onSaved={() => setShowConsumption(false)} />}
  </details>;
}

function AddClientProductDialog({ products, adding, error, onClose, onSubmit }: { products: Product[]; adding: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const productRef = useRef<HTMLSelectElement>(null);
  const [dirty, setDirty] = useState(false);

  return <ModalShell title="Agregar producto" description="Asociá un producto a este cliente y definí su información operativa." onClose={onClose} initialFocusRef={productRef} dirty={dirty} className="client-product-modal">
    <form className="client-product-add client-product-modal-form" onSubmit={onSubmit} onChange={() => setDirty(true)}>
      <label>Nombre operativo<input name="operationalName" placeholder="Opcional" /></label>
      <label>Seleccionar producto<select ref={productRef} name="productId" required defaultValue=""><option value="" disabled>Seleccionar producto</option>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></label>
      <label>Punto de control<input name="initialControl" placeholder="Opcional" /></label>
      <FieldError id="add-client-product-error">{error}</FieldError>
      <div className="modal-actions"><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={adding} loadingLabel="Agregando…"><Plus size={16} />Agregar producto</AsyncButton></div></div>
    </form>
  </ModalShell>;
}

function ClientPanel({ clientId, products }: { clientId: string; products: Product[] }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingProduct, setAddingProduct] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [clientError, setClientError] = useState("");
  const [productError, setProductError] = useState("");
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

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAddingProduct(true); setProductError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/clients/${clientId}/products`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: form.get("productId"), operationalName: form.get("operationalName"), initialControl: form.get("initialControl") }) });
    const payload = await payloadOf<{ product?: ClientProduct }>(response); setAddingProduct(false);
    if (!response.ok || !payload.product) return setProductError(payload.error ?? "No se pudo asociar el producto.");
    setDetail((current) => current ? { ...current, products: [...current.products, payload.product!] } : current); event.currentTarget.reset(); setShowAddProduct(false);
  };
  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingClient(true); setClientError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: form.get("address"), department: form.get("department"), active: form.get("active") === "on" }) });
    const payload = await payloadOf<{ client?: ClientDetail["client"] }>(response); setSavingClient(false);
    if (!response.ok || !payload.client) return setClientError(payload.error ?? "No se pudo guardar el cliente.");
    setDetail((current) => current ? { ...current, client: payload.client! } : current);
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
      router.push("/clientes");
      router.refresh();
    } catch {
      setDeletingClient(false);
      setClientError("Error de conexión al eliminar el cliente.");
      setConfirmDelete(false);
    }
  };
  if (loading) return <LoadingState label="Cargando ficha del cliente" />;
  if (!detail) return <FieldError id={`client-${clientId}-error`}>{loadError}</FieldError>;
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
    <section className="client-panel-section" aria-labelledby="client-products-title"><div className="client-panel-section-heading"><h3 id="client-products-title">Productos</h3><button type="button" className="primary-button" onClick={() => { setProductError(""); setShowAddProduct(true); }}><Plus size={16} />Agregar producto</button></div><div className="client-product-list">{detail.products.length ? detail.products.map((item) => <ProductCard key={item.id} item={item} clientName={detail.client.name} onChanged={(next) => setDetail((current) => current ? { ...current, products: current.products.map((entry) => String(entry.id) === String(next.id) ? next : entry) } : current)} />) : <EmptyState icon={Package} title="Este cliente todavía no tiene productos" description="Agregá un producto para que luego aparezca en el alta de pedidos." />}</div></section>
    {showAddProduct && <AddClientProductDialog products={products} adding={addingProduct} error={productError} onSubmit={add} onClose={() => { setProductError(""); setShowAddProduct(false); }} />}
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

export default function ClientMasterView({ clients, products, onAdd, initialClientId }: { clients: ClientSummary[]; products: Product[]; onAdd: () => void; initialClientId?: string }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => clients.filter((client) => [client.name, client.address, client.department].some((value) => value?.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")))), [clients, query]);
  if (initialClientId) {
    const client = clients.find((item) => item.id === initialClientId);
    return <section className="clients-surface client-detail-surface" aria-labelledby="client-detail-title">
      <nav className="client-subtabs" aria-label="Ubicación en clientes">
        <Link href="/clientes" className="client-subtab"><ArrowLeft size={16} aria-hidden="true" />Clientes</Link>
        <span className="client-subtab active" aria-current="page">{client?.name ?? "Ficha del cliente"}</span>
      </nav>
      <header className="client-detail-overview">
        <i className="client-avatar" aria-hidden="true">{client?.name.slice(0, 1) ?? "C"}</i>
        <div><h2 id="client-detail-title">{client?.name ?? "Ficha del cliente"}</h2>{(client?.address || client?.department) && <small>{[client.address, client.department].filter(Boolean).join(" · ")}</small>}</div>
        {client && <span><strong>{number.format(client.activePallets)}</strong><small>palets activos</small></span>}
      </header>
      <ClientPanel clientId={initialClientId} products={products} />
    </section>;
  }

  return <section className="clients-surface" aria-labelledby="clients-title"><div className="clients-toolbar"><div><h2 id="clients-title">Clientes y productos</h2></div><div className="module-toolbar-actions"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" /><button type="button" className="add-order-button" onClick={onAdd}><Plus size={17} />Agregar cliente</button></div></div>
    <div className="client-master-list">{visible.map((client) => <article className="client-master-row" key={client.id ?? client.name}>{client.id ? <Link href={`/clientes/${encodeURIComponent(client.id)}`} className="client-master-summary" aria-label={`Abrir ficha de ${client.name}`}><i className="client-avatar" aria-hidden="true">{client.name.slice(0, 1)}</i><span><strong>{client.name}</strong>{(client.address || client.department) && <small>{[client.address, client.department].filter(Boolean).join(" · ")}</small>}</span><span><strong>{number.format(client.activePallets)}</strong><small>palets activos</small></span><ChevronRight size={19} aria-hidden="true" /></Link> : <div className="client-master-summary unavailable" aria-disabled="true"><i className="client-avatar" aria-hidden="true">{client.name.slice(0, 1)}</i><span><strong>{client.name}</strong><small>Sin ficha maestra disponible</small></span><span><strong>{number.format(client.activePallets)}</strong><small>palets activos</small></span><ChevronRight size={19} aria-hidden="true" /></div>}</article>)}</div>
  </section>;
}
