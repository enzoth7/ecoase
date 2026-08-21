"use client";

import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  ClipboardList,
  Clock3,
  Factory,
  FileSpreadsheet,
  Info,
  Menu,
  Package,
  PackageCheck,
  Search,
  Tags,
  ThermometerSun,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  agenda,
  alerts,
  compatibilityRule,
  dataCutoff,
  deliveries,
  orders,
  stock,
  stockTotals,
  type AgendaItem,
  type AlertItem,
  type Delivery,
  type EvidenceSource,
  type Order,
  type OrderStatus,
  type RiskLevel,
  type StockItem,
  type ViewId,
} from "./data";

type DetailSelection =
  | { type: "alert"; id: string }
  | { type: "order"; id: string }
  | { type: "stock"; id: string }
  | { type: "delivery"; id: string }
  | null;

const navItems = [
  { id: "resumen" as const, label: "Resumen", short: "Resumen", icon: CircleAlert },
  { id: "agenda" as const, label: "Próximos 14 días", short: "14 días", icon: CalendarDays },
  { id: "pedidos" as const, label: "Pedidos", short: "Pedidos", icon: ClipboardList },
  { id: "stock" as const, label: "Stock y preparación", short: "Stock", icon: Boxes },
  { id: "entregas" as const, label: "Entregas", short: "Entregas", icon: Truck },
];

const riskMeta: Record<RiskLevel, { label: string; className: string }> = {
  critico: { label: "Crítico", className: "critical" },
  alto: { label: "Atención", className: "warning" },
  medio: { label: "A revisar", className: "medium" },
  bien: { label: "En orden", className: "good" },
};

const orderStatusLabels: Record<OrderStatus, string> = {
  bloqueado: "Bloqueado",
  "por-confirmar": "Por confirmar",
  planificado: "Planificado",
  parcial: "Entrega parcial",
  cumplido: "Cumplido",
};

const deliveryStatusLabels: Record<Delivery["status"], string> = {
  programado: "Programado",
  "sin-camion": "Sin camión",
  parcial: "Parcial",
  completo: "Completo",
  bloqueado: "Bloqueado",
};

const evidenceIcons = {
  excel: FileSpreadsheet,
  regla: Info,
  demo: CircleDashed,
  pendiente: Clock3,
};

const agendaTypeMeta: Record<AgendaItem["type"], { label: string; icon: typeof Truck }> = {
  entrega: { label: "Entrega", icon: Truck },
  produccion: { label: "Producción", icon: Factory },
  ht: { label: "HT", icon: ThermometerSun },
  marcado: { label: "Marcado", icon: Tags },
  decision: { label: "Decisión", icon: CircleAlert },
};

const number = new Intl.NumberFormat("es-UY");
const date = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short" });
const weekday = new Intl.DateTimeFormat("es-UY", { weekday: "short" });

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatDate(value: string | null) {
  return value ? date.format(dateFromIso(value)).replace(".", "") : "Sin fecha";
}

