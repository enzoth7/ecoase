"use client";

import { FileCheck2, Image as ImageIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { TreatmentControlResult, TreatmentDestination, TreatmentProductOption } from "../treatment";
import type { TreatmentResultTarget } from "./TreatmentResults";
import { AsyncButton, FieldError, ModalShell } from "./ui";

const number = new Intl.NumberFormat("es-UY");

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

/** Diálogo único para registrar HT: lo usan el registro semanal y la cola del secadero. */
export default function TreatmentEntryModal({ target, onClose, onSaved }: {
  target: TreatmentResultTarget | null;
  onClose: () => void;
  onSaved: (orderLineId?: string) => void;
}) {
  const plannedEntry = target;
  const responsible = "Operación";
  const [options, setOptions] = useState<TreatmentProductOption[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [productId, setProductId] = useState(target?.productId ?? "");
  const [destinationKey, setDestinationKey] = useState(target ? `order:${target.lineId}` : "general");
  const [quantity, setQuantity] = useState(target ? String(target.planned - target.actual) : "");
  const [performedAt, setPerformedAt] = useState(() => target ? `${target.date <= localDateKey() ? target.date : localDateKey()}T${datetimeLocalValue().slice(11)}` : datetimeLocalValue());
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState<Record<string, { result: TreatmentControlResult | ""; note: string }>>({});
  const [didTreatment, setDidTreatment] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/treatment/options", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { options?: TreatmentProductOption[]; error?: string };
        if (!response.ok || !payload.options) throw new Error(payload.error ?? "No se pudieron cargar las opciones.");
        setOptions(payload.options);
        if (!target) setProductId(payload.options.find((option) => option.pending > 0)?.product.id ?? "");
      })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setFormError(caught instanceof Error ? markingCopy(caught.message) : "No se pudo cargar el registro de HT."); });
    return () => controller.abort();
  }, [target]);

  const productOption = options.find((option) => option.product.id === productId);
  const destination: TreatmentDestination | undefined = plannedEntry
    ? productOption?.destinations.find((item) => item.orderLineId === plannedEntry.lineId)
    : productOption?.destinations.find((item) => item.key === destinationKey) ?? productOption?.destinations[0];
  const numericQuantity = Number(quantity) || 0;
  const hasFailure = Object.values(checks).some((check) => check.result === "fail");

  useEffect(() => {
    const next = Object.fromEntries((destination?.controls ?? []).map((control) => [String(control.id), { result: "" as const, note: "" }]));
    const timer = window.setTimeout(() => setChecks(next), 0);
    return () => window.clearTimeout(timer);
  }, [destination?.key, destination?.controls]);

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
        onSaved(plannedEntry.lineId);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "No se pudo registrar el resultado.");
      } finally { setSaving(false); }
      return;
    }
    if (!productOption || !destination) { setFormError("Seleccione producto y destino."); return; }
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) { setFormError("Indique una cantidad mayor a cero."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/treatment/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        productId,
        clientProductId: destination.clientProductId,
        orderLineId: destination.orderLineId,
        quantity: numericQuantity,
        performedAt: new Date(`${performedAt}:00-03:00`).toISOString(),
        responsible,
        note: note.trim() || (destination.key === "general" ? "Stock general" : hasFailure ? "No conforme" : ""),
        controls: destination.controls.filter((control) => checks[String(control.id)]?.result).map((control) => ({ controlId: control.id, result: checks[String(control.id)]?.result, note: checks[String(control.id)]?.note })),
      }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo registrar el HT.");
      onSaved(destination.orderLineId);
    } catch (error) {
      setFormError(error instanceof Error ? markingCopy(error.message) : "No se pudo registrar el HT.");
    } finally { setSaving(false); }
  };

  return <ModalShell title={plannedEntry ? "Registrar HT real" : "Registrar HT"} className="treatment-entry-modal" onClose={() => { if (!saving) onClose(); }}><form className="treatment-entry production-result-form" onSubmit={submit}>
      {plannedEntry && <>
        <div className="production-result-plan"><strong>{plannedEntry.product}</strong><span>{plannedEntry.client}</span><span>Planificado: {number.format(plannedEntry.planned)} unidades para el {plannedEntry.date}</span></div>
        {!plannedEntry.actual && !plannedEntry.missed && <fieldset className="production-result-choice">
          <legend>¿Qué ocurrió?</legend>
          <button type="button" className={didTreatment ? "selected" : ""} aria-pressed={didTreatment} onClick={() => { setDidTreatment(true); setFormError(""); }}>Se hizo HT</button>
          <button type="button" className={!didTreatment ? "selected" : ""} aria-pressed={!didTreatment} onClick={() => { setDidTreatment(false); setFormError(""); }}>No se hizo</button>
        </fieldset>}
      </>}
      {didTreatment && !plannedEntry && <>
        <label>Producto<select required value={productId} onChange={(event) => { setProductId(event.target.value); setDestinationKey("general"); }}><option value="" disabled>Seleccionar producto</option>{options.filter((option) => option.pending > 0).map((option) => <option key={option.product.id} value={option.product.id}>{option.label} ({number.format(option.pending)} pendientes)</option>)}</select></label>
        <label>Destino<select value={destination?.key ?? "general"} onChange={(event) => setDestinationKey(event.target.value)}>{productOption?.destinations.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      </>}
      <label>Fecha real<input required type="date" value={performedAt.slice(0, 10)} max={localDateKey()} onChange={(event) => setPerformedAt(event.target.value ? `${event.target.value}T${performedAt.slice(11) || "12:00"}` : "")} /></label>
      {didTreatment && <label>{plannedEntry ? "Unidades tratadas" : "Unidades"}<input required min={1} step={1} inputMode="numeric" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>}
      {destination && (destination.primaryAsset || destination.controls.length > 0) ? <details className="treatment-entry-controls"><summary><span><strong>Plano y puntos de control</strong><small>{destination.controls.length ? `${destination.controls.length} controles para revisar` : "Referencia visual del producto"}</small></span><FileCheck2 size={18} /></summary><div>{destination.primaryAsset && <div className="treatment-asset"><div><ImageIcon size={18} /><span><strong>Plano o foto principal</strong><small>{destination.primaryAsset.altText}</small></span></div>{destination.primaryAsset.mimeType === "application/pdf" ? <a href={destination.primaryAsset.url} target="_blank" rel="noreferrer">Abrir plano PDF</a> : <img src={destination.primaryAsset.url} alt={destination.primaryAsset.altText} loading="lazy" />}</div>}{destination.controls.length > 0 && <fieldset className="treatment-controls"><legend><FileCheck2 size={17} />Puntos de control</legend>{destination.controls.map((control) => { const check = checks[String(control.id)] ?? { result: "", note: "" }; return <div key={control.id} className={check.result === "fail" ? "failed" : ""}><strong>{control.title}</strong>{control.detail && <small>{control.detail}</small>}<div className="treatment-control-result"><button type="button" className={check.result === "pass" ? "selected pass" : ""} aria-pressed={check.result === "pass"} onClick={() => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, result: "pass" } }))}>Conforme</button><button type="button" className={check.result === "fail" ? "selected fail" : ""} aria-pressed={check.result === "fail"} onClick={() => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, result: "fail" } }))}>No conforme</button></div>{check.result === "fail" && <label>Observación obligatoria<textarea rows={2} value={check.note} onChange={(event) => setChecks((current) => ({ ...current, [String(control.id)]: { ...check, note: event.target.value } }))} /></label>}</div>; })}</fieldset>}</div></details> : null}
      <label>Observación opcional<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {plannedEntry && didTreatment && numericQuantity > 0 && numericQuantity < plannedEntry.planned - plannedEntry.actual && <p className="production-result-balance">Faltarán {number.format(plannedEntry.planned - plannedEntry.actual - numericQuantity)} unidades.</p>}
      <FieldError id="marking-form-error">{formError}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button treatment-submit" loading={saving} error={Boolean(formError)}>Guardar resultado</AsyncButton></div>
    </form></ModalShell>;
}
