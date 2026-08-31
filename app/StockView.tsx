"use client";

import { AlertTriangle, ArrowDownToLine, CalendarClock, ChevronRight, ClipboardPlus, PackageCheck, RotateCcw, Search, ShieldAlert, SlidersHorizontal, TrendingDown, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AsyncButton, FieldError, LoadingState, ModalShell } from "./components/ui";
import type { Client, Provider } from "./data";
import { movementStateLabel, riskCopy, type StockDetail, type StockRiskLevel, type StockSummaryRow } from "./stock";

const number = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short", timeZone: "America/Montevideo" });
const movementCopy: Record<string, string> = { opening_balance: "Saldo inicial", internal_production: "Producción interna", supplier_receipt: "Recepción de proveedor", production_receipt: "Producción confirmada", treatment_out: "Sale a marcado", treatment_in: "Marcado confirmado", treatment_reversal_out: "Reversión de marcado", treatment_reversal_in: "Retorno por reversión", dispatch: "Despacho", return: "Devolución", waste: "Merma", adjustment: "Ajuste", reversal: "Reversión" };

function localDateTimeValue() {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function productName(row: StockSummaryRow) { return row.product.stockName ?? [row.product.kind, row.product.measure].filter(Boolean).join(" "); }

function RiskBadge({ level, days }: { level: StockRiskLevel; days?: number }) {
  return <span className={`stock-risk-badge ${level}`}><i aria-hidden="true" />{riskCopy[level].label}{days !== undefined && <small>{number.format(days)} días estimados</small>}</span>;
}

type ImportReport = { id: number; source_file: string; source_catalog: string; as_of_date: string; expected_pending: number; expected_ready: number; source_reported_pending: number | null; source_reported_ready: number | null; status: string; note: string | null };

type StockPagePayload = { stock: StockSummaryRow[]; imports: ImportReport[]; providers: Provider[]; clients: Client[] };
type StockRiskFilter = StockRiskLevel | "alert" | "";
type StockSummaryFilter = "alert" | "ready" | "reserved" | "pending" | "";

function matchesSummaryFilter(row: StockSummaryRow, filter: StockSummaryFilter) {
  if (!filter) return true;
  if (filter === "alert") return ["red", "orange", "yellow"].includes(row.riskLevel);
  return row[filter] > 0;
}

async function requestStockPage(): Promise<StockPagePayload> {
  const [stockResponse, providersResponse, clientsResponse] = await Promise.all([fetch("/api/stock/summary"), fetch("/api/providers"), fetch("/api/clients")]);
  const [stockPayload, providersPayload, clientsPayload] = await Promise.all([stockResponse.json() as Promise<{ stock?: StockSummaryRow[]; imports?: ImportReport[]; error?: string }>, providersResponse.json() as Promise<{ providers?: Provider[] }>, clientsResponse.json() as Promise<{ clients?: Client[] }>]);
  if (!stockResponse.ok || !stockPayload.stock) throw new Error(stockPayload.error ?? "No se pudo cargar el stock.");
  return { stock: stockPayload.stock, imports: stockPayload.imports ?? [], providers: providersPayload.providers ?? [], clients: clientsPayload.clients ?? [] };
}

async function requestStockDetail(productId: string): Promise<StockDetail> {
  const response = await fetch(`/api/stock/${encodeURIComponent(productId)}`);
  const payload = await response.json() as { stock?: StockDetail; error?: string };
  if (!response.ok || !payload.stock) throw new Error(payload.error ?? "No se pudo cargar el detalle.");
  return payload.stock;
}

function StockEntryModal({ rows, providers, onClose, onSaved }: { rows: StockSummaryRow[]; providers: Provider[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [movementType, setMovementType] = useState("supplier_receipt");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/stock/movements/receipts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: form.get("productId"), stockState: form.get("stockState"), quantity: Number(form.get("quantity")), movementType, providerId: form.get("providerId") || undefined, sourceReference: form.get("sourceReference"), occurredAt: new Date(String(form.get("occurredAt"))).toISOString(), responsible: form.get("responsible"), note: form.get("note") }) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo registrar la entrada."); onSaved(); };
  return <ModalShell title="Registrar entrada de stock" description="Suma unidades al libro; el movimiento original queda inmutable." onClose={onClose}><form className="stock-action-form" onSubmit={submit}><label className="field-wide">Producto<select name="productId" required><option value="" disabled>Seleccionar producto</option>{rows.map((row) => <option value={row.product.id} key={row.product.id}>{productName(row)}</option>)}</select></label><label>Origen<select value={movementType} onChange={(event) => setMovementType(event.target.value)}><option value="supplier_receipt">Recepción de proveedor</option><option value="internal_production">Producción interna</option><option value="return">Devolución</option></select></label><label>Estado<select name="stockState"><option value="pending_treatment">Pendiente de marcado</option><option value="ready">Listo</option></select></label>{movementType === "supplier_receipt" && <label>Proveedor<select name="providerId" required><option value="" disabled>Seleccionar</option>{providers.filter((provider) => provider.type !== "Transporte").map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>}<label>Cantidad<input name="quantity" type="number" min="1" step="1" required /></label><label>Momento<input name="occurredAt" type="datetime-local" defaultValue={localDateTimeValue()} required /></label><label>Responsable<input name="responsible" required /></label><label>Referencia<input name="sourceReference" placeholder="Remito, lote u OC" /></label><label className="field-wide">Observación<textarea name="note" rows={2} /></label><FieldError id="stock-entry-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Registrar entrada</AsyncButton></div></form></ModalShell>;
}

function StockAdjustmentModal({ rows, initialProductId, onClose, onSaved }: { rows: StockSummaryRow[]; initialProductId?: string; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/stock/movements/adjustments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: form.get("productId"), stockState: form.get("stockState"), quantityDelta: Number(form.get("quantityDelta")), occurredAt: new Date(String(form.get("occurredAt"))).toISOString(), responsible: form.get("responsible"), reason: form.get("reason") }) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo registrar el ajuste."); onSaved(); };
  return <ModalShell title="Ajuste excepcional" description="Use valor positivo para sumar o negativo para descontar. Siempre requiere motivo." onClose={onClose}><form className="stock-action-form" onSubmit={submit}><label className="field-wide">Producto<select name="productId" defaultValue={initialProductId ?? ""} required><option value="" disabled>Seleccionar producto</option>{rows.map((row) => <option value={row.product.id} key={row.product.id}>{productName(row)}</option>)}</select></label><label>Estado<select name="stockState"><option value="pending_treatment">Pendiente de marcado</option><option value="ready">Listo</option></select></label><label>Diferencia<input name="quantityDelta" type="number" step="1" placeholder="Ej. -12 o 25" required /></label><label>Momento<input name="occurredAt" type="datetime-local" defaultValue={localDateTimeValue()} required /></label><label>Responsable<input name="responsible" required /></label><label className="field-wide">Motivo<textarea name="reason" rows={3} required /></label><FieldError id="stock-adjust-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Registrar ajuste</AsyncButton></div></form></ModalShell>;
}

function ConsumptionModal({ productId, clients, onClose, onSaved }: { productId: string; clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/stock/consumption", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, clientId: form.get("clientId"), dailyConsumption: Number(form.get("dailyConsumption")), workdaysPerWeek: Number(form.get("workdaysPerWeek")), safetyStock: Number(form.get("safetyStock")), validFrom: form.get("validFrom"), validTo: form.get("validTo") || undefined, source: form.get("source"), note: form.get("note") }) }); const payload = await response.json() as { error?: string }; setSaving(false); if (!response.ok) return setError(payload.error ?? "No se pudo guardar el consumo."); onSaved(); };
  return <ModalShell title="Nueva regla de consumo" description="La vigencia no puede superponerse con otra regla del mismo cliente y producto." onClose={onClose}><form className="stock-action-form" onSubmit={submit}><label className="field-wide">Cliente<select name="clientId" required><option value="" disabled>Seleccionar cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label>Consumo diario<input name="dailyConsumption" type="number" min="0" step="0.01" required /></label><label>Días laborables/semana<input name="workdaysPerWeek" type="number" min="1" max="7" step="1" defaultValue="5" required /></label><label>Stock de seguridad<input name="safetyStock" type="number" min="0" step="1" defaultValue="0" required /></label><label>Vigente desde<input name="validFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Vigente hasta<input name="validTo" type="date" /></label><label>Fuente<input name="source" placeholder="Cliente, reunión, planilla…" required /></label><label className="field-wide">Observación<textarea name="note" rows={2} /></label><FieldError id="stock-consumption-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar consumo</AsyncButton></div></form></ModalShell>;
}

function StockDetailModal({ row, onClose, onChanged, onAdjust, onConsumption }: { row: StockSummaryRow; onClose: () => void; onChanged: () => void; onAdjust: () => void; onConsumption: () => void }) {
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
  const chart = detail?.projection.map((point) => ({ ...point, label: date.format(new Date(`${point.date}T12:00:00`)) })) ?? [];
  return (
    <ModalShell title={productName(row)} description={`${row.product.sourceCatalog ?? "Catálogo"} · ${row.product.sourceCode ?? row.product.id}`} onClose={onClose} className="stock-detail-modal">
      <div className="stock-detail-actions">
        <button type="button" className="secondary-button" onClick={onAdjust}><SlidersHorizontal size={15} />Ajustar</button>
        <button type="button" className="secondary-button" onClick={onConsumption}><UsersRound size={15} />Cargar consumo</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!detail ? <LoadingState label="Cargando detalle de stock" rows={6} /> : <>
        <section className="stock-detail-balance" aria-label="Saldos y alerta del producto">
          <div><small>Pendiente de marcado</small><strong>{number.format(detail.summary.pending)}</strong></div>
          <div><small>Listo</small><strong>{number.format(detail.summary.ready)}</strong></div>
          <div><small>Reservado</small><strong>{number.format(detail.summary.reserved)}</strong></div>
          <div><small>Disponible</small><strong>{number.format(detail.summary.available)}</strong></div>
          <RiskBadge level={detail.summary.riskLevel} days={detail.summary.daysToBreak} />
        </section>
        {detail.summary.riskLevel === "gray" && <div className="stock-inline-action"><span>No calculable: falta configurar el consumo del producto.</span><button type="button" className="secondary-button" onClick={onConsumption}>Cargar consumo</button></div>}

        <div className="stock-detail-sections">
          <details className="stock-detail-section">
            <summary><span><strong>Proyección</strong><small>Disponibilidad estimada para los próximos 30 días</small></span><ChevronRight size={18} aria-hidden="true" /></summary>
            <div className="stock-detail-section-body">
              <div className="stock-chart" aria-label="Gráfico de disponibilidad proyectada">
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={32} tick={{ fontSize: 11 }} /><YAxis width={46} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => number.format(Number(value))} /><ReferenceLine y={detail.summary.safetyStock} stroke="#b7791f" strokeDasharray="5 4" label="Seguridad" /><Area type="monotone" dataKey="projectedAvailable" name="Disponible proyectado" stroke="#1f6f54" fill="#dceee7" strokeWidth={2} /></AreaChart></ResponsiveContainer>
              </div>
              <details className="stock-projection-data"><summary>Ver tabla de la proyección</summary><div><table><thead><tr><th>Fecha</th><th>Ingresos</th><th>Entregas</th><th>Consumo</th><th>Disponible</th></tr></thead><tbody>{detail.projection.map((point) => <tr key={point.date}><td>{date.format(new Date(`${point.date}T12:00:00`))}</td><td>{number.format(point.incoming)}</td><td>{number.format(point.plannedOutgoing)}</td><td>{number.format(point.dailyOutgoing)}</td><td>{number.format(point.projectedAvailable)}</td></tr>)}</tbody></table></div></details>
            </div>
          </details>

          <details className="stock-detail-section">
            <summary><span><strong>Consumo</strong><small>{detail.consumption.length ? `${detail.consumption.length} reglas configuradas` : "Sin reglas configuradas"}</small></span><ChevronRight size={18} aria-hidden="true" /></summary>
            <div className="stock-detail-section-body stock-consumption-list">
              {detail.consumption.map((rule) => <article key={rule.id}><strong>{rule.clientName}</strong><span>{number.format(rule.dailyConsumption)} por día · {rule.workdaysPerWeek} días/sem.</span><small>Seguridad {number.format(rule.safetyStock)} · desde {date.format(new Date(`${rule.validFrom}T12:00:00`))}</small>{rule.note && <p>{rule.note}</p>}</article>)}
              {!detail.consumption.length && <div className="stock-empty-action"><p className="stock-empty-copy">No calculable hasta informar el consumo.</p><button type="button" className="secondary-button" onClick={onConsumption}>Cargar consumo</button></div>}
            </div>
          </details>

          <details className="stock-detail-section">
            <summary><span><strong>Movimientos</strong><small>{detail.movements.length} movimientos recientes</small></span><ChevronRight size={18} aria-hidden="true" /></summary>
            <div className="stock-detail-section-body stock-movement-list">
              {detail.movements.map((movement) => <article key={movement.id}><i className={movement.quantity > 0 ? "positive" : "negative"}>{movement.quantity > 0 ? "+" : "−"}</i><div><strong>{movementCopy[movement.movementType] ?? movement.movementType}</strong><small>{movementStateLabel(movement.stockState)} · {dateTime.format(new Date(movement.performedAt))}</small><span>{movement.responsible}{movement.remittance ? ` · Remito ${movement.remittance}` : ""}</span>{movement.note && <p>{movement.note}</p>}</div><b>{movement.quantity > 0 ? "+" : ""}{number.format(movement.quantity)}</b>{["internal_production", "supplier_receipt", "return", "waste", "adjustment"].includes(movement.movementType) && !movement.correctionOfMovementId && <button type="button" title="Revertir movimiento" aria-label={`Revertir movimiento ${movement.id}`} disabled={reversing === String(movement.id)} onClick={() => void reverse(movement.id)}><RotateCcw size={14} /></button>}</article>)}
            </div>
          </details>
        </div>
      </>}
    </ModalShell>
  );
}

