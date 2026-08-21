export type ViewId = "resumen" | "agenda" | "pedidos" | "stock" | "entregas";
export type EvidenceKind = "excel" | "regla" | "demo" | "pendiente";
export type RiskLevel = "critico" | "alto" | "medio" | "bien";
export type OrderStatus = "bloqueado" | "por-confirmar" | "planificado" | "parcial" | "cumplido";

export interface EvidenceSource {
  kind: EvidenceKind;
  label: "Dato del Excel" | "Regla relevada" | "Supuesto de demostración" | "Falta validar";
  reference: string;
  note?: string;
}

export interface OrderLine {
  id: string;
  product: string;
  requested: number;
  delivered: number;
  pending: number;
  preparation: "Sin HT" | "Con HT" | "Marcado" | "Sin marcar" | "No consta";
}

export interface Order {
  id: string;
  orderNumber: string;
  client: string;
  requestedDate: string;
  committedDate: string | null;
  requested: number;
  delivered: number;
  pending: number;
  status: OrderStatus;
  risk: RiskLevel;
  remittance: string | null;
  blocker: string | null;
  nextDecision: string;
  lines: OrderLine[];
  evidence: EvidenceSource[];
}

export interface AlertItem {
  id: string;
  level: RiskLevel;
  title: string;
  subtitle: string;
  what: string;
  why: string;
  nextDecision: string;
  affects: string;
  dueDate: string;
  evidence: EvidenceSource[];
}

export interface AgendaItem {
  id: string;
  date: string;
  type: "entrega" | "produccion" | "ht" | "marcado" | "decision";
  status: "hecho" | "pendiente" | "bloqueado";
  title: string;
  description: string;
  client?: string;
  evidence: EvidenceSource;
}

export interface StockItem {
  id: string;
  source: "Palbin" | "Pamer";
  product: string;
  pendingLabel: "Sin marcar" | "Sin tratar";
  readyLabel: "Marcado" | "Tratado";
  pendingPreparation: number;
  ready: number;
  total: number;
  coverageDays: number | null;
  risk: RiskLevel;
  note: string;
  evidence: EvidenceSource;
}

export interface Delivery {
  id: string;
  date: string;
  client: string;
  quantity: number;
  status: "programado" | "sin-camion" | "parcial" | "completo" | "bloqueado";
  transport: string;
  remittance: string | null;
  preparation: string;
  balance: number;
  blocker: string | null;
  nextStep: string;
  evidence: EvidenceSource[];
}

export const dataCutoff = "15 de agosto de 2026";

const excel = (reference: string, note?: string): EvidenceSource => ({
  kind: "excel",
  label: "Dato del Excel",
  reference,
  note,
});

const demo = (reference: string, note?: string): EvidenceSource => ({
  kind: "demo",
  label: "Supuesto de demostración",
  reference,
  note,
});

const rule = (reference: string, note?: string): EvidenceSource => ({
  kind: "regla",
  label: "Regla relevada",
  reference,
  note,
});

const pending = (reference: string, note?: string): EvidenceSource => ({
  kind: "pendiente",
  label: "Falta validar",
  reference,
  note,
});

