export type OrderStatus = "bloqueado" | "coordinacion" | "completado";
export type OperationStage = "negociacion" | "produccion" | "logistica" | "completado";
export type DeliveryStatus = "programada" | "en_transito" | "parcial" | "completa" | "fallida" | "rechazada";
export type OrderUpdateKind = "cambio" | "entrega" | "direccion" | "despacho" | "incidencia";

export interface OrderLine {
  id: string;
  product: string;
  quantity: number;
  preparation?: string;
}

export interface OperationOrder {
  id: string;
  reference: string;
  client: string;
  product: string;
  requested: number;
  delivered: number;
  pending: number;
  status: OrderStatus;
  statusLabel: "Bloqueado" | "En coordinación" | "Completado";
  stage?: OperationStage;
  dateLabel: string;
  plannedDate?: string;
  originalPlannedDate?: string;
  transport: string;
  supply: string;
  preparation: string;
  logistics: string;
  delivery: string;
  action: string;
  remittance?: string;
  deliveryAddress?: string;
  deliveryStatus?: DeliveryStatus;
  dispatchedAt?: string;
  deliveredAt?: string;
  lines: OrderLine[];
  source: string;
}

export interface OrderChange {
  id: string;
  changedAt: string;
  kind?: OrderUpdateKind;
  note?: string;
  changes: Array<{ field: string; from: string; to: string }>;
}

export const stageLabels: Record<OperationStage, string> = {
  negociacion: "Negociación",
  produccion: "Producción",
  logistica: "Logística",
  completado: "Completado",
};

export function getOrderStage(order: OperationOrder): OperationStage {
  if (order.stage) return order.stage;
  return order.status === "completado" ? "completado" : "negociacion";
}

function dateFromLabel(label: string) {
  const day = Number(label.match(/\d+/)?.[0]);
  if (!Number.isFinite(day)) return "2026-08-10";
  return label.toLocaleLowerCase("es").includes("julio")
    ? `2026-07-${String(day).padStart(2, "0")}`
    : `2026-08-${String(day).padStart(2, "0")}`;
}

export function getOrderPlannedDate(order: OperationOrder) {
  return order.plannedDate ?? dateFromLabel(order.dateLabel);
}

export function formatPlannedDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long" }).format(value);
}

export type ProviderType = "Aserradero" | "Transporte";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  supplies: string;
}

export type ProductKind = "Pallet" | "Piso" | "Bin";
export type ProductTreatment = "Marcado" | "HT" | "Marcado y HT";
type ProductCatalog = "Palbin" | "Pamer";

export interface Product {
  id: string;
  kind: ProductKind;
  measure?: string;
  treatment?: ProductTreatment;
}

type ProductSeed = Product & {
  code: string;
  name: string;
  assignment?: string;
  specification?: string;
  catalog: ProductCatalog;
};

export const providers: Provider[] = [
  { id: "blanc", name: "Blanc", type: "Aserradero", supplies: "Pallets y mercadería de terceros" },
  { id: "mirasol", name: "Mirasol", type: "Aserradero", supplies: "Pallets y mercadería de terceros" },
  { id: "linares", name: "Linares", type: "Transporte", supplies: "Traslado y entrega de pedidos" },
  { id: "milton", name: "Milton", type: "Transporte", supplies: "Traslado y entrega de pedidos" },
  { id: "matias", name: "Matías", type: "Transporte", supplies: "Traslado y entrega de pedidos" },
];