function EvidenceBadge({ source, compact = false }: { source: EvidenceSource; compact?: boolean }) {
  const Icon = evidenceIcons[source.kind];
  return (
    <span className={`evidence-badge ${source.kind} ${compact ? "compact" : ""}`}>
      <Icon size={13} aria-hidden="true" />
      {source.label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const meta = riskMeta[risk];
  const Icon = risk === "bien" ? CheckCircle2 : risk === "medio" ? Clock3 : AlertTriangle;
  return (
    <span className={`risk-badge ${meta.className}`}>
      <Icon size={13} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const className = status === "cumplido" ? "good" : status === "bloqueado" ? "critical" : status === "parcial" ? "warning" : "neutral";
  return <span className={`status-badge ${className}`}>{orderStatusLabels[status]}</span>;
}

function MetricCard({
  tone,
  label,
  value,
  detail,
  icon: Icon,
}: {
  tone: "critical" | "warning" | "neutral" | "good";
  label: string;
  value: string;
  detail: string;
  icon: typeof AlertTriangle;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon"><Icon size={18} aria-hidden="true" /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <Search size={22} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function SectionHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="view-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{copy}</p>
    </header>
  );
}

function SummaryView({
  showGuide,
  onHideGuide,
  riskFilter,
  setRiskFilter,
  openDetail,
}: {
  showGuide: boolean;
  onHideGuide: () => void;
  riskFilter: "todos" | RiskLevel;
  setRiskFilter: (value: "todos" | RiskLevel) => void;
  openDetail: (selection: DetailSelection) => void;
}) {
  const visibleAlerts = riskFilter === "todos" ? alerts : alerts.filter((item) => item.level === riskFilter);
  const atRisk = alerts.filter((item) => item.level === "critico" || item.level === "alto").length;
  const withoutTruck = deliveries.filter((item) => item.status === "sin-camion").length;

  return (
    <>
      <SectionHeader
        eyebrow={`Foto histórica · corte ${dataCutoff}`}
        title="Lo que necesita atención"
        copy="Empezá por los bloqueos. Abrí cualquier caso para ver qué pasó, qué decisión falta y de dónde sale el dato."
      />

      {showGuide && (
        <section className="guide-card" aria-labelledby="guide-title">
          <div className="guide-icon"><Info size={20} aria-hidden="true" /></div>
          <div>
            <p className="eyebrow">Cómo leer esta pantalla</p>
            <h2 id="guide-title">No necesitás entender las planillas para empezar</h2>
            <p>Rojo significa que algo bloquea un compromiso. Ámbar pide una decisión. Verde confirma que el circuito está cerrado. Cada tarjeta conserva su fuente.</p>
          </div>
          <button type="button" className="icon-button" onClick={onHideGuide} aria-label="Cerrar explicación">
            <X size={18} aria-hidden="true" />
          </button>
        </section>
      )}

      <section className="summary-grid" aria-label="Indicadores de la foto histórica">
        <MetricCard tone="critical" label="Compromisos en riesgo" value={String(atRisk)} detail="2 bloqueos críticos" icon={AlertTriangle} />
        <MetricCard tone="warning" label="Sin camión confirmado" value={String(withoutTruck)} detail="escenarios señalados" icon={Truck} />
        <MetricCard tone="neutral" label="Pendiente de preparar" value={number.format(stockTotals.palbin.pending + stockTotals.pamer.pending)} detail="sin marcar o tratar" icon={Tags} />
        <MetricCard tone="good" label="Stock físico registrado" value={number.format(stockTotals.palbin.total + stockTotals.pamer.total)} detail="Palbin + Pamer" icon={Boxes} />
      </section>

      <section className="attention-section" aria-labelledby="attention-title">
        <div className="section-heading stacked-mobile">
          <div>
            <p className="eyebrow">Ordenado por urgencia</p>
            <h2 id="attention-title">Necesita atención</h2>
          </div>
          <div className="chip-group" aria-label="Filtrar riesgos">
            {(["todos", "critico", "alto", "medio"] as const).map((level) => (
              <button key={level} type="button" className={`filter-chip ${riskFilter === level ? "active" : ""}`} onClick={() => setRiskFilter(level)}>
                {level === "todos" ? "Todos" : riskMeta[level].label}
              </button>
            ))}
          </div>
        </div>

        <div className="attention-list">
          {visibleAlerts.map((item) => (
            <button key={item.id} type="button" className={`attention-row ${riskMeta[item.level].className}`} onClick={() => openDetail({ type: "alert", id: item.id })}>
              <span className="attention-severity" aria-hidden="true"><AlertTriangle size={17} /></span>
              <span className="attention-copy">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </span>
              <EvidenceBadge source={item.evidence[0]} compact />
              <span className="attention-action">Entender el caso <ChevronRight size={16} aria-hidden="true" /></span>
            </button>
          ))}
          {visibleAlerts.length === 0 && <EmptyState title="No hay alertas con este filtro" copy="Probá con otra categoría de riesgo." />}
        </div>
      </section>

      <section className="operation-strip" aria-label="Lectura simple de la operación">
        <div>
          <p className="eyebrow">La operación en una frase</p>
          <h2>Pedido → disponibilidad → preparación → camión → entrega</h2>
        </div>
        <div className="flow-steps" aria-label="Etapas del proceso">
          {["Pedido", "Stock", "HT / marcado", "Transporte", "Entrega"].map((step, index) => (
            <span key={step}><b>{index + 1}</b>{step}{index < 4 && <ArrowRight size={14} aria-hidden="true" />}</span>
          ))}
        </div>
      </section>
    </>
  );
}

function AgendaView({ openDetail }: { openDetail: (selection: DetailSelection) => void }) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = new Date("2026-08-10T12:00:00");
    day.setDate(day.getDate() + index);
    return day.toISOString().slice(0, 10);
  });

  return (
    <>
      <SectionHeader
        eyebrow="Calendario de diagnóstico"
        title="Próximos 14 días"
        copy="Combina compromisos reales de la foto histórica con una reprogramación didáctica. Los supuestos están marcados."
      />
      <div className="agenda-legend" aria-label="Leyenda de agenda">
        <span><i className="agenda-dot done" /> Hecho</span>
        <span><i className="agenda-dot pending" /> Pendiente</span>
        <span><i className="agenda-dot blocked" /> Bloqueado</span>
      </div>
      <section className="agenda-grid" aria-label="Agenda del 10 al 23 de agosto de 2026">
        {days.map((day) => {
          const items = agenda.filter((item) => item.date === day);
          return (
            <article className={`day-column ${items.length === 0 ? "empty" : ""}`} key={day}>
              <header>
                <span>{weekday.format(dateFromIso(day)).replace(".", "")}</span>
                <strong>{dateFromIso(day).getDate()}</strong>
              </header>
              <div className="day-events">
                {items.length === 0 && <span className="no-events">Sin actividad registrada</span>}
                {items.map((item) => {
                  const meta = agendaTypeMeta[item.type];
                  const Icon = meta.icon;
                  const relatedOrder = orders.find((order) => order.client === item.client && order.requestedDate === item.date);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`agenda-event ${item.status}`}
                      onClick={() => relatedOrder && openDetail({ type: "order", id: relatedOrder.id })}
                      aria-label={`${meta.label}: ${item.title}`}
                    >
                      <span className="event-type"><Icon size={13} aria-hidden="true" /> {meta.label}</span>
                      <strong>{item.title}</strong>
                      {item.client && <small>{item.client}</small>}
                      <EvidenceBadge source={item.evidence} compact />
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
      <aside className="plain-note">
        <Info size={18} aria-hidden="true" />
        <div><strong>Los espacios vacíos no significan capacidad disponible.</strong><p>El archivo de capacidad productiva y los cupos de transporte todavía no están disponibles.</p></div>
        <EvidenceBadge source={{ kind: "pendiente", label: "Falta validar", reference: "Capacidad productiva y logística" }} />
      </aside>
    </>
  );
}

function OrdersView({ openDetail }: { openDetail: (selection: DetailSelection) => void }) {
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("todos");
  const [status, setStatus] = useState<"todos" | OrderStatus>("todos");
  const clients = [...new Set(orders.map((order) => order.client))].sort();
  const filtered = orders.filter((order) => {
    const haystack = `${order.orderNumber} ${order.client} ${order.lines.map((line) => line.product).join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (client === "todos" || order.client === client) && (status === "todos" || order.status === status);
  });

  return (
    <>
      <SectionHeader
        eyebrow="Solicitado · entregado · pendiente"
        title="Pedidos"
        copy="Cada fila separa lo pedido de lo entregado. Abrí un pedido para recorrer sus líneas, su remito y sus fuentes."
      />
      <section className="filters-panel" aria-label="Filtros de pedidos">
        <label className="search-field">
          <span>Buscar pedido, cliente o producto</span>
          <div><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: Pamer o 184833" /></div>
        </label>
        <label>
          <span>Cliente</span>
          <select value={client} onChange={(event) => setClient(event.target.value)}>
            <option value="todos">Todos los clientes</option>
            {clients.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Estado</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as "todos" | OrderStatus)}>
            <option value="todos">Todos los estados</option>
            {Object.entries(orderStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      <section className="data-card orders-table-card" aria-label={`${filtered.length} pedidos encontrados`}>
        <div className="table-summary"><strong>{filtered.length} pedidos</strong><span>Foto histórica y escenarios didácticos</span></div>
        {filtered.length > 0 ? (
          <>
            <div className="desktop-table-wrap">
              <table className="data-table">
                <thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th className="number-cell">Solicitado</th><th className="number-cell">Entregado</th><th className="number-cell">Pendiente</th><th>Origen</th><th><span className="sr-only">Abrir</span></th></tr></thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr key={order.id}>
                      <td><button type="button" className="table-link" onClick={() => openDetail({ type: "order", id: order.id })}><strong>{order.client}</strong><small>{order.orderNumber}</small></button></td>
                      <td>{formatDate(order.committedDate ?? order.requestedDate)}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="number-cell">{number.format(order.requested)}</td>
                      <td className="number-cell">{number.format(order.delivered)}</td>
                      <td className={`number-cell ${order.pending > 0 ? "pending-number" : ""}`}>{number.format(order.pending)}</td>
                      <td><EvidenceBadge source={order.evidence[0]} compact /></td>
                      <td><button type="button" className="row-action" onClick={() => openDetail({ type: "order", id: order.id })} aria-label={`Abrir pedido de ${order.client}`}><ChevronRight size={17} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-card-list">
              {filtered.map((order) => (
                <button type="button" className="mobile-data-card" key={order.id} onClick={() => openDetail({ type: "order", id: order.id })}>
                  <span><strong>{order.client}</strong><small>{order.orderNumber} · {formatDate(order.committedDate ?? order.requestedDate)}</small></span>
                  <StatusBadge status={order.status} />
                  <div className="mobile-amounts"><span>Solicitado <b>{number.format(order.requested)}</b></span><span>Pendiente <b>{number.format(order.pending)}</b></span></div>
                </button>
              ))}
            </div>
          </>
        ) : <EmptyState title="No encontramos pedidos" copy="Borrá la búsqueda o cambiá los filtros." />}
      </section>
    </>
  );
}

function StockView({ openDetail }: { openDetail: (selection: DetailSelection) => void }) {
  const [source, setSource] = useState<"todos" | StockItem["source"]>("todos");
  const filtered = source === "todos" ? stock : stock.filter((item) => item.source === source);

  return (
    <>
      <SectionHeader
        eyebrow="Stock físico y estado de preparación"
        title="Stock y preparación"
        copy="El total físico se divide entre unidades listas y unidades que todavía requieren marcado o HT. Una transformación no crea stock nuevo."
      />
      <section className="stock-totals" aria-label="Totales de stock por fuente">
        {(["palbin", "pamer"] as const).map((key) => {
          const item = stockTotals[key];
          const readyLabel = key === "palbin" ? "marcado" : "tratado";
          return (
            <article key={key}>
              <span className="source-name">{key === "palbin" ? "Palbin" : "Pamer"}</span>
              <strong>{number.format(item.total)}</strong>
              <small>stock físico total</small>
              <div className="split-bar" aria-label={`${number.format(item.ready)} listo y ${number.format(item.pending)} pendiente`}>
                <i style={{ width: `${(item.ready / item.total) * 100}%` }} />
              </div>
              <div className="split-labels"><span>{number.format(item.ready)} {readyLabel}</span><span>{number.format(item.pending)} pendiente</span></div>
            </article>
          );
        })}
        <article className="stock-rule-card">
          <span className="rule-icon"><Check size={18} aria-hidden="true" /></span>
          <div><strong>La transformación conserva el total</strong><p>Marcar o tratar resta de “pendiente” y suma la misma cantidad a “listo”.</p></div>
          <EvidenceBadge source={{ kind: "regla", label: "Regla relevada", reference: "Stock Palbin y Pamer" }} compact />
        </article>
      </section>

      <div className="section-heading">
        <div><p className="eyebrow">Productos representativos</p><h2>Cobertura y preparación</h2></div>
        <div className="chip-group" aria-label="Filtrar fuente de stock">
          {(["todos", "Palbin", "Pamer"] as const).map((item) => <button key={item} type="button" className={`filter-chip ${source === item ? "active" : ""}`} onClick={() => setSource(item)}>{item === "todos" ? "Todo" : item}</button>)}
        </div>
      </div>
      <section className="stock-list">
        {filtered.map((item) => {
          const percent = item.coverageDays === null ? 0 : Math.min(100, (item.coverageDays / 14) * 100);
          return (
            <button type="button" className="stock-row" key={item.id} onClick={() => openDetail({ type: "stock", id: item.id })}>
              <span className="stock-product"><strong>{item.product}</strong><small>{item.source} · {item.note}</small></span>
              <span className="stock-amount"><small>{item.pendingLabel}</small><strong>{number.format(item.pendingPreparation)}</strong></span>
              <span className="stock-amount"><small>{item.readyLabel}</small><strong>{number.format(item.ready)}</strong></span>
              <span className="coverage-cell">
                <span><small>Cobertura</small><b>{item.coverageDays === null ? "No calculable" : `${item.coverageDays} días`}</b></span>
                <i className={`coverage-track ${item.coverageDays === null ? "unknown" : riskMeta[item.risk].className}`}><b style={{ width: `${percent}%` }} /></i>
              </span>
              <RiskBadge risk={item.risk} />
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          );
        })}
      </section>

      <section className="compatibility-card">
        <div className="compatibility-title"><Package size={19} aria-hidden="true" /><div><p className="eyebrow">Compatibilidad dirigida</p><h2>Una sustitución no funciona en ambos sentidos</h2></div></div>
        <div className="compatibility-flow"><span className="allowed"><Check size={16} /> {compatibilityRule.allowed}</span><span className="blocked"><X size={16} /> {compatibilityRule.blocked}</span></div>
        <EvidenceBadge source={compatibilityRule.evidence} />
      </section>
    </>
  );
}

function DeliveriesView({ openDetail }: { openDetail: (selection: DetailSelection) => void }) {
  const [filter, setFilter] = useState<"todos" | "pendientes" | "completos">("todos");
  const filtered = deliveries.filter((item) => filter === "todos" || (filter === "completos" ? item.status === "completo" : item.status !== "completo"));

  return (
    <>
      <SectionHeader
        eyebrow="Preparación · camión · remito · saldo"
        title="Entregas"
        copy="Una entrega no está lista solo porque exista stock. También necesita preparación correcta, transporte y evidencia de salida."
      />
      <div className="section-heading">
        <div><p className="eyebrow">{filtered.length} movimientos</p><h2>Estado logístico</h2></div>
        <div className="chip-group" aria-label="Filtrar entregas">
          {(["todos", "pendientes", "completos"] as const).map((item) => <button key={item} type="button" className={`filter-chip ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item === "todos" ? "Todas" : item === "pendientes" ? "Con pendiente" : "Completas"}</button>)}
        </div>
      </div>
      <section className="delivery-grid">
        {filtered.map((item) => {
          const className = item.status === "completo" ? "good" : item.status === "bloqueado" ? "critical" : item.status === "sin-camion" ? "warning" : "medium";
          return (
            <button type="button" className={`delivery-card ${className}`} key={item.id} onClick={() => openDetail({ type: "delivery", id: item.id })}>
              <span className="delivery-top"><span className={`delivery-status ${className}`}>{deliveryStatusLabels[item.status]}</span><small>{formatDate(item.date)}</small></span>
              <span className="delivery-client"><strong>{item.client}</strong><small>{number.format(item.quantity)} unidades</small></span>
              <span className="delivery-facts">
                <span><Truck size={15} aria-hidden="true" /><small>Transporte</small><b>{item.transport}</b></span>
                <span><Tags size={15} aria-hidden="true" /><small>Preparación</small><b>{item.preparation}</b></span>
                <span><ClipboardList size={15} aria-hidden="true" /><small>Remito</small><b>{item.remittance ?? "Sin asociar"}</b></span>
              </span>
              <span className="delivery-balance"><span>Saldo pendiente</span><strong>{number.format(item.balance)}</strong><ChevronRight size={17} aria-hidden="true" /></span>
            </button>
          );
        })}
      </section>
    </>
  );
}

function EvidenceList({ sources }: { sources: EvidenceSource[] }) {
  return (
    <div className="evidence-list">
      {sources.map((source, index) => (
        <div key={`${source.reference}-${index}`}>
          <EvidenceBadge source={source} />
          <p><strong>{source.reference}</strong>{source.note && <span>{source.note}</span>}</p>
        </div>
      ))}
    </div>
  );
}

function AlertDetail({ item }: { item: AlertItem }) {
  return (
    <>
      <div className="drawer-title"><RiskBadge risk={item.level} /><h2>{item.title}</h2><p>{item.subtitle}</p></div>
      <div className="decision-grid">
        <article><span>Qué sucede</span><p>{item.what}</p></article>
        <article><span>Por qué importa</span><p>{item.why}</p></article>
        <article className="next"><span>Próxima decisión</span><p>{item.nextDecision}</p></article>
      </div>
      <div className="drawer-section"><p className="eyebrow">Afecta</p><strong>{item.affects}</strong></div>
      <div className="drawer-section"><p className="eyebrow">Fuentes</p><EvidenceList sources={item.evidence} /></div>
    </>
  );
}

function OrderDetail({ item }: { item: Order }) {
  const progress = item.requested ? (item.delivered / item.requested) * 100 : 0;
  return (
    <>
      <div className="drawer-title"><StatusBadge status={item.status} /><h2>{item.client}</h2><p>Pedido {item.orderNumber} · {formatDate(item.committedDate ?? item.requestedDate)}</p></div>
      <div className="quantity-summary">
        <span><small>Solicitado</small><strong>{number.format(item.requested)}</strong></span>
        <span><small>Entregado</small><strong>{number.format(item.delivered)}</strong></span>
        <span className={item.pending > 0 ? "has-pending" : ""}><small>Pendiente</small><strong>{number.format(item.pending)}</strong></span>
      </div>
      <div className="progress-track" aria-label={`${Math.round(progress)} por ciento entregado`}><i style={{ width: `${progress}%` }} /></div>

      {item.blocker && <div className="blocker-box"><AlertTriangle size={18} aria-hidden="true" /><div><strong>Qué lo bloquea</strong><p>{item.blocker}</p></div></div>}
      <div className="next-decision"><span>Próxima decisión</span><p>{item.nextDecision}</p></div>

      <div className="drawer-section">
        <p className="eyebrow">Líneas del pedido</p>
        <div className="line-list">
          {item.lines.map((line) => (
            <div key={line.id}><span><strong>{line.product}</strong><small>{line.preparation}</small></span><span><b>{number.format(line.delivered)}</b> / {number.format(line.requested)}<small>{number.format(line.pending)} pendiente</small></span></div>
          ))}
        </div>
      </div>

      {item.orderNumber === "184833" && (
        <div className="drawer-section">
          <p className="eyebrow">Trazabilidad comprobada</p>
          <ol className="trace-list">
            <li className="done"><Check size={14} /><span><strong>Orden recibida</strong><small>5 líneas · 500 unidades</small></span></li>
            <li className="unknown"><CircleDashed size={14} /><span><strong>Planificación intermedia</strong><small>No conserva orden ni remito</small></span></li>
            <li className="done"><Check size={14} /><span><strong>Remito 603</strong><small>5 líneas coincidentes</small></span></li>
            <li className="done"><Check size={14} /><span><strong>Salida de stock</strong><small>−500 unidades</small></span></li>
            <li className="done"><Check size={14} /><span><strong>Saldo final</strong><small>0 unidades</small></span></li>
          </ol>
        </div>
      )}
      <div className="drawer-section"><p className="eyebrow">Fuentes</p><EvidenceList sources={item.evidence} /></div>
    </>
  );
}

function StockDetail({ item }: { item: StockItem }) {
  return (
    <>
      <div className="drawer-title"><RiskBadge risk={item.risk} /><h2>{item.product}</h2><p>Stock {item.source}</p></div>
      <div className="quantity-summary">
        <span><small>{item.pendingLabel}</small><strong>{number.format(item.pendingPreparation)}</strong></span>
        <span><small>{item.readyLabel}</small><strong>{number.format(item.ready)}</strong></span>
        <span><small>Total físico</small><strong>{number.format(item.total)}</strong></span>
      </div>
      <div className="stock-equation"><span>{number.format(item.pendingPreparation)} pendiente</span><b>+</b><span>{number.format(item.ready)} listo</span><b>=</b><span>{number.format(item.total)} físico</span></div>
      <div className="decision-grid single">
        <article><span>Lectura</span><p>{item.note}</p></article>
        <article><span>Días de cobertura</span><p>{item.coverageDays === null ? "No calculable: falta un consumo válido." : `${item.coverageDays} días en el escenario de diagnóstico.`}</p></article>
      </div>
      <div className="drawer-section"><p className="eyebrow">Fuente</p><EvidenceList sources={[item.evidence]} /></div>
    </>
  );
}

function DeliveryDetail({ item }: { item: Delivery }) {
  const className = item.status === "completo" ? "good" : item.status === "bloqueado" ? "critical" : item.status === "sin-camion" ? "warning" : "medium";
  return (
    <>
      <div className="drawer-title"><span className={`delivery-status ${className}`}>{deliveryStatusLabels[item.status]}</span><h2>{item.client}</h2><p>{formatDate(item.date)} · {number.format(item.quantity)} unidades</p></div>
      <div className="delivery-detail-grid">
        <article><Truck size={17} /><span>Transporte</span><strong>{item.transport}</strong></article>
        <article><Tags size={17} /><span>Preparación</span><strong>{item.preparation}</strong></article>
        <article><ClipboardList size={17} /><span>Remito</span><strong>{item.remittance ?? "Sin asociar"}</strong></article>
        <article><PackageCheck size={17} /><span>Saldo</span><strong>{number.format(item.balance)}</strong></article>
      </div>
      {item.blocker && <div className="blocker-box"><AlertTriangle size={18} /><div><strong>Qué lo bloquea</strong><p>{item.blocker}</p></div></div>}
      <div className="next-decision"><span>Próximo paso</span><p>{item.nextStep}</p></div>
      <div className="drawer-section"><p className="eyebrow">Fuentes</p><EvidenceList sources={item.evidence} /></div>
    </>
  );
}

function DetailDrawer({ selection, onClose }: { selection: DetailSelection; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!selection) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, onClose]);

  if (!selection) return null;
  const item =
    selection.type === "alert" ? alerts.find((value) => value.id === selection.id) :
    selection.type === "order" ? orders.find((value) => value.id === selection.id) :
    selection.type === "stock" ? stock.find((value) => value.id === selection.id) :
    deliveries.find((value) => value.id === selection.id);
  if (!item) return null;

  return (
    <div className="drawer-layer">
      <button type="button" className="drawer-scrim" onClick={onClose} aria-label="Cerrar detalle" />
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="Detalle operativo">
        <div className="drawer-toolbar"><span>Detalle operativo</span><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Cerrar detalle"><X size={19} /></button></div>
        <div className="drawer-content">
          {selection.type === "alert" && <AlertDetail item={item as AlertItem} />}
          {selection.type === "order" && <OrderDetail item={item as Order} />}
          {selection.type === "stock" && <StockDetail item={item as StockItem} />}
          {selection.type === "delivery" && <DeliveryDetail item={item as Delivery} />}
        </div>
      </aside>
    </div>
  );
}

export default function Dashboard() {
  const [activeView, setActiveView] = useState<ViewId>("resumen");
  const [showGuide, setShowGuide] = useState(true);
  const [riskFilter, setRiskFilter] = useState<"todos" | RiskLevel>("todos");
  const [selection, setSelection] = useState<DetailSelection>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const hash = window.location.hash.replace("#", "") as ViewId;
      if (navItems.some((item) => item.id === hash)) setActiveView(hash);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const currentLabel = navItems.find((item) => item.id === activeView)?.label ?? "Resumen";
  const openDetail = (detail: DetailSelection) => setSelection(detail);
  const closeDetail = () => setSelection(null);

  const changeView = (view: ViewId) => {
    setActiveView(view);
    setMobileMenu(false);
    window.history.replaceState(null, "", `#${view}`);
    requestAnimationFrame(() => mainRef.current?.focus());
  };

  const view = useMemo(() => {
    if (activeView === "agenda") return <AgendaView openDetail={openDetail} />;
    if (activeView === "pedidos") return <OrdersView openDetail={openDetail} />;
    if (activeView === "stock") return <StockView openDetail={openDetail} />;
    if (activeView === "entregas") return <DeliveriesView openDetail={openDetail} />;
    return <SummaryView showGuide={showGuide} onHideGuide={() => setShowGuide(false)} riskFilter={riskFilter} setRiskFilter={setRiskFilter} openDetail={openDetail} />;
  }, [activeView, showGuide, riskFilter]);

  return (
    <div className="app-shell dashboard-shell">
      <a className="skip-link" href="#dashboard-main">Saltar al contenido</a>
      <aside className={`sidebar ${mobileMenu ? "menu-open" : ""}`} aria-label="Navegación principal">
        <button className="brand" type="button" onClick={() => changeView("resumen")} aria-label="Ecoase, ir al resumen">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>Ecoase</strong><small>Control operativo</small></span>
        </button>
        <nav aria-label="Secciones del dashboard">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={`nav-item ${activeView === item.id ? "active" : ""}`} onClick={() => changeView(item.id)} aria-current={activeView === item.id ? "page" : undefined}>
                <Icon size={18} aria-hidden="true" /><span className="nav-long">{item.label}</span><span className="nav-short">{item.short}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span><i className="status-dot" aria-hidden="true" /><strong>Modo diagnóstico</strong></span>
          <p>Datos ficticios. No se actualiza en vivo ni modifica las planillas.</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="mobile-topbar">
          <button type="button" className="icon-button" onClick={() => setMobileMenu((value) => !value)} aria-label="Abrir navegación" aria-expanded={mobileMenu}><Menu size={20} /></button>
          <span><strong>Ecoase</strong><small>{currentLabel}</small></span>
          <button type="button" className="icon-button" onClick={() => { setShowGuide(true); changeView("resumen"); }} aria-label="Cómo leer el dashboard"><Info size={19} /></button>
        </header>
        <div className="desktop-utility-bar">
          <div><span className="live-dot" />Demostración de solo lectura</div>
          <button type="button" onClick={() => { setShowGuide(true); changeView("resumen"); }}><Info size={15} /> Cómo leer el dashboard</button>
        </div>
        <main id="dashboard-main" ref={mainRef} className="main-content" tabIndex={-1}>
          {view}
          <footer className="dashboard-footer">
            <div><strong>Origen de los datos</strong><span>6 Excel ficticios · corte {dataCutoff}</span></div>
            <div className="footer-legend" aria-label="Tipos de evidencia">
              <EvidenceBadge source={{ kind: "excel", label: "Dato del Excel", reference: "" }} compact />
              <EvidenceBadge source={{ kind: "regla", label: "Regla relevada", reference: "" }} compact />
              <EvidenceBadge source={{ kind: "demo", label: "Supuesto de demostración", reference: "" }} compact />
              <EvidenceBadge source={{ kind: "pendiente", label: "Falta validar", reference: "" }} compact />
            </div>
          </footer>
        </main>
      </div>
      <DetailDrawer selection={selection} onClose={closeDetail} />
    </div>
  );
}
