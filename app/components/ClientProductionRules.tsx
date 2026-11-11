"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import type { CapacitySnapshot } from "../capacity";
import type { Product, ProductKind } from "../data";
import type { ClientProductOption } from "../master-data";
import { canProduceProductKind } from "../production-resource-applicability";
import { useNavigate } from "../navigation-client";
import ColumnFilter from "./ColumnFilter";

type Client = { id?: string; name: string };
type Draft = { normal: string; maximum: string };
const key = (productId: number | string, resourceId: number | string) => `${productId}:${resourceId}`;
const draftStorageKey = "ecoase_client_production_rule_drafts";
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

function kindFromLabel(label: string): ProductKind | undefined {
  if (/^\s*pallets?\b/i.test(label)) return "Pallet";
  if (/^\s*bins?\b/i.test(label)) return "Bin";
  return undefined;
}

export default function ClientProductionRules({ clients, catalogProducts, capacity, selectedClientId, focusProductIds, validFrom, onSaved }: {
  clients: Client[];
  catalogProducts: Product[];
  capacity: CapacitySnapshot;
  selectedClientId?: string;
  focusProductIds: string[];
  validFrom?: string;
  onSaved: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const clientId = selectedClientId && clients.some((client) => client.id === selectedClientId) ? selectedClientId : clients.find((client) => client.id)?.id;
  const [products, setProducts] = useState<ClientProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [clientListOpen, setClientListOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState<{ id: string; value: string } | null>(null);
  const [editsByClient, setEditsByClient] = useState<Record<string, Record<string, Draft>>>(() => {
    try { return JSON.parse(sessionStorage.getItem(draftStorageKey) ?? "{}") as Record<string, Record<string, Draft>>; }
    catch { return {}; }
  });
  const edits = clientId ? editsByClient[clientId] ?? {} : {};
  const resources = useMemo(() => capacity.production.resources.filter((resource) => resource.active), [capacity]);
  const catalogKinds = useMemo(() => new Map(catalogProducts.map((product) => [product.id, product.kind])), [catalogProducts]);
  const hasPalletBaseline = capacity.production.rules.some((rule) => rule.source === "planilla de rendimiento inicial");
  const kindOf = (product: ClientProductOption) => catalogKinds.get(product.productId) ?? product.kind ?? kindFromLabel(product.label);
  const savedRuleKeys = new Set(capacity.production.rules.filter((rule) => rule.clientProductId !== undefined).map((rule) => key(rule.clientProductId!, rule.resourceId)));
  const matrixResources = resources.filter((resource) => products.some((product) => canProduceProductKind(resource, kindOf(product))));
  const visibleProducts = products.filter((product) => (!kindFilter || kindOf(product) === kindFilter) && (!resourceFilter || (
    resourceFilter.value === "configured" ? savedRuleKeys.has(key(product.id, resourceFilter.id)) : !savedRuleKeys.has(key(product.id, resourceFilter.id))
  )));
  const matrixColumns = matrixResources.length ? `minmax(190px, 2fr) repeat(${matrixResources.length}, minmax(0, 1fr))` : "minmax(0, 1fr)";

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    const load = async () => {
      setLoading(true); setError(""); setMessage(""); setProducts([]);
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/products`);
        const body = await response.json() as { products?: ClientProductOption[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los productos del cliente.");
        if (live) setProducts(body.products ?? []);
      } catch (caught) {
        if (live) setError(caught instanceof Error ? caught.message : "No se pudieron cargar los productos del cliente.");
      } finally { if (live) setLoading(false); }
    };
    void load();
    return () => { live = false; };
  }, [clientId]);

  useEffect(() => { try { sessionStorage.setItem(draftStorageKey, JSON.stringify(editsByClient)); } catch { /* storage unavailable */ } }, [editsByClient]);

  const savedDrafts = useMemo(() => {
    const next: Record<string, Draft> = {};
    for (const product of products) for (const resource of resources) {
      const rule = capacity.production.rules.find((item) => String(item.clientProductId) === String(product.id) && String(item.resourceId) === String(resource.id));
      next[key(product.id, resource.id)] = { normal: rule ? String(rule.normalUnitsPerDay) : "", maximum: rule ? String(rule.maximumUnitsPerDay) : "" };
    }
    return next;
  }, [products, resources, capacity.production.rules]);

  useEffect(() => {
    if (!focusProductIds.length || !products.length) return;
    const timer = window.setTimeout(() => document.getElementById(`client-rule-${focusProductIds[0]}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
    return () => window.clearTimeout(timer);
  }, [focusProductIds, products]);

  const update = (id: string, field: keyof Draft, value: string) => {
    if (!clientId) return;
    setEditsByClient((current) => ({ ...current, [clientId]: { ...(current[clientId] ?? {}), [id]: { ...(current[clientId]?.[id] ?? savedDrafts[id] ?? { normal: "", maximum: "" }), [field]: value } } }));
    setMessage("");
  };

  const save = async () => {
    setError(""); setMessage("");
    const tasks = Object.keys(edits).map((id) => {
      const [productId, resourceId] = id.split(":");
      const product = products.find((item) => String(item.id) === productId);
      const resource = resources.find((item) => String(item.id) === resourceId);
      const draft = edits[id];
      const existing = capacity.production.rules.find((rule) => String(rule.clientProductId) === productId && String(rule.resourceId) === resourceId);
      return { id, product, resource, draft, existing };
    });
    for (const task of tasks) {
      if (!task.product || !task.resource || !task.draft) continue;
      if (!task.draft.normal && !task.draft.maximum) continue;
      const normal = Number(task.draft.normal), maximum = Number(task.draft.maximum);
      if (!Number.isInteger(normal) || normal <= 0 || !Number.isInteger(maximum) || maximum < normal) {
        setError(`Completá normal y máximo para ${task.product.label} con ${task.resource.name}; el máximo debe ser igual o mayor al normal.`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const task of tasks) {
        if (!task.product || !task.resource || !task.draft) continue;
        const empty = !task.draft.normal && !task.draft.maximum;
        if (empty && !task.existing) continue;
        const response = await fetch(empty ? `/api/capacity/rules?id=${encodeURIComponent(String(task.existing!.id))}` : "/api/capacity/rules", {
          method: empty ? "DELETE" : task.existing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          ...(!empty ? { body: JSON.stringify({ id: task.existing?.id, clientProductId: task.product.id, productId: task.product.productId, resourceId: task.resource.id, normalUnitsPerDay: Number(task.draft.normal), maximumUnitsPerDay: Number(task.draft.maximum), configurationLabel: "Estándar", validFrom: task.existing?.validFrom ?? validFrom ?? today(), source: "manual", note: `Rendimiento de ${clients.find((item) => item.id === clientId)?.name ?? "cliente"}` }) } : {}),
        });
        if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? `No se pudo guardar ${task.product.label}.`); }
      }
      await onSaved();
      setEditsByClient((current) => { const next = { ...current }; if (clientId) delete next[clientId]; return next; });
      setMessage("Reglas guardadas para los próximos pedidos de este cliente.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron guardar las reglas."); }
    finally { setSaving(false); }
  };

  return <div className="client-rules-layout">
    <button type="button" className="client-rules-mobile-toggle" aria-expanded={clientListOpen} aria-controls="client-rules-list" onClick={() => setClientListOpen((open) => !open)}>Clientes: {clients.find((client) => client.id === clientId)?.name ?? "Elegí un cliente"}<ChevronDown size={16} aria-hidden="true" /></button>
    <nav id="client-rules-list" className={`client-rules-list ${clientListOpen ? "open" : ""}`} aria-label="Clientes con productos">
      <strong>Clientes</strong>
      {clients.filter((client) => client.id).map((client) => <button type="button" key={client.id} className={client.id === clientId ? "selected" : ""} onClick={() => { setKindFilter(""); setResourceFilter(null); setClientListOpen(false); navigate(`/reglas-produccion?cliente=${encodeURIComponent(client.id!)}`); }}>{client.name}</button>)}
    </nav>
    <div className="client-rules-content">
      <div className="client-rules-intro">
        <div><h3>{clients.find((client) => client.id === clientId)?.name ?? "Elegí un cliente"}</h3><p>{hasPalletBaseline ? "Cada producto tiene su ritmo normal y su capacidad máxima por productor. Las cifras iniciales se pueden ajustar para este cliente." : "Completá el ritmo normal y la capacidad máxima por día de cada producto y productor."}</p></div>
        <button type="button" className="primary-button" onClick={() => void save()} disabled={saving || !Object.keys(edits).length}>{saving ? "Guardando…" : "Guardar reglas"}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="wizard-ok" role="status">{message}</p>}
      {loading && <p>Cargando productos…</p>}
      {!loading && !products.length && <p>Este cliente todavía no tiene productos vinculados. Cargalos en Clientes para configurar su rendimiento.</p>}
      {!loading && products.length > 0 && <>
        <div className="rule-matrix-toolbar">
          <span>{visibleProducts.length === products.length ? `${products.length} ${products.length === 1 ? "producto" : "productos"}` : `${visibleProducts.length} de ${products.length} productos`}</span>
        </div>
        <div className="client-rule-matrix" role="table" aria-label="Reglas de rendimiento por producto y productor" style={{ "--matrix-columns": matrixColumns } as CSSProperties}>
          <div className="rule-matrix-head" role="row">
            <div role="columnheader"><ColumnFilter label="Producto" value={kindFilter} options={([ ["Pallet", "Pallets"], ["Bin", "Bins"], ["Piso", "Pisos"] ] as const).filter(([kind]) => products.some((product) => kindOf(product) === kind)).map(([value, label]) => ({ value, label }))} onChange={setKindFilter} /></div>
            {matrixResources.map((resource) => <div role="columnheader" key={resource.id}><ColumnFilter label={resource.name} value={resourceFilter?.id === String(resource.id) ? resourceFilter.value : ""} options={[{ value: "configured", label: "Con regla" }, { value: "missing", label: "Sin regla" }]} onChange={(value) => setResourceFilter(value ? { id: String(resource.id), value } : null)} /></div>)}
          </div>
          <div className="rule-matrix-body" role="rowgroup">
            {visibleProducts.map((product) => <div id={`client-rule-${product.id}`} key={product.id} className={`rule-matrix-product client-rule-product ${focusProductIds.includes(String(product.id)) ? "focused" : ""}`} role="row">
              <div className="rule-matrix-product-info" role="rowheader">
                <div className="rule-matrix-product-title"><strong>{product.label}</strong></div>
                <span className="rule-matrix-metric">Normal por día</span>
                <span className="rule-matrix-metric">Máximo por día</span>
              </div>
              {matrixResources.map((resource) => { const id = key(product.id, resource.id); const applies = canProduceProductKind(resource, kindOf(product)); const draft = edits[id] ?? savedDrafts[id] ?? { normal: "", maximum: "" }; return <div className={`rule-matrix-cell ${applies ? "" : "not-applicable"}`} role="cell" key={resource.id}>
                <strong className="rule-matrix-resource-name">{resource.name}</strong>
                {applies ? <>
                  <label className="rule-matrix-input-row"><span>Normal</span><input type="number" min="1" inputMode="numeric" aria-label={`${product.label}, ${resource.name}, normal por día`} value={draft.normal} onChange={(event) => update(id, "normal", event.target.value)} placeholder="—" /></label>
                  <label className="rule-matrix-input-row"><span>Máximo</span><input type="number" min="1" inputMode="numeric" aria-label={`${product.label}, ${resource.name}, máximo por día`} value={draft.maximum} onChange={(event) => update(id, "maximum", event.target.value)} placeholder="—" /></label>
                </> : <span className="rule-matrix-na">No aplica</span>}
              </div>; })}
            </div>)}
          </div>
          {!visibleProducts.length && <p className="rule-matrix-empty">No hay productos para este filtro.</p>}
        </div>
        <p className="rule-matrix-note">Normal es el ritmo habitual, no un mínimo obligatorio. El máximo requiere coordinación previa.</p>
      </>}
    </div>
  </div>;
}