export const orders: Order[] = [
  {
    id: "order-pamer-184833",
    orderNumber: "184833",
    client: "Pamer",
    requestedDate: "2026-07-28",
    committedDate: "2026-07-28",
    requested: 500,
    delivered: 500,
    pending: 0,
    status: "cumplido",
    risk: "bien",
    remittance: "603",
    blocker: null,
    nextDecision: "Ninguna. La orden y la salida de stock coinciden.",
    lines: [
      { id: "184833-1", product: "Pallet 100 × 100 doble entrada", requested: 100, delivered: 100, pending: 0, preparation: "Sin HT" },
      { id: "184833-2", product: "Pallet 100 × 100", requested: 20, delivered: 20, pending: 0, preparation: "Con HT" },
      { id: "184833-3", product: "Pallet 120 × 80 doble entrada", requested: 180, delivered: 180, pending: 0, preparation: "Sin HT" },
      { id: "184833-4", product: "Pallet 120 × 130", requested: 100, delivered: 100, pending: 0, preparation: "Sin HT" },
      { id: "184833-5", product: "Pallet 100 × 120 Mercosur", requested: 100, delivered: 100, pending: 0, preparation: "Con HT" },
    ],
    evidence: [
      excel("Órdenes de compra · hoja PAMER · filas 4–8"),
      excel("Stock Pamer · MOVIMIENTOS · filas 53–57", "Cinco ventas asociadas al remito 603."),
      pending("Planificación intermedia", "El plan no conserva el número de orden ni el remito."),
    ],
  },
  {
    id: "order-frutura-122102",
    orderNumber: "Plan-14A",
    client: "Frutura",
    requestedDate: "2026-08-14",
    committedDate: "2026-08-14",
    requested: 600,
    delivered: 0,
    pending: 600,
    status: "bloqueado",
    risk: "critico",
    remittance: null,
    blocker: "Los pallets no llegaron.",
    nextDecision: "Confirmar nueva llegada y acordar una fecha de entrega.",
    lines: [
      { id: "fru-1", product: "Pallet 122 × 102", requested: 600, delivered: 0, pending: 600, preparation: "Marcado" },
    ],
    evidence: [
      excel("Plan diario · Plan semanal · fila 74", "La observación dice “NO LLEGARON LOS PALLETS”."),
      demo("Escenario didáctico", "El saldo se representa como 600 para mostrar el bloqueo."),
    ],
  },
  {
    id: "order-proquimur-aug",
    orderNumber: "Plan-63",
    client: "Proquimur",
    requestedDate: "2026-08-11",
    committedDate: null,
    requested: 600,
    delivered: 0,
    pending: 600,
    status: "por-confirmar",
    risk: "alto",
    remittance: null,
    blocker: "El cliente todavía no confirmó.",
    nextDecision: "Confirmar fecha y separar 300 unidades con HT de las 300 sin HT.",
    lines: [
      { id: "proq-1", product: "Pallet Proquimur 120 × 100", requested: 300, delivered: 0, pending: 300, preparation: "Con HT" },
      { id: "proq-2", product: "Pallet Proquimur 120 × 100", requested: 300, delivered: 0, pending: 300, preparation: "Sin HT" },
    ],
    evidence: [
      excel("Plan diario · Plan semanal · fila 63"),
      excel("Stock Palbin · STOCK · fila 19", "300 sin marcar y 300 marcados en la foto histórica."),
      pending("Compromiso vigente", "La fecha final no está confirmada."),
    ],
  },
  {
    id: "order-msj-balance",
    orderNumber: "Saldo-42",
    client: "Molinos San José",
    requestedDate: "2026-08-13",
    committedDate: null,
    requested: 600,
    delivered: 300,
    pending: 300,
    status: "parcial",
    risk: "alto",
    remittance: null,
    blocker: "El saldo no tiene una nueva fecha confirmada.",
    nextDecision: "Asignar origen para 300 unidades y confirmar el próximo viaje.",
    lines: [
      { id: "msj-1", product: "Pallet MSJ 220 × 120", requested: 600, delivered: 300, pending: 300, preparation: "Sin HT" },
    ],
    evidence: [
      excel("Plan diario · Plan semanal · fila 42", "Figura “saldo para completar 300 pallets”."),
      demo("Escenario didáctico", "Se parte de 600 para hacer visible la entrega parcial."),
    ],
  },
  {
    id: "order-samifruit-aug",
    orderNumber: "Plan-60",
    client: "Samifruit",
    requestedDate: "2026-08-11",
    committedDate: "2026-08-11",
    requested: 110,
    delivered: 0,
    pending: 110,
    status: "planificado",
    risk: "critico",
    remittance: null,
    blocker: "El plan requiere cepillado y HT; no consta un ciclo con 3–4 horas de margen.",
    nextDecision: "Reservar ciclo HT antes de confirmar la hora de carga.",
    lines: [
      { id: "sami-1", product: "Pallet 116,5 × 114 cepillado", requested: 110, delivered: 0, pending: 110, preparation: "Con HT" },
    ],
    evidence: [
      excel("Plan diario · Plan semanal · fila 60"),
      rule("Tratamiento térmico", "El relevamiento indica una duración aproximada de 3–4 horas."),
      demo("Escenario didáctico", "La falta de margen se usa para mostrar la alerta."),
    ],
  },
  {
    id: "order-granja-pocha",
    orderNumber: "Plan-65",
    client: "Granja Pocha",
    requestedDate: "2026-08-12",
    committedDate: "2026-08-12",
    requested: 600,
    delivered: 600,
    pending: 0,
    status: "cumplido",
    risk: "bien",
    remittance: null,
    blocker: null,
    nextDecision: "Ninguna. El plan figura entregado.",
    lines: [
      { id: "pocha-1", product: "Pallet punto rojo 120 × 100", requested: 400, delivered: 400, pending: 0, preparation: "Marcado" },
      { id: "pocha-2", product: "Pallet Mercosur exportación 120 × 100", requested: 200, delivered: 200, pending: 0, preparation: "Marcado" },
    ],
    evidence: [excel("Plan diario · Plan semanal · fila 65")],
  },
  {
    id: "order-afb",
    orderNumber: "Plan-62",
    client: "AFB",
    requestedDate: "2026-08-11",
    committedDate: "2026-08-11",
    requested: 600,
    delivered: 600,
    pending: 0,
    status: "cumplido",
    risk: "bien",
    remittance: null,
    blocker: null,
    nextDecision: "Ninguna. El plan figura entregado.",
    lines: [
      { id: "afb-1", product: "Pallet 120 × 100 Mercosur cepillado", requested: 600, delivered: 600, pending: 0, preparation: "Marcado" },
    ],
    evidence: [excel("Plan diario · Plan semanal · fila 62")],
  },
  {
    id: "order-pamer-641",
    orderNumber: "Sin número visible",
    client: "Pamer",
    requestedDate: "2026-08-12",
    committedDate: "2026-08-12",
    requested: 360,
    delivered: 360,
    pending: 0,
    status: "cumplido",
    risk: "bien",
    remittance: "641",
    blocker: null,
    nextDecision: "Validar el número de orden para cerrar la trazabilidad.",
    lines: [
      { id: "641-1", product: "Pallet 216 × 110 simple", requested: 100, delivered: 100, pending: 0, preparation: "Con HT" },
      { id: "641-2", product: "Pallet 216 × 110 simple", requested: 41, delivered: 41, pending: 0, preparation: "Sin HT" },
      { id: "641-3", product: "Pallet 100 × 80", requested: 100, delivered: 100, pending: 0, preparation: "Sin HT" },
      { id: "641-4", product: "Pallet 100 × 100", requested: 59, delivered: 59, pending: 0, preparation: "Sin HT" },
      { id: "641-5", product: "Pallet 120 × 80", requested: 20, delivered: 20, pending: 0, preparation: "Con HT" },
      { id: "641-6", product: "Pallet 120 × 90 cerrado", requested: 40, delivered: 40, pending: 0, preparation: "Con HT" },
    ],
    evidence: [
      excel("Órdenes de compra · hoja PAMER · filas 10–15"),
      pending("Número de orden", "No aparece visible en el bloque del remito 641."),
    ],
  },
];

