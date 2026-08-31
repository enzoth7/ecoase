"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useCallback,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

export function ConfirmDialog({ title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar", destructive = false, onConfirm, onCancel }: { title: string; description: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return <div className="confirm-dialog-backdrop" role="presentation"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description"><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p><div><button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button><button type="button" className={destructive ? "delete-button" : "primary-button"} onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
}

export function ModalShell({ title, description, children, onClose, className = "", initialFocusRef, dirty = false, closeLabel = "Cerrar" }: { title: string; description?: string; children: ReactNode; onClose: () => void; className?: string; initialFocusRef?: RefObject<HTMLElement | null>; dirty?: boolean; closeLabel?: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = useCallback(() => dirty ? setConfirmDiscard(true) : onClose(), [dirty, onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTarget = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])");
    window.requestAnimationFrame(() => focusTarget?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [initialFocusRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}><section ref={dialogRef} className={`modal-shell ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}><div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{description && <small id={descriptionId}>{description}</small>}</div><button type="button" onClick={requestClose} aria-label={closeLabel}><X size={18} aria-hidden="true" /></button></div>{children}</section>{confirmDiscard && <ConfirmDialog title="¿Descartar los cambios?" description="Los datos ingresados todavía no se guardaron." confirmLabel="Descartar" destructive onCancel={() => setConfirmDiscard(false)} onConfirm={onClose} />}</div>;
}

export function AsyncButton({ loading = false, success = false, error = false, loadingLabel = "Guardando…", children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; success?: boolean; error?: boolean; loadingLabel?: string }) {
  return <button {...props} disabled={disabled || loading} aria-busy={loading || undefined}>{loading ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />{loadingLabel}</> : success ? <><CheckCircle2 size={16} aria-hidden="true" />Guardado</> : error ? <><AlertCircle size={16} aria-hidden="true" />Reintentar</> : children}</button>;
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return <p id={id} className="field-error" role="alert"><AlertCircle size={14} aria-hidden="true" />{children}</p>;
}

export type EntityOption = { value: string; label: string; disabled?: boolean };
export function EntitySelect({ label, name, value, defaultValue, options, onChange, required, loading = false, emptyLabel = "No hay opciones", searchable = false, error, inputRef }: { label: string; name: string; value?: string; defaultValue?: string; options: EntityOption[]; onChange?: (value: string) => void; required?: boolean; loading?: boolean; emptyLabel?: string; searchable?: boolean; error?: string; inputRef?: RefObject<HTMLSelectElement | null> }) {
  const id = useId();
  const errorId = `${id}-error`;
  const [query, setQuery] = useState("");
  const visible = useMemo(() => options.filter((option) => option.label.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"))), [options, query]);
  return <label className="entity-select" htmlFor={id}><span>{label}{required && <em aria-hidden="true"> *</em>}</span>{searchable && options.length > 8 && <span className="entity-select-search"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${label.toLocaleLowerCase("es")}`} aria-label={`Buscar ${label.toLocaleLowerCase("es")}`} /></span>}<select ref={inputRef} id={id} name={name} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={(event) => onChange?.(event.target.value)} required={required} disabled={loading} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}><option value="" disabled>{loading ? "Cargando…" : visible.length ? "Seleccionar" : emptyLabel}</option>{visible.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select><FieldError id={errorId}>{error}</FieldError></label>;
}

export function WeekNavigator({ label, onPrevious, onNext }: { label: string; onPrevious: () => void; onNext: () => void }) {
  return <div className="calendar-week-controls" aria-label="Navegación semanal"><button type="button" onClick={onPrevious} aria-label="Semana anterior"><ChevronLeft size={18} aria-hidden="true" /></button><strong aria-live="polite">{label}</strong><button type="button" onClick={onNext} aria-label="Semana siguiente"><ChevronRight size={18} aria-hidden="true" /></button></div>;
}

export function StatusBadge({ label, tone = "neutral", icon: Icon }: { label: string; tone?: string; icon?: LucideIcon }) {
  return <span className={`status-badge ${tone}`}>{Icon && <Icon size={14} aria-hidden="true" />}{label}</span>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><Icon size={28} aria-hidden="true" /><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}

export function LoadingState({ label = "Cargando…", rows = 3 }: { label?: string; rows?: number }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, index) => <i key={index} aria-hidden="true" />)}</div>;
}

export function MetricCard({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "danger" | "success" | "warning" }) {
  return <div className={`capacity-metric ${tone === "neutral" ? "" : tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function CapacityMeter({ value, maximum, label }: { value: number; maximum?: number; label: string }) {
  const percentage = maximum && maximum > 0 ? Math.min(Math.round(value / maximum * 100), 100) : 0;
  const overloaded = maximum !== undefined && value > maximum;
  return <div className={`capacity-meter ${overloaded ? "danger" : ""}`}><div><span>{label}</span><strong>{maximum === undefined ? `${value} / sin definir` : `${value} / ${maximum}`}</strong></div><div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={maximum ?? Math.max(value, 1)} aria-valuenow={value}><i style={{ width: `${percentage}%` }} /></div>{overloaded && <small><AlertCircle size={13} aria-hidden="true" />Sobrecarga de {value - maximum!}</small>}</div>;
}
