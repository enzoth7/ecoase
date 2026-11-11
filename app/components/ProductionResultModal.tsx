import { useState, type FormEvent } from "react";
import type { ProductionAssignmentSummary } from "../production-capacity";
import { AsyncButton, FieldError, ModalShell } from "./ui";

const number = new Intl.NumberFormat("es-UY");

export type RecordedProductionResult = {
  actualQuantity: number;
  actualDate: string;
  resultDestination?: "client" | "stock";
  completionNote?: string;
};

export default function ProductionResultModal({ assignment, onClose, onSaved }: { assignment: ProductionAssignmentSummary; onClose: () => void; onSaved: (result: RecordedProductionResult) => Promise<void> }) {
  const [produced, setProduced] = useState(true);
  const [quantity, setQuantity] = useState(String(assignment.plannedQuantity));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [date, setDate] = useState(() => assignment.plannedDate <= today ? assignment.plannedDate : today);
  const [destination, setDestination] = useState<"client" | "stock">("client");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const actual = produced ? Number(quantity) : 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (produced && (!Number.isInteger(actual) || actual <= 0)) { setError("Indique cuántas unidades se produjeron."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/production-allocations/${assignment.id}/result`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ actualQuantity: actual, actualDate: date, destination: produced ? destination : undefined, note }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo registrar el resultado.");
      await onSaved({ actualQuantity: actual, actualDate: date, resultDestination: produced ? destination : undefined, completionNote: note.trim() || undefined });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo registrar el resultado.");
    } finally {
      setSaving(false);
    }
  };

  return <ModalShell title="Registrar producción real" onClose={onClose}>
    <form className="production-result-form" onSubmit={submit}>
      <div className="production-result-plan">
        <strong>{assignment.productName}</strong>
        <span>{assignment.client}</span>
        <span>Planificado: {number.format(assignment.plannedQuantity)} unidades para el {assignment.plannedDate}</span>
      </div>
      <fieldset className="production-result-choice">
        <legend>¿Qué ocurrió?</legend>
        <button type="button" className={produced ? "selected" : ""} aria-pressed={produced} onClick={() => setProduced(true)}>Se produjo</button>
        <button type="button" className={!produced ? "selected" : ""} aria-pressed={!produced} onClick={() => setProduced(false)}>No se produjo</button>
      </fieldset>
      <label>Fecha real<input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} required /></label>
      {produced && <>
        <label>Unidades producidas<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <fieldset className="production-result-choice">
          <legend>Asignación del stock producido</legend>
          <button type="button" className={destination === "client" ? "selected" : ""} aria-pressed={destination === "client"} onClick={() => setDestination("client")}>Para {assignment.client}</button>
          <button type="button" className={destination === "stock" ? "selected" : ""} aria-pressed={destination === "stock"} onClick={() => setDestination("stock")}>Stock general</button>
        </fieldset>
      </>}
      <label>Observación opcional<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {actual < assignment.plannedQuantity && <p className="production-result-balance">Faltaron {number.format(assignment.plannedQuantity - actual)} unidades de esta asignación.</p>}
      {produced && <p className="production-result-balance">Toda la producción entra al stock físico. {destination === "client" ? `Estas unidades quedan asignadas a ${assignment.client}.` : "Estas unidades quedan sin asignar a un pedido."}</p>}
      <FieldError id="production-result-error">{error}</FieldError>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar resultado</AsyncButton></div>
    </form>
  </ModalShell>;
}