export const alerts: AlertItem[] = [
  {
    id: "alert-frutura-arrival",
    level: "critico",
    title: "No llegaron los pallets de Frutura",
    subtitle: "600 pallets 122 × 102 · compromiso del viernes 14",
    what: "La mercadería prevista no llegó y el despacho quedó bloqueado.",
    why: "Sin una fecha nueva no se puede prometer la entrega ni reservar el viaje correcto.",
    nextDecision: "Confirmar la llegada y renegociar la fecha con el cliente.",
    affects: "Frutura · Plan-14A",
    dueDate: "2026-08-14",
    evidence: [excel("Plan diario · fila 74"), demo("Saldo didáctico de 600 unidades")],
  },
  {
    id: "alert-samifruit-ht",
    level: "critico",
    title: "HT sin margen suficiente",
    subtitle: "110 pallets cepillados para Samifruit",
    what: "La preparación exige HT y no consta un ciclo reservado antes de la carga.",
    why: "El tratamiento requiere aproximadamente 3–4 horas y no puede resolverse al momento de despachar.",
    nextDecision: "Reservar un ciclo HT y ajustar la hora de salida.",
    affects: "Samifruit · Plan-60",
    dueDate: "2026-08-11",
    evidence: [excel("Plan diario · fila 60"), rule("HT: 3–4 horas"), demo("Horario de carga no disponible")],
  },
  {
    id: "alert-proquimur-confirm",
    level: "alto",
    title: "Proquimur espera confirmación",
    subtitle: "300 pallets con HT + 300 sin HT",
    what: "El plan tiene cantidades, pero el compromiso final no está confirmado.",
    why: "Separar stock o transporte antes de confirmar puede bloquear otros pedidos.",
    nextDecision: "Confirmar fecha y condiciones; después reservar stock y viaje.",
    affects: "Proquimur · Plan-63",
    dueDate: "2026-08-11",
    evidence: [excel("Plan diario · fila 63"), excel("Stock Palbin · fila 19")],
  },
  {
    id: "alert-msj-balance",
    level: "alto",
    title: "Entrega parcial sin próximo viaje",
    subtitle: "Quedan 300 pallets para Molinos San José",
    what: "El plan muestra un saldo, pero no una nueva fecha confirmada.",
    why: "El pendiente puede desaparecer de la agenda aunque comercialmente siga abierto.",
    nextDecision: "Asignar origen, fecha y transporte al saldo.",
    affects: "Molinos San José · Saldo-42",
    dueDate: "2026-08-13",
    evidence: [excel("Plan diario · fila 42"), demo("Entrega inicial de 300 unidades")],
  },
  {
    id: "alert-pamer-treatment",
    level: "medio",
    title: "280 unidades Pamer esperan tratamiento",
    subtitle: "Tres productos concentran casi todo el pendiente",
    what: "Hay 140 unidades 160 × 110, 70 unidades 216 × 110 y 60 unidades ADIUM REF sin tratar.",
    why: "El total físico existe, pero esas unidades todavía no están listas para pedidos con HT.",
    nextDecision: "Priorizar el secadero según los próximos compromisos.",
    affects: "Stock Pamer",
    dueDate: "2026-08-15",
    evidence: [excel("Stock Pamer · STOCK · filas 12, 28 y 29")],
  },
];

