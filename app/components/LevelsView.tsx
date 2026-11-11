"use client";

import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import type { ProductLevel } from "../classification";
import { AsyncButton, ConfirmDialog, FieldError } from "./ui";

type DraftLevel = { key: string; id?: string; label: string; options: string[]; system: boolean };
type Usage = Record<string, Record<string, number>>;

const minimumRows = 12;
const toDraft = (levels: ProductLevel[]): DraftLevel[] => levels.map((level) => ({ key: level.id, id: level.id, label: level.label, options: [...level.options], system: level.system }));
/** Lo que se guarda: nombre y opciones sin celdas vacías. */
const payloadOf = (levels: DraftLevel[]) => levels.map((level) => ({ id: level.id, label: level.label.trim(), options: level.options.map((option) => option.trim()).filter(Boolean) }));

/** Tabla estilo planilla: cada columna es un nivel y cada fila, una opción de ese nivel. */
export default function LevelsView({ levels, onSaved }: { levels: ProductLevel[]; onSaved: (levels: ProductLevel[]) => void }) {
  const [saved, setSaved] = useState<DraftLevel[]>(() => toDraft(levels));
  const [draft, setDraft] = useState<DraftLevel[]>(() => toDraft(levels));
  const [usage, setUsage] = useState<Usage>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/product-levels").then(async (response) => {
      const payload = await response.json() as { levels?: ProductLevel[]; usage?: Usage; error?: string };
      if (!active || !response.ok || !payload.levels) return;
      setSaved(toDraft(payload.levels));
      setDraft(toDraft(payload.levels));
      setUsage(payload.usage ?? {});
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const dirty = useMemo(() => JSON.stringify(payloadOf(draft)) !== JSON.stringify(payloadOf(saved)), [draft, saved]);
  const rows = Math.max(minimumRows, ...draft.map((level) => level.options.length + 1));

  const focusCell = (column: number, row: number) => {
    const input = document.querySelector<HTMLInputElement>(`[data-cell="${column}:${row}"]`);
    input?.focus();
    input?.select();
  };

  const setCell = (column: number, row: number, value: string) => {
    setMessage("");
    setDraft((current) => current.map((level, index) => {
      if (index !== column) return level;
      const options = [...level.options];
      while (options.length <= row) options.push("");
      options[row] = value;
      return { ...level, options };
    }));
  };

  /** Pegar varias filas (y columnas) desde una planilla las reparte a partir de la celda elegida. */
  const pasteCells = (column: number, row: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!/[\n\t]/.test(text)) return;
    event.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n");
    if (lines.at(-1) === "") lines.pop();
    setMessage("");
    setDraft((current) => {
      const next = current.map((level) => ({ ...level, options: [...level.options] }));
      lines.forEach((line, lineIndex) => line.split("\t").forEach((cell, cellIndex) => {
        const level = next[column + cellIndex];
        if (!level) return;
        while (level.options.length <= row + lineIndex) level.options.push("");
        level.options[row + lineIndex] = cell.trim();
      }));
      return next;
    });
  };

  const navigate = (column: number, row: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "ArrowDown") { event.preventDefault(); focusCell(column, row + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusCell(column, Math.max(row - 1, 0)); }
  };

  const setLabel = (column: number, label: string) => { setMessage(""); setDraft((current) => current.map((level, index) => index === column ? { ...level, label } : level)); };

  const moveLevel = (column: number, delta: number) => {
    setMessage("");
    setDraft((current) => {
      const target = column + delta;
      if (column < 1 || target < 1 || target >= current.length) return current;
      const next = [...current];
      [next[column], next[target]] = [next[target], next[column]];
      return next;
    });
  };

  const addLevel = () => {
    setMessage("");
    setDraft((current) => [...current, { key: `nuevo-${crypto.randomUUID()}`, label: "", options: [], system: false }]);
    window.setTimeout(() => document.querySelectorAll<HTMLInputElement>("[data-level-label]").item(document.querySelectorAll("[data-level-label]").length - 1)?.focus(), 0);
  };

  const totalUse = (level: DraftLevel) => Object.values(usage[level.id ?? ""] ?? {}).reduce((sum, count) => sum + count, 0);

  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/product-levels", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ levels: payloadOf(draft) }) });
      const payload = await response.json() as { levels?: ProductLevel[]; usage?: Usage; error?: string };
      if (!response.ok || !payload.levels) throw new Error(payload.error ?? "No se pudieron guardar los niveles.");
      setSaved(toDraft(payload.levels));
      setDraft(toDraft(payload.levels));
      setUsage(payload.usage ?? {});
      onSaved(payload.levels);
      setMessage("Cambios guardados.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron guardar los niveles.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="module-surface levels-surface" aria-labelledby="levels-title">
      <div className="module-toolbar levels-toolbar">
        <div>
          <h2 id="levels-title">Niveles</h2>
        </div>
        <div className="module-toolbar-actions">
          <button type="button" className="secondary-button" onClick={addLevel}><Plus size={16} aria-hidden="true" />Agregar nivel</button>
          <button type="button" className="secondary-button" disabled={!dirty || saving} onClick={() => { setDraft(saved); setError(""); setMessage(""); }}>Descartar</button>
          <AsyncButton type="button" className="add-order-button" loading={saving} loadingLabel="Guardando…" disabled={!dirty} onClick={() => void save()}>Guardar cambios</AsyncButton>
        </div>
      </div>
      <FieldError id="levels-error">{error}</FieldError>
      {message && <p className="levels-message" role="status">{message}</p>}
      <div className="levels-scroll">
        <table className="levels-sheet">
          <thead>
            <tr>
              <th className="row-number" scope="col"><span className="sr-only">Fila</span></th>
              {draft.map((level, column) => (
                <th key={level.key} scope="col">
                  <div className="level-head">
                    <input data-level-label value={level.label} style={{ width: `calc(${Math.max(6, level.label.length + 2)}ch + 20px)` }} onChange={(event) => setLabel(column, event.target.value)} placeholder="Nombre del nivel" aria-label={`Nombre del nivel ${column + 1}`} />
                    <span className="level-tools">
                      {column > 0 && <button type="button" onClick={() => moveLevel(column, -1)} disabled={column < 2} aria-label={`Mover ${level.label || "el nivel"} a la izquierda`}><ArrowLeft size={14} aria-hidden="true" /></button>}
                      {column > 0 && <button type="button" onClick={() => moveLevel(column, 1)} disabled={column === draft.length - 1} aria-label={`Mover ${level.label || "el nivel"} a la derecha`}><ArrowRight size={14} aria-hidden="true" /></button>}
                      {!level.system && <button type="button" onClick={() => (level.id ? setRemoving(column) : setDraft((current) => current.filter((_, index) => index !== column)))} aria-label={`Eliminar ${level.label || "el nivel"}`}><Trash2 size={14} aria-hidden="true" /></button>}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                <th className="row-number" scope="row">{row + 1}</th>
                {draft.map((level, column) => {
                  const value = level.options[row] ?? "";
                  const count = value ? usage[level.id ?? ""]?.[value.toLocaleLowerCase("es")] ?? 0 : 0;
                  return (
                    <td key={level.key}>
                      <input data-cell={`${column}:${row}`} value={value} onChange={(event) => setCell(column, row, event.target.value)} onPaste={pasteCells(column, row)} onKeyDown={navigate(column, row)} aria-label={`${level.label || "Nivel nuevo"}, opción ${row + 1}`} autoComplete="off" />
                      {count > 0 && <span className="cell-usage" title={`${count} ${count === 1 ? "producto lo usa" : "productos lo usan"}`}>{count}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {removing !== null && draft[removing] && (
        <ConfirmDialog
          title={`¿Eliminar el nivel «${draft[removing].label || "sin nombre"}»?`}
          description={totalUse(draft[removing]) > 0 ? `${totalUse(draft[removing])} productos tienen un valor en este nivel, así que no se va a poder guardar el cambio.` : "Se quita la columna con sus opciones. Se aplica al guardar."}
          confirmLabel="Eliminar nivel"
          destructive
          onCancel={() => setRemoving(null)}
          onConfirm={() => { setDraft((current) => current.filter((_, index) => index !== removing)); setRemoving(null); setMessage(""); }}
        />
      )}
    </section>
  );
}
