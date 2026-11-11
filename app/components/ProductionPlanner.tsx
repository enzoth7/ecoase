"use client";

import { AlertTriangle, CalendarRange, Check, CheckCircle2, ChevronDown, Factory, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { CapacitySnapshot } from "../capacity";
import { getOrderPlannedDate, type OperationOrder, type OrderLine, type Product } from "../data";
import type { ProductLevel } from "../classification";
import { productLabel } from "../master-data";
import type { ProductionAssignmentSummary, ProductionCapacityRule, ProductionResource } from "../production-capacity";
import { canProduceProductKind } from "../production-resource-applicability";
import { AsyncButton, EmptyState, FieldError, LoadingState, ModalShell, WeekNavigator } from "./ui";

const number = new Intl.NumberFormat("es-UY");

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseDate(key: string) { return new Date(`${key}T12:00:00`); }
function startOfWeek(date: Date) { const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()); value.setDate(value.getDate() - (value.getDay() + 6) % 7); return value; }
function weekDays(start: Date, count = 7) { return Array.from({ length: count }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return dateKey(date); }); }
function formatRange(days: string[]) { return `${shortDate(days[0])} – ${shortDate(days.at(-1)!)}`; }
function shortDate(key: string) { return new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" }).format(parseDate(key)); }
function weekdayLabel(key: string) { const label = new Intl.DateTimeFormat("es-UY", { weekday: "short" }).format(parseDate(key)).replace(".", ""); return label.charAt(0).toLocaleUpperCase("es") + label.slice(1); }
function sameId(left: number | string | undefined, right: number | string | undefined) { return left !== undefined && right !== undefined && String(left) === String(right); }
function resourceKind(resource: ProductionResource) { return resource.resourceType === "internal_factory" ? "Fábrica" : resource.resourceType === "internal_crew" ? "Cuadrilla" : "Externo"; }

function assignmentResult(assignment: ProductionAssignmentSummary) {
  if (assignment.status !== "completed") return null;
  if ((assignment.actualQuantity ?? 0) === 0) return { state: "not-produced", label: "No se produjo" };
  if (assignment.resultDestination === "stock") return { state: "stock", label: "Stock general" };
  return { state: "client", label: "Para el cliente" };
}

export function productionRangeLabel(order: OperationOrder) {
  if (order.productionDefined === false || !order.productionDate) return "Sin definir";
  const end = order.productionEndDate ?? order.productionDate;
  return end === order.productionDate ? shortDate(order.productionDate) : `${shortDate(order.productionDate)} → ${shortDate(end)}`;
}

function plannedOrderProgress(order: OperationOrder) {
  return order.lines.reduce((progress, line) => {
    const produced = (line.productionAllocations ?? []).reduce((sum, allocation) => sum + (allocation.status === "completed" ? Math.max(allocation.actualQuantity ?? 0, 0) : 0), 0);
    const scheduled = (line.productionAllocations ?? []).reduce((sum, allocation) => sum + (allocation.status === "draft" || allocation.status === "confirmed" ? allocation.plannedQuantity : 0), 0);
    progress.produced += produced;
    progress.pending += Math.max(line.quantity - produced, 0);
    progress.toSchedule += Math.max(line.quantity - produced - scheduled, 0);
    return progress;
  }, { produced: 0, pending: 0, toSchedule: 0 });
}

function useCapacity(from: string, to: string, refreshKey = 0) {
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/capacity?from=${from}&to=${to}`);
      const body = await response.json() as { capacity?: CapacitySnapshot; error?: string };
      if (!response.ok || !body.capacity) throw new Error(body.error ?? "No se pudo cargar la capacidad.");
      setCapacity(body.capacity);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar la capacidad."); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load, refreshKey]);
  return { capacity, error, loading, load };
}

type CellLoad = { status: "free" | "ok" | "stretched" | "over" | "missing"; percent?: number; normal?: number; maximum?: number; committed: number };

function ruleFor(rules: ProductionCapacityRule[], resourceId: number | string, clientProductId: number | string | undefined, date: string) {
  if (!clientProductId) return undefined;
  return rules
    .filter((rule) => sameId(rule.resourceId, resourceId) && sameId(rule.clientProductId, clientProductId) && rule.validFrom <= date && (!rule.validTo || rule.validTo >= date))
    .sort((left, right) => right.normalUnitsPerDay - left.normalUnitsPerDay)[0];
}

/** Carga de un recurso en un día: lo ya comprometido por otros pedidos más lo que se está planificando. */
function cellLoad(capacity: CapacitySnapshot, resource: ProductionResource, date: string, excludeOrderId: string | undefined, planned: Array<{ clientProductId?: number | string; quantity: number }>): CellLoad {
  const day = capacity.production.days.find((item) => item.date === date);
  const entry = day?.resources.find((item) => sameId(item.resource.id, resource.id));
  const others = (entry?.assignments ?? []).filter((assignment) => assignment.orderId !== excludeOrderId);
  let normalLoad = 0; let maximumLoad = 0; let missing = false;
  for (const assignment of others) {
    if (!assignment.normalUnitsPerDay || !assignment.maximumUnitsPerDay) { missing = true; continue; }
    normalLoad += (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.normalUnitsPerDay;
    maximumLoad += (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.maximumUnitsPerDay;
  }
  let normalReference: number | undefined; let maximumReference: number | undefined;
  for (const item of planned) {
    if (item.quantity <= 0) continue;
    const rule = ruleFor(capacity.production.rules, resource.id, item.clientProductId, date);
    if (!rule) { missing = true; continue; }
    normalReference ??= rule.normalUnitsPerDay; maximumReference ??= rule.maximumUnitsPerDay;
    normalLoad += item.quantity / rule.normalUnitsPerDay;
    maximumLoad += item.quantity / rule.maximumUnitsPerDay;
  }
  const committed = others.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity), 0) + planned.reduce((sum, item) => sum + Math.max(item.quantity, 0), 0);
  if (missing) return { status: "missing", committed };
  if (committed === 0) return { status: "free", committed, normal: normalReference, maximum: maximumReference, percent: 0 };
  const percent = Math.round(normalLoad * 100);
  return { status: maximumLoad > 1.0000001 ? "over" : normalLoad > 1.0000001 ? "stretched" : "ok", percent, committed, normal: normalReference, maximum: maximumReference };
}

const loadCopy: Record<CellLoad["status"], string> = { free: "Libre", ok: "Dentro del límite", stretched: "Sobre lo normal", over: "Límite superado", missing: "Sin regla de capacidad" };

function boardQuantityLabel(assignment: ProductionAssignmentSummary, quantity = assignment.plannedQuantity) {
  return `${number.format(quantity)}\u00a0u. | ${assignment.client}`;
}

export function setBoardDragImage(event: DragEvent<HTMLButtonElement>, productName: string, quantityLabel: string) {
  const image = document.createElement("div");
  image.className = "board-drag-image";
  const product = document.createElement("strong");
  product.textContent = productName;
  const quantity = document.createElement("small");
  quantity.textContent = quantityLabel;
  image.append(product, quantity);
  const origin = event.currentTarget.getBoundingClientRect();
  image.style.left = `${origin.left}px`;
  image.style.top = `${origin.top}px`;
  document.body.append(image);
  event.dataTransfer.setDragImage(image, 24, 20);
  window.requestAnimationFrame(() => image.remove());
}

/** Calendario interno: columnas = días, filas = quién produce. */
export function ProductionBoard({ capacity, days, products, highlightOrderId, onSelectAssignment, onMoveAssignment }: { capacity: CapacitySnapshot; days: string[]; products: Product[]; highlightOrderId?: string; onSelectAssignment?: (assignment: ProductionAssignmentSummary, resource: ProductionResource, day: string) => void; onMoveAssignment?: (id: number | string, day: string) => Promise<void> }) {
  const resources = capacity.production.resources.filter((resource) => resource.active);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const fullProductName = (assignment: ProductionAssignmentSummary) => {
    const product = assignment.productId === undefined ? undefined : productsById.get(assignment.productId);
    return product ? productLabel(product) : assignment.productName;
  };
  const today = dateKey(new Date());
  const lastDrag = useRef(0);
  const dropInProgress = useRef(false);
  const [dragging, setDragging] = useState<{ assignment: ProductionAssignmentSummary; resourceId: string; fromDay: string } | null>(null);
  const [target, setTarget] = useState<{ resourceId: string; day: string } | null>(null);
  const [savingDrop, setSavingDrop] = useState(false);
  const dayTotals = days.map((day) => ({ day, total: capacity.production.days.find((item) => item.date === day)?.resources.reduce((sum, resource) => sum + resource.assignments.reduce((quantity, assignment) => quantity + assignment.plannedQuantity, 0), 0) ?? 0 }));
  const producedDayTotals = days.map((day) => ({ day, total: capacity.production.days.find((item) => item.date === day)?.producedQuantity ?? 0 }));
  const normalDayTotals = days.map((day) => {
    const resourceDays = capacity.production.days.find((item) => item.date === day)?.resources ?? [];
    const missing = resourceDays.filter((entry) => entry.assignments.length > 0 && entry.normalLoad === undefined).length;
    const used = resourceDays.reduce((sum, entry) => sum + (entry.normalLoad ?? 0), 0);
    return { day, missing, used, available: resources.length, percent: missing || !resources.length ? undefined : Math.round(used / resources.length * 100) };
  });
  return <div className="production-board-wrap"><table className="production-board">
    <thead><tr><th scope="col" className="production-board-corner">Quién produce</th>{days.map((day) => <th scope="col" key={day} className={`${day === today ? "today" : ""} ${target?.day === day ? "board-day-target" : ""}`}><span>{weekdayLabel(day)}</span><strong>{parseDate(day).getDate()}</strong></th>)}</tr></thead>
    <tbody>{resources.map((resource) => <tr key={resource.id}>
      <th scope="row"><strong>{resource.name}</strong><small>{resourceKind(resource)}</small></th>
      {days.map((day) => {
        const entry = capacity.production.days.find((item) => item.date === day)?.resources.find((item) => sameId(item.resource.id, resource.id));
        const assignments = entry?.assignments ?? [];
        const resultsComplete = assignments.length > 0 && assignments.every((assignment) => assignment.status === "completed");
        const percent = entry?.normalLoad === undefined ? undefined : entry.normalLoad > 1 ? Math.max(101, Math.round(entry.normalLoad * 100)) : Math.round(entry.normalLoad * 100);
        const tone = !assignments.length ? "free" : entry?.status === "overloaded" ? "over" : entry?.status === "stretched" ? "stretched" : entry?.status === "missing_rule" ? "missing" : "ok";
        const utilization = percent === undefined ? "missing" : percent > 100 ? "over" : percent === 100 ? "full" : "normal";
        const utilizationStyle = percent === undefined ? undefined : { "--load-hue": String(Math.round(140 * (1 - Math.min(percent, 100) / 100))) } as CSSProperties;
        const resourceId = String(resource.id);
        const isTarget = target?.resourceId === resourceId && target.day === day;
        return <td key={day} data-day={day} data-column-label={`${weekdayLabel(day)} ${parseDate(day).getDate()}`} data-load-percent={resultsComplete ? undefined : percent} data-load-state={resultsComplete ? "completed" : utilization} style={resultsComplete ? undefined : utilizationStyle} className={`load-${tone} board-utilization board-utilization-${utilization} ${resultsComplete ? "board-results-complete" : ""} ${day === today ? "today" : ""} ${isTarget ? "board-drop-target" : ""}`} onDragOver={(event) => {
          if (!dragging || dragging.resourceId !== resourceId || dragging.fromDay === day || !onMoveAssignment) return;
          event.preventDefault(); event.dataTransfer.dropEffect = "move";
          if (!isTarget) setTarget({ resourceId, day });
        }} onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData("text/plain");
          if (!dragging || !onMoveAssignment || dragging.resourceId !== resourceId || dragging.fromDay === day || String(dragging.assignment.id) !== id) { setDragging(null); setTarget(null); return; }
          dropInProgress.current = true;
          setSavingDrop(true);
          setTarget({ resourceId, day });
          void onMoveAssignment(id, day).finally(() => { dropInProgress.current = false; setSavingDrop(false); setDragging(null); setTarget(null); });
        }}>
          {assignments.map((assignment) => {
            const result = assignmentResult(assignment);
            const shownQuantity = assignment.status === "completed" ? assignment.actualQuantity ?? 0 : assignment.plannedQuantity;
            const productName = fullProductName(assignment);
            const quantityLabel = boardQuantityLabel(assignment, shownQuantity);
            return <button type="button" key={assignment.id} data-allocation-id={assignment.id} data-result-state={result?.state} draggable={Boolean(onMoveAssignment && (assignment.status === "draft" || assignment.status === "confirmed"))} className={`board-chip ${assignment.orderId === highlightOrderId ? "highlight" : ""} ${assignment.status} ${result ? `board-chip-result-${result.state}` : ""} ${dragging && String(dragging.assignment.id) === String(assignment.id) ? "board-chip-dragging" : ""}`} onDragStart={(event) => { lastDrag.current = Date.now(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(assignment.id)); setBoardDragImage(event, productName, quantityLabel); setDragging({ assignment, resourceId, fromDay: day }); setTarget(null); }} onDragEnd={() => { lastDrag.current = Date.now(); if (!dropInProgress.current) { setDragging(null); setTarget(null); } }} onClick={() => { if (Date.now() - lastDrag.current > 500) onSelectAssignment?.(assignment, resource, day); }} aria-label={`${productName}, ${number.format(shownQuantity)} unidades, ${assignment.client}. ${result ? `${result.label}. ` : ""}Abrir detalle`} title="Abrir detalle del producto"><strong>{productName}</strong><span>{quantityLabel}</span>{result && <small className="board-chip-outcome">{result.label}</small>}</button>;
          })}
          {isTarget && dragging && <div className="board-chip-preview" aria-hidden="true"><strong>{fullProductName(dragging.assignment)}</strong><span>{boardQuantityLabel(dragging.assignment)}</span>{savingDrop && <small>Guardando…</small>}</div>}
          {!resultsComplete && <span className="board-load" aria-label={percent === undefined ? loadCopy.missing : `${percent}% de la capacidad normal`}>{percent === undefined ? "Sin regla" : `${percent}%`}</span>}
        </td>;
      })}
    </tr>)}</tbody>
    <tfoot>
      <tr className="board-total-row"><th scope="row">Total planificado a producir</th>{dayTotals.map(({ day, total }) => <td key={day} data-day={day} data-total={total} data-column-label={`${weekdayLabel(day)} ${parseDate(day).getDate()}`} aria-label={`${weekdayLabel(day)} ${parseDate(day).getDate()}: ${number.format(total)} ${total === 1 ? "palet" : "palets"} planificados`}><strong>{number.format(total)}</strong><small>{total === 1 ? "palet" : "palets"}</small></td>)}</tr>
      <tr className="board-produced-row"><th scope="row">Total producido</th>{producedDayTotals.map(({ day, total }) => <td key={day} data-day={day} data-produced-total={total} data-column-label={`${weekdayLabel(day)} ${parseDate(day).getDate()}`} aria-label={`${weekdayLabel(day)} ${parseDate(day).getDate()}: ${number.format(total)} ${total === 1 ? "palet" : "palets"} producidos`}><strong>{number.format(total)}</strong><small>{total === 1 ? "palet" : "palets"}</small></td>)}</tr>
      <tr className="board-capacity-row"><th scope="row">Uso de capacidad normal</th>{normalDayTotals.map(({ day, missing, percent }) => <td key={day} data-day={day} data-capacity-percent={percent} data-column-label={`${weekdayLabel(day)} ${parseDate(day).getDate()}`} style={percent === undefined ? undefined : { "--load-hue": String(Math.round(140 * (1 - Math.min(percent, 100) / 100))) } as CSSProperties} aria-label={missing ? `${weekdayLabel(day)} ${parseDate(day).getDate()}: capacidad sin calcular` : `${weekdayLabel(day)} ${parseDate(day).getDate()}: ${percent ?? 0}% de la capacidad normal utilizada`}><strong>{missing ? "Sin calcular" : `${percent ?? 0}%`}</strong></td>)}</tr>
    </tfoot>
  </table></div>;
}

type Step = 0 | 1 | 2 | 3;
const steps = ["Días", "Quién produce", "Cantidades", "Confirmar"];

function lineProductKind(line: OrderLine, products: Product[]) {
  const catalogKind = products.find((product) => product.id === line.productId)?.kind;
  if (catalogKind) return catalogKind;
  if (/^\s*pallets?\b/i.test(line.product)) return "Pallet";
  if (/^\s*bins?\b/i.test(line.product)) return "Bin";
  return undefined;
}

export function PlanProductionWizard({ order, products, pendingOnly = false, onClose, onSaved, onConfigure }: { order: OperationOrder; products: Product[]; pendingOnly?: boolean; onClose: () => void; onSaved: (order: OperationOrder) => void; onConfigure: (clientId: string, productIds: Array<number | string>, validFrom: string) => void }) {
  const existingDrafts = useMemo(() => order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status === "draft").map((item) => ({ line, item }))), [order.lines]);
  const fixed = useMemo(() => order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status === "confirmed" || item.status === "completed").map((item) => ({ line, item }))), [order.lines]);
  const initialAnchor = existingDrafts[0]?.item.plannedDate ?? (pendingOnly ? dateKey(new Date()) : order.productionDate ?? dateKey(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(parseDate(initialAnchor)));
  const [step, setStep] = useState<Step>(0);
  const [selectedDays, setSelectedDays] = useState<string[]>(() => [...new Set(existingDrafts.map(({ item }) => item.plannedDate))].sort());
  const [selectedResources, setSelectedResources] = useState<string[]>(() => [...new Set(existingDrafts.map(({ item }) => String(item.productionResourceId ?? item.resourceId ?? "")).filter(Boolean))]);
  const [lineId, setLineId] = useState(order.lines[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(existingDrafts.map(({ line, item }) => [`${line.id}|${String(item.productionResourceId ?? item.resourceId)}|${item.plannedDate}`, item.plannedQuantity])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const allDays = useMemo(() => [...new Set([...days, ...selectedDays])].sort(), [days, selectedDays]);
  const { capacity, error: capacityError } = useCapacity(allDays[0], allDays.at(-1)!);
  const resources = useMemo(() => (capacity?.production.resources ?? []).filter((resource) => resource.active && order.lines.some((line) => canProduceProductKind(resource, lineProductKind(line, products)))).sort((left, right) => Number(left.resourceType === "external_supplier") - Number(right.resourceType === "external_supplier") || left.displayOrder - right.displayOrder), [capacity, order.lines, products]);
  const resourceFitsLine = (resource: ProductionResource, line: OrderLine) => canProduceProductKind(resource, lineProductKind(line, products));
  const sortedDays = useMemo(() => [...selectedDays].sort(), [selectedDays]);
  const key = (line: string, resource: string, day: string) => `${line}|${resource}|${day}`;
  const fixedFor = (line: OrderLine) => Math.min(line.quantity, fixed.filter((entry) => entry.line.id === line.id).reduce((sum, entry) => sum + (entry.item.status === "completed" ? entry.item.actualQuantity ?? 0 : entry.item.plannedQuantity), 0));
  const assignedFor = (line: OrderLine) => sortedDays.reduce((sum, day) => sum + selectedResources.reduce((inner, resource) => inner + (quantities[key(line.id, resource, day)] ?? 0), 0), 0);
  const remainingFor = (line: OrderLine) => line.quantity - fixedFor(line) - assignedFor(line);
  const plannedAt = (resource: string, day: string) => order.lines.map((line) => ({ clientProductId: line.clientProductId, quantity: quantities[key(line.id, resource, day)] ?? 0 }));
  const currentLine = order.lines.find((line) => line.id === lineId) ?? order.lines[0];
  const toggleDay = (day: string) => setSelectedDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
  const toggleResource = (id: string) => setSelectedResources((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const autoDistribute = () => {
    if (!capacity || !selectedResources.length || !sortedDays.length) return;
    setQuantities((current) => {
      const next = { ...current };
      for (const line of order.lines) {
        for (const day of sortedDays) for (const resource of selectedResources) delete next[key(line.id, resource, day)];
        let remaining = line.quantity - fixedFor(line);
        const cells = sortedDays.flatMap((day) => selectedResources.filter((resourceId) => { const resource = resources.find((item) => String(item.id) === resourceId); return resource && resourceFitsLine(resource, line); }).map((resource) => ({ day, resource })));
        // Primero hasta el rendimiento normal de cada recurso, luego el resto en partes iguales.
        for (const cell of cells) {
          if (remaining <= 0) break;
          const resource = resources.find((item) => String(item.id) === cell.resource);
          const rule = resource ? ruleFor(capacity.production.rules, resource.id, line.clientProductId, cell.day) : undefined;
          const othersLoad = resource ? cellLoad(capacity, resource, cell.day, order.id, []) : undefined;
          const alreadyPlanned = order.lines.reduce((sum, item) => sum + (next[key(item.id, cell.resource, cell.day)] ?? 0), 0);
          const used = Math.round(((othersLoad?.percent ?? 0) / 100) * (rule?.normalUnitsPerDay ?? 0)) + alreadyPlanned;
          const room = rule ? Math.max(rule.normalUnitsPerDay - used, 0) : 0;
          const amount = Math.min(room, remaining);
          if (amount > 0) { next[key(line.id, cell.resource, cell.day)] = amount; remaining -= amount; }
        }
        if (remaining > 0 && cells.length) {
          const base = Math.floor(remaining / cells.length);
          cells.forEach((cell, index) => {
            const amount = base + (index < remaining % cells.length ? 1 : 0);
            if (amount > 0) next[key(line.id, cell.resource, cell.day)] = (next[key(line.id, cell.resource, cell.day)] ?? 0) + amount;
          });
          remaining = 0;
        }
      }
      return next;
    });
  };

  const problems = capacity ? sortedDays.flatMap((day) => selectedResources.map((resource) => { const item = resources.find((entry) => String(entry.id) === resource); const load = item ? cellLoad(capacity, item, day, order.id, plannedAt(resource, day)) : undefined; return load && (load.status === "over" || load.status === "missing") && load.committed > 0 && plannedAt(resource, day).some((entry) => entry.quantity > 0) ? { day, resource: item!, load } : null; }).filter((value): value is { day: string; resource: ProductionResource; load: CellLoad } => Boolean(value))) : [];
  const overAssigned = order.lines.some((line) => remainingFor(line) < 0);
  const totalAssigned = order.lines.reduce((sum, line) => sum + assignedFor(line), 0);
  const missingRuleProducts = capacity ? order.lines.filter((line) => sortedDays.some((day) => selectedResources.some((resourceId) => {
    const quantity = quantities[key(line.id, resourceId, day)] ?? 0;
    return quantity > 0 && !ruleFor(capacity.production.rules, resourceId, line.clientProductId, day);
  }))) : [];
  const canAdvance = step === 0 ? sortedDays.length > 0 : step === 1 ? selectedResources.length > 0 : step === 2 ? totalAssigned > 0 && !overAssigned : true;

  const save = async (configure = false) => {
    setSaving(true); setError("");
    const allocations = order.lines.flatMap((line) => sortedDays.flatMap((day) => selectedResources.map((resource) => ({ orderLineId: line.id, resourceId: resource, plannedDate: day, plannedQuantity: quantities[key(line.id, resource, day)] ?? 0 })))).filter((item) => item.plannedQuantity > 0);
    try {
      const response = await fetch(`/api/orders/${order.id}/production-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allocations }) });
      const body = await response.json() as { order?: OperationOrder; error?: string };
      if (!response.ok || !body.order) throw new Error(body.error ?? "No se pudo guardar la planificación.");
      onSaved(body.order);
      if (configure) onConfigure(order.clientId ?? "", missingRuleProducts.map((line) => line.clientProductId).filter((id): id is number | string => id !== undefined), sortedDays[0]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar la planificación."); }
    finally { setSaving(false); }
  };

  const progress = plannedOrderProgress(order);
  const quantityLabel = pendingOnly ? `${number.format(progress.toSchedule)} palets por planificar` : `${number.format(progress.pending)} palets por producir`;
  return <ModalShell title={pendingOnly ? "Planificar pendientes" : "Planificar producción"} description={`${order.client} · ${quantityLabel} · Entrega ${shortDate(getOrderPlannedDate(order))}`} className="plan-wizard-modal" onClose={onClose} dirty={totalAssigned > 0 && !saving}>
    <ol className="wizard-steps" aria-label="Pasos de la planificación">{steps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "done" : ""}><button type="button" onClick={() => index <= step && setStep(index as Step)} disabled={index > step}><span>{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{label}</button></li>)}</ol>
    <div className="wizard-layout">
      <div className="wizard-main">
        {capacityError && <FieldError id="wizard-capacity-error">{capacityError}</FieldError>}
        {!capacity && !capacityError && <LoadingState label="Cargando capacidad" rows={4} />}
        {capacity && step === 0 && <section className="wizard-section" aria-labelledby="wizard-days-title">
          <header><div><h3 id="wizard-days-title">¿Qué días se produce?</h3></div><WeekNavigator label={formatRange(days)} onPrevious={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() - 7); return next; })} onNext={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() + 7); return next; })} /></header>
          <div className="day-picker">{days.map((day) => { const selected = selectedDays.includes(day); const late = day > getOrderPlannedDate(order); return <button type="button" key={day} className={`${selected ? "selected" : ""} ${late ? "late" : ""}`} aria-pressed={selected} onClick={() => toggleDay(day)}><span>{weekdayLabel(day)}</span><strong>{parseDate(day).getDate()}</strong>{late && <small>Después de la entrega</small>}</button>; })}</div>
          {sortedDays.length > 0 && <p className="wizard-summary-line"><CalendarRange size={16} aria-hidden="true" />Rango de producción: <strong>{sortedDays.length === 1 ? shortDate(sortedDays[0]) : `${shortDate(sortedDays[0])} → ${shortDate(sortedDays.at(-1)!)}`}</strong> · {sortedDays.length} {sortedDays.length === 1 ? "día" : "días"}</p>}
        </section>}
        {capacity && step === 1 && <section className="wizard-section" aria-labelledby="wizard-resources-title">
          <header><div><h3 id="wizard-resources-title">¿Quién lo produce?</h3></div></header>
          <div className="resource-picker">{resources.map((resource) => { const id = String(resource.id); const selected = selectedResources.includes(id); const hasRule = order.lines.some((line) => sortedDays.some((day) => ruleFor(capacity.production.rules, resource.id, line.clientProductId, day))); return <button type="button" key={id} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleResource(id)}><span className="resource-picker-icon" aria-hidden="true">{resource.resourceType === "external_supplier" ? <Factory size={18} /> : <Users size={18} />}</span><span><strong>{resource.name}</strong><small>{resourceKind(resource)}{hasRule ? "" : " · sin regla para este producto"}</small></span>{selected && <CheckCircle2 size={18} aria-hidden="true" />}</button>; })}</div>
        </section>}
        {capacity && step === 2 && currentLine && <section className="wizard-section" aria-labelledby="wizard-quantities-title">
          <header><div><h3 id="wizard-quantities-title">¿Cuánto por día?</h3></div><button type="button" className="secondary-button" onClick={autoDistribute}>Repartir automáticamente</button></header>
          {pendingOnly && <p className="wizard-note">Faltan {number.format(order.lines.reduce((sum, line) => sum + Math.max(remainingFor(line), 0), 0))} palets por planificar.</p>}
          {order.lines.length > 1 && <div className="segmented" role="tablist" aria-label="Producto">{order.lines.map((line) => <button type="button" role="tab" key={line.id} aria-selected={line.id === currentLine.id} className={line.id === currentLine.id ? "active" : ""} onClick={() => setLineId(line.id)}>{line.product}<small>{number.format(Math.max(remainingFor(line), 0))} por asignar</small></button>)}</div>}
          <div className="quantity-grid-wrap"><table className="quantity-grid"><thead><tr><th scope="col">Recurso</th>{sortedDays.map((day) => <th scope="col" key={day}>{weekdayLabel(day)} {parseDate(day).getDate()}</th>)}</tr></thead><tbody>{selectedResources.map((resourceId) => { const resource = resources.find((item) => String(item.id) === resourceId); if (!resource || !resourceFitsLine(resource, currentLine)) return null; return <tr key={resourceId}><th scope="row">{resource.name}</th>{sortedDays.map((day) => { const rule = ruleFor(capacity.production.rules, resource.id, currentLine.clientProductId, day); const load = cellLoad(capacity, resource, day, order.id, plannedAt(resourceId, day)); return <td key={day} className={`load-${load.status}`}><input type="number" min="0" step="1" inputMode="numeric" aria-label={`${resource.name}, ${weekdayLabel(day)} ${parseDate(day).getDate()}`} value={quantities[key(currentLine.id, resourceId, day)] || ""} placeholder="0" onChange={(event) => setQuantities((current) => ({ ...current, [key(currentLine.id, resourceId, day)]: Math.max(Number(event.target.value) || 0, 0) }))} /><small>{rule ? `normal ${number.format(rule.normalUnitsPerDay)} · máx ${number.format(rule.maximumUnitsPerDay)}` : "Sin regla"}</small></td>; })}</tr>; })}</tbody></table></div>
          <div className="line-progress">{order.lines.map((line) => { const done = line.quantity - remainingFor(line); return <div key={line.id} className={remainingFor(line) < 0 ? "danger" : remainingFor(line) === 0 ? "complete" : ""}><span>{line.product}</span><div role="progressbar" aria-valuemin={0} aria-valuemax={line.quantity} aria-valuenow={done} aria-label={`Asignado de ${line.product}`}><i style={{ width: `${Math.min(done / line.quantity * 100, 100)}%` }} /></div><strong>{number.format(done)} / {number.format(line.quantity)}</strong></div>; })}</div>
          {fixed.length > 0 && <p className="wizard-note">Ya se fabricaron {number.format(fixed.filter((entry) => entry.item.status === "completed").reduce((sum, entry) => sum + (entry.item.actualQuantity ?? 0), 0))} palets. Cuentan tanto los asignados a {order.client} como los que quedaron en stock general. Las asignaciones confirmadas no se modifican.</p>}
          {overAssigned && <FieldError id="wizard-over">Asignaste más palets que los del pedido.</FieldError>}
        </section>}
        {capacity && step === 3 && <section className="wizard-section" aria-labelledby="wizard-confirm-title">
          <header><div><h3 id="wizard-confirm-title">Revisá y confirmá</h3></div></header>
          <div className={missingRuleProducts.length ? "wizard-alert" : "wizard-ok"}>
            {missingRuleProducts.length ? <AlertTriangle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
            <div><strong>{missingRuleProducts.length ? "Faltan reglas de rendimiento" : "Reglas de rendimiento configuradas"}</strong>
              {missingRuleProducts.length ? <><span>{missingRuleProducts.map((line) => line.product).join(" · ")}</span><small>Guardá esta planificación y configurá estos productos para el cliente antes de confirmar la capacidad.</small><button type="button" className="secondary-button" disabled={saving} onClick={() => void save(true)}>Ir a configurar</button></> : <small>Los productos y productores elegidos tienen reglas vigentes para estos días.</small>}
            </div>
          </div>
          <ul className="wizard-review">{sortedDays.map((day) => { const entries = selectedResources.flatMap((resource) => order.lines.map((line) => ({ resource: resources.find((item) => String(item.id) === resource), line, quantity: quantities[key(line.id, resource, day)] ?? 0 }))).filter((entry) => entry.quantity > 0); if (!entries.length) return null; return <li key={day}><strong>{weekdayLabel(day)} {shortDate(day)}</strong><div>{entries.map((entry) => <span key={`${entry.resource?.id}-${entry.line.id}`}>{entry.resource?.name} · {entry.line.product} · <b>{number.format(entry.quantity)}</b></span>)}</div></li>; })}</ul>
          {problems.length > 0 ? <div className="wizard-alert"><AlertTriangle size={18} aria-hidden="true" /><div><strong>{problems.length === 1 ? "1 día supera el límite o no tiene regla" : `${problems.length} días superan el límite o no tienen regla`}</strong>{problems.map((problem) => <span key={`${problem.day}-${problem.resource.id}`}>{problem.resource.name} · {weekdayLabel(problem.day)} {parseDate(problem.day).getDate()}: {loadCopy[problem.load.status]}</span>)}<small>Podés guardar igual y ajustar después.</small></div></div> : <div className="wizard-ok"><CheckCircle2 size={18} aria-hidden="true" />Todo dentro de la capacidad.</div>}
          <FieldError id="wizard-error">{error}</FieldError>
        </section>}
      </div>
      {capacity && <aside className="wizard-calendar" aria-label="Capacidad en paralelo">
        <h4>Capacidad en paralelo</h4>
        {!selectedResources.length || !sortedDays.length ? <p className="wizard-calendar-empty">Elegí días y recursos para ver la carga de cada uno.</p> : <div className="parallel-grid" style={{ gridTemplateColumns: `minmax(70px, 1fr) repeat(${sortedDays.length}, minmax(0, 1fr))` }}>
          <span />{sortedDays.map((day) => <span key={day} className="parallel-day">{weekdayLabel(day).slice(0, 2)} {parseDate(day).getDate()}</span>)}
          {selectedResources.map((resourceId) => { const resource = resources.find((item) => String(item.id) === resourceId); if (!resource) return null; return [<span key={`${resourceId}-name`} className="parallel-name">{resource.name}</span>, ...sortedDays.map((day) => { const load = cellLoad(capacity, resource, day, order.id, plannedAt(resourceId, day)); return <span key={`${resourceId}-${day}`} className={`parallel-cell load-${load.status}`} title={`${resource.name} · ${shortDate(day)}: ${loadCopy[load.status]}`}>{load.status === "missing" ? "?" : `${load.percent ?? 0}%`}</span>; })]; })}
        </div>}
        <ul className="parallel-legend"><li className="load-ok">Dentro del límite</li><li className="load-stretched">Sobre lo normal</li><li className="load-over">Límite superado</li><li className="load-missing">Sin regla</li></ul>
      </aside>}
    </div>
    <div className="modal-actions wizard-actions">
      <button type="button" className="secondary-button" onClick={() => step === 0 ? onClose() : setStep((step - 1) as Step)}>{step === 0 ? "Cancelar" : "Atrás"}</button>
      {step < 3 ? <button type="button" className="primary-button" disabled={!canAdvance} onClick={() => setStep((step + 1) as Step)}>Continuar</button> : <AsyncButton type="button" className="primary-button" loading={saving} onClick={() => void save()}>Guardar planificación</AsyncButton>}
    </div>
  </ModalShell>;
}

