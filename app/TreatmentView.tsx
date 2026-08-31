"use client";

import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, FileCheck2, Flame, Image as ImageIcon, MoreVertical, PackageCheck, Plus, RotateCcw, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ProductionTabs from "./components/ProductionTabs";
import { AsyncButton, FieldError, LoadingState, ModalShell } from "./components/ui";
import type { TreatmentBatch, TreatmentControlResult, TreatmentDashboard, TreatmentDestination, TreatmentProductOption } from "./treatment";

const number = new Intl.NumberFormat("es-UY");
const time = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", weekday: "short", day: "numeric" });

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function datetimeLocalValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function markingCopy(value: string) {
  return value.replace(/tratamiento térmico/giu, "marcado").replace(/tratamiento/giu, "marcado");
}

const statusCopy = {
  posted: { label: "Marcado confirmado", icon: CheckCircle2 },
  rejected: { label: "No conforme", icon: XCircle },
  reversal: { label: "Reversión de marcado", icon: RotateCcw },
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
      <p className="modal-context">La reversión devolverá {number.format(batch.quantity)} unidades a Pendiente de marcado y las quitará de Listo. El lote original no se modifica.</p>
      <label>Responsable<input ref={responsibleRef} required name="responsible" autoComplete="name" /></label>
      <label>Momento<input required name="performedAt" type="datetime-local" defaultValue={datetimeLocalValue()} /></label>
      <label className="field-wide">Motivo<textarea required name="note" rows={3} /></label>
      <FieldError id="reverse-marking-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="danger-button" loading={saving} error={Boolean(error)}>Registrar reversión</AsyncButton></div>
    </form>
  </ModalShell>;
}

