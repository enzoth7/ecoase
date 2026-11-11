"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, FileCheck2, Flame, Image as ImageIcon, MoreVertical, Plus, RotateCcw, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AsyncButton, FieldError, LoadingState, ModalShell } from "./components/ui";
import TreatmentResults, { type TreatmentResultTarget } from "./components/TreatmentResults";
import type { OperationOrder, Product } from "./data";
import { shiftDryingDay } from "./drying";
import type { TreatmentBatch, TreatmentControlResult, TreatmentDashboard, TreatmentDestination, TreatmentProductOption } from "./treatment";

const number = new Intl.NumberFormat("es-UY");
const time = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" });

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function datetimeLocalValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function markingCopy(value: string) {
  return value.replace(/tratamiento térmico|tratamiento|marcado/giu, "HT");
}

const statusCopy = {
  posted: { label: "HT realizado", icon: CheckCircle2 },
  rejected: { label: "No conforme", icon: XCircle },
  reversal: { label: "Reversión de HT", icon: RotateCcw },
} as const;

function ReverseBatchModal({ batch, onClose, onSaved }: { batch: TreatmentBatch; onClose: () => void; onSaved: () => void }) {
  const responsibleRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/treatment/batches/${batch.id}/reverse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ performedAt: new Date(String(form.get("performedAt"))).toISOString(), responsible: String(form.get("responsible") ?? ""), note: String(form.get("note") ?? "") }) });
    const payload = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) { setError(markingCopy(payload.error ?? "No se pudo revertir el lote.")); return; }
    setDirty(false); onSaved();
  };
  return <ModalShell title={`Revertir lote #${batch.id}`} onClose={onClose} initialFocusRef={responsibleRef} dirty={dirty && !saving} className="treatment-reversal-modal">
    <form className="treatment-reversal-form" onSubmit={submit} onChange={() => setDirty(true)}>
      <p className="modal-context">La reversión devolverá {number.format(batch.quantity)} unidades a Pendiente de HT y las quitará de Listo. El lote original no se modifica.</p>
      <label>Responsable<input ref={responsibleRef} required name="responsible" autoComplete="name" /></label>
      <label>Momento<input required name="performedAt" type="datetime-local" defaultValue={datetimeLocalValue()} /></label>
      <label className="field-wide">Motivo<textarea required name="note" rows={3} /></label>
      <FieldError id="reverse-marking-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="danger-button" loading={saving} error={Boolean(error)}>Registrar reversión</AsyncButton></div>
    </form>
  </ModalShell>;
}