export default function StockView({ initialRiskFilter }: { initialRiskFilter?: "alert" }) {
  const [rows, setRows] = useState<StockSummaryRow[]>([]); const [imports, setImports] = useState<ImportReport[]>([]); const [providers, setProviders] = useState<Provider[]>([]); const [clients, setClients] = useState<Client[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState(""); const [risk, setRisk] = useState<StockRiskFilter>(initialRiskFilter ?? ""); const [summaryFilter, setSummaryFilter] = useState<StockSummaryFilter>(""); const [catalog, setCatalog] = useState(""); const [selected, setSelected] = useState<StockSummaryRow | null>(null); const [entry, setEntry] = useState(false); const [adjustmentProduct, setAdjustmentProduct] = useState<string | null>(null); const [consumptionProduct, setConsumptionProduct] = useState<string | null>(null); const [showImport, setShowImport] = useState(false);
  const applyPayload = useCallback((payload: StockPagePayload) => { setRows(payload.stock); setImports(payload.imports); setProviders(payload.providers); setClients(payload.clients); setSelected((current) => current ? payload.stock.find((row) => row.product.id === current.product.id) ?? null : null); }, []);
  const load = useCallback(async () => { setLoading(true); setError(""); try { applyPayload(await requestStockPage()); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar Stock."); } finally { setLoading(false); } }, [applyPayload]);
  useEffect(() => { let active = true; void requestStockPage().then((payload) => { if (active) applyPayload(payload); }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "No se pudo cargar Stock."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [applyPayload]);
  const visible = useMemo(() => { const normalized = query.trim().toLocaleLowerCase("es"); const order: Record<StockRiskLevel, number> = { red: 0, orange: 1, yellow: 2, green: 3, gray: 4 }; return rows.filter((row) => matchesSummaryFilter(row, summaryFilter) && (!risk || (risk === "alert" ? ["red", "orange", "yellow"].includes(row.riskLevel) : row.riskLevel === risk)) && (!catalog || row.product.sourceCatalog === catalog) && (!normalized || [productName(row), row.product.measure, row.product.zetaCode, row.product.sourceCode].some((value) => value?.toLocaleLowerCase("es").includes(normalized)))).sort((a, b) => order[a.riskLevel] - order[b.riskLevel] || (a.daysToBreak ?? Infinity) - (b.daysToBreak ?? Infinity) || productName(a).localeCompare(productName(b), "es")); }, [catalog, query, risk, rows, summaryFilter]);
  const alerts = rows.filter((row) => ["red", "orange", "yellow"].includes(row.riskLevel)).length; const ready = rows.reduce((sum, row) => sum + row.ready, 0); const reserved = rows.reduce((sum, row) => sum + row.reserved, 0); const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  const changed = () => { setEntry(false); setAdjustmentProduct(null); setConsumptionProduct(null); void load(); };
  return <section className="stock-page" aria-labelledby="stock-title"><div className="module-surface stock-header"><div><h2 id="stock-title">Stock</h2></div><div><button type="button" className="secondary-button" onClick={() => setShowImport((current) => !current)}><ClipboardPlus size={16} />Conciliación inicial</button><button type="button" className="primary-button" onClick={() => setEntry(true)}><ArrowDownToLine size={16} />Registrar entrada</button></div></div>{showImport && <section className="stock-import-audit" aria-label="Conciliación de saldos iniciales">{imports.map((report) => <article key={report.id}><PackageCheck size={18} /><div><strong>{report.source_catalog} · corte {date.format(new Date(`${report.as_of_date}T12:00:00`))}</strong><span>{number.format(report.expected_pending)} pendientes de marcado · {number.format(report.expected_ready)} listas</span>{report.source_reported_pending !== report.expected_pending && <mark><AlertTriangle size={13} />El resumen de origen no coincide con el detalle importado</mark>}<small>{report.note}</small></div></article>)}</section>}{error && <p className="capacity-error" role="alert">{error}</p>}<section className="stock-kpis" aria-label="Filtros rápidos de stock"><button type="button" className={`critical ${summaryFilter === "alert" ? "active" : ""}`} aria-pressed={summaryFilter === "alert"} onClick={() => setSummaryFilter((current) => current === "alert" ? "" : "alert")}><ShieldAlert size={20} /><div><strong>{alerts}</strong><small>Productos con alerta</small></div></button><button type="button" className={summaryFilter === "ready" ? "active" : ""} aria-pressed={summaryFilter === "ready"} onClick={() => setSummaryFilter((current) => current === "ready" ? "" : "ready")}><PackageCheck size={20} /><div><strong>{number.format(ready)}</strong><small>Unidades listas</small></div></button><button type="button" className={summaryFilter === "reserved" ? "active" : ""} aria-pressed={summaryFilter === "reserved"} onClick={() => setSummaryFilter((current) => current === "reserved" ? "" : "reserved")}><CalendarClock size={20} /><div><strong>{number.format(reserved)}</strong><small>Reservadas</small></div></button><button type="button" className={summaryFilter === "pending" ? "active" : ""} aria-pressed={summaryFilter === "pending"} onClick={() => setSummaryFilter((current) => current === "pending" ? "" : "pending")}><TrendingDown size={20} /><div><strong>{number.format(pending)}</strong><small>Pendientes de marcado</small></div></button></section><section className="module-surface stock-table-surface"><div className="stock-toolbar"><label className="search-field"><Search size={16} /><span className="sr-only">Buscar producto</span><input type="search" placeholder="Buscar artículo, medida o código Zeta" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><span className="sr-only">Filtrar días de stock</span><select value={risk} onChange={(event) => setRisk(event.target.value as StockRiskFilter)}><option value="">Todos</option><option value="alert">Con alerta</option>{Object.entries(riskCopy).map(([value, copy]) => <option value={value} key={value}>{copy.label}</option>)}</select></label><label><span className="sr-only">Filtrar catálogo</span><select value={catalog} onChange={(event) => setCatalog(event.target.value)}><option value="">Todos los catálogos</option><option>Palbin</option><option>Pamer</option></select></label><small>{visible.length} artículos</small></div>{loading && !rows.length ? <LoadingState label="Cargando stock" rows={8} /> : <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Artículo</th><th>Código Zeta</th><th>Medida</th><th>Pendiente de marcado</th><th>Listo</th><th>Reservado</th><th>Disponible</th><th>Días de stock</th><th><span className="sr-only">Detalle</span></th></tr></thead><tbody>{visible.map((row) => <tr key={row.product.id}><td><button type="button" onClick={() => setSelected(row)}><strong>{productName(row)}</strong></button></td><td>{row.product.zetaCode ?? row.product.sourceCode ?? "—"}</td><td>{row.product.measure ?? "Sin medida"}</td><td>{number.format(row.pending)}</td><td>{number.format(row.ready)}</td><td>{number.format(row.reserved)}</td><td><strong>{number.format(row.available)}</strong></td><td><RiskBadge level={row.riskLevel} days={row.daysToBreak} />{row.riskLevel === "gray" && <button type="button" className="stock-inline-action" onClick={() => setConsumptionProduct(row.product.id)}>Cargar consumo</button>}</td><td><button type="button" className="stock-row-open" onClick={() => setSelected(row)} aria-label={`Ver detalle de ${productName(row)}`}><ChevronRight size={17} /></button></td></tr>)}</tbody></table>{!visible.length && <p className="stock-empty-copy">No hay artículos para esos filtros.</p>}</div>}</section>{selected && <StockDetailModal row={selected} onClose={() => setSelected(null)} onChanged={changed} onAdjust={() => { setAdjustmentProduct(selected.product.id); setSelected(null); }} onConsumption={() => { setConsumptionProduct(selected.product.id); setSelected(null); }} />}{entry && <StockEntryModal rows={rows} providers={providers} onClose={() => setEntry(false)} onSaved={changed} />}{adjustmentProduct && <StockAdjustmentModal rows={rows} initialProductId={adjustmentProduct} onClose={() => setAdjustmentProduct(null)} onSaved={changed} />}{consumptionProduct && <ConsumptionModal productId={consumptionProduct} clients={clients} onClose={() => setConsumptionProduct(null)} onSaved={changed} />}</section>;
}