export default function TreatmentView() {
  const [date, setDate] = useState(localDateKey());
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

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [dashboardResponse, optionsResponse] = await Promise.all([fetch(`/api/treatment?date=${date}`), fetch("/api/treatment/options")]);
      const [dashboardPayload, optionsPayload] = await Promise.all([dashboardResponse.json() as Promise<{ treatment?: TreatmentDashboard; error?: string }>, optionsResponse.json() as Promise<{ options?: TreatmentProductOption[]; error?: string }>]);
      if (!dashboardResponse.ok || !dashboardPayload.treatment) throw new Error(markingCopy(dashboardPayload.error ?? "No se pudo cargar el registro diario."));
      if (!optionsResponse.ok || !optionsPayload.options) throw new Error(optionsPayload.error ?? "No se pudieron cargar las opciones.");
      setDashboard(dashboardPayload.treatment); setOptions(optionsPayload.options);
      setProductId((current) => optionsPayload.options!.some((option) => option.product.id === current) ? current : optionsPayload.options!.find((option) => option.pending > 0)?.product.id ?? optionsPayload.options![0]?.product.id ?? "");
    } catch (caught) { setError(caught instanceof Error ? markingCopy(caught.message) : "No se pudo cargar Marcado."); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const productOption = options.find((option) => option.product.id === productId);
  const destination: TreatmentDestination | undefined = productOption?.destinations.find((item) => item.key === destinationKey) ?? productOption?.destinations[0];
  const numericQuantity = Number(quantity) || 0;
  const resultingPending = Math.max((productOption?.pending ?? 0) - numericQuantity, 0);
  const resultingReady = (productOption?.ready ?? 0) + numericQuantity;
  const hasFailure = Object.values(checks).some((check) => check.result === "fail");
  const performedDate = performedAt ? localDateKey(new Date(performedAt)) : date;
  const isOutsideSelectedDate = performedDate !== date;
  const trendMaximum = Math.max(1, ...(dashboard?.trend.map((item) => Math.max(item.processed, item.rejected)) ?? [1]));

  useEffect(() => {
    const next = Object.fromEntries((destination?.controls ?? []).map((control) => [String(control.id), { result: "" as const, note: "" }]));
    const timer = window.setTimeout(() => setChecks(next), 0);
    return () => window.clearTimeout(timer);
  }, [destination?.key, destination?.controls]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError("");
    if (!productOption || !destination) { setFormError("Seleccione producto y destino."); return; }
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) { setFormError("Indique una cantidad mayor a cero."); return; }
    if (destination.controls.some((control) => !checks[String(control.id)]?.result)) { setFormError("Marque Conforme o No conforme en cada punto de control."); return; }
    if (destination.key === "general" && !note.trim()) { setFormError("Justifique por qué el lote queda como stock general."); return; }
    if (hasFailure && !note.trim()) { setFormError("Explique la no conformidad del lote."); return; }
    setSaving(true);
    const response = await fetch("/api/treatment/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      productId,
      clientProductId: destination.clientProductId,
      orderLineId: destination.orderLineId,
      quantity: numericQuantity,
      performedAt: new Date(performedAt).toISOString(),
      responsible,
      note,
      controls: destination.controls.map((control) => ({ controlId: control.id, result: checks[String(control.id)]?.result, note: checks[String(control.id)]?.note })),
    }) });
    const payload = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) { setFormError(markingCopy(payload.error ?? "No se pudo registrar el marcado.")); return; }
    setQuantity(""); setNote(""); setChecks({}); setPerformedAt(datetimeLocalValue());
    await load(); setShowEntry(false);
  };

  return <section className="treatment-page" aria-labelledby="treatment-title">
    <ProductionTabs current="marking" />
    <div className="module-surface treatment-header simplified"><div><h2 id="treatment-title">Marcado</h2></div><div className="treatment-header-actions"><label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" className="primary-button" onClick={() => { setFormError(""); setShowEntry(true); }}><Plus size={16} />Registrar marcado</button></div></div>
    {error && <p className="capacity-error" role="alert">{error}</p>}
    {loading && !dashboard ? <div className="module-surface capacity-loading"><LoadingState label="Cargando marcado diario" rows={5} /></div> : dashboard && <>
      <section className="treatment-kpis compact" aria-label="Resumen diario de marcado"><article><i className="posted"><PackageCheck size={19} /></i><div><strong>{number.format(dashboard.summary.processed)}</strong><small>Procesadas hoy</small></div></article><article><i className="rejected"><AlertTriangle size={19} /></i><div><strong>{number.format(dashboard.summary.rejected)}</strong><small>No conformes</small></div></article><article><i className="pending"><Boxes size={19} /></i><div><strong>{number.format(dashboard.summary.pending)}</strong><small>Pendientes de marcado</small></div></article></section>
      <section className="module-surface treatment-history simplified" aria-labelledby="treatment-history-title"><header><div><h3 id="treatment-history-title">Registros del día</h3><small>{dashboard.batches.length} lotes registrados</small></div></header><div className="treatment-table-wrap"><table className="treatment-table"><thead><tr><th>Producto</th><th>Cliente / pedido</th><th>Cantidad</th><th>Responsable</th><th>Hora</th><th>Resultado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{dashboard.batches.map((batch) => { const StatusIcon = statusCopy[batch.status].icon; return <tr key={batch.id}><td><strong>{batch.productName}</strong>{batch.checks.length > 0 && <details><summary>Ver controles</summary><ul>{batch.checks.map((check) => <li key={check.id}><span>{check.result === "pass" ? "Conforme" : "No conforme"}</span><strong>{check.title}</strong>{check.note && <small>{check.note}</small>}</li>)}</ul></details>}</td><td>{batch.clientName ? <><strong>{batch.clientName}</strong><small>{batch.orderReference}</small></> : "Stock general"}</td><td className="numeric-cell"><strong>{number.format(batch.quantity)}</strong></td><td>{batch.responsible}</td><td>{time.format(new Date(batch.performedAt))}</td><td><span className={`treatment-batch-status ${batch.status}`}><StatusIcon size={15} />{statusCopy[batch.status].label}</span></td><td>{batch.status === "posted" && !batch.reversedByBatchId ? <details className="treatment-row-menu"><summary aria-label={`Acciones del lote ${batch.id}`}><MoreVertical size={18} /></summary><button type="button" onClick={() => setReverseBatch(batch)}><RotateCcw size={14} />Revertir</button></details> : batch.reversedByBatchId ? <small>Revertido</small> : <span aria-hidden="true">—</span>}</td></tr>; })}</tbody></table>{!dashboard.batches.length && <div className="treatment-empty"><Flame size={25} /><strong>No hay registros para esta fecha</strong><p>Usá “Registrar marcado” para agregar el primero.</p></div>}</div></section>
      <details className="module-surface treatment-trend simplified"><summary><h3 id="treatment-trend-title">Tendencia de los últimos 7 días</h3><span>Ver tendencia</span></summary><div className="treatment-trend-bars">{dashboard.trend.map((item) => <div key={item.date}><div className="trend-track" aria-label={`${item.date}: ${item.processed} procesadas y ${item.rejected} rechazadas`}><i className="processed" style={{ height: `${Math.max(item.processed / trendMaximum * 100, item.processed ? 8 : 0)}%` }} /><i className="rejected" style={{ height: `${Math.max(item.rejected / trendMaximum * 100, item.rejected ? 8 : 0)}%` }} /></div><small>{shortDate.format(new Date(`${item.date}T12:00:00Z`))}</small></div>)}</div><p className="trend-legend"><span><i className="processed" />Procesadas</span><span><i className="rejected" />No conformes</span></p></details>
    </>}
    {showEntry && <ModalShell title="Registrar marcado" description="Producto y cantidad primero; los controles aparecen según el destino." className="treatment-entry-modal" onClose={() => setShowEntry(false)}><form className="treatment-entry" onSubmit={submit}>
      <div className="treatment-primary-fields"><label>Producto<select required value={productId} onChange={(event) => { setProductId(event.target.value); setDestinationKey("general"); }}><option value="" disabled>Seleccionar producto</option>{options.map((option) => <option key={option.product.id} value={option.product.id}>{option.label} · {number.format(option.pending)} pendientes de marcado</option>)}</select></label><label>Cantidad<input required min={1} step={1} inputMode="numeric" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label></div>
      {productOption && <div className="treatment-balance-preview" aria-live="polite"><div><small>Pendiente actual</small><strong>{number.format(productOption.pending)}</strong></div><ArrowRight size={18} /><div><small>Quedará pendiente</small><strong>{number.format(resultingPending)}</strong></div><div><small>Listo resultante</small><strong>{number.format(resultingReady)}</strong></div></div>}
      <label>Destino<select value={destination?.key ?? "general"} onChange={(event) => setDestinationKey(event.target.value)}>{productOption?.destinations.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      {destination && (destination.primaryAsset || destination.controls.length > 0) ? <details className="treatment-entry-controls"><summary><span><strong>Plano y puntos de control</strong><small>{destination.controls.length ? `${destination.controls.length} controles para revisar` : "Referencia visual del producto"}</small></span><FileCheck2 size={18} /></summary><div>{destination.primaryAsset && <div className="treatment-asset"><div><ImageIcon size={18} /><span><strong>Plano o foto principal</strong><small>{destination.primaryAsset.altText}</small></span></div>{destination.primaryAsset.mimeType === "application/pdf" ? <a href={destination.primaryAsset.url} target="_blank" rel="noreferrer">Abrir plano PDF</a> : <img src={destination.primaryAsset.url} alt={destination.primaryAsset.altText} loading="lazy" />}</div>}{destination.controls.length > 0 && <fieldset className="treatment-controls"><legend><FileCheck2 size={17} />Puntos de control</legend>{destination.controls.map((control) => { const check = checks[String(control.id)] ?? { result: "", note: "" }; return <div key={control.id} className={check.result === "fail" ? "failed" : ""}><strong>{control.title}</strong>{control.detail && <small>{control.detail}</small>}<div className="treatment-control-result"><button type="button" className={check.result === "pass" ? "selected pass" : ""} aria-pressed={check.result === "pass"} onClick={() => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, result: "pass" } }))}>Conforme</button><button type="button" className={check.result === "fail" ? "selected fail" : ""} aria-pressed={check.result === "fail"} onClick={() => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, result: "fail" } }))}>No conforme</button></div>{check.result === "fail" && <label>Observación obligatoria<textarea rows={2} value={check.note} onChange={(event) => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, note: event.target.value } }))} /></label>}</div>; })}</fieldset>}</div></details> : <p className="treatment-general-note">Stock general: agregá una observación que justifique por qué no se vincula a un cliente o pedido.</p>}
      <div className="treatment-meta-fields"><label>Fecha y hora<input required type="datetime-local" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} /></label><label>Responsable<input required value={responsible} onChange={(event) => setResponsible(event.target.value)} autoComplete="name" /></label></div>
      {isOutsideSelectedDate && <p className="treatment-date-warning" role="status"><AlertTriangle size={16} aria-hidden="true" /><span>El momento indicado pertenece al {performedDate}; el lote se guardará en esa fecha.</span></p>}
      <label>Observación<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} required={destination?.key === "general" || hasFailure} /></label>
      <div className={`treatment-confirmation ${hasFailure ? "rejected" : ""}`}>{hasFailure ? <><AlertTriangle size={18} /><p><strong>El lote quedará No conforme.</strong><span>No moverá unidades de stock.</span></p></> : <><ArrowRight size={18} /><p><strong>{number.format(numericQuantity)} unidades pasarán de Pendiente de marcado a Listo.</strong><span>Stock físico total sin cambio.</span></p></>}</div>
      <FieldError id="marking-form-error">{formError}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEntry(false)}>Cancelar</button><AsyncButton type="submit" className="primary-button treatment-submit" loading={saving} error={Boolean(formError)}>Guardar marcado</AsyncButton></div>
    </form></ModalShell>}
    {reverseBatch && <ReverseBatchModal batch={reverseBatch} onClose={() => setReverseBatch(null)} onSaved={() => { setReverseBatch(null); void load(); }} />}
  </section>;
}