export default function TreatmentView({ orders, products, productsRequiringTreatment, initialDate, onOrderChanged }: {
  orders: OperationOrder[];
  products: Product[];
  productsRequiringTreatment: Set<string>;
  initialDate?: string;
  onOrderChanged: (id: string) => Promise<void>;
}) {
  const [date, setDate] = useState(() => initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && Number.isFinite(Date.parse(initialDate)) && shiftDryingDay(initialDate, 0) === initialDate ? initialDate : localDateKey());
  const [dashboard, setDashboard] = useState<TreatmentDashboard | null>(null);
  const [options, setOptions] = useState<TreatmentProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [productId, setProductId] = useState("");
  const [destinationKey, setDestinationKey] = useState("general");
  const [quantity, setQuantity] = useState("");
  const [performedAt, setPerformedAt] = useState(datetimeLocalValue());
  const [responsible, setResponsible] = useState("");
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState<Record<string, { result: TreatmentControlResult | ""; note: string }>>({});
  const [reverseBatch, setReverseBatch] = useState<TreatmentBatch | null>(null);
  const [showEntry, setShowEntry] = useState(false);
  const [plannedEntry, setPlannedEntry] = useState<TreatmentResultTarget | null>(null);
  const [didTreatment, setDidTreatment] = useState(true);
  const [revision, setRevision] = useState(0);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setDashboard(null); setError("");
    try {
      const [dashboardResponse, optionsResponse] = await Promise.all([fetch(`/api/treatment?date=${date}`), fetch("/api/treatment/options")]);
      const [dashboardPayload, optionsPayload] = await Promise.all([dashboardResponse.json() as Promise<{ treatment?: TreatmentDashboard; error?: string }>, optionsResponse.json() as Promise<{ options?: TreatmentProductOption[]; error?: string }>]);
      if (!dashboardResponse.ok || !dashboardPayload.treatment) throw new Error(markingCopy(dashboardPayload.error ?? "No se pudo cargar el registro diario."));
      if (!optionsResponse.ok || !optionsPayload.options) throw new Error(optionsPayload.error ?? "No se pudieron cargar las opciones.");
      if (version !== loadVersion.current) return;
      setDashboard(dashboardPayload.treatment); setOptions(optionsPayload.options);
      setProductId((current) => optionsPayload.options!.some((option) => option.product.id === current) ? current : optionsPayload.options!.find((option) => option.pending > 0)?.product.id ?? optionsPayload.options![0]?.product.id ?? "");
    } catch (caught) { if (version === loadVersion.current) setError(caught instanceof Error ? markingCopy(caught.message) : "No se pudo cargar el registro de HT."); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [date]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const productOption = options.find((option) => option.product.id === productId);
  const destination: TreatmentDestination | undefined = plannedEntry
    ? productOption?.destinations.find((item) => item.orderLineId === plannedEntry.lineId)
    : productOption?.destinations.find((item) => item.key === destinationKey) ?? productOption?.destinations[0];
  const numericQuantity = Number(quantity) || 0;
  const resultingPending = Math.max((productOption?.pending ?? 0) - numericQuantity, 0);
  const resultingReady = (productOption?.ready ?? 0) + numericQuantity;
  const hasFailure = Object.values(checks).some((check) => check.result === "fail");
  const performedDate = performedAt.slice(0, 10) || date;
  const isOutsideSelectedDate = performedDate !== date;

  useEffect(() => {
    const next = Object.fromEntries((destination?.controls ?? []).map((control) => [String(control.id), { result: "" as const, note: "" }]));
    const timer = window.setTimeout(() => setChecks(next), 0);
    return () => window.clearTimeout(timer);
  }, [destination?.key, destination?.controls]);

  const openEntry = (target: TreatmentResultTarget | null) => {
    setPlannedEntry(target); setDidTreatment(true); setFormError(""); setNote(""); setChecks({});
    if (target) {
      setProductId(target.productId ?? "");
      setDestinationKey(`order:${target.lineId}`);
      setQuantity(String(target.planned - target.actual));
      setPerformedAt(`${target.date}T${datetimeLocalValue().slice(11)}`);
    } else {
      setDestinationKey("general"); setQuantity(""); setPerformedAt(datetimeLocalValue());
      if (!options.some((option) => option.product.id === productId)) setProductId(options.find((option) => option.pending > 0)?.product.id ?? options[0]?.product.id ?? "");
    }
    setShowEntry(true);
  };

  const refreshResults = (orderLineId?: string) => {
    setRevision((current) => current + 1);
    const order = orders.find((item) => item.lines.some((line) => line.id === orderLineId));
    if (order) void onOrderChanged(order.id).catch(() => undefined);
    void load();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    if (plannedEntry && !didTreatment) {
      setSaving(true);
      try {
        const response = await fetch("/api/treatment/results", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          orderId: plannedEntry.orderId, orderLineId: plannedEntry.lineId, date: plannedEntry.date, responsible, note,
        }) });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "No se pudo registrar el resultado.");
        setShowEntry(false); refreshResults();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "No se pudo registrar el resultado.");
      } finally { setSaving(false); }
      return;
    }
    if (!productOption || !destination) { setFormError("Seleccione producto y destino."); return; }
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) { setFormError("Indique una cantidad mayor a cero."); return; }
    if (destination.controls.some((control) => !checks[String(control.id)]?.result)) { setFormError("Marque Conforme o No conforme en cada punto de control."); return; }
    if (destination.key === "general" && !note.trim()) { setFormError("Justifique por qué el lote queda como stock general."); return; }
    if (hasFailure && !note.trim()) { setFormError("Explique la no conformidad del lote."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/treatment/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        productId,
        clientProductId: destination.clientProductId,
        orderLineId: destination.orderLineId,
        quantity: numericQuantity,
        performedAt: new Date(`${performedAt}:00-03:00`).toISOString(),
        responsible,
        note,
        controls: destination.controls.map((control) => ({ controlId: control.id, result: checks[String(control.id)]?.result, note: checks[String(control.id)]?.note })),
      }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo registrar el HT.");
      setShowEntry(false); refreshResults(destination.orderLineId);
    } catch (error) {
      setFormError(error instanceof Error ? markingCopy(error.message) : "No se pudo registrar el HT.");
    } finally { setSaving(false); }
  };

  return <section className="treatment-page" aria-labelledby="treatment-title">
    <div className="module-surface treatment-header simplified"><div><h2 id="treatment-title">Registro de HT</h2></div><div className="treatment-header-actions"><label>Fecha<input type="date" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label><button type="button" className="secondary-button" onClick={() => openEntry(null)}><Plus size={16} />Registrar HT</button></div></div>
    {error && <p className="capacity-error" role="alert">{error}</p>}
    {loading && !dashboard ? <div className="module-surface capacity-loading"><LoadingState label="Cargando el resumen diario de HT" rows={3} /></div> : dashboard &&
      <section className="treatment-kpis compact" aria-label="Resumen diario de HT"><article data-kpi="processed"><strong>{number.format(dashboard.summary.processed)}</strong><small>Procesadas del día</small></article><article data-kpi="rejected"><strong>{number.format(dashboard.summary.rejected)}</strong><small>No conformes</small></article><article data-kpi="pending-treatment"><strong>{number.format(dashboard.summary.pending)}</strong><small>Pendientes de HT</small></article></section>}
    <TreatmentResults orders={orders} products={products} productsRequiringTreatment={productsRequiringTreatment} date={date} revision={revision} onDateChange={setDate} onRecord={openEntry} />
    {dashboard && <>
      <section className="module-surface treatment-history simplified" aria-labelledby="treatment-history-title"><header><div><h3 id="treatment-history-title">Registros del día</h3><small>{dashboard.batches.length} lotes registrados</small></div></header><div className="treatment-table-wrap"><table className="treatment-table"><thead><tr><th>Producto</th><th>Cliente / pedido</th><th>Cantidad</th><th>Responsable</th><th>Hora</th><th>Resultado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{dashboard.batches.map((batch) => { const StatusIcon = statusCopy[batch.status].icon; return <tr key={batch.id}><td><strong>{batch.productName}</strong>{batch.checks.length > 0 && <details><summary>Ver controles</summary><ul>{batch.checks.map((check) => <li key={check.id}><span>{check.result === "pass" ? "Conforme" : "No conforme"}</span><strong>{check.title}</strong>{check.note && <small>{check.note}</small>}</li>)}</ul></details>}</td><td>{batch.clientName ? <><strong>{batch.clientName}</strong><small>{batch.orderReference}</small></> : "Stock general"}</td><td className="numeric-cell"><strong>{number.format(batch.quantity)}</strong></td><td>{batch.responsible}</td><td>{time.format(new Date(batch.performedAt))}</td><td><span className={`treatment-batch-status ${batch.status}`}><StatusIcon size={15} />{statusCopy[batch.status].label}</span></td><td>{batch.status === "posted" && !batch.reversedByBatchId ? <details className="treatment-row-menu"><summary aria-label={`Acciones del lote ${batch.id}`}><MoreVertical size={18} /></summary><button type="button" onClick={() => setReverseBatch(batch)}><RotateCcw size={14} />Revertir</button></details> : batch.reversedByBatchId ? <small>Revertido</small> : <span aria-hidden="true">—</span>}</td></tr>; })}</tbody></table>{!dashboard.batches.length && <div className="treatment-empty"><Flame size={25} /><strong>No hay registros para esta fecha</strong><p>Usá “Registrar HT” para agregar el primero.</p></div>}</div></section>
    </>}
    {showEntry && <ModalShell title={plannedEntry ? "Registrar resultado de HT" : "Registrar HT"} description={plannedEntry ? undefined : "Producto, cantidad y destino del lote."} className="treatment-entry-modal" onClose={() => { if (!saving) setShowEntry(false); }}><form className="treatment-entry" onSubmit={submit}>
      {plannedEntry && <>
        <div className="production-result-plan"><strong>{plannedEntry.product}</strong><span>{plannedEntry.client} · {plannedEntry.reference}</span><span>Planificado: {number.format(plannedEntry.planned)} u. para el {plannedEntry.date}</span></div>
        {!plannedEntry.actual && !plannedEntry.missed && <fieldset className="production-result-choice">
          <legend>¿Qué ocurrió?</legend>
          <button type="button" className={didTreatment ? "selected" : ""} aria-pressed={didTreatment} onClick={() => { setDidTreatment(true); setFormError(""); }}>Se hizo HT</button>
          <button type="button" className={!didTreatment ? "selected" : ""} aria-pressed={!didTreatment} onClick={() => { setDidTreatment(false); setFormError(""); }}>No se hizo</button>
        </fieldset>}
      </>}
      {didTreatment && <>
      <div className="treatment-primary-fields">{!plannedEntry && <label>Producto<select required value={productId} onChange={(event) => { setProductId(event.target.value); setDestinationKey("general"); }}><option value="" disabled>Seleccionar producto</option>{options.map((option) => <option key={option.product.id} value={option.product.id}>{option.label}: {number.format(option.pending)} pendientes de HT</option>)}</select></label>}<label>{plannedEntry ? "Unidades tratadas" : "Cantidad"}<input required min={1} step={1} inputMode="numeric" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label></div>
      {productOption && <div className="treatment-balance-preview" aria-live="polite"><div><small>Pendiente actual</small><strong>{number.format(productOption.pending)}</strong></div><ArrowRight size={18} /><div><small>Quedará pendiente</small><strong>{number.format(resultingPending)}</strong></div><div><small>Listo resultante</small><strong>{number.format(resultingReady)}</strong></div></div>}
      {!plannedEntry && <label>Destino<select value={destination?.key ?? "general"} onChange={(event) => setDestinationKey(event.target.value)}>{productOption?.destinations.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>}
      {plannedEntry && (!destination || !destination.controls.length) && <p className="treatment-general-note">{!destination ? "La ficha del pedido no está disponible para registrar el lote." : "La ficha del pedido necesita al menos un punto de control activo."}</p>}
      {destination && (destination.primaryAsset || destination.controls.length > 0) ? <details className="treatment-entry-controls"><summary><span><strong>Plano y puntos de control</strong><small>{destination.controls.length ? `${destination.controls.length} controles para revisar` : "Referencia visual del producto"}</small></span><FileCheck2 size={18} /></summary><div>{destination.primaryAsset && <div className="treatment-asset"><div><ImageIcon size={18} /><span><strong>Plano o foto principal</strong><small>{destination.primaryAsset.altText}</small></span></div>{destination.primaryAsset.mimeType === "application/pdf" ? <a href={destination.primaryAsset.url} target="_blank" rel="noreferrer">Abrir plano PDF</a> : <img src={destination.primaryAsset.url} alt={destination.primaryAsset.altText} loading="lazy" />}</div>}{destination.controls.length > 0 && <fieldset className="treatment-controls"><legend><FileCheck2 size={17} />Puntos de control</legend>{destination.controls.map((control) => { const check = checks[String(control.id)] ?? { result: "", note: "" }; return <div key={control.id} className={check.result === "fail" ? "failed" : ""}><strong>{control.title}</strong>{control.detail && <small>{control.detail}</small>}<div className="treatment-control-result"><button type="button" className={check.result === "pass" ? "selected pass" : ""} aria-pressed={check.result === "pass"} onClick={() => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, result: "pass" } }))}>Conforme</button><button type="button" className={check.result === "fail" ? "selected fail" : ""} aria-pressed={check.result === "fail"} onClick={() => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, result: "fail" } }))}>No conforme</button></div>{check.result === "fail" && <label>Observación obligatoria<textarea rows={2} value={check.note} onChange={(event) => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, note: event.target.value } }))} /></label>}</div>; })}</fieldset>}</div></details> : destination?.key === "general" ? <p className="treatment-general-note">Stock general: agregá una observación que justifique por qué no se vincula a un cliente o pedido.</p> : null}
      </>}
      <div className="treatment-meta-fields">
        {didTreatment && (plannedEntry ? <label>Hora del HT<input required type="time" value={performedAt.slice(11)} onChange={(event) => setPerformedAt(event.target.value ? `${plannedEntry.date}T${event.target.value}` : "")} /></label>
          : <label>Fecha y hora<input required type="datetime-local" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} /></label>)}
        <label>Responsable<input required value={responsible} onChange={(event) => setResponsible(event.target.value)} autoComplete="name" /></label>
      </div>
      {didTreatment && !plannedEntry && isOutsideSelectedDate && <p className="treatment-date-warning" role="status"><AlertTriangle size={16} aria-hidden="true" /><span>El momento indicado pertenece al {performedDate}. El lote se guardará en esa fecha.</span></p>}
      <label>Observación<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} required={didTreatment && (destination?.key === "general" || hasFailure)} /></label>
      {didTreatment ? <div className={`treatment-confirmation ${hasFailure ? "rejected" : ""}`}>{hasFailure ? <><AlertTriangle size={18} /><p><strong>El lote quedará No conforme.</strong><span>No moverá unidades de stock.</span></p></> : <><ArrowRight size={18} /><p><strong>{number.format(numericQuantity)} unidades pasarán de Pendiente de HT a Listo.</strong><span>Stock físico total sin cambio.</span></p></>}</div>
        : <p className="production-result-balance">Las unidades seguirán pendientes de HT.</p>}
      <FieldError id="marking-form-error">{formError}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => setShowEntry(false)}>Cancelar</button><AsyncButton type="submit" className="primary-button treatment-submit" loading={saving} error={Boolean(formError)} disabled={Boolean(plannedEntry && didTreatment && (!destination || !destination.controls.length))}>{plannedEntry ? "Guardar resultado" : "Guardar HT"}</AsyncButton></div>
    </form></ModalShell>}
    {reverseBatch && <ReverseBatchModal batch={reverseBatch} onClose={() => setReverseBatch(null)} onSaved={() => { const lineId = reverseBatch.orderLineId; setReverseBatch(null); refreshResults(lineId); }} />}
  </section>;
}
