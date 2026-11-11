"use client";

import { ArrowDownToLine, ChevronRight, RotateCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AsyncButton, FieldError, LoadingState, ModalShell } from "./components/ui";
import { canonicalProductName } from "./classification";
import type { OperationOrder, Provider } from "./data";
import { movementStateLabel, orderStockReservations, scopeStockInventory, stockQuantityBreakdown, type StockDetail, type StockInventoryScope, type StockQuantityField, type StockSummaryRow } from "./stock";

const number = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short", timeZone: "America/Montevideo" });
const movementCopy: Record<string, string> = { opening_balance: "Saldo inicial", internal_production: "Producción interna", supplier_receipt: "Recepción de proveedor", production_receipt: "Producción confirmada", treatment_out: "Sale a HT", treatment_in: "HT realizado", treatment_reversal_out: "Reversión de HT", treatment_reversal_in: "Retorno por reversión", dispatch: "Despacho", return: "Devolución", waste: "Merma", adjustment: "Ajuste", reversal: "Reversión" };

function localDateTimeValue() {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function productName(row: StockSummaryRow) { return canonicalProductName(row.product.stockName ?? [row.product.kind, row.product.measure].filter(Boolean).join(" ")); }

type StockPagePayload = { stock: StockSummaryRow[]; providers: Provider[] };
const stockKpis = [
  { field: "pending", label: "Pendiente de HT" },
  { field: "ready", label: "Listo" },
  { field: "reserved", label: "Reservado" },
  { field: "available", label: "Disponible" },
] as const;
type StockSummaryFilter = StockQuantityField | "";

async function requestStockPage(): Promise<StockPagePayload> {
  const [stockResponse, providersResponse] = await Promise.all([fetch("/api/stock/summary?destinos=1"), fetch("/api/providers")]);
  const [stockPayload, providersPayload] = await Promise.all([stockResponse.json() as Promise<{ stock?: StockSummaryRow[]; error?: string }>, providersResponse.json() as Promise<{ providers?: Provider[] }>]);
  if (!stockResponse.ok || !stockPayload.stock) throw new Error(stockPayload.error ?? "No se pudo cargar el stock.");
  let stock = stockPayload.stock;
  const needsOrderHistory = stock.some((row) => !row.inventoryScope && !row.product.clientNames?.length);
  const needsCommitments = stock.some((row) => row.reserved > 0 && row.orderCommitments === undefined);
  const readOrders = (path: string, key: "orders" | "history") => fetch(path)
    .then(async (response) => response.ok ? (await response.json() as Partial<Record<typeof key, OperationOrder[]>>)[key] : undefined)
    .catch(() => undefined);
  const [orders, history] = await Promise.all([
    needsOrderHistory || needsCommitments ? readOrders("/api/orders", "orders") : undefined,
    needsOrderHistory ? readOrders("/api/history", "history") : undefined,
  ]);
  if (needsCommitments && orders) {
    const commitments = orderStockReservations(orders, stock.map((row) => row.product));
    stock = stock.map((row) => row.orderCommitments === undefined ? { ...row, orderCommitments: commitments.get(row.product.id)?.orders ?? [] } : row);
  }
  stock = scopeStockInventory(stock, [...orders ?? [], ...history ?? []]);
  return { stock, providers: providersPayload.providers ?? [] };
}

async function requestStockDetail(productId: string): Promise<StockDetail> {
  const response = await fetch(`/api/stock/${encodeURIComponent(productId)}`);
  const payload = await response.json() as { stock?: StockDetail; error?: string };
  if (!response.ok || !payload.stock) throw new Error(payload.error ?? "No se pudo cargar el detalle.");
  return payload.stock;
}

export function StockEntryModal({ rows, providers, onClose, onSaved }: { rows: StockSummaryRow[]; providers: Provider[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [movementType, setMovementType] = useState("supplier_receipt");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/stock/movements/receipts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: form.get("productId"), stockState: form.get("stockState"), quantity: Number(form.get("quantity")), movementType, providerId: form.get("providerId") || undefined, sourceReference: form.get("sourceReference"), occurredAt: new Date(String(form.get("occurredAt"))).toISOString(), responsible: form.get("responsible"), note: form.get("note") }) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo registrar la entrada."); onSaved(); };
  return <ModalShell title="Registrar entrada de stock" description="Suma unidades al libro; el movimiento original queda inmutable." onClose={onClose}><form className="stock-action-form" onSubmit={submit}><label className="field-wide">Producto<select name="productId" required><option value="" disabled>Seleccionar producto</option>{rows.map((row) => <option value={row.product.id} key={row.product.id}>{productName(row)}</option>)}</select></label><label>Origen<select value={movementType} onChange={(event) => setMovementType(event.target.value)}><option value="supplier_receipt">Recepción de proveedor</option><option value="internal_production">Producción interna</option><option value="return">Devolución</option></select></label><label>Estado<select name="stockState"><option value="pending_treatment">Pendiente de HT</option><option value="ready">Listo</option></select></label>{movementType === "supplier_receipt" && <label>Proveedor<select name="providerId" required><option value="" disabled>Seleccionar</option>{providers.filter((provider) => provider.type !== "Transporte").map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}<label>Cantidad<input name="quantity" type="number" min="1" step="1" required /></label><label>Momento<input name="occurredAt" type="datetime-local" defaultValue={localDateTimeValue()} required /></label><label>Responsable<input name="responsible" required /></label><label>Referencia<input name="sourceReference" placeholder="Remito, lote u OC" /></label><label className="field-wide">Observación<textarea name="note" rows={2} /></label><FieldError id="stock-entry-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Registrar entrada</AsyncButton></div></form></ModalShell>;
}

function StockDetailModal({ row, onClose, onChanged }: { row: StockSummaryRow; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [error, setError] = useState("");
  const [reversing, setReversing] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError("");
    try {
      setDetail(await requestStockDetail(row.product.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el detalle.");
    }
  }, [row.product.id]);
  useEffect(() => {
    let active = true;
    void requestStockDetail(row.product.id)
      .then((stock) => { if (active) setDetail(stock); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "No se pudo cargar el detalle."); });
    return () => { active = false; };
  }, [row.product.id]);
  const reverse = async (movementId: number | string) => {
    const responsible = window.prompt("Responsable de la reversión");
    if (!responsible) return;
    const reason = window.prompt("Motivo obligatorio");
    if (!reason) return;
    setReversing(String(movementId));
    const response = await fetch(`/api/stock/movements/${movementId}/reverse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ occurredAt: new Date().toISOString(), responsible, reason }),
    });
    const payload = await response.json() as { error?: string };
    setReversing(null);
    if (!response.ok) return setError(payload.error ?? "No se pudo revertir.");
    await load();
    onChanged();
  };
  return (
    <ModalShell title={productName(row)} description={`${row.product.sourceCatalog ?? "Catálogo"}, ${row.product.sourceCode ?? row.product.id}`} onClose={onClose} className="stock-detail-modal">
      {error && <p className="field-error" role="alert">{error}</p>}
      {!detail ? <LoadingState label="Cargando detalle de stock" rows={6} /> : <>
        <section className="stock-detail-balance" aria-label="Saldos del producto">
          <div><small>Pendiente de HT</small><strong>{number.format(detail.summary.pending)}</strong></div>
          <div><small>Listo</small><strong>{number.format(detail.summary.ready)}</strong></div>
          <div><small>Reservado</small><strong>{number.format(detail.summary.reserved)}</strong></div>
          <div><small>Disponible</small><strong>{number.format(detail.summary.available)}</strong></div>
        </section>

        <div className="stock-detail-sections">
          <details className="stock-detail-section">
            <summary><span><strong>Movimientos</strong><small>{detail.movements.length} movimientos recientes</small></span><ChevronRight size={18} aria-hidden="true" /></summary>
            <div className="stock-detail-section-body stock-movement-list">
              {detail.movements.map((movement) => <article key={movement.id}><i className={movement.quantity > 0 ? "positive" : "negative"}>{movement.quantity > 0 ? "+" : "−"}</i><div><strong>{movementCopy[movement.movementType] ?? movement.movementType}</strong><small>{movementStateLabel(movement.stockState)}, {dateTime.format(new Date(movement.performedAt))}</small><span>{movement.responsible}{movement.remittance ? `, Remito ${movement.remittance}` : ""}</span>{movement.note && <p>{movement.note}</p>}</div><b>{movement.quantity > 0 ? "+" : ""}{number.format(movement.quantity)}</b>{["internal_production", "supplier_receipt", "return", "waste", "adjustment"].includes(movement.movementType) && !movement.correctionOfMovementId && <button type="button" title="Revertir movimiento" aria-label={`Revertir movimiento ${movement.id}`} disabled={reversing === String(movement.id)} onClick={() => void reverse(movement.id)}><RotateCcw size={14} /></button>}</article>)}
            </div>
          </details>
        </div>
      </>}
    </ModalShell>
  );
}

function StockDestinationModal({ row, field, label, onClose }: { row: StockSummaryRow; field: StockQuantityField; label: string; onClose: () => void }) {
  const { entries, unassigned, unidentified, exceedsBalance } = stockQuantityBreakdown(row, field);
  return <ModalShell title={`${label} · ${number.format(row[field])} u.`} description={productName(row)} onClose={onClose} className="stock-destination-modal">
    {exceedsBalance && <p className="stock-destination-note">Hay compromisos registrados que superan el saldo reservado en stock.</p>}
    {entries.length > 0 || unassigned > 0 || unidentified > 0 ? <ul className="stock-destination-list" aria-label="Destino de las unidades">
      {entries.map((entry) => <li key={entry.orderId}>
        <div><strong>{entry.client}</strong><small>{entry.reference}</small>
          {field === "reserved" && entry.pending > 0 && entry.ready > 0 && <small>{number.format(entry.pending)} u. pendientes de HT · {number.format(entry.ready)} u. listas</small>}
        </div>
        <span>{number.format(entry.pending + entry.ready)} u.</span>
      </li>)}
      {unidentified > 0 && <li><strong>{row.orderCommitments === undefined ? "Detalle de la reserva no disponible" : "Reserva sin cliente identificado"}</strong><span>{number.format(unidentified)} u.</span></li>}
      {unassigned > 0 && <li><strong>Sin cliente asignado</strong><span>{number.format(unassigned)} u.</span></li>}
    </ul> : <p className="stock-empty-copy">No hay unidades en este estado.</p>}
  </ModalShell>;
}

export default function StockView({ scope, focusProductId }: { scope: StockInventoryScope; focusProductId?: string }) {
  const [payload, setPayload] = useState<StockPagePayload>({ stock: [], providers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setPayload(await requestStockPage()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el stock."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void requestStockPage()
      .then((next) => { if (active) setPayload(next); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "No se pudo cargar el stock."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => payload.stock.filter((row) => row.inventoryScope === scope), [payload.stock, scope]);
  const title = scope === "pamer" ? "Stock Pamer" : "Stock general";
  return <StockInventory key={scope} title={title} rows={rows} providers={payload.providers} loading={loading} error={error} onChanged={load} focusProductId={focusProductId} />;
}

function StockInventory({ title, rows, providers, loading, error, onChanged, focusProductId }: { title: string; rows: StockSummaryRow[]; providers: Provider[]; loading: boolean; error: string; onChanged: () => Promise<void>; focusProductId?: string }) {
  const [query, setQuery] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<StockSummaryFilter>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (focusProductId) setSelectedId(focusProductId); }, [focusProductId]);
  const [destination, setDestination] = useState<{ productId: string; field: StockQuantityField; label: string } | null>(null);
  const [entry, setEntry] = useState(false);
  const selected = rows.find((row) => row.product.id === selectedId);
  const destinationRow = rows.find((row) => row.product.id === destination?.productId);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return rows.filter((row) => (!summaryFilter || row[summaryFilter] > 0) && (!normalized || [productName(row), row.product.measure, row.product.zetaCode, row.product.sourceCode].some((value) => value?.toLocaleLowerCase("es").includes(normalized))))
      .sort((a, b) => productName(a).localeCompare(productName(b), "es"));
  }, [query, rows, summaryFilter]);
  const changed = () => { setEntry(false); void onChanged(); };
  return <section className="stock-page" aria-labelledby="stock-title">
    <div className="module-surface stock-header">
      <div><h2 id="stock-title">{title}</h2></div>
      <div><button type="button" className="primary-button" onClick={() => setEntry(true)}><ArrowDownToLine size={16} />Registrar entrada</button></div>
    </div>
    {error && <p className="capacity-error" role="alert">{error}</p>}
    <section className="stock-kpis" aria-label="Filtros rápidos de stock">
      {stockKpis.map(({ field, label }) => <button key={field} type="button" className={`stock-kpi-${field}`} data-kpi={field} aria-pressed={summaryFilter === field} onClick={() => setSummaryFilter((current) => current === field ? "" : field)}>
        <strong>{number.format(rows.reduce((sum, row) => sum + row[field], 0))}</strong>
        <small>{label}</small>
      </button>)}
    </section>
    <section className="module-surface stock-table-surface">
      <div className="stock-toolbar">
        <label className="search-field"><Search size={16} /><span className="sr-only">Buscar producto</span><input type="search" placeholder="Buscar artículo, medida o código" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <small>{visible.length} artículos</small>
      </div>
      {loading && !rows.length ? <LoadingState label="Cargando stock" rows={8} /> : <div className="stock-table-wrap">
        <table className="stock-table">
          <thead><tr><th>Artículo</th><th>Código</th><th>Medida</th><th>Pendiente de HT</th><th>Listo</th><th>Reservado</th><th>Disponible</th><th scope="col">Acciones</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.product.id}>
            <td><button type="button" onClick={() => setSelectedId(row.product.id)}><strong>{productName(row)}</strong></button></td>
            <td>{row.product.zetaCode ?? row.product.sourceCode ?? "—"}</td>
            <td>{row.product.measure ?? "Sin medida"}</td>
            {stockKpis.map(({ field, label }) => <td key={field} className={row[field] > 0 ? "stock-quantity has-stock" : "stock-quantity"}>
              <button type="button" className="stock-quantity-link" aria-label={`${label}: ${number.format(row[field])} unidades de ${productName(row)}. Ver destino`} onClick={() => setDestination({ productId: row.product.id, field, label })}>{number.format(row[field])}</button>
            </td>)}
            <td className="stock-row-actions" />
          </tr>)}</tbody>
        </table>
        {!visible.length && <p className="stock-empty-copy">No hay artículos para esos filtros.</p>}
      </div>}
    </section>
    {selected && <StockDetailModal row={selected} onClose={() => setSelectedId(null)} onChanged={changed} />}
    {destination && destinationRow && <StockDestinationModal row={destinationRow} field={destination.field} label={destination.label} onClose={() => setDestination(null)} />}
    {entry && <StockEntryModal rows={rows} providers={providers} onClose={() => setEntry(false)} onSaved={changed} />}
  </section>;
}