export const agenda: AgendaItem[] = [
  { id: "ag-10-msj", date: "2026-08-10", type: "entrega", status: "hecho", title: "Entrega Molinos San José", description: "Pallets 220 × 120; la cantidad no quedó estructurada.", client: "Molinos San José", evidence: excel("Plan diario · fila 54") },
  { id: "ag-11-afb", date: "2026-08-11", type: "entrega", status: "hecho", title: "600 pallets Mercosur cepillados", description: "El plan figura entregado.", client: "AFB", evidence: excel("Plan diario · fila 62") },
  { id: "ag-11-proq", date: "2026-08-11", type: "decision", status: "pendiente", title: "Confirmar pedido dividido por HT", description: "300 con HT y 300 sin HT.", client: "Proquimur", evidence: excel("Plan diario · fila 63") },
  { id: "ag-11-sami", date: "2026-08-11", type: "ht", status: "bloqueado", title: "Reservar ciclo HT", description: "110 pallets cepillados; escenario para mostrar falta de margen.", client: "Samifruit", evidence: demo("Escenario HT") },
  { id: "ag-12-pocha", date: "2026-08-12", type: "entrega", status: "hecho", title: "600 pallets entregados", description: "400 punto rojo + 200 Mercosur exportación.", client: "Granja Pocha", evidence: excel("Plan diario · fila 65") },
  { id: "ag-12-pamer", date: "2026-08-12", type: "entrega", status: "hecho", title: "Remito 641", description: "360 unidades en seis líneas; falta el número de orden visible.", client: "Pamer", evidence: excel("Órdenes Pamer · filas 10–15") },
  { id: "ag-13-fru", date: "2026-08-13", type: "entrega", status: "hecho", title: "600 pallets entregados", description: "Pallet 120 × 100.", client: "Frutura", evidence: excel("Plan diario · fila 69") },
  { id: "ag-13-msj", date: "2026-08-13", type: "decision", status: "pendiente", title: "Programar saldo de 300", description: "El plan no conserva nueva fecha.", client: "Molinos San José", evidence: excel("Plan diario · fila 42") },
  { id: "ag-14-pamer", date: "2026-08-14", type: "decision", status: "pendiente", title: "Revisar prioridades", description: "Validar si hubo cambios después de la entrega del martes.", client: "Pamer", evidence: excel("Plan diario · fila 73") },
  { id: "ag-14-fru", date: "2026-08-14", type: "entrega", status: "bloqueado", title: "Entrega bloqueada", description: "Los pallets 122 × 102 no llegaron.", client: "Frutura", evidence: excel("Plan diario · fila 74") },
  { id: "ag-15-fru", date: "2026-08-15", type: "ht", status: "bloqueado", title: "Pallet 120 × 112 con HT", description: "El plan vuelve a indicar que los pallets no llegaron.", client: "Frutura", evidence: excel("Plan diario · fila 78") },
  { id: "ag-17-arrival", date: "2026-08-17", type: "produccion", status: "pendiente", title: "Nueva llegada propuesta", description: "Ejemplo de cómo reprogramar el material faltante.", client: "Frutura", evidence: demo("Reprogramación didáctica") },
  { id: "ag-18-mark", date: "2026-08-18", type: "marcado", status: "pendiente", title: "Marcar lote 122 × 102", description: "Transformación interna: no aumenta el stock físico.", client: "Frutura", evidence: demo("Secuencia didáctica") },
  { id: "ag-19-dispatch", date: "2026-08-19", type: "entrega", status: "pendiente", title: "Nueva salida propuesta", description: "Viaje sujeto a llegada y marcado del lote.", client: "Frutura", evidence: demo("Reprogramación didáctica") },
];