const productSeeds = [
  { id: "palbin-p01", code: "P01", name: "Cristal PET", kind: "Pallet", measure: "106 × 119", assignment: "Cristal PET", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p02", code: "P02", name: "Palets Citrus", kind: "Pallet", measure: "120 × 100", assignment: "Citrus", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p03", code: "P03", name: "Molinos San José", kind: "Pallet", measure: "120 × 100", assignment: "Molinos San José", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p04", code: "P04", name: "Saint Gobain", kind: "Pallet", measure: "106 × 106", assignment: "Saint Gobain", catalog: "Palbin" },
  { id: "palbin-p05", code: "P05", name: "Pallet", kind: "Pallet", measure: "122 × 102", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p09", code: "P09", name: "Pisos exportación", kind: "Piso", assignment: "Exportación", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p10", code: "P10", name: "Fricasa", kind: "Pallet", measure: "120 × 100", assignment: "Fricasa", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p11", code: "P11", name: "Proquimur", kind: "Pallet", measure: "120 × 100", assignment: "Proquimur", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p12", code: "P12", name: "Conaprole", kind: "Pallet", measure: "120 × 100", assignment: "Conaprole", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p13", code: "P13", name: "Pallet", kind: "Pallet", measure: "120 × 80", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p14", code: "P14", name: "Pisos Chacra", kind: "Piso", assignment: "Chacra", catalog: "Palbin" },
  { id: "palbin-p15", code: "P15", name: "Bins X3 exportación", kind: "Bin", assignment: "Exportación", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p16", code: "P16", name: "Bins X2 exportación", kind: "Bin", assignment: "Exportación", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p17", code: "P17", name: "Bins Chacra azul", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
  { id: "palbin-p18", code: "P18", name: "Bins Chacra blanco", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
  { id: "palbin-p19", code: "P19", name: "Bins Chacra rojo", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
  { id: "palbin-p20", code: "P20", name: "Bins Chacra anaranjado", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
  { id: "palbin-p21", code: "P21", name: "AFB", kind: "Pallet", measure: "120 × 100", assignment: "AFB", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p22", code: "P22", name: "AFB", kind: "Pallet", measure: "220 × 117", assignment: "AFB", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p23", code: "P23", name: "Pallet tipo MSJ Mirasol", kind: "Pallet", measure: "120 × 120", assignment: "Mercosur con rebaje en todas las tablas MSJ", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p24", code: "P24", name: "Bins Lio X3", kind: "Bin", assignment: "Lio", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p25", code: "P25", name: "Pallet Citrus", kind: "Pallet", measure: "103 × 121", assignment: "Citrus", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p26", code: "P26", name: "Pallet número 6", kind: "Pallet", measure: "122 × 102", assignment: "Azucitrus", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p27", code: "P27", name: "Pallet Mercosur con corte", kind: "Pallet", measure: "120 × 100", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p28", code: "P28", name: "Pallet Mercosur sin corte", kind: "Pallet", measure: "120 × 100", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p29", code: "P29", name: "Aluminios del Uruguay", kind: "Pallet", measure: "120 × 100", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p30", code: "P30", name: "San Miguel", kind: "Pallet", measure: "113 × 113", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p31", code: "P31", name: "Pallet", kind: "Pallet", measure: "120 × 130", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p32", code: "P32", name: "Pallet", kind: "Pallet", measure: "112 × 120", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p33", code: "P33", name: "San Miguel", kind: "Pallet", measure: "116,5 × 114", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p34", code: "P34", name: "San Miguel", kind: "Pallet", measure: "120 × 120", catalog: "Palbin" },
  { id: "palbin-p35", code: "P35", name: "San Miguel reforzado", kind: "Pallet", measure: "120 × 120", catalog: "Palbin" },
  { id: "palbin-p36", code: "P36", name: "Pallet Preinco", kind: "Pallet", measure: "120 × 100", assignment: "Preinco", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p37", code: "P37", name: "Bins Chacra Chapicuy", kind: "Bin", assignment: "Frutos del Chapicuy", catalog: "Palbin" },
  { id: "palbin-p38", code: "P38", name: "Pallet MSJ", kind: "Pallet", measure: "220 × 120", assignment: "Molinos San José", treatment: "Marcado", catalog: "Palbin" },
  { id: "palbin-p39", code: "P39", name: "Avanti", kind: "Pallet", measure: "120 × 100", assignment: "Avanti", treatment: "Marcado", catalog: "Palbin" },
  { id: "pamer-p01", code: "P01", name: "Pallet", kind: "Pallet", measure: "100 × 80", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p02", code: "P02", name: "Pallet", kind: "Pallet", measure: "100 × 100", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p03", code: "P03", name: "Pallet", kind: "Pallet", measure: "100 × 120", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p04", code: "P04", name: "Pallet", kind: "Pallet", measure: "120 × 100", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p05", code: "P05", name: "Pallet", kind: "Pallet", measure: "120 × 80", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p06", code: "P06", name: "Pallet", kind: "Pallet", measure: "120 × 80", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p07", code: "P07", name: "Pallet", kind: "Pallet", measure: "120 × 90", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p08", code: "P08", name: "Pallet", kind: "Pallet", measure: "120 × 100", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p09", code: "P09", name: "Pallet", kind: "Pallet", measure: "120 × 100", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p10", code: "P10", name: "Pallet", kind: "Pallet", measure: "120 × 120", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p11", code: "P11", name: "Pallet", kind: "Pallet", measure: "120 × 120", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p12", code: "P12", name: "Pallet", kind: "Pallet", measure: "130 × 90", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p13", code: "P13", name: "Pallet", kind: "Pallet", measure: "140 × 120", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p14", code: "P14", name: "Pallet", kind: "Pallet", measure: "140 × 120", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p15", code: "P15", name: "Pallet", kind: "Pallet", measure: "145 × 80", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p16", code: "P16", name: "Pallet", kind: "Pallet", measure: "145 × 100", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p17", code: "P17", name: "Pallet", kind: "Pallet", measure: "145 × 100", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p18", code: "P18", name: "Pallet", kind: "Pallet", measure: "155 × 70", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p19", code: "P19", name: "Pallet", kind: "Pallet", measure: "160 × 80", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p20", code: "P20", name: "Pallet", kind: "Pallet", measure: "160 × 110", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p21", code: "P21", name: "Pallet", kind: "Pallet", measure: "216 × 110", treatment: "HT", catalog: "Pamer" },
  { id: "pamer-p22", code: "P22", name: "Pallet", kind: "Pallet", measure: "130 × 120", catalog: "Pamer" },
] satisfies ProductSeed[];

function combineTreatment(current?: ProductTreatment, next?: ProductTreatment) {
  if (!current) return next;
  if (!next || current === next || current === "Marcado y HT") return current;
  return "Marcado y HT";
}

export const products: Product[] = productSeeds.reduce<Product[]>((unique, product) => {
  if (!product.measure) {
    unique.push({ id: product.id, kind: product.kind, treatment: product.treatment });
    return unique;
  }

  const existing = unique.find((item) => item.kind === product.kind && item.measure === product.measure);
  if (existing) {
    existing.treatment = combineTreatment(existing.treatment, product.treatment);
    return unique;
  }

  unique.push({ id: product.id, kind: product.kind, measure: product.measure, treatment: product.treatment });
  return unique;
}, []);

export const orders: OperationOrder[] = [
  {
    id: "frutura-74",
    reference: "Plan 74",
    client: "Frutura",
    product: "Pallet 122 × 102",
    requested: 600,
    delivered: 0,
    pending: 600,
    status: "bloqueado",
    statusLabel: "Bloqueado",
    dateLabel: "Viernes 14",
    transport: "Linares",
    supply: "Los pallets previstos no llegaron",
    preparation: "Marcado requerido",
    logistics: "Viaje con Linares detenido",
    delivery: "0 de 600 entregados",
    action: "Reprogramar la entrega cuando ingrese la mercadería.",
    lines: [{ id: "frutura-74-1", product: "Pallet 122 × 102", quantity: 600, preparation: "Marcado" }],
    source: "Plan semanal · fila 74",
  },
  {
    id: "proquimur-63",
    reference: "Plan 63",
    client: "Proquimur",
    product: "Pallet 120 × 100 Mercosur",
    requested: 600,
    delivered: 0,
    pending: 600,
    status: "coordinacion",
    statusLabel: "En coordinación",
    dateLabel: "Martes 11",
    transport: "Linares",
    supply: "600 en stock Palbin · 300 marcados y 300 sin marcar",
    preparation: "300 con HT · 300 sin HT",
    logistics: "Linares asignado",
    delivery: "Pedido en coordinación",
    action: "Coordinar fecha con el cliente y reservar el viaje.",
    lines: [
      { id: "proquimur-63-1", product: "Pallet 120 × 100 Mercosur", quantity: 300, preparation: "Con HT" },
      { id: "proquimur-63-2", product: "Pallet 120 × 100 Mercosur", quantity: 300, preparation: "Sin HT" },
    ],
    source: "Plan semanal · fila 63 / Stock Palbin · fila 19",
  },
  {
    id: "pamer-184833",
    reference: "Orden 184833",
    client: "Pamer",
    product: "Cinco líneas de pallets",
    requested: 500,
    delivered: 500,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "28 de julio",
    transport: "No registrado",
    supply: "Orden despachada en cinco líneas",
    preparation: "380 sin HT · 120 con HT",
    logistics: "Remito 603",
    delivery: "500 entregados · saldo 0",
    action: "Pedido cerrado.",
    remittance: "603",
    lines: [
      { id: "184833-1", product: "Pallet 100 × 100 doble entrada", quantity: 100, preparation: "Sin HT" },
      { id: "184833-2", product: "Pallet 100 × 100", quantity: 20, preparation: "Con HT" },
      { id: "184833-3", product: "Pallet 120 × 80 doble entrada", quantity: 180, preparation: "Sin HT" },
      { id: "184833-4", product: "Pallet 120 × 130", quantity: 100, preparation: "Sin HT" },
      { id: "184833-5", product: "Pallet 100 × 120 Mercosur", quantity: 100, preparation: "Con HT" },
    ],
    source: "Órdenes Pamer · filas 4–8",
  },
  {
    id: "pamer-641",
    reference: "Remito 641",
    client: "Pamer",
    product: "Seis líneas de pallets",
    requested: 360,
    delivered: 360,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "12 de agosto",
    transport: "Propio",
    supply: "Seis líneas despachadas",
    preparation: "200 sin HT · 160 con HT",
    logistics: "Transporte propio · remito 641",
    delivery: "360 entregados · saldo 0",
    action: "Pedido cerrado.",
    remittance: "641",
    lines: [
      { id: "641-1", product: "Pallet 216 × 110 simple", quantity: 100, preparation: "Con HT" },
      { id: "641-2", product: "Pallet 216 × 110 simple", quantity: 41, preparation: "Sin HT" },
      { id: "641-3", product: "Pallet 100 × 80", quantity: 100, preparation: "Sin HT" },
      { id: "641-4", product: "Pallet 100 × 100", quantity: 59, preparation: "Sin HT" },
      { id: "641-5", product: "Pallet 120 × 80", quantity: 20, preparation: "Con HT" },
      { id: "641-6", product: "Pallet 120 × 90 cerrado", quantity: 40, preparation: "Con HT" },
    ],
    source: "Órdenes Pamer · filas 10–15",
  },
  {
    id: "afb-62",
    reference: "Plan 62",
    client: "AFB",
    product: "Pallet 120 × 100 Mercosur cepillado",
    requested: 600,
    delivered: 600,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Martes 11",
    transport: "Linares",
    supply: "Pedido completo",
    preparation: "Mercosur cepillado",
    logistics: "Linares · un viaje",
    delivery: "600 entregados",
    action: "Pedido cerrado.",
    lines: [{ id: "afb-62-1", product: "Pallet 120 × 100 Mercosur cepillado", quantity: 600 }],
    source: "Plan semanal · fila 62",
  },
  {
    id: "granja-pocha-65",
    reference: "Plan 65",
    client: "Granja Pocha",
    product: "Punto rojo y Mercosur exportación",
    requested: 600,
    delivered: 600,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Miércoles 12",
    transport: "Linares",
    supply: "Dos líneas completas",
    preparation: "400 punto rojo · 200 Mercosur exportación",
    logistics: "Linares · un viaje",
    delivery: "600 entregados",
    action: "Pedido cerrado.",
    lines: [
      { id: "pocha-65-1", product: "Pallet punto rojo 120 × 100", quantity: 400 },
      { id: "pocha-65-2", product: "Pallet Mercosur exportación 120 × 100", quantity: 200 },
    ],
    source: "Plan semanal · fila 65",
  },
  {
    id: "forestal-66",
    reference: "Plan 66",
    client: "Forestal Oriental",
    product: "Pallet 120 × 130",
    requested: 50,
    delivered: 50,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Miércoles 12",
    transport: "Matías",
    supply: "Pedido completo",
    preparation: "Sin HT · sin corte de esquina · sin rebaje",
    logistics: "Matías · un viaje",
    delivery: "50 entregados",
    action: "Pedido cerrado.",
    lines: [{ id: "forestal-66-1", product: "Pallet 120 × 130", quantity: 50, preparation: "Sin HT" }],
    source: "Plan semanal · fila 66",
  },
  {
    id: "frutura-67",
    reference: "Plan 67",
    client: "Frutura",
    product: "Pallet 122 × 102",
    requested: 518,
    delivered: 518,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Miércoles 12",
    transport: "Milton",
    supply: "Pedido completo",
    preparation: "Pallet 122 × 102",
    logistics: "Milton · un viaje",
    delivery: "518 entregados",
    action: "Pedido cerrado.",
    lines: [{ id: "frutura-67-1", product: "Pallet 122 × 102", quantity: 518 }],
    source: "Plan semanal · fila 67",
  },
  {
    id: "frutura-69",
    reference: "Plan 69",
    client: "Frutura",
    product: "Pallet 120 × 100",
    requested: 600,
    delivered: 600,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Jueves 13",
    transport: "Linares",
    supply: "Pedido completo",
    preparation: "Pallet 120 × 100",
    logistics: "Linares · un viaje",
    delivery: "600 entregados",
    action: "Pedido cerrado.",
    lines: [{ id: "frutura-69-1", product: "Pallet 120 × 100", quantity: 600 }],
    source: "Plan semanal · fila 69",
  },
  {
    id: "azucitrus-75",
    reference: "Plan 75",
    client: "Azucitrus",
    product: "Pallet 120 × 100",
    requested: 600,
    delivered: 600,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Viernes 14",
    transport: "Linares",
    supply: "Pedido completo",
    preparation: "Pallet 120 × 100",
    logistics: "Linares · un viaje",
    delivery: "600 entregados",
    action: "Pedido cerrado.",
    lines: [{ id: "azucitrus-75-1", product: "Pallet 120 × 100", quantity: 600 }],
    source: "Plan semanal · fila 75",
  },
  {
    id: "san-miguel-76",
    reference: "Plan 76",
    client: "San Miguel",
    product: "Dos medidas de pallets",
    requested: 360,
    delivered: 360,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Viernes 14",
    transport: "Milton",
    supply: "Dos líneas completas",
    preparation: "250 de 120 × 120 · 110 de 116,5 × 114",
    logistics: "Milton · un viaje",
    delivery: "360 entregados",
    action: "Pedido cerrado.",
    lines: [
      { id: "san-miguel-76-1", product: "Pallet 120 × 120", quantity: 250 },
      { id: "san-miguel-76-2", product: "Pallet 116,5 × 114", quantity: 110 },
    ],
    source: "Plan semanal · fila 76",
  },
  {
    id: "pontevedra-79",
    reference: "Plan 79",
    client: "Pontevedra",
    product: "Pallet Mercosur con HT",
    requested: 150,
    delivered: 150,
    pending: 0,
    status: "completado",
    statusLabel: "Completado",
    dateLabel: "Sábado 15",
    transport: "Matías",
    supply: "Pedido completo",
    preparation: "Mercosur con HT",
    logistics: "Matías · un viaje",
    delivery: "150 entregados",
    action: "Pedido cerrado.",
    lines: [{ id: "pontevedra-79-1", product: "Pallet Mercosur", quantity: 150, preparation: "Con HT" }],
    source: "Plan semanal · fila 79",
  },
];
