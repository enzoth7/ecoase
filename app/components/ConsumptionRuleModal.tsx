"use client";

import { useState, type FormEvent } from "react";
import type { Client } from "../data";
import { AsyncButton, FieldError, ModalShell } from "./ui";

export default function ConsumptionRuleModal({ productId, clients = [], fixedClient, onClose, onSaved }: { productId: string; clients?: Client[]; fixedClient?: Pick<Client, "id" | "name">; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/stock/consumption", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, clientId: fixedClient?.id ?? form.get("clientId"), dailyConsumption: Number(form.get("dailyConsumption")), workdaysPerWeek: Number(form.get("workdaysPerWeek")), safetyStock: Number(form.get("safetyStock")), validFrom: form.get("validFrom"), validTo: form.get("validTo") || undefined, source: form.get("source"), note: form.get("note") }) });
    const payload = await response.json() as { error?: string }; setSaving(false);
    if (!response.ok) return setError(payload.error ?? "No se pudo guardar el consumo.");
    onSaved();
  };
  return <ModalShell title="Nueva regla de consumo" description="Esta información se comparte entre Clientes y Stock." onClose={onClose}><form className="stock-action-form" onSubmit={submit}>
    {fixedClient ? <div className="field-wide consumption-client-context"><small>Cliente</small><strong>{fixedClient.name}</strong></div> : <label className="field-wide">Cliente<select name="clientId" required defaultValue=""><option value="" disabled>Seleccionar cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>}
    <label>Consumo diario<input name="dailyConsumption" type="number" min="0" step="0.01" required /></label><label>Días laborables/semana<input name="workdaysPerWeek" type="number" min="1" max="7" step="1" defaultValue="5" required /></label><label>Stock de seguridad<input name="safetyStock" type="number" min="0" step="1" defaultValue="0" required /></label><label>Vigente desde<input name="validFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Vigente hasta<input name="validTo" type="date" /></label><label>Fuente<input name="source" placeholder="Cliente, reunión, planilla…" required /></label><label className="field-wide">Observación<textarea name="note" rows={2} /></label><FieldError id="stock-consumption-error">{error}</FieldError><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><AsyncButton type="submit" className="primary-button" loading={saving}>Guardar consumo</AsyncButton></div>
  </form></ModalShell>;
}