export const stock: StockItem[] = [
  { id: "stock-palbin-122102", source: "Palbin", product: "Pallet 122 × 102", pendingLabel: "Sin marcar", readyLabel: "Marcado", pendingPreparation: 0, ready: 74, total: 74, coverageDays: 0, risk: "critico", note: "La foto tiene 74 listos frente al escenario de 600 unidades.", evidence: excel("Stock Palbin · STOCK · fila 13") },
  { id: "stock-palbin-msj220", source: "Palbin", product: "Pallet 220 × 120 MSJ", pendingLabel: "Sin marcar", readyLabel: "Marcado", pendingPreparation: 27, ready: 0, total: 27, coverageDays: 1, risk: "critico", note: "El saldo planificado es mayor que el stock visible.", evidence: excel("Stock Palbin · STOCK · fila 46") },
  { id: "stock-palbin-proq", source: "Palbin", product: "Proquimur 120 × 100", pendingLabel: "Sin marcar", readyLabel: "Marcado", pendingPreparation: 300, ready: 300, total: 600, coverageDays: 5, risk: "alto", note: "La cantidad coincide con el plan, pero solo la mitad figura lista.", evidence: excel("Stock Palbin · STOCK · fila 19") },
  { id: "stock-palbin-citrus", source: "Palbin", product: "Pallet Citrus 120 × 100", pendingLabel: "Sin marcar", readyLabel: "Marcado", pendingPreparation: 210, ready: 580, total: 790, coverageDays: 6, risk: "alto", note: "210 unidades requieren marcado.", evidence: excel("Stock Palbin · STOCK · fila 10") },
  { id: "stock-palbin-pocha", source: "Palbin", product: "Granja Pocha punto rojo", pendingLabel: "Sin marcar", readyLabel: "Marcado", pendingPreparation: 100, ready: 232, total: 332, coverageDays: 8, risk: "medio", note: "100 unidades todavía no están listas.", evidence: excel("Stock Palbin · STOCK · fila 15") },
  { id: "stock-palbin-mercosur", source: "Palbin", product: "Pallet Mercosur con corte", pendingLabel: "Sin marcar", readyLabel: "Marcado", pendingPreparation: 922, ready: 520, total: 1442, coverageDays: 14, risk: "bien", note: "Es el mayor stock físico de la foto, aunque 922 esperan marcado.", evidence: excel("Stock Palbin · STOCK · fila 35") },
  { id: "stock-pamer-216", source: "Pamer", product: "216 × 110 simples reforzadas", pendingLabel: "Sin tratar", readyLabel: "Tratado", pendingPreparation: 70, ready: 0, total: 70, coverageDays: null, risk: "alto", note: "Hay stock físico, pero nada tratado.", evidence: excel("Stock Pamer · STOCK · fila 29") },
  { id: "stock-pamer-160", source: "Pamer", product: "160 × 110 simples reforzadas", pendingLabel: "Sin tratar", readyLabel: "Tratado", pendingPreparation: 140, ready: 0, total: 140, coverageDays: null, risk: "alto", note: "El consumo no está estructurado; no se calculan días.", evidence: excel("Stock Pamer · STOCK · fila 28") },
  { id: "stock-pamer-adium", source: "Pamer", product: "120 × 100 ADIUM REF", pendingLabel: "Sin tratar", readyLabel: "Tratado", pendingPreparation: 60, ready: 240, total: 300, coverageDays: 12, risk: "medio", note: "60 unidades esperan tratamiento.", evidence: excel("Stock Pamer · STOCK · fila 12") },
  { id: "stock-pamer-14580", source: "Pamer", product: "145 × 80 abiertas REF", pendingLabel: "Sin tratar", readyLabel: "Tratado", pendingPreparation: 0, ready: 110, total: 110, coverageDays: null, risk: "bien", note: "Todo el stock visible está tratado.", evidence: excel("Stock Pamer · STOCK · fila 23") },
];