/** Producción: pedidos por planificar + calendario interno por recurso. */
export default function ProductionPlanningView({ orders, products, levels, refreshKey, onPlan, onPlanPending, onOpenOrder, onOrderChanged }: { orders: OperationOrder[]; products: Product[]; levels: ProductLevel[]; refreshKey: number; onPlan: (order: OperationOrder) => void; onPlanPending: (order: OperationOrder) => void; onOpenOrder: (id: string) => void; onOrderChanged: (id: string) => Promise<void> }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedAssignment, setSelectedAssignment] = useState<{ assignment: ProductionAssignmentSummary; resource: ProductionResource; day: string } | null>(null);
  const [moveError, setMoveError] = useState("");
  const [moveMessage, setMoveMessage] = useState("");
  const [moving, setMoving] = useState(false);
  const days = useMemo(() => weekDays(weekStart, 6), [weekStart]);
  const { capacity, error, loading, load } = useCapacity(days[0], days.at(-1)!, refreshKey);
  const selectedProduct = selectedAssignment && products.find((product) => product.id === selectedAssignment.assignment.productId);
  const moveAssignment = async (id: number | string, day: string) => {
    if (moving) return;
    const current = capacity?.production.days.flatMap((item) => item.resources.flatMap((resource) => resource.assignments.map((assignment) => ({ assignment, day: item.date })))).find((item) => String(item.assignment.id) === String(id));
    if (!current || current.day === day) return;
    setMoving(true); setMoveError(""); setMoveMessage("");
    try {
      const response = await fetch(`/api/production-allocations/${encodeURIComponent(String(id))}/move`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plannedDate: day }) });
      const body = await response.json() as { orderId?: string; error?: string };
      if (!response.ok || !body.orderId) throw new Error(body.error ?? "No se pudo mover el pedido.");
      await Promise.all([load(), onOrderChanged(body.orderId)]);
      setMoveMessage(`Asignación movida al ${shortDate(day)}. Quedó en borrador para revisar la capacidad de ese día.`);
    } catch (caught) { setMoveError(caught instanceof Error ? caught.message : "No se pudo mover el pedido."); }
    finally { setMoving(false); }
  };
  const pending = orders.filter((order) => order.productionDefined === false).sort((left, right) => getOrderPlannedDate(left).localeCompare(getOrderPlannedDate(right)));
  const planned = orders.filter((order) => order.productionDefined !== false && order.productionDate).sort((left, right) => (left.productionDate ?? "").localeCompare(right.productionDate ?? "")).slice(0, 12);
  const plannedWithProgress = planned.map((order) => ({ order, progress: plannedOrderProgress(order) }));
  const inProgressCount = plannedWithProgress.filter(({ progress }) => progress.produced > 0 && progress.pending > 0).length;
  const pendingCount = plannedWithProgress.filter(({ progress }) => progress.pending > 0).length;
  const completedCount = plannedWithProgress.filter(({ progress }) => progress.produced > 0 && progress.pending === 0).length;
  return <div className="phase-page">
    <section className="module-surface phase-queue" aria-labelledby="production-queue-title">
      <header className="phase-header"><div><h2 id="production-queue-title">Pedidos sin producción definida</h2></div>{pending.length > 0 && <span className="count-pill warning">{pending.length} por planificar</span>}</header>
      {pending.length ? <div className="queue-list">{pending.map((order) => <article key={order.id} className="queue-card"><div className="queue-card-main"><strong>{order.client}</strong><span>{order.lines.map((line) => `${line.product} × ${number.format(line.quantity)}`).join(" · ")}</span></div><div className="queue-card-meta"><small>Entrega</small><strong>{shortDate(getOrderPlannedDate(order))}</strong></div><div className="queue-card-meta"><small>Palets</small><strong>{number.format(order.requested)}</strong></div><button type="button" className="primary-button" onClick={() => onPlan(order)}>Planificar</button></article>)}</div> : <EmptyState icon={CheckCircle2} title="No hay pedidos sin planificación inicial" />}
      {plannedWithProgress.length > 0 && <details className="queue-planned"><summary><span className="queue-planned-label">Planificados recientemente ({plannedWithProgress.length})</span><span className="queue-planned-summary-statuses">{inProgressCount > 0 && <span className="queue-progress-badge in-progress">{inProgressCount} en progreso</span>}{pendingCount > 0 && <span className="queue-progress-badge pending">{pendingCount} con pendientes</span>}{completedCount > 0 && <span className="queue-progress-badge completed">{completedCount} completados</span>}</span><ChevronDown size={17} aria-hidden="true" /></summary><div className="queue-list compact">{plannedWithProgress.map(({ order, progress }) => <article key={order.id} className="queue-card"><div className="queue-card-main"><strong>{order.client}</strong><span>{productionRangeLabel(order)}</span><div className="queue-card-statuses">{progress.produced > 0 && progress.pending > 0 && <span className="queue-progress-badge in-progress">En progreso</span>}{progress.pending > 0 && <span className="queue-progress-badge pending">Aún quedan pendientes: {number.format(progress.pending)} palets</span>}{progress.produced > 0 && progress.pending === 0 && <span className="queue-progress-badge completed">Producción completada</span>}</div>{progress.toSchedule > 0 && <small>{number.format(progress.toSchedule)} palets por planificar</small>}</div><div className="queue-card-meta"><small>Entrega</small><strong>{shortDate(getOrderPlannedDate(order))}</strong></div><div className="queue-card-actions">{progress.toSchedule > 0 && <button type="button" className="primary-button" onClick={() => onPlanPending(order)}>Planificar pendientes</button>}<button type="button" className="secondary-button" onClick={() => onPlan(order)}>Replanificar</button></div></article>)}</div></details>}
    </section>
    <section className="module-surface" aria-labelledby="production-board-title">
      <header className="phase-header"><div><h2 id="production-board-title">Calendario interno</h2></div><WeekNavigator label={formatRange(days)} onPrevious={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() - 7); return next; })} onNext={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() + 7); return next; })} /></header>
      {error && <FieldError id="production-board-error">{error}</FieldError>}
      {moveError && <FieldError id="production-move-error">{moveError}</FieldError>}
      {moveMessage && <p className="board-saving" role="status">{moveMessage}</p>}
      {moving && <p className="board-saving" role="status">Moviendo asignación…</p>}
      {loading && !capacity ? <LoadingState label="Cargando calendario" rows={5} /> : capacity && <ProductionBoard capacity={capacity} days={days} products={products} onSelectAssignment={(assignment, resource, day) => setSelectedAssignment({ assignment, resource, day })} onMoveAssignment={moveAssignment} />}
    </section>
    {selectedAssignment && <ModalShell title="Detalle de producción" description={selectedAssignment.assignment.orderReference} onClose={() => setSelectedAssignment(null)} className="production-detail-modal">
      <dl className="production-detail-list">
        <div><dt>Producto</dt><dd>{selectedProduct ? productLabel(selectedProduct) : selectedAssignment.assignment.productName}</dd></div>
        {selectedProduct?.zetaCode && <div><dt>Código</dt><dd>{selectedProduct.zetaCode}</dd></div>}
        {selectedProduct && <div><dt>Tipo</dt><dd>{selectedProduct.kind}</dd></div>}
        {selectedProduct && levels.filter((level) => selectedProduct.attributes?.[level.id]).map((level) => <div key={level.id}><dt>{level.label}</dt><dd>{selectedProduct.attributes?.[level.id]}</dd></div>)}
        <div><dt>Cliente</dt><dd>{selectedAssignment.assignment.client}</dd></div>
        <div><dt>Quién produce</dt><dd>{selectedAssignment.resource.name}</dd></div>
        <div><dt>Fecha</dt><dd>{shortDate(selectedAssignment.day)}</dd></div>
        <div><dt>Planificado</dt><dd>{number.format(selectedAssignment.assignment.plannedQuantity)} unidades</dd></div>
        {selectedAssignment.assignment.actualQuantity !== undefined && <div><dt>Producido</dt><dd>{number.format(selectedAssignment.assignment.actualQuantity)} unidades</dd></div>}
        {selectedAssignment.assignment.resultDestination && <div><dt>Destino real</dt><dd>{selectedAssignment.assignment.resultDestination === "stock" ? "Stock" : selectedAssignment.assignment.client}</dd></div>}
        <div><dt>Estado</dt><dd>{selectedAssignment.assignment.status === "confirmed" ? "Confirmado" : selectedAssignment.assignment.status === "completed" ? "Completado" : "Borrador"}</dd></div>
      </dl>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { const id = selectedAssignment.assignment.orderId; setSelectedAssignment(null); onOpenOrder(id); }}>Ver pedido completo</button></div>
    </ModalShell>}
  </div>;
}