export const deliveries: Delivery[] = [
  {
    id: "delivery-603",
    date: "2026-07-28",
    client: "Pamer",
    quantity: 500,
    status: "completo",
    transport: "No consta en la orden",
    remittance: "603",
    preparation: "380 sin HT · 120 con HT",
    balance: 0,
    blocker: null,
    nextStep: "Ninguno. Orden y movimientos de salida conciliados.",
    evidence: [excel("Órdenes Pamer · filas 4–8"), excel("Stock Pamer · MOVIMIENTOS · filas 53–57")],
  },
  {
    id: "delivery-frutura-14",
    date: "2026-08-14",
    client: "Frutura",
    quantity: 600,
    status: "bloqueado",
    transport: "Transporte externo previsto",
    remittance: null,
    preparation: "Marcado pendiente de llegada",
    balance: 600,
    blocker: "No llegaron los pallets.",
    nextStep: "Reprogramar llegada, preparación y viaje.",
    evidence: [excel("Plan diario · fila 74"), demo("Saldo didáctico")],
  },
  {
    id: "delivery-proquimur",
    date: "2026-08-11",
    client: "Proquimur",
    quantity: 600,
    status: "sin-camion",
    transport: "Sin asignar",
    remittance: null,
    preparation: "300 con HT · 300 sin HT",
    balance: 600,
    blocker: "Faltan confirmación y transporte.",
    nextStep: "Confirmar el pedido antes de reservar el viaje.",
    evidence: [excel("Plan diario · fila 63"), demo("Transporte sin asignar")],
  },
  {
    id: "delivery-msj-balance",
    date: "2026-08-13",
    client: "Molinos San José",
    quantity: 600,
    status: "parcial",
    transport: "Próximo viaje sin asignar",
    remittance: null,
    preparation: "Sin HT",
    balance: 300,
    blocker: "El saldo no tiene nueva fecha.",
    nextStep: "Programar 300 unidades restantes.",
    evidence: [excel("Plan diario · fila 42"), demo("Entrega inicial de 300 unidades")],
  },
  {
    id: "delivery-samifruit",
    date: "2026-08-11",
    client: "Samifruit",
    quantity: 110,
    status: "sin-camion",
    transport: "Sin confirmar",
    remittance: null,
    preparation: "Cepillado + HT",
    balance: 110,
    blocker: "No consta margen para HT ni transporte confirmado.",
    nextStep: "Reservar ciclo HT y después confirmar carga.",
    evidence: [excel("Plan diario · fila 60"), rule("HT: 3–4 horas"), demo("Transporte sin confirmar")],
  },
  {
    id: "delivery-pocha",
    date: "2026-08-12",
    client: "Granja Pocha",
    quantity: 600,
    status: "completo",
    transport: "Transporte externo",
    remittance: null,
    preparation: "Marcado",
    balance: 0,
    blocker: null,
    nextStep: "Ninguno. El plan figura entregado.",
    evidence: [excel("Plan diario · fila 65")],
  },
];

export const stockTotals = {
  palbin: { pending: 2150, ready: 2717, total: 4867 },
  pamer: { pending: 271, ready: 460, total: 731 },
};

export const compatibilityRule = {
  allowed: "MSJ puede sustituir a Cousa",
  blocked: "Cousa no puede sustituir a MSJ",
  evidence: rule("Especificaciones de pallets", "La compatibilidad es dirigida, no simétrica."),
};

export const transformationChecks = [
  { id: "marcado", fromState: "Sin marcar", toState: "Marcado", fromDelta: -100, toDelta: 100 },
  { id: "ht", fromState: "Sin tratar", toState: "Tratado", fromDelta: -100, toDelta: 100 },
] as const;
