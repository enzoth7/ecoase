var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// app/data.ts
function getOrderStage(order) {
  if (order.stage) return order.stage;
  return "negociacion";
}
function getOrderPalletStages(order) {
  let produced = 0, heatProduced = 0, heatTreated = 0;
  for (const line of order.lines) {
    const fromProduction = (line.productionAllocations ?? []).filter((allocation) => allocation.status === "completed" && allocation.resultDestination !== "stock").reduce((sum, allocation) => sum + Math.max(allocation.actualQuantity ?? allocation.plannedQuantity, 0), 0);
    const lineProduced = Math.min(Math.max(fromProduction, line.readyReservedQuantity ?? 0), line.quantity);
    produced += lineProduced;
    if (lineRequiresHeat(line)) {
      heatProduced += lineProduced;
      heatTreated += Math.min(line.treatedQuantity ?? 0, lineProduced);
    }
  }
  const shipments = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled");
  const sentByShipments = shipments.filter((shipment) => ["dispatched", "delivered"].includes(shipment.status)).flatMap((shipment) => shipment.lines).reduce((sum, line) => sum + Math.max(line.deliveredQuantity, line.loadedQuantity ?? line.plannedQuantity), 0);
  const legacySent = (order.dispatchedAt || order.deliveryStatus === "en_transito") && sentByShipments === 0 ? order.requested : 0;
  let shipped = Math.min(Math.max(order.delivered, sentByShipments, legacySent), order.requested);
  const buckets = { planned: Math.max(order.requested - produced, 0), htPlanning: heatProduced - heatTreated, htConfirmed: heatTreated, produced: produced - heatProduced, shipped: 0 };
  for (const key of ["produced", "htConfirmed", "htPlanning", "planned"]) {
    const taken = Math.min(buckets[key], shipped);
    buckets[key] -= taken;
    shipped -= taken;
  }
  buckets.shipped = Math.min(Math.max(order.delivered, sentByShipments, legacySent), order.requested);
  return buckets;
}
function getOrderOperationalStatus(order) {
  if (getOrderStage(order) === "cancelado") return "cancelled";
  const shipments = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled");
  const deliveredByShipments = shipments.flatMap((shipment) => shipment.lines).reduce((sum, line) => sum + line.deliveredQuantity, 0);
  const delivered = Math.max(order.delivered, deliveredByShipments);
  if (Math.max(order.requested - delivered, 0) === 0) return "delivered";
  const stages = getOrderPalletStages(order);
  if (stages.shipped > 0 || shipments.some((shipment) => ["dispatched", "delivered"].includes(shipment.status))) return "shipped";
  if (stages.htConfirmed > 0) return "ht_confirmed";
  if (stages.htPlanning > 0 || order.dryingStartDate && order.lines.some(lineRequiresHeat)) return "ht_planning";
  if (stages.produced > 0) return "produced";
  return "planned";
}
function isOrderClosed(order) {
  return ["delivered", "cancelled"].includes(getOrderOperationalStatus(order));
}
function dateFromLabel(label) {
  const day = Number(label.match(/\d+/)?.[0]);
  if (!Number.isFinite(day)) return "2026-08-10";
  return label.toLocaleLowerCase("es").includes("julio") ? `2026-07-${String(day).padStart(2, "0")}` : `2026-08-${String(day).padStart(2, "0")}`;
}
function getOrderRequestedDate(order) {
  return order.requestedDeliveryDate ?? order.originalPlannedDate ?? getOrderPlannedDate(order);
}
function getOrderPlannedDate(order) {
  return order.plannedDate ?? dateFromLabel(order.dateLabel);
}
function formatPlannedDate(date) {
  const value = /* @__PURE__ */ new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long" }).format(value);
}
function isActiveProvider({ id }) {
  return id !== "linares";
}
function compareProductsByInternalCode(left, right) {
  const codeNumber = (code) => {
    const match = code?.match(/\d+/);
    return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
  };
  const leftCode = left.zetaCode ?? left.sourceCode;
  const rightCode = right.zetaCode ?? right.sourceCode;
  const leftNumber = codeNumber(leftCode);
  const rightNumber = codeNumber(rightCode);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return (leftCode ?? "").localeCompare(rightCode ?? "", "es", { numeric: true, sensitivity: "base" }) || (left.stockName ?? "").localeCompare(right.stockName ?? "", "es", { sensitivity: "base" }) || left.id.localeCompare(right.id, "es", { sensitivity: "base" });
}
function combineTreatment(current, next) {
  return current || next ? "Marcado" : void 0;
}
var stageLabels, orderOperationalStatusLabels, lineRequiresHeat, providers, productSeeds, products, orders;
var init_data = __esm({
  "app/data.ts"() {
    "use strict";
    stageLabels = {
      negociacion: "Negociaci\xF3n",
      produccion: "Producci\xF3n",
      logistica: "Log\xEDstica",
      atrasado: "Atrasado",
      pospuesto: "Pospuesto",
      cancelado: "Cancelado",
      reorganizando: "Reorganizando",
      completado: "Completado"
    };
    orderOperationalStatusLabels = {
      planned: "Planificando",
      produced: "Produciendo",
      ht_planning: "Produciendo",
      ht_confirmed: "Produciendo",
      shipped: "Enviando",
      delivered: "Entregado",
      cancelled: "Cancelado"
    };
    lineRequiresHeat = (line) => /HT/.test(line.treatment ?? "") || /\bCon HT\b/i.test(line.product);
    providers = [
      { id: "blanc", name: "Blanc", type: "Aserradero", supplies: "Pallets y mercader\xEDa de terceros" },
      { id: "mirasol", name: "Mirasol", type: "Aserradero", supplies: "Pallets y mercader\xEDa de terceros" },
      { id: "linares", name: "Linares", type: "Transporte", supplies: "Transporte interno", internalTransport: true },
      { id: "susalla", name: "Susalla", type: "Transporte", supplies: "Transporte interno", internalTransport: true },
      { id: "giossa", name: "Giossa", type: "Transporte", supplies: "Transporte interno", internalTransport: true },
      { id: "milton", name: "Milton", type: "Transporte", supplies: "Traslado y entrega de pedidos" },
      { id: "matias", name: "Mat\xEDas", type: "Transporte", supplies: "Traslado y entrega de pedidos" }
    ];
    productSeeds = [
      { id: "palbin-p01", code: "P01", name: "Cristal PET", kind: "Pallet", measure: "106 \xD7 119", assignment: "Cristal PET", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p02", code: "P02", name: "Palets Citrus", kind: "Pallet", measure: "120 \xD7 100", assignment: "Citrus", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p03", code: "P03", name: "Molinos San Jos\xE9", kind: "Pallet", measure: "120 \xD7 100", assignment: "Molinos San Jos\xE9", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p04", code: "P04", name: "Saint Gobain", kind: "Pallet", measure: "106 \xD7 106", assignment: "Saint Gobain", catalog: "Palbin" },
      { id: "palbin-p05", code: "P05", name: "Pallet", kind: "Pallet", measure: "122 \xD7 102", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p09", code: "P09", name: "Pisos exportaci\xF3n", kind: "Piso", assignment: "Exportaci\xF3n", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p10", code: "P10", name: "Fricasa", kind: "Pallet", measure: "120 \xD7 100", assignment: "Fricasa", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p11", code: "P11", name: "Proquimur", kind: "Pallet", measure: "120 \xD7 100", assignment: "Proquimur", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p12", code: "P12", name: "Conaprole", kind: "Pallet", measure: "120 \xD7 100", assignment: "Conaprole", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p13", code: "P13", name: "Pallet", kind: "Pallet", measure: "120 \xD7 80", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p14", code: "P14", name: "Pisos Chacra", kind: "Piso", assignment: "Chacra", catalog: "Palbin" },
      { id: "palbin-p15", code: "P15", name: "Bins X3 exportaci\xF3n", kind: "Bin", assignment: "Exportaci\xF3n", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p16", code: "P16", name: "Bins X2 exportaci\xF3n", kind: "Bin", assignment: "Exportaci\xF3n", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p17", code: "P17", name: "Bins Chacra azul", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
      { id: "palbin-p18", code: "P18", name: "Bins Chacra blanco", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
      { id: "palbin-p19", code: "P19", name: "Bins Chacra rojo", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
      { id: "palbin-p20", code: "P20", name: "Bins Chacra anaranjado", kind: "Bin", assignment: "Chacra", catalog: "Palbin" },
      { id: "palbin-p21", code: "P21", name: "AFB", kind: "Pallet", measure: "120 \xD7 100", assignment: "AFB", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p22", code: "P22", name: "AFB", kind: "Pallet", measure: "220 \xD7 117", assignment: "AFB", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p23", code: "P23", name: "Pallet tipo MSJ Mirasol", kind: "Pallet", measure: "120 \xD7 120", assignment: "Mercosur con rebaje en todas las tablas MSJ", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p24", code: "P24", name: "Bins Lio X3", kind: "Bin", assignment: "Lio", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p25", code: "P25", name: "Pallet Citrus", kind: "Pallet", measure: "103 \xD7 121", assignment: "Citrus", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p26", code: "P26", name: "Pallet n\xFAmero 6", kind: "Pallet", measure: "122 \xD7 102", assignment: "Azucitrus", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p27", code: "P27", name: "Pallet Mercosur con corte", kind: "Pallet", measure: "120 \xD7 100", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p28", code: "P28", name: "Pallet Mercosur sin corte", kind: "Pallet", measure: "120 \xD7 100", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p29", code: "P29", name: "Aluminios del Uruguay", kind: "Pallet", measure: "120 \xD7 100", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p30", code: "P30", name: "San Miguel", kind: "Pallet", measure: "113 \xD7 113", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p31", code: "P31", name: "Pallet", kind: "Pallet", measure: "120 \xD7 130", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p32", code: "P32", name: "Pallet", kind: "Pallet", measure: "112 \xD7 120", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p33", code: "P33", name: "San Miguel", kind: "Pallet", measure: "116,5 \xD7 114", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p34", code: "P34", name: "San Miguel", kind: "Pallet", measure: "120 \xD7 120", catalog: "Palbin" },
      { id: "palbin-p35", code: "P35", name: "San Miguel reforzado", kind: "Pallet", measure: "120 \xD7 120", catalog: "Palbin" },
      { id: "palbin-p36", code: "P36", name: "Pallet Preinco", kind: "Pallet", measure: "120 \xD7 100", assignment: "Preinco", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p37", code: "P37", name: "Bins Chacra Chapicuy", kind: "Bin", assignment: "Frutos del Chapicuy", catalog: "Palbin" },
      { id: "palbin-p38", code: "P38", name: "Pallet MSJ", kind: "Pallet", measure: "220 \xD7 120", assignment: "Molinos San Jos\xE9", treatment: "Marcado", catalog: "Palbin" },
      { id: "palbin-p39", code: "P39", name: "Avanti", kind: "Pallet", measure: "120 \xD7 100", assignment: "Avanti", treatment: "Marcado", catalog: "Palbin" },
      { id: "pamer-p01", code: "P40", name: "Pallet", kind: "Pallet", measure: "100 \xD7 80", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p02", code: "P41", name: "Pallet", kind: "Pallet", measure: "100 \xD7 100", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p03", code: "P42", name: "Pallet", kind: "Pallet", measure: "100 \xD7 120", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p04", code: "P43", name: "Pallet", kind: "Pallet", measure: "120 \xD7 100", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p05", code: "P44", name: "Pallet", kind: "Pallet", measure: "120 \xD7 80", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p06", code: "P45", name: "Pallet", kind: "Pallet", measure: "120 \xD7 80", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p07", code: "P46", name: "Pallet", kind: "Pallet", measure: "120 \xD7 90", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p08", code: "P47", name: "Pallet", kind: "Pallet", measure: "120 \xD7 100", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p09", code: "P48", name: "Pallet", kind: "Pallet", measure: "120 \xD7 100", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p10", code: "P49", name: "Pallet", kind: "Pallet", measure: "120 \xD7 120", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p11", code: "P50", name: "Pallet", kind: "Pallet", measure: "120 \xD7 120", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p12", code: "P51", name: "Pallet", kind: "Pallet", measure: "130 \xD7 90", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p13", code: "P52", name: "Pallet", kind: "Pallet", measure: "140 \xD7 120", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p14", code: "P53", name: "Pallet", kind: "Pallet", measure: "140 \xD7 120", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p15", code: "P54", name: "Pallet", kind: "Pallet", measure: "145 \xD7 80", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p16", code: "P55", name: "Pallet", kind: "Pallet", measure: "145 \xD7 100", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p17", code: "P56", name: "Pallet", kind: "Pallet", measure: "145 \xD7 100", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p18", code: "P57", name: "Pallet", kind: "Pallet", measure: "155 \xD7 70", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p19", code: "P58", name: "Pallet", kind: "Pallet", measure: "160 \xD7 80", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p20", code: "P59", name: "Pallet", kind: "Pallet", measure: "160 \xD7 110", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p21", code: "P60", name: "Pallet", kind: "Pallet", measure: "216 \xD7 110", treatment: "HT", catalog: "Pamer" },
      { id: "pamer-p22", code: "P61", name: "Pallet", kind: "Pallet", measure: "130 \xD7 120", catalog: "Pamer" }
    ];
    products = productSeeds.reduce((unique, product) => {
      const existing = unique.find((item) => item.kind === product.kind && item.measure === product.measure);
      if (existing) {
        existing.treatment = combineTreatment(existing.treatment, product.treatment);
        existing.requiresTreatment = Boolean(existing.treatment);
        return unique;
      }
      unique.push({
        id: product.id,
        kind: product.kind,
        measure: product.measure,
        treatment: combineTreatment(void 0, product.treatment),
        requiresTreatment: Boolean(product.treatment),
        stockName: product.name,
        sourceCatalog: product.catalog,
        sourceCode: product.code,
        zetaCode: product.code,
        stockActive: true
      });
      return unique;
    }, []);
    orders = [
      {
        id: "frutura-74",
        reference: "Plan 74",
        client: "Frutura",
        product: "Pallet 122 \xD7 102",
        requested: 600,
        delivered: 0,
        pending: 600,
        stage: "produccion",
        dateLabel: "Viernes 14",
        transport: "Linares",
        supply: "Los pallets previstos no llegaron",
        preparation: "Marcado requerido",
        logistics: "Viaje con Linares detenido",
        delivery: "0 de 600 entregados",
        action: "Reprogramar la entrega cuando ingrese la mercader\xEDa.",
        lines: [{ id: "frutura-74-1", product: "Pallet 122 \xD7 102", quantity: 600, preparation: "Marcado" }],
        source: "Plan semanal \xB7 fila 74"
      },
      {
        id: "proquimur-63",
        reference: "Plan 63",
        client: "Proquimur",
        product: "Pallet 120 \xD7 100 Mercosur",
        requested: 600,
        delivered: 0,
        pending: 600,
        stage: "produccion",
        dateLabel: "Martes 11",
        transport: "Linares",
        supply: "600 en stock Palbin \xB7 300 marcados y 300 sin marcar",
        preparation: "300 con HT \xB7 300 sin HT",
        logistics: "Linares asignado",
        delivery: "Pedido en coordinaci\xF3n",
        action: "Coordinar fecha con el cliente y reservar el viaje.",
        lines: [
          { id: "proquimur-63-1", product: "Pallet 120 \xD7 100 Mercosur", quantity: 300, preparation: "Con HT" },
          { id: "proquimur-63-2", product: "Pallet 120 \xD7 100 Mercosur", quantity: 300, preparation: "Sin HT" }
        ],
        source: "Plan semanal \xB7 fila 63 / Stock Palbin \xB7 fila 19"
      },
      {
        id: "pamer-184833",
        reference: "Orden 184833",
        client: "Pamer",
        product: "Cinco l\xEDneas de pallets",
        requested: 500,
        delivered: 500,
        pending: 0,
        stage: "completado",
        dateLabel: "28 de julio",
        transport: "No registrado",
        supply: "Orden despachada en cinco l\xEDneas",
        preparation: "380 sin HT \xB7 120 con HT",
        logistics: "Remito 603",
        delivery: "500 entregados \xB7 saldo 0",
        action: "Pedido cerrado.",
        remittance: "603",
        lines: [
          { id: "184833-1", product: "Pallet 100 \xD7 100 doble entrada", quantity: 100, preparation: "Sin HT" },
          { id: "184833-2", product: "Pallet 100 \xD7 100", quantity: 20, preparation: "Con HT" },
          { id: "184833-3", product: "Pallet 120 \xD7 80 doble entrada", quantity: 180, preparation: "Sin HT" },
          { id: "184833-4", product: "Pallet 120 \xD7 130", quantity: 100, preparation: "Sin HT" },
          { id: "184833-5", product: "Pallet 100 \xD7 120 Mercosur", quantity: 100, preparation: "Con HT" }
        ],
        source: "\xD3rdenes Pamer \xB7 filas 4\u20138"
      },
      {
        id: "pamer-641",
        reference: "Remito 641",
        client: "Pamer",
        product: "Seis l\xEDneas de pallets",
        requested: 360,
        delivered: 360,
        pending: 0,
        stage: "completado",
        dateLabel: "12 de agosto",
        transport: "Propio",
        supply: "Seis l\xEDneas despachadas",
        preparation: "200 sin HT \xB7 160 con HT",
        logistics: "Transporte propio \xB7 remito 641",
        delivery: "360 entregados \xB7 saldo 0",
        action: "Pedido cerrado.",
        remittance: "641",
        lines: [
          { id: "641-1", product: "Pallet 216 \xD7 110 simple", quantity: 100, preparation: "Con HT" },
          { id: "641-2", product: "Pallet 216 \xD7 110 simple", quantity: 41, preparation: "Sin HT" },
          { id: "641-3", product: "Pallet 100 \xD7 80", quantity: 100, preparation: "Sin HT" },
          { id: "641-4", product: "Pallet 100 \xD7 100", quantity: 59, preparation: "Sin HT" },
          { id: "641-5", product: "Pallet 120 \xD7 80", quantity: 20, preparation: "Con HT" },
          { id: "641-6", product: "Pallet 120 \xD7 90 cerrado", quantity: 40, preparation: "Con HT" }
        ],
        source: "\xD3rdenes Pamer \xB7 filas 10\u201315"
      },
      {
        id: "afb-62",
        reference: "Plan 62",
        client: "AFB",
        product: "Pallet 120 \xD7 100 Mercosur cepillado",
        requested: 600,
        delivered: 600,
        pending: 0,
        stage: "completado",
        dateLabel: "Martes 11",
        transport: "Linares",
        supply: "Pedido completo",
        preparation: "Mercosur cepillado",
        logistics: "Linares \xB7 un viaje",
        delivery: "600 entregados",
        action: "Pedido cerrado.",
        lines: [{ id: "afb-62-1", product: "Pallet 120 \xD7 100 Mercosur cepillado", quantity: 600 }],
        source: "Plan semanal \xB7 fila 62"
      },
      {
        id: "granja-pocha-65",
        reference: "Plan 65",
        client: "Granja Pocha",
        product: "Punto rojo y Mercosur exportaci\xF3n",
        requested: 600,
        delivered: 600,
        pending: 0,
        stage: "completado",
        dateLabel: "Mi\xE9rcoles 12",
        transport: "Linares",
        supply: "Dos l\xEDneas completas",
        preparation: "400 punto rojo \xB7 200 Mercosur exportaci\xF3n",
        logistics: "Linares \xB7 un viaje",
        delivery: "600 entregados",
        action: "Pedido cerrado.",
        lines: [
          { id: "pocha-65-1", product: "Pallet punto rojo 120 \xD7 100", quantity: 400 },
          { id: "pocha-65-2", product: "Pallet Mercosur exportaci\xF3n 120 \xD7 100", quantity: 200 }
        ],
        source: "Plan semanal \xB7 fila 65"
      },
      {
        id: "forestal-66",
        reference: "Plan 66",
        client: "Forestal Oriental",
        product: "Pallet 120 \xD7 130",
        requested: 50,
        delivered: 50,
        pending: 0,
        stage: "completado",
        dateLabel: "Mi\xE9rcoles 12",
        transport: "Mat\xEDas",
        supply: "Pedido completo",
        preparation: "Sin HT \xB7 sin corte de esquina \xB7 sin rebaje",
        logistics: "Mat\xEDas \xB7 un viaje",
        delivery: "50 entregados",
        action: "Pedido cerrado.",
        lines: [{ id: "forestal-66-1", product: "Pallet 120 \xD7 130", quantity: 50, preparation: "Sin HT" }],
        source: "Plan semanal \xB7 fila 66"
      },
      {
        id: "frutura-67",
        reference: "Plan 67",
        client: "Frutura",
        product: "Pallet 122 \xD7 102",
        requested: 518,
        delivered: 518,
        pending: 0,
        stage: "completado",
        dateLabel: "Mi\xE9rcoles 12",
        transport: "Milton",
        supply: "Pedido completo",
        preparation: "Pallet 122 \xD7 102",
        logistics: "Milton \xB7 un viaje",
        delivery: "518 entregados",
        action: "Pedido cerrado.",
        lines: [{ id: "frutura-67-1", product: "Pallet 122 \xD7 102", quantity: 518 }],
        source: "Plan semanal \xB7 fila 67"
      },
      {
        id: "frutura-69",
        reference: "Plan 69",
        client: "Frutura",
        product: "Pallet 120 \xD7 100",
        requested: 600,
        delivered: 600,
        pending: 0,
        stage: "completado",
        dateLabel: "Jueves 13",
        transport: "Linares",
        supply: "Pedido completo",
        preparation: "Pallet 120 \xD7 100",
        logistics: "Linares \xB7 un viaje",
        delivery: "600 entregados",
        action: "Pedido cerrado.",
        lines: [{ id: "frutura-69-1", product: "Pallet 120 \xD7 100", quantity: 600 }],
        source: "Plan semanal \xB7 fila 69"
      },
      {
        id: "azucitrus-75",
        reference: "Plan 75",
        client: "Azucitrus",
        product: "Pallet 120 \xD7 100",
        requested: 600,
        delivered: 600,
        pending: 0,
        stage: "completado",
        dateLabel: "Viernes 14",
        transport: "Linares",
        supply: "Pedido completo",
        preparation: "Pallet 120 \xD7 100",
        logistics: "Linares \xB7 un viaje",
        delivery: "600 entregados",
        action: "Pedido cerrado.",
        lines: [{ id: "azucitrus-75-1", product: "Pallet 120 \xD7 100", quantity: 600 }],
        source: "Plan semanal \xB7 fila 75"
      },
      {
        id: "san-miguel-76",
        reference: "Plan 76",
        client: "San Miguel",
        product: "Dos medidas de pallets",
        requested: 360,
        delivered: 360,
        pending: 0,
        stage: "completado",
        dateLabel: "Viernes 14",
        transport: "Milton",
        supply: "Dos l\xEDneas completas",
        preparation: "250 de 120 \xD7 120 \xB7 110 de 116,5 \xD7 114",
        logistics: "Milton \xB7 un viaje",
        delivery: "360 entregados",
        action: "Pedido cerrado.",
        lines: [
          { id: "san-miguel-76-1", product: "Pallet 120 \xD7 120", quantity: 250 },
          { id: "san-miguel-76-2", product: "Pallet 116,5 \xD7 114", quantity: 110 }
        ],
        source: "Plan semanal \xB7 fila 76"
      },
      {
        id: "pontevedra-79",
        reference: "Plan 79",
        client: "Pontevedra",
        product: "Pallet Mercosur con HT",
        requested: 150,
        delivered: 150,
        pending: 0,
        stage: "completado",
        dateLabel: "S\xE1bado 15",
        transport: "Mat\xEDas",
        supply: "Pedido completo",
        preparation: "Mercosur con HT",
        logistics: "Mat\xEDas \xB7 un viaje",
        delivery: "150 entregados",
        action: "Pedido cerrado.",
        lines: [{ id: "pontevedra-79-1", product: "Pallet Mercosur", quantity: 150, preparation: "Con HT" }],
        source: "Plan semanal \xB7 fila 79"
      }
    ];
  }
});

// app/production-rule-defaults.ts
function palletProductionDefaults(model) {
  const normalized = model?.trim().toLocaleLowerCase("es") ?? "";
  const specific = normalized.startsWith("mercosur") ? PALLET_MODEL_PRODUCTION_DEFAULTS.mercosur : normalized === "citrus" ? PALLET_MODEL_PRODUCTION_DEFAULTS.citrus : [];
  return [...PALLET_PRODUCTION_DEFAULTS, ...specific];
}
var PALLET_PRODUCTION_DEFAULTS, PALLET_MODEL_PRODUCTION_DEFAULTS, PALLET_RULE_START_DATE;
var init_production_rule_defaults = __esm({
  "app/production-rule-defaults.ts"() {
    "use strict";
    PALLET_PRODUCTION_DEFAULTS = [
      { resourceId: "blanc", normal: 250, maximum: 350 },
      { resourceId: "sandro_raul", normal: 200, maximum: 240 },
      { resourceId: "enzo", normal: 120, maximum: 140 },
      { resourceId: "lito", normal: 80, maximum: 120 }
    ];
    PALLET_MODEL_PRODUCTION_DEFAULTS = {
      mercosur: [
        { resourceId: "fabrica_john", normal: 550, maximum: 600 },
        { resourceId: "fabrica_omar", normal: 140, maximum: 160 }
      ],
      citrus: [
        { resourceId: "fabrica_john", normal: 450, maximum: 550 }
      ]
    };
    PALLET_RULE_START_DATE = "2026-01-01";
  }
});

// app/production-capacity.ts
function datesBetween(from, to) {
  const dates = [];
  const current = /* @__PURE__ */ new Date(`${from}T12:00:00`);
  const end = /* @__PURE__ */ new Date(`${to}T12:00:00`);
  while (current <= end) {
    dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
function sameId(left, right) {
  return left !== void 0 && right !== void 0 && String(left) === String(right);
}
function ruleIsCurrent(rule, date) {
  return rule.validFrom <= date && (!rule.validTo || rule.validTo >= date);
}
function statusPriority(status) {
  return { normal: 0, stretched: 1, missing_rule: 2, overloaded: 4 }[status];
}
function buildProductionCapacity(input) {
  const resources = [...input.resources].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "es"));
  const producedByDate = /* @__PURE__ */ new Map();
  for (const order of input.orders) {
    for (const line of order.lines) {
      for (const allocation of line.productionAllocations ?? []) {
        if (allocation.status !== "completed" || !allocation.actualDate || !allocation.actualQuantity) continue;
        producedByDate.set(allocation.actualDate, (producedByDate.get(allocation.actualDate) ?? 0) + Math.max(allocation.actualQuantity, 0));
      }
    }
  }
  const days = datesBetween(input.from, input.to).map((date) => {
    const rawAssignments = input.orders.flatMap((order) => order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((allocation) => allocation.status !== "cancelled" && allocation.plannedDate === date).map((allocation) => ({ order, line, allocation }))));
    const summaries = rawAssignments.map(({ order, line, allocation }) => {
      const resourceId = allocation.productionResourceId;
      const applicableRules = resourceId && line.clientProductId ? input.rules.filter((rule2) => sameId(rule2.resourceId, resourceId) && sameId(rule2.clientProductId, line.clientProductId) && rule2.productId === line.productId && ruleIsCurrent(rule2, date)) : [];
      const storedRule = applicableRules.find((rule2) => sameId(rule2.id, allocation.capacityRuleId)) ?? (allocation.status !== "draft" ? input.rules.find((rule2) => sameId(rule2.id, allocation.capacityRuleId)) : void 0);
      const rule = storedRule ?? (applicableRules.length === 1 ? applicableRules[0] : void 0);
      const plannedQuantity = allocation.plannedQuantity;
      const actualQuantity = allocation.actualQuantity;
      return {
        id: allocation.id,
        orderId: order.id,
        orderReference: order.reference,
        client: order.client,
        orderLineId: line.id,
        productId: line.productId,
        clientProductId: line.clientProductId,
        productName: line.product,
        resourceId,
        capacityRuleId: rule?.id,
        applicableRuleIds: applicableRules.map((entry) => entry.id),
        configurationLabel: rule?.configurationLabel,
        peopleCount: rule?.peopleCount,
        plannedQuantity,
        plannedDate: allocation.plannedDate,
        actualQuantity,
        actualDate: allocation.actualDate,
        resultDestination: allocation.resultDestination,
        pendingQuantity: Math.max(plannedQuantity - (actualQuantity ?? 0), 0),
        status: allocation.status,
        note: allocation.note,
        completionNote: allocation.completionNote,
        normalUnitsPerDay: rule?.normalUnitsPerDay,
        maximumUnitsPerDay: rule?.maximumUnitsPerDay
      };
    });
    const resourceDays = resources.filter((resource) => resource.active).map((resource) => {
      const assignments = summaries.filter((assignment) => sameId(assignment.resourceId, resource.id));
      const missingRule = assignments.some((assignment) => !assignment.normalUnitsPerDay || !assignment.maximumUnitsPerDay);
      const calculable = assignments.filter((assignment) => assignment.normalUnitsPerDay && assignment.maximumUnitsPerDay);
      const normalLoad = missingRule ? void 0 : calculable.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.normalUnitsPerDay, 0);
      const maximumLoad = missingRule ? void 0 : calculable.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.maximumUnitsPerDay, 0);
      const confirmed = calculable.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed");
      const confirmedMissingRule = assignments.some((assignment) => (assignment.status === "confirmed" || assignment.status === "completed") && (!assignment.normalUnitsPerDay || !assignment.maximumUnitsPerDay));
      const confirmedNormalLoad = confirmedMissingRule ? void 0 : confirmed.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.normalUnitsPerDay, 0);
      const confirmedMaximumLoad = confirmedMissingRule ? void 0 : confirmed.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.maximumUnitsPerDay, 0);
      let status2 = "normal";
      if (missingRule) status2 = "missing_rule";
      else if ((maximumLoad ?? 0) > 1.0000001) status2 = "overloaded";
      else if ((normalLoad ?? 0) > 1.0000001) status2 = "stretched";
      return { resource, assignments, normalLoad, maximumLoad, confirmedNormalLoad, confirmedMaximumLoad, status: status2 };
    });
    const unassigned = summaries.filter((assignment) => !assignment.resourceId || !resources.some((resource) => sameId(resource.id, assignment.resourceId)));
    const statuses3 = [...resourceDays.map((entry) => entry.status), ...unassigned.length ? ["missing_rule"] : []];
    const status = statuses3.sort((left, right) => statusPriority(right) - statusPriority(left))[0] ?? "normal";
    const issues = [
      ...resourceDays.filter((entry) => entry.status !== "normal").map((entry) => `${entry.resource.name}: ${entry.status}`),
      ...unassigned.length ? [`${unassigned.length} asignaci\xF3n${unassigned.length === 1 ? "" : "es"} sin recurso`] : []
    ];
    return { date, producedQuantity: producedByDate.get(date) ?? 0, status, resources: resourceDays, unassigned, issues };
  });
  return { resources, rules: input.rules, products: input.products, days };
}
var init_production_capacity = __esm({
  "app/production-capacity.ts"() {
    "use strict";
  }
});

// app/capacity.ts
function datesBetween2(from, to) {
  const dates = [];
  const current = /* @__PURE__ */ new Date(`${from}T12:00:00`);
  const end = /* @__PURE__ */ new Date(`${to}T12:00:00`);
  while (current <= end) {
    dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
function adjustedCapacity(base, adjustment) {
  if (base === void 0 && adjustment === 0) return void 0;
  return Math.max((base ?? 0) + adjustment, 0);
}
function buildCapacitySnapshot(input) {
  const providerNames = new Map(input.providers.map((provider) => [provider.id, provider.name]));
  const activeOrders = input.orders.filter((order) => !isOrderClosed(order));
  const logisticsOrders = input.orders.filter((order) => getOrderOperationalStatus(order) !== "cancelled");
  const internalTeam = { availablePeople: input.availablePeople };
  const days = datesBetween2(input.from, input.to).map((date) => {
    const productionCommitments = activeOrders.flatMap((order) => {
      const allocations = order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled" && item.plannedDate === date).map((item) => ({ order, quantity: item.plannedQuantity, resourceId: item.resourceId })));
      return allocations.length ? allocations : order.productionDate === date ? [{ order, quantity: order.requested, resourceId: order.producerProviderId ?? (order.productionSource === "internal" ? "internal" : void 0) }] : [];
    });
    const deliveryShipments = activeOrders.flatMap((order) => (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && shipment.plannedDate === date).map((shipment) => ({ order, shipment, quantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0) })));
    const deliveryOrders = activeOrders.filter((order) => !order.shipments?.length && getOrderPlannedDate(order) === date);
    const tripShipments = logisticsOrders.flatMap((order) => (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && shipment.plannedDate === date).map((shipment) => ({ order, shipment })));
    const tripOrders = logisticsOrders.filter((order) => !order.shipments?.length && getOrderPlannedDate(order) === date);
    const internalProduction = ["assembly", "marking", "ht"].map((operation) => {
      const defaults = input.internalDefaults.find((item) => item.operation === operation);
      const rule = defaults ? input.rules.find((item) => item.operation === operation && item.peopleCount === defaults.peopleCount) : void 0;
      const baseCapacity = defaults?.manualCapacity ?? rule?.palletCapacity;
      const adjustmentEntry = input.adjustments.find((item) => item.date === date && item.resourceType === "internal_production" && item.operation === operation);
      const adjustment = adjustmentEntry?.palletAdjustment ?? 0;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const committed2 = productionCommitments.filter((entry) => (entry.order.productionSource ?? "internal") === "internal" && (entry.order.requiredOperations ?? ["assembly"]).includes(operation)).reduce((sum, entry) => sum + entry.quantity, 0);
      const peopleCount = defaults?.peopleCount ?? 0;
      const peopleAdditional = adjustmentEntry?.peopleCount ?? 0;
      return { operation, peopleCount, peopleAdditional, peopleAssigned: peopleCount + peopleAdditional, baseCapacity, adjustment, adjustmentResponsible: adjustmentEntry?.responsible, capacity, committed: committed2, available: capacity === void 0 ? void 0 : Math.max(capacity - committed2, 0), overload: capacity === void 0 ? 0 : Math.max(committed2 - capacity, 0) };
    });
    const basePeople = internalProduction.reduce((sum, entry) => sum + entry.peopleCount, 0);
    const additionalPeople = internalProduction.reduce((sum, entry) => sum + entry.peopleAdditional, 0);
    const peopleAssigned = basePeople + additionalPeople;
    const dayInternalTeam = { availablePeople: input.availablePeople, basePeople, additionalPeople, assignedPeople: peopleAssigned, freePeople: input.availablePeople === void 0 ? void 0 : Math.max(input.availablePeople - peopleAssigned, 0), missingPeople: input.availablePeople === void 0 ? 0 : Math.max(peopleAssigned - input.availablePeople, 0) };
    const externalKeys = new Set(input.externalDefaults.map((item) => `${item.providerId}|${item.operation}`));
    for (const entry of productionCommitments.filter((item) => item.order.productionSource === "sawmill" && (item.resourceId || item.order.producerProviderId))) for (const operation of entry.order.requiredOperations ?? ["assembly"]) externalKeys.add(`${entry.resourceId ?? entry.order.producerProviderId}|${operation}`);
    for (const adjustment of input.adjustments.filter((item) => item.date === date && item.resourceType === "external_production" && item.providerId && item.operation)) externalKeys.add(`${adjustment.providerId}|${adjustment.operation}`);
    const externalProduction = [...externalKeys].map((key) => {
      const [providerId, operation] = key.split("|");
      const defaults = input.externalDefaults.find((item) => item.providerId === providerId && item.operation === operation);
      const adjustmentEntry = input.adjustments.find((item) => item.date === date && item.resourceType === "external_production" && item.providerId === providerId && item.operation === operation);
      const adjustment = adjustmentEntry?.palletAdjustment ?? 0;
      const baseCapacity = defaults?.palletCapacity;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const committed2 = productionCommitments.filter((entry) => entry.order.productionSource === "sawmill" && (entry.resourceId ?? entry.order.producerProviderId) === providerId && (entry.order.requiredOperations ?? ["assembly"]).includes(operation)).reduce((sum, entry) => sum + entry.quantity, 0);
      return { providerId, providerName: providerNames.get(providerId) ?? "Proveedor", operation, status: adjustmentEntry?.status ?? defaults?.status ?? "estimated", baseCapacity, adjustment, adjustmentResponsible: adjustmentEntry?.responsible, capacity, committed: committed2, available: capacity === void 0 ? void 0 : Math.max(capacity - committed2, 0), overload: capacity === void 0 ? 0 : Math.max(committed2 - capacity, 0) };
    });
    const imports = activeOrders.filter((order) => order.productionSource === "import" && order.importArrivalDate === date).map((order) => ({ orderId: order.id, client: order.client, pallets: order.requested }));
    const productionCommitted = productionCommitments.filter((entry) => entry.order.productionSource !== "import").reduce((sum, entry) => sum + entry.quantity, 0);
    const internalAssembly = internalProduction.find((entry) => entry.operation === "assembly");
    const confirmedExternalAssembly = externalProduction.filter((entry) => entry.operation === "assembly" && entry.status === "confirmed");
    const knownProductionCapacity = (internalAssembly?.capacity ?? 0) + confirmedExternalAssembly.reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const hasProductionCapacity = internalAssembly?.capacity !== void 0 || confirmedExternalAssembly.some((entry) => entry.capacity !== void 0);
    const productionAvailable = hasProductionCapacity ? (internalAssembly?.available ?? 0) + confirmedExternalAssembly.reduce((sum, entry) => sum + (entry.available ?? 0), 0) : void 0;
    const productionMissing = !internalAssembly ? 0 : internalAssembly.committed > 0 && internalAssembly.capacity === void 0 ? internalAssembly.committed : internalAssembly.overload;
    const externalProductionMissing = externalProduction.filter((entry) => entry.operation === "assembly").reduce((sum, entry) => {
      if (entry.committed === 0) return sum;
      if (entry.status !== "confirmed" || entry.capacity === void 0) return sum + entry.committed;
      return sum + entry.overload;
    }, 0);
    const productionTotals = { committed: productionCommitted, capacity: hasProductionCapacity ? knownProductionCapacity : void 0, available: productionAvailable, missing: productionMissing + externalProductionMissing };
    const transportKeys = /* @__PURE__ */ new Set(["internal|internal", ...input.transportDefaults.map((item) => `${item.source}|${item.providerId ?? "internal"}`)]);
    for (const { shipment } of tripShipments) transportKeys.add(`${shipment.transportSource}|${shipment.transportProviderId ?? "internal"}`);
    for (const order of deliveryOrders) transportKeys.add(`${order.transportSource ?? "external"}|${order.transportProviderId ?? "internal"}`);
    for (const adjustment of input.adjustments.filter((item) => item.date === date && item.resourceType === "transport" && item.source)) transportKeys.add(`${adjustment.source}|${adjustment.providerId ?? "internal"}`);
    const transport = [...transportKeys].map((key) => {
      const [source, providerKey] = key.split("|");
      const providerId = source === "external" && providerKey !== "internal" ? providerKey : void 0;
      const defaults = input.transportDefaults.find((item) => item.source === source && (item.providerId ?? "") === (providerId ?? ""));
      const adjustmentEntry = input.adjustments.find((item) => item.date === date && item.resourceType === "transport" && item.source === source && (item.providerId ?? "") === (providerId ?? ""));
      const adjustment = adjustmentEntry?.palletAdjustment ?? 0;
      const baseCapacity = defaults?.palletCapacity;
      const capacity = adjustedCapacity(baseCapacity, adjustment);
      const tripAdjustment = adjustmentEntry?.tripAdjustment ?? 0;
      const baseTripCapacity = defaults?.tripCapacity;
      const tripCapacity = adjustedCapacity(baseTripCapacity, tripAdjustment);
      const shipmentCommitted = deliveryShipments.filter(({ shipment }) => shipment.transportSource === source && (source === "internal" || shipment.transportProviderId === providerId)).reduce((sum, entry) => sum + entry.quantity, 0);
      const legacyCommitted = deliveryOrders.filter((order) => (order.transportSource ?? "external") === source && (source === "internal" || order.transportProviderId === providerId)).reduce((sum, order) => sum + order.requested, 0);
      const committed2 = shipmentCommitted + legacyCommitted;
      const tripsCommitted2 = tripShipments.filter(({ shipment }) => shipment.transportSource === source && (source === "internal" || shipment.transportProviderId === providerId)).length + tripOrders.filter((order) => (order.transportSource ?? "external") === source && (source === "internal" || order.transportProviderId === providerId)).length;
      return { source, providerId, providerName: source === "internal" ? "Transporte interno" : providerNames.get(providerId ?? "") ?? "Transportista", status: adjustmentEntry?.status ?? defaults?.status ?? (source === "internal" ? "confirmed" : "estimated"), baseCapacity, adjustment, adjustmentResponsible: adjustmentEntry?.responsible, capacity, committed: committed2, available: capacity === void 0 ? void 0 : Math.max(capacity - committed2, 0), overload: capacity === void 0 ? 0 : Math.max(committed2 - capacity, 0), baseTripCapacity, tripAdjustment, tripCapacity, tripsCommitted: tripsCommitted2, tripsAvailable: tripCapacity === void 0 ? void 0 : Math.max(tripCapacity - tripsCommitted2, 0), tripsOverload: tripCapacity === void 0 ? 0 : Math.max(tripsCommitted2 - tripCapacity, 0) };
    });
    const internal = transport.filter((entry) => entry.source === "internal").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const externalConfirmed = transport.filter((entry) => entry.source === "external" && entry.status === "confirmed").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const externalEstimated = transport.filter((entry) => entry.source === "external" && entry.status === "estimated").reduce((sum, entry) => sum + (entry.capacity ?? 0), 0);
    const committed = deliveryShipments.reduce((sum, entry) => sum + entry.quantity, 0) + deliveryOrders.reduce((sum, order) => sum + order.requested, 0);
    const missing = Math.max(committed - internal - externalConfirmed, 0);
    const confirmedTripEntries = transport.filter((entry) => entry.status === "confirmed" && entry.tripCapacity !== void 0);
    const configuredTripCapacity = confirmedTripEntries.reduce((sum, entry) => sum + (entry.tripCapacity ?? 0), 0);
    const hasTripCapacity = confirmedTripEntries.length > 0;
    const tripsCommitted = tripShipments.length + tripOrders.length;
    const tripsMissing = hasTripCapacity ? Math.max(tripsCommitted - configuredTripCapacity, 0) : 0;
    const internalTripEntries = confirmedTripEntries.filter((entry) => entry.source === "internal");
    const externalTripEntries = confirmedTripEntries.filter((entry) => entry.source === "external");
    const internalTripCapacity = internalTripEntries.length ? internalTripEntries.reduce((sum, entry) => sum + (entry.tripCapacity ?? 0), 0) : void 0;
    const externalTripCapacity = externalTripEntries.length ? externalTripEntries.reduce((sum, entry) => sum + (entry.tripCapacity ?? 0), 0) : void 0;
    const internalTripsCommitted = tripShipments.filter(({ shipment }) => shipment.transportSource === "internal").length + tripOrders.filter((order) => (order.transportSource ?? "external") === "internal").length;
    const externalTripsCommitted = tripsCommitted - internalTripsCommitted;
    const issues = [];
    if (dayInternalTeam.missingPeople > 0) issues.push("Faltan personas");
    if (internalProduction.some((entry) => entry.capacity === void 0)) issues.push("Producci\xF3n sin definir");
    if (productionTotals.missing > 0 || internalProduction.some((entry) => entry.operation !== "assembly" && entry.committed > 0 && (entry.capacity === void 0 || entry.overload > 0)) || externalProduction.some((entry) => entry.operation !== "assembly" && entry.committed > 0 && (entry.capacity === void 0 || entry.overload > 0))) issues.push("Falta producci\xF3n");
    if (!hasTripCapacity) issues.push("Cupos de viaje sin configurar");
    if (tripsMissing > 0) issues.push("Faltan cupos de viaje");
    return { date, internalProduction, internalTeam: dayInternalTeam, externalProduction, imports, productionTotals, transport, transportTotals: { internal, externalConfirmed, externalEstimated, committed, missing, tripCapacity: hasTripCapacity ? configuredTripCapacity : void 0, tripsCommitted, tripsAvailable: hasTripCapacity ? Math.max(configuredTripCapacity - tripsCommitted, 0) : void 0, tripsMissing, internalTripCapacity, internalTripsCommitted, externalTripCapacity, externalTripsCommitted }, issues: [...new Set(issues)] };
  });
  const production = buildProductionCapacity({
    from: input.from,
    to: input.to,
    resources: input.productionResources ?? [],
    rules: input.productionRules ?? [],
    products: input.productionProducts ?? [],
    orders: input.orders
  });
  return { from: input.from, to: input.to, rules: input.rules, internalDefaults: input.internalDefaults, internalTeam, externalDefaults: input.externalDefaults, transportDefaults: input.transportDefaults, adjustments: input.adjustments, days, production };
}
var init_capacity = __esm({
  "app/capacity.ts"() {
    "use strict";
    init_data();
    init_production_capacity();
  }
});

// app/classification.ts
function canonicalProductName(value) {
  return value.replace(/\bSin marcado\b/giu, "Sin HT").replace(/\bCon marcado\b/giu, "Con HT").replace(/\bMarcado\b/giu, "Con HT");
}
function productHeatTreatmentLabel(value) {
  const name = canonicalProductName(value);
  if (/\bSin HT\b/iu.test(name)) return "Sin HT";
  if (/\bCon HT\b/iu.test(name)) return "Con HT";
  return "";
}
function cleanAttributes(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean2 = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) clean2[key] = value.trim();
  }
  return clean2;
}
function normalizeMeasure(value) {
  return (value ?? "").toLocaleLowerCase("es").replace(/×/g, "x").replace(/,/g, ".").replace(/\s+/g, "");
}
function treatmentOf(product) {
  if (product.attributes) return product.attributes[TREATMENT_LEVEL]?.trim() ?? "";
  return product.requiresTreatment ? "Con HT" : "Sin HT";
}
function hasClassification(product) {
  return product.attributes !== void 0;
}
function applyLevelRules(attributes) {
  return { ...attributes };
}
function levelValue(product, levelId) {
  if (levelId === MEASURE_LEVEL) return product.measure?.trim() ?? "";
  if (levelId === TREATMENT_LEVEL) return treatmentOf(product);
  return product.attributes?.[levelId]?.trim() ?? "";
}
function buildProductName(product, levels = defaultProductLevels, options = {}) {
  const parts = [product.kind, product.measure?.trim()];
  for (const level of levels) {
    if (level.id === MEASURE_LEVEL) continue;
    parts.push(level.id === TREATMENT_LEVEL && options.fallbackHeat === false ? product.attributes?.[TREATMENT_LEVEL]?.trim() : levelValue(product, level.id));
  }
  return parts.filter(Boolean).join(" \xB7 ");
}
function productKey(product) {
  const attributes = cleanAttributes(product.attributes);
  const treatment = treatmentOf(product);
  if (treatment) attributes[TREATMENT_LEVEL] = treatment;
  const pairs = Object.entries(attributes).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => `${key}=${value.toLowerCase()}`);
  return [product.kind.toLowerCase(), normalizeMeasure(product.measure), ...pairs].join("|");
}
function attributesFromLegacy(legacy) {
  const attributes = {};
  const set = (key, value) => {
    if (value?.trim()) attributes[key] = value.trim();
  };
  const model = legacy.model?.trim() ?? "";
  if (model === "Mercosur \xB7 Adium") {
    set("modelo", "Mercosur");
    set("identificacion", "Adium");
  } else if (model === "Simple entrada \xB7 5 tacos") {
    set("modelo", "Simple entrada");
    set("taco", "5 tacos");
  } else if (model === "Con taco") set("taco", "Con taco");
  else if (model === "Mercosur 20 mm") set("modelo", "Mercosur 20 mm");
  else set("modelo", model);
  const boards = legacy.board_count ? `${legacy.board_count} tablas` : "";
  set("refuerzo", [legacy.reinforcement?.trim(), boards].filter(Boolean).join(" \xB7 "));
  set("identificacion", legacy.quality);
  const finish = legacy.finish?.trim().toLocaleLowerCase("es") ?? "";
  if (finish.includes("Con corte")) set("corte-esquina", "Con corte");
  else if (finish.includes("Sin corte")) set("corte-esquina", "Sin corte");
  if (finish.includes("cepillado")) set("terminacion", "Cepillado");
  else if (finish.includes("rebaje en todas las tablas")) set("terminacion", "Rebaje en todas las tablas del piso");
  const heat = legacy.heat_treatment?.trim() || (legacy.requires_treatment ? "Con HT" : "Sin HT");
  if (heat === "Con HT \xB7 exportaci\xF3n") set(TREATMENT_LEVEL, "Con HT");
  else set(TREATMENT_LEVEL, heat);
  return attributes;
}
function levelSlug(label, taken) {
  const base = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "nivel";
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}
function cleanOptions(options) {
  if (!Array.isArray(options)) return [];
  const seen = /* @__PURE__ */ new Set();
  const clean2 = [];
  for (const option of options) {
    if (typeof option !== "string") continue;
    const value = option.trim();
    const key = value.toLocaleLowerCase("es");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    clean2.push(value);
  }
  return clean2;
}
var MEASURE_LEVEL, TREATMENT_LEVEL, LOGO_LEVEL, defaultProductLevels, requiresHeatTreatment;
var init_classification = __esm({
  "app/classification.ts"() {
    "use strict";
    MEASURE_LEVEL = "medida";
    TREATMENT_LEVEL = "tratamiento";
    LOGO_LEVEL = "logo-propio";
    defaultProductLevels = [
      {
        id: MEASURE_LEVEL,
        label: "Medida",
        system: true,
        options: ["100 x 80", "100 x 100", "100 x 120", "106 x 106", "113 x 113", "115 x 115", "116 x 116", "116,5 x 114", "119 x 106", "120 x 80", "120 x 90", "120 x 100", "120 x 112", "120 x 120", "120 x 130", "121 x 103", "122 x 102", "140 x 120", "145 x 80", "145 x 100", "160 x 110", "216 x 110"]
      },
      { id: "modelo", label: "Modelo", system: false, options: ["Mercosur", "Simple entrada", "Doble entrada", "Cerrado", "Citrus", "Adium", "Mercosur 20 mm", "Doble entrada \xB7 Cerrado"] },
      { id: "taco", label: "Taco", system: false, options: ["5 tacos", "Taco corrido", "Con taco"] },
      { id: "refuerzo", label: "Refuerzo", system: false, options: ["Liviano", "Reforzado", "7 tablas", "Reforzado Celsius"] },
      { id: "identificacion", label: "Identificaci\xF3n", system: false, options: ["N\xB0 1", "N\xB0 3", "N\xB0 6", "Punto Azul", "Punto Rojo", "Punto Negro", "N\xB0 3 Punto Azul"] },
      { id: "corte-esquina", label: "Corte esquina", system: false, options: ["Con corte", "Sin corte", "Con corte en maquina"] },
      { id: "terminacion", label: "Terminaci\xF3n", system: false, options: ["Cepillado", "Rebaje en todas las tablas del piso", "R\xFAstico"] },
      { id: TREATMENT_LEVEL, label: "Tratamiento", system: true, options: ["Sin HT", "Con HT"] },
      { id: LOGO_LEVEL, label: "Logo propio", system: false, options: ["A", "Crufi", "MSJ"] }
    ];
    requiresHeatTreatment = (value) => Boolean(value?.trim().startsWith("Con HT"));
  }
});

// app/lib/supabase.ts
function configuration(secret = false) {
  const url = process.env.SUPABASE_URL;
  const key = secret ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(secret ? "Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno de servidor." : "Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en el entorno.");
  }
  return { url: url.replace(/\/$/, ""), key };
}
async function supabaseRequest(path, options = {}) {
  const { url, key } = configuration();
  const headers = new Headers(options.headers);
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  headers.set("accept", "application/json");
  if (options.body) headers.set("content-type", "application/json");
  if (options.prefer) headers.set("prefer", options.prefer);
  const response = await fetch(`${url}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.text();
  const payload = body ? JSON.parse(body) : null;
  if (!response.ok) {
    const message = payload?.message ?? payload?.error_description ?? "Error al consultar Supabase.";
    throw new Error(message);
  }
  return payload;
}
async function supabaseServerRequest(path, options = {}) {
  const { url, key } = configuration(true);
  const headers = new Headers(options.headers);
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  headers.set("accept", "application/json");
  if (options.body && !(options.body instanceof Blob) && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  if (options.prefer) headers.set("prefer", options.prefer);
  const response = await fetch(`${url}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.text();
  const payload = body ? JSON.parse(body) : null;
  if (!response.ok) {
    const error = new Error(payload?.message ?? payload?.error ?? "Error al consultar Supabase desde el servidor.");
    error.code = payload?.code;
    throw error;
  }
  return payload;
}
async function uploadPrivateAsset(path, file) {
  return supabaseServerRequest(`/storage/v1/object/client-product-control/${path}`, {
    method: "POST",
    headers: { "content-type": file.type, "x-upsert": "false" },
    body: file
  });
}
async function createPrivateAssetUrl(path, expiresIn = 300) {
  const { url } = configuration(true);
  const payload = await supabaseServerRequest(`/storage/v1/object/sign/client-product-control/${path}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn })
  });
  const signed = payload.signedURL ?? payload.signedUrl;
  if (!signed) throw new Error("No se pudo generar el enlace temporal del archivo.");
  return signed.startsWith("http") ? signed : `${url}${signed}`;
}
async function deletePrivateAsset(path) {
  await supabaseServerRequest("/storage/v1/object/client-product-control", {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [path] })
  });
}
var init_supabase = __esm({
  "app/lib/supabase.ts"() {
    "use strict";
  }
});

// app/master-data.ts
function clientProductReady(item) {
  return Boolean((item.product?.zetaCode ?? item.zetaCode).trim());
}
function productLabel(product, operationalName) {
  if (!operationalName?.trim() && hasClassification(product)) return canonicalProductName(product.stockName?.trim() || buildProductName(product));
  const name = operationalName?.trim();
  if (name) return canonicalProductName(name);
  const base = product.stockName?.trim() || [product.kind, product.measure ?? "Sin medida"].join(" / ");
  const treatment = productHeatTreatmentLabel(base) ? "" : treatmentOf(product);
  return canonicalProductName([base, treatment].filter(Boolean).join(" / "));
}
var allowedAssetTypes, maximumAssetBytes;
var init_master_data = __esm({
  "app/master-data.ts"() {
    "use strict";
    init_classification();
    allowedAssetTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    maximumAssetBytes = 6 * 1024 * 1024;
  }
});

// app/treatment.ts
function productTreatmentLabel(product) {
  return [product.stockName, product.kind, product.measure ?? "Sin medida"].filter(Boolean).join(" \xB7 ");
}
function calculateStockBalances(movements) {
  const balances = /* @__PURE__ */ new Map();
  for (const movement of movements) {
    const current = balances.get(movement.productId) ?? { pending: 0, ready: 0 };
    if (movement.stockState === "pending_treatment") current.pending += movement.quantity;
    else current.ready += movement.quantity;
    balances.set(movement.productId, current);
  }
  return balances;
}
function summarizeTreatmentDay(date, batches, balances) {
  const sameDay = batches.filter((batch) => batch.performedAt.slice(0, 10) === date);
  return {
    date,
    processed: sameDay.filter((batch) => batch.status === "posted").reduce((sum, batch) => sum + batch.quantity, 0),
    rejected: sameDay.filter((batch) => batch.status === "rejected").reduce((sum, batch) => sum + batch.quantity, 0),
    reversed: sameDay.filter((batch) => batch.status === "reversal").reduce((sum, batch) => sum + batch.quantity, 0),
    pending: [...balances.values()].reduce((sum, balance) => sum + balance.pending, 0),
    ready: [...balances.values()].reduce((sum, balance) => sum + balance.ready, 0)
  };
}
var init_treatment = __esm({
  "app/treatment.ts"() {
    "use strict";
  }
});

// app/stock.ts
function isPamer(name) {
  return name.trim().toLocaleLowerCase("es") === "pamer";
}
function scopeStockInventory(rows, orders2) {
  const pamerOrderProducts = /* @__PURE__ */ new Set();
  for (const order of orders2) {
    if (!isPamer(order.client)) continue;
    for (const line of order.lines) {
      if (line.productId) pamerOrderProducts.add(line.productId);
    }
  }
  return rows.map((row) => {
    if (row.inventoryScope) return row;
    const { product } = row;
    const clientNames = product.clientNames ?? [];
    const pamer = product.sourceCatalog === "Pamer" || clientNames.length > 0 && clientNames.every(isPamer) || !product.clientNames?.length && pamerOrderProducts.has(product.id);
    return { ...row, inventoryScope: pamer ? "pamer" : "general" };
  });
}
function orderStockReservations(orders2, products2) {
  const productMap = new Map(products2.map((product) => [product.id, product]));
  const reserved = /* @__PURE__ */ new Map();
  for (const order of orders2.filter((item) => getOrderOperationalStatus(item) !== "cancelled")) for (const line of order.lines) {
    if (!line.productId) continue;
    const producedForOrder = (line.productionAllocations ?? []).reduce((sum, allocation) => sum + (allocation.status === "completed" && allocation.resultDestination !== "stock" ? Math.max(allocation.actualQuantity ?? 0, 0) : 0), 0);
    const treated = line.treatedQuantity ?? 0;
    const shipmentLines = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled").flatMap((shipment) => shipment.lines.filter((item) => item.orderLineId === line.id).map((item) => ({ item, dispatched: Boolean(shipment.dispatchedAt) || shipment.status === "dispatched" })));
    const delivered = shipmentLines.reduce((sum, { item }) => sum + item.deliveredQuantity, 0);
    const shipped = shipmentLines.reduce((sum, { item, dispatched }) => sum + (dispatched ? item.loadedQuantity ?? item.plannedQuantity : item.deliveredQuantity), 0);
    const openQuantity = Math.max(line.quantity - delivered, 0);
    const requiresTreatment = productMap.get(line.productId)?.requiresTreatment === true;
    const readyForOrder = requiresTreatment ? treated : producedForOrder;
    const ready = Math.min(openQuantity, Math.max(readyForOrder - shipped, line.readyReservedQuantity ?? 0, 0));
    const pending = Math.min(Math.max(openQuantity - ready, 0), requiresTreatment ? Math.max(producedForOrder - treated, 0) : 0);
    if (pending === 0 && ready === 0) continue;
    const current = reserved.get(line.productId) ?? { pending: 0, ready: 0, orders: [] };
    current.pending += pending;
    current.ready += ready;
    const commitment = current.orders.at(-1);
    if (commitment?.orderId === order.id) {
      commitment.pending += pending;
      commitment.ready += ready;
    } else {
      current.orders.push({ orderId: order.id, reference: order.reference, client: order.client, pending, ready });
    }
    reserved.set(line.productId, current);
  }
  return reserved;
}
var init_stock = __esm({
  "app/stock.ts"() {
    "use strict";
    init_data();
  }
});

// app/api/store.ts
function seedMemoryPalletProductionRules(relation) {
  if (!relation.active || relation.product.kind !== "Pallet") return;
  for (const baseline of palletProductionDefaults(relation.product.attributes?.modelo)) {
    const resource = memoryProductionResources.find((item) => item.id === baseline.resourceId && item.active);
    if (!resource || memoryProductionRules.some((rule) => String(rule.clientProductId) === String(relation.id) && String(rule.resourceId) === String(resource.id))) continue;
    memoryProductionRules.push({
      id: `rule-${memoryProductionId++}`,
      resourceId: resource.id,
      productId: relation.productId,
      clientProductId: relation.id,
      productName: productLabel(relation.product),
      configurationLabel: "Base para pallets",
      normalUnitsPerDay: baseline.normal,
      maximumUnitsPerDay: baseline.maximum,
      validFrom: PALLET_RULE_START_DATE,
      source: "planilla de rendimiento inicial",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}
function canonicalOperations(operations4) {
  return [...new Set((operations4 ?? ["assembly"]).map((operation) => operation === "marking" || operation === "ht" ? "treatment" : operation))];
}
function treatmentFromLabel(label) {
  if (productHeatTreatmentLabel(label) === "Con HT") return "Marcado";
  return void 0;
}
function mapOrder(row) {
  return {
    id: row.id,
    reference: row.reference,
    client: row.client,
    product: canonicalProductName(row.product),
    productId: row.order_lines?.[0]?.product_id ?? void 0,
    clientProductId: row.order_lines?.[0]?.client_product_id ?? void 0,
    requested: row.requested,
    delivered: row.delivered,
    pending: row.pending,
    stage: row.stage,
    orderDate: row.order_date ?? void 0,
    requestedDeliveryDate: row.requested_delivery_date ?? void 0,
    zetaCode: row.zeta_code ?? void 0,
    plannedDate: row.planned_date,
    originalPlannedDate: row.original_planned_date ?? void 0,
    dateLabel: formatPlannedDate(row.planned_date),
    transport: row.transport,
    supply: row.supply,
    preparation: row.preparation,
    logistics: row.logistics,
    delivery: row.delivery,
    action: row.action,
    remittance: row.remittance ?? void 0,
    deliveryAddress: row.delivery_address ?? void 0,
    notes: row.notes ?? void 0,
    deliveryStatus: row.delivery_status ?? void 0,
    dispatchedAt: row.dispatched_at ?? void 0,
    deliveredAt: row.delivered_at ?? void 0,
    source: row.source,
    productionSource: row.production_source ?? "internal",
    producerProviderId: row.producer_provider_id ?? void 0,
    productionDate: row.production_date ?? void 0,
    importArrivalDate: row.import_arrival_date ?? void 0,
    requiredOperations: canonicalOperations(row.required_operations),
    transportSource: row.transport_source ?? (row.transport.toLocaleLowerCase() === "interno" || row.transport.toLocaleLowerCase() === "propio" ? "internal" : "external"),
    transportProviderId: row.transport_provider_id ?? void 0,
    deliveryDateNote: row.delivery_date_note ?? void 0,
    productionDefined: row.production_defined ?? true,
    productionEndDate: row.production_end_date ?? void 0,
    transportDefined: row.transport_defined ?? true,
    dryingStartDate: row.drying_start_date ?? void 0,
    dryingEndDate: row.drying_end_date ?? void 0,
    dryingNote: row.drying_note ?? void 0,
    lines: [...row.order_lines ?? []].sort((a, b) => a.position - b.position).map((line) => ({ id: line.id, product: canonicalProductName(line.product), productId: line.product_id ?? void 0, clientProductId: line.client_product_id ?? void 0, quantity: line.requested_quantity ?? line.quantity, preparation: line.preparation ?? void 0, treatment: treatmentFromLabel(line.product) }))
  };
}
async function attachDatabaseOperations(orders2) {
  const orderIds = orders2.map((order) => order.id);
  const lineIds = orders2.flatMap((order) => order.lines.map((line) => line.id));
  if (!orderIds.length) return orders2;
  const [allocations, shipments, providers2, treatmentProgress, reservations, dryingRows] = await Promise.all([
    lineIds.length ? supabaseRequest(`/rest/v1/production_allocations?select=*&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})&order=planned_date.asc,id.asc`) : Promise.resolve([]),
    supabaseRequest(`/rest/v1/shipments?select=*,shipment_lines(*),shipment_events(*)&order_id=in.(${orderIds.map(encodeURIComponent).join(",")})&order=planned_date.asc,id.asc&shipment_events.order=created_at.asc,id.asc`),
    getProviders({ includeRetired: true }),
    lineIds.length ? supabaseRequest(`/rest/v1/treatment_batches?select=id,order_line_id,quantity,status,reversal_of_batch_id&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})`) : Promise.resolve([]),
    lineIds.length ? supabaseRequest(`/rest/v1/stock_reservations?select=shipment_line_id,quantity,status,shipment_lines(order_line_id)&status=eq.active`) : Promise.resolve([]),
    lineIds.length ? supabaseRequest(`/rest/v1/drying_allocations?select=order_line_id,planned_date,planned_quantity&order_line_id=in.(${lineIds.map(encodeURIComponent).join(",")})&order=planned_date.asc`).catch(() => []) : Promise.resolve([])
  ]);
  const providerNames = new Map(providers2.map((provider) => [provider.id, provider.name]));
  const lineMap = new Map(orders2.flatMap((order) => order.lines.map((line) => [line.id, line])));
  for (const order of orders2) {
    for (const line of order.lines) {
      line.productionAllocations = allocations.filter((item) => item.order_line_id === line.id).map((item) => ({ id: item.id, orderLineId: item.order_line_id, resourceId: item.resource_id ?? void 0, productionResourceId: item.production_resource_id ?? void 0, capacityRuleId: item.capacity_rule_id ?? void 0, plannedDate: item.planned_date, plannedQuantity: item.planned_quantity, actualQuantity: item.actual_quantity ?? void 0, actualDate: item.actual_date ?? void 0, resultDestination: item.result_destination ?? void 0, status: item.status, note: item.note ?? void 0, completedAt: item.completed_at ?? void 0, completionNote: item.completion_note ?? void 0, createdAt: item.created_at, updatedAt: item.updated_at }));
      const lineBatches = treatmentProgress.filter((batch) => batch.order_line_id === line.id);
      const treated = lineBatches.reduce((sum, batch) => sum + (batch.status === "posted" ? batch.quantity : batch.status === "reversal" ? -batch.quantity : 0), 0);
      line.dryingAllocations = dryingRows.filter((item) => item.order_line_id === line.id).map((item) => ({ date: item.planned_date, quantity: item.planned_quantity }));
      line.treatedQuantity = Math.max(treated, 0);
      line.treatmentPendingQuantity = Math.max(line.quantity - line.treatedQuantity, 0);
      line.readyReservedQuantity = 0;
      line.readyReservedQuantity = reservations.filter((reservation) => reservation.shipment_lines?.order_line_id === line.id).reduce((sum, reservation) => sum + reservation.quantity, 0);
    }
    order.shipments = shipments.filter((item) => item.order_id === order.id).map((item) => ({
      id: item.id,
      orderId: item.order_id,
      plannedDate: item.planned_date,
      status: item.status,
      transportSource: item.transport_source,
      transportProviderId: item.transport_provider_id ?? void 0,
      transportLabel: item.transport_source === "internal" ? providerNames.get(item.transport_provider_id ?? "") ?? "Transporte interno" : providerNames.get(item.transport_provider_id ?? "") ?? "Transportista",
      remittance: item.remittance ?? void 0,
      sharedRemittanceReason: item.shared_remittance_reason ?? void 0,
      deliveryAddressSnapshot: item.delivery_address_snapshot ?? void 0,
      loadedAt: item.loaded_at ?? void 0,
      dispatchedAt: item.dispatched_at ?? void 0,
      deliveredAt: item.delivered_at ?? void 0,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      lines: item.shipment_lines.map((line) => ({ id: line.id, shipmentId: line.shipment_id, orderLineId: line.order_line_id, product: lineMap.get(line.order_line_id)?.product ?? "Producto", treatment: lineMap.get(line.order_line_id)?.treatment, plannedQuantity: line.planned_quantity, loadedQuantity: line.loaded_quantity ?? void 0, deliveredQuantity: line.delivered_quantity })),
      events: [...item.shipment_events].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((event) => ({ id: event.id, shipmentId: event.shipment_id, eventType: event.event_type, previousStatus: event.previous_status ?? void 0, nextStatus: event.next_status ?? void 0, previousDate: event.previous_date ?? void 0, nextDate: event.next_date ?? void 0, reason: event.reason ?? void 0, note: event.note ?? void 0, previousRemittance: event.previous_remittance ?? void 0, nextRemittance: event.next_remittance ?? void 0, responsible: event.responsible, createdAt: event.created_at }))
    }));
  }
  return orders2;
}
async function getDatabaseOrder(id) {
  const query = new URLSearchParams({ select: "*,order_lines(*)", id: `eq.${id}`, "order_lines.order": "position.asc" });
  const rows = await supabaseRequest(`/rest/v1/orders?${query}`);
  return rows[0] ? (await attachDatabaseOperations([mapOrder(rows[0])]))[0] : null;
}
async function getOrders() {
  if (useMemoryStore) return memoryOrders;
  const query = new URLSearchParams({ select: "*,order_lines(*)", order: "created_at.asc", "order_lines.order": "position.asc" });
  const rows = await supabaseRequest(`/rest/v1/orders?${query}`);
  const clientProductIds = [...new Set(rows.flatMap((row) => (row.order_lines ?? []).map((line) => line.client_product_id).filter((id) => id !== null)))];
  const links = clientProductIds.length ? await supabaseRequest(`/rest/v1/client_products?select=id,client_id&id=in.(${clientProductIds.join(",")})`) : [];
  const clientByProduct = new Map(links.map((link) => [String(link.id), link.client_id]));
  return attachDatabaseOperations(rows.map((row) => {
    const order = mapOrder(row);
    order.clientId = clientByProduct.get(String(order.clientProductId));
    return order;
  }));
}
function generateProviderSlug(name) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || `prov-${crypto.randomUUID().slice(0, 8)}`;
}
async function getProviders({ includeRetired = false } = {}) {
  if (useMemoryStore) return includeRetired ? memoryProviders : memoryProviders.filter(isActiveProvider);
  const query = new URLSearchParams({ select: "*", order: "type.asc,name.asc" });
  const rows = await supabaseRequest(`/rest/v1/providers?${query}`);
  return (includeRetired ? rows : rows.filter(isActiveProvider)).map((row) => ({ id: row.id, name: row.name, type: row.type, supplies: row.supplies, internalTransport: Boolean(row.internal_transport) }));
}
async function createProvider(input) {
  const name = input.name.trim();
  if (!name) throw new Error("Indique el nombre del proveedor.");
  const validTypes = /* @__PURE__ */ new Set(["Aserradero", "Transporte", "Importador"]);
  if (!validTypes.has(input.type)) throw new Error("El tipo de proveedor indicado no es v\xE1lido.");
  const supplies = input.supplies?.trim() ?? "";
  if (!supplies) throw new Error("Indique qu\xE9 provee el proveedor.");
  if (useMemoryStore) {
    if (memoryProviders.some((p) => p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
      throw new Error("Ya existe un proveedor con ese nombre.");
    }
    const baseSlug2 = generateProviderSlug(name);
    let id2 = baseSlug2;
    let counter2 = 2;
    while (memoryProviders.some((p) => p.id === id2)) {
      id2 = `${baseSlug2}-${counter2++}`;
    }
    const provider = { id: id2, name, type: input.type, supplies };
    memoryProviders.push(provider);
    return provider;
  }
  const existing = await getProviders({ includeRetired: true });
  if (existing.some((p) => p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
    throw new Error("Ya existe un proveedor con ese nombre.");
  }
  const baseSlug = generateProviderSlug(name);
  let id = baseSlug;
  let counter = 2;
  while (existing.some((p) => p.id === id)) {
    id = `${baseSlug}-${counter++}`;
  }
  const rows = await supabaseServerRequest("/rest/v1/providers", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ id, name, type: input.type, supplies })
  });
  const created = rows?.[0] ?? (await getProviders()).find((p) => p.id === id);
  if (!created) throw new Error("El proveedor se cre\xF3 pero no pudo recuperarse.");
  return created;
}
async function updateProvider(id, input) {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("ID de proveedor no v\xE1lido.");
  if (useMemoryStore) {
    const current2 = memoryProviders.find((p) => p.id === trimmedId);
    if (!current2) throw new Error("Proveedor no encontrado.");
    if (input.name !== void 0) {
      const name = input.name.trim();
      if (!name) throw new Error("El nombre no puede estar vac\xEDo.");
      if (memoryProviders.some((p) => p.id !== trimmedId && p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
        throw new Error("Ya existe otro proveedor con ese nombre.");
      }
      current2.name = name;
    }
    if (input.type !== void 0) {
      const validTypes = /* @__PURE__ */ new Set(["Aserradero", "Transporte", "Importador"]);
      if (!validTypes.has(input.type)) throw new Error("El tipo de proveedor no es v\xE1lido.");
      current2.type = input.type;
    }
    if (input.supplies !== void 0) {
      const supplies = input.supplies.trim();
      if (!supplies) throw new Error("Indique qu\xE9 provee el proveedor.");
      current2.supplies = supplies;
    }
    return current2;
  }
  const current = (await getProviders()).find((p) => p.id === trimmedId);
  if (!current) throw new Error("Proveedor no encontrado.");
  const patch = {};
  if (input.name !== void 0) {
    const name = input.name.trim();
    if (!name) throw new Error("El nombre no puede estar vac\xEDo.");
    const existing = await getProviders({ includeRetired: true });
    if (existing.some((p) => p.id !== trimmedId && p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) {
      throw new Error("Ya existe otro proveedor con ese nombre.");
    }
    patch.name = name;
  }
  if (input.type !== void 0) {
    const validTypes = /* @__PURE__ */ new Set(["Aserradero", "Transporte", "Importador"]);
    if (!validTypes.has(input.type)) throw new Error("El tipo de proveedor no es v\xE1lido.");
    patch.type = input.type;
  }
  if (input.supplies !== void 0) {
    const supplies = input.supplies.trim();
    if (!supplies) throw new Error("Indique qu\xE9 provee el proveedor.");
    patch.supplies = supplies;
  }
  if (Object.keys(patch).length > 0) {
    await supabaseServerRequest(`/rest/v1/providers?id=eq.${encodeURIComponent(trimmedId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify(patch)
    });
  }
  const updated = (await getProviders()).find((p) => p.id === trimmedId);
  if (!updated) throw new Error("El proveedor se actualiz\xF3 pero no pudo recuperarse.");
  return updated;
}
async function deleteProvider(id) {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("ID de proveedor no v\xE1lido.");
  if (useMemoryStore) {
    const index = memoryProviders.findIndex((p) => p.id === trimmedId);
    if (index === -1) throw new Error("Proveedor no encontrado.");
    const isReferencedInOrders = memoryOrders.some(
      (order) => order.producerProviderId === trimmedId || order.transportProviderId === trimmedId || order.shipments?.some((s) => s.transportProviderId === trimmedId)
    );
    const isReferencedInResources = memoryProductionResources.some((r) => r.providerId === trimmedId);
    const isReferencedInDefaults = memoryExternalDefaults.some((d) => d.providerId === trimmedId) || memoryTransportDefaults.some((t) => t.providerId === trimmedId);
    const isReferencedInMovements = memoryStockMovements.some((m) => m.providerId === trimmedId);
    if (isReferencedInOrders || isReferencedInResources || isReferencedInDefaults || isReferencedInMovements) {
      throw new Error("No se puede eliminar el proveedor porque tiene \xF3rdenes, transportes o recursos asociados.");
    }
    memoryProviders.splice(index, 1);
    return { ok: true };
  }
  const [ordersUsing, resourcesUsing, externalDefaults, transportDefaults] = await Promise.all([
    supabaseRequest(
      `/rest/v1/orders?or=(producer_provider_id.eq.${encodeURIComponent(trimmedId)},transport_provider_id.eq.${encodeURIComponent(trimmedId)})&select=id&limit=1`
    ).catch(() => []),
    supabaseRequest(
      `/rest/v1/production_resources?provider_id=eq.${encodeURIComponent(trimmedId)}&select=id&limit=1`
    ).catch(() => []),
    supabaseRequest(
      `/rest/v1/external_production_defaults?provider_id=eq.${encodeURIComponent(trimmedId)}&select=id&limit=1`
    ).catch(() => []),
    supabaseRequest(
      `/rest/v1/transport_capacity_defaults?provider_id=eq.${encodeURIComponent(trimmedId)}&select=id&limit=1`
    ).catch(() => [])
  ]);
  if (ordersUsing.length > 0 || resourcesUsing.length > 0 || externalDefaults.length > 0 || transportDefaults.length > 0) {
    throw new Error("No se puede eliminar el proveedor porque tiene \xF3rdenes, transportes o recursos asociados.");
  }
  try {
    await supabaseServerRequest(`/rest/v1/providers?id=eq.${encodeURIComponent(trimmedId)}`, {
      method: "DELETE",
      prefer: "return=representation"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("foreign key") || error.code === "23503") {
      throw new Error("No se puede eliminar el proveedor porque tiene registros dependientes.");
    }
    throw error;
  }
  return { ok: true };
}
async function getProducts() {
  if (useMemoryStore) {
    const clientNameById2 = new Map(memoryClients.map((client) => [client.id, client.name]));
    return memoryProducts.map((product) => ({
      ...product,
      heightCm: product.kind === "Pallet" ? product.heightCm ?? 10 : product.heightCm,
      clientNames: [...new Set(memoryClientProducts.filter((item) => item.productId === product.id && item.active).map((item) => clientNameById2.get(item.clientId)).filter((name) => Boolean(name)))].sort((a, b) => a.localeCompare(b, "es"))
    })).sort(compareProductsByInternalCode);
  }
  const query = new URLSearchParams({
    select: "*",
    order: "stock_name.asc,kind.asc,measure.asc"
  });
  const [rows, assignments, clients] = await Promise.all([
    supabaseRequest(`/rest/v1/products?${query}`),
    supabaseRequest("/rest/v1/client_products?select=product_id,client_id&active=eq.true&order=display_order.asc,id.asc"),
    supabaseRequest("/rest/v1/clients?select=id,name&order=name.asc")
  ]);
  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));
  const namesByProduct = /* @__PURE__ */ new Map();
  for (const assignment of assignments) {
    const name = clientNameById.get(assignment.client_id);
    if (!name) continue;
    const names = namesByProduct.get(assignment.product_id) ?? /* @__PURE__ */ new Set();
    names.add(name);
    namesByProduct.set(assignment.product_id, names);
  }
  return rows.map((row) => ({ ...mapProduct(row), clientNames: [...namesByProduct.get(row.id) ?? []].sort((a, b) => a.localeCompare(b, "es")) })).sort(compareProductsByInternalCode);
}
async function getClients() {
  if (useMemoryStore) return memoryClients;
  const rows = await supabaseRequest("/rest/v1/clients?select=id,name,address,department,active,updated_at&order=name.asc");
  return rows.map((row) => ({ id: row.id, name: row.name, address: row.address ?? void 0, department: row.department ?? void 0, active: row.active, updatedAt: row.updated_at }));
}
async function createClient(input) {
  const name = input.name.trim();
  if (!name) throw new Error("Indique el nombre del cliente.");
  if (!useMemoryStore) {
    const id = await supabaseServerRequest("/rest/v1/rpc/create_operation_client", { method: "POST", body: JSON.stringify({ p_name: name, p_address: input.address?.trim() || null, p_department: input.department?.trim() || null }) });
    const client2 = (await getClients()).find((item) => item.id === id);
    if (!client2) throw new Error("El cliente se cre\xF3 pero no pudo recuperarse.");
    return client2;
  }
  if (memoryClients.some((client2) => client2.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0)) throw new Error("Ese cliente ya existe.");
  const address = input.address?.trim() || void 0;
  const client = { id: `cliente-${crypto.randomUUID()}`, name, address, department: input.department?.trim() || void 0, active: true, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  memoryClients.push(client);
  return client;
}
async function updateClientMaster(id, input) {
  const current = (await getClients()).find((item) => item.id === id);
  if (!current) return null;
  const next = { name: input.name?.trim() || current.name, address: input.address === void 0 ? current.address : input.address.trim() || void 0, department: input.department === void 0 ? current.department : input.department.trim() || void 0, active: input.active ?? current.active ?? false };
  if (useMemoryStore) {
    Object.assign(current, next, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    return current;
  }
  await supabaseServerRequest(`/rest/v1/clients?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ name: next.name, address: next.address ?? null, department: next.department ?? null, active: next.active }) });
  return (await getClients()).find((item) => item.id === id) ?? null;
}
async function deleteClient(id) {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("ID de cliente no v\xE1lido.");
  const clients = await getClients();
  const current = clients.find((c) => c.id === trimmedId);
  if (!current) throw new Error("Cliente no encontrado.");
  if (useMemoryStore) {
    const isReferencedInOrders = memoryOrders.some(
      (order) => order.client.localeCompare(current.name, "es", { sensitivity: "accent" }) === 0
    );
    if (isReferencedInOrders) {
      throw new Error("No se puede eliminar el cliente porque tiene pedidos registrados.");
    }
    const clientProductIds = new Set(
      memoryClientProducts.filter((cp) => cp.clientId === trimmedId).map((cp) => String(cp.id))
    );
    for (const cpId of clientProductIds) {
      memoryAssetFiles.delete(cpId);
    }
    const nextClientProducts = memoryClientProducts.filter((cp) => cp.clientId !== trimmedId);
    memoryClientProducts.length = 0;
    memoryClientProducts.push(...nextClientProducts);
    const keptRules = memoryProductionRules.filter((rule) => !clientProductIds.has(String(rule.clientProductId)));
    memoryProductionRules.length = 0;
    memoryProductionRules.push(...keptRules);
    const clientIndex = memoryClients.findIndex((c) => c.id === trimmedId);
    if (clientIndex !== -1) {
      memoryClients.splice(clientIndex, 1);
    }
    return { ok: true };
  }
  const ordersUsing = await supabaseRequest(
    `/rest/v1/orders?client=eq.${encodeURIComponent(current.name)}&select=id&limit=1`
  ).catch(() => []);
  if (ordersUsing.length > 0) {
    throw new Error("No se puede eliminar el cliente porque tiene pedidos registrados.");
  }
  try {
    const clientProducts = await supabaseRequest(
      `/rest/v1/client_products?client_id=eq.${encodeURIComponent(trimmedId)}&select=id`
    ).catch(() => []);
    for (const cp of clientProducts) {
      await supabaseServerRequest(
        `/rest/v1/client_product_assets?client_product_id=eq.${cp.id}`,
        { method: "DELETE" }
      ).catch(() => void 0);
      await supabaseServerRequest(
        `/rest/v1/client_product_controls?client_product_id=eq.${cp.id}`,
        { method: "DELETE" }
      ).catch(() => void 0);
    }
    await supabaseServerRequest(
      `/rest/v1/client_products?client_id=eq.${encodeURIComponent(trimmedId)}`,
      { method: "DELETE" }
    ).catch(() => void 0);
    await supabaseServerRequest(
      `/rest/v1/clients?id=eq.${encodeURIComponent(trimmedId)}`,
      { method: "DELETE", prefer: "return=representation" }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("foreign key") || error.code === "23503") {
      throw new Error("No se puede eliminar el cliente porque tiene registros dependientes.");
    }
    throw error;
  }
  return { ok: true };
}
function mapProduct(row) {
  const stored = cleanAttributes(row.attributes);
  const hasLegacy = Boolean(row.model || row.reinforcement || row.board_count || row.quality || row.finish || row.heat_treatment);
  const attributes = row.attributes != null ? stored : hasLegacy ? attributesFromLegacy(row) : void 0;
  return { id: row.id, kind: row.kind, measure: row.measure ?? void 0, heightCm: row.kind === "Pallet" ? row.height_cm ?? 10 : row.height_cm ?? void 0, treatment: row.treatment ?? void 0, requiresTreatment: row.requires_treatment, stockName: row.stock_name ?? void 0, sourceCatalog: row.source_catalog ?? void 0, sourceCode: row.source_code ?? void 0, zetaCode: row.zeta_code ?? void 0, stockActive: row.stock_active ?? true, ...attributes !== void 0 ? { attributes } : {} };
}
function mapClientProduct(row) {
  const product = mapProduct(Array.isArray(row.products) ? row.products[0] : row.products);
  return {
    id: row.id,
    clientId: row.client_id,
    productId: row.product_id,
    zetaCode: product.zetaCode ?? row.zeta_code ?? "",
    operationalName: row.operational_name ?? void 0,
    active: row.active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    product,
    controls: [...row.client_product_controls ?? []].sort((a, b) => a.display_order - b.display_order).map((control) => ({
      id: control.id,
      clientProductId: control.client_product_id,
      title: control.title,
      detail: control.detail ?? void 0,
      displayOrder: control.display_order,
      active: control.active
    })),
    assets: [...row.client_product_assets ?? []].filter((asset) => asset.active).map((asset) => ({
      id: asset.id,
      clientProductId: asset.client_product_id,
      storagePath: asset.storage_path,
      fileName: asset.file_name,
      assetType: asset.asset_type,
      mimeType: asset.mime_type,
      sizeBytes: asset.size_bytes,
      altText: asset.alt_text,
      isPrimary: asset.is_primary,
      active: asset.active,
      createdAt: asset.created_at
    }))
  };
}
async function getClientProduct(id) {
  if (useMemoryStore) return memoryClientProducts.find((item) => String(item.id) === String(id)) ?? null;
  const query = new URLSearchParams({ select: masterSelect, id: `eq.${id}` });
  const rows = await supabaseRequest(`/rest/v1/client_products?${query}`);
  return rows[0] ? mapClientProduct(rows[0]) : null;
}
async function getClientDetail(clientId) {
  const client = (await getClients()).find((item) => item.id === clientId);
  if (!client) return null;
  if (useMemoryStore) return { client, products: memoryClientProducts.filter((item) => item.clientId === clientId).sort((a, b) => a.displayOrder - b.displayOrder) };
  const query = new URLSearchParams({ select: masterSelect, client_id: `eq.${clientId}`, order: "display_order.asc,created_at.asc" });
  const rows = await supabaseRequest(`/rest/v1/client_products?${query}`);
  return { client, products: rows.map(mapClientProduct) };
}
async function getClientProductOptions(clientId, activeOnly = true) {
  const detail = await getClientDetail(clientId);
  if (!detail || activeOnly && !detail.client.active) return [];
  return detail.products.filter((item) => !activeOnly || item.active && item.product.stockActive !== false && clientProductReady(item)).map((item) => ({
    id: item.id,
    productId: item.productId,
    kind: item.product.kind,
    label: productLabel(item.product, item.operationalName),
    zetaCode: item.product.zetaCode ?? item.zetaCode,
    clientAddress: detail.client.address,
    treatmentRequired: item.product.requiresTreatment,
    controlsReady: item.controls.some((control) => control.active)
  }));
}
async function createClientProduct(clientId, input) {
  const initialControl = input.initialControl?.trim() ?? "";
  if (!input.productId) throw new Error("Seleccione un producto.");
  if (useMemoryStore) {
    const client = memoryClients.find((item3) => item3.id === clientId);
    const product = memoryProducts.find((item3) => item3.id === input.productId);
    if (!client || !product) throw new Error("Cliente o producto no encontrado.");
    if (memoryClientProducts.some((item3) => item3.clientId === clientId && item3.productId === input.productId)) throw Object.assign(new Error("Ese producto ya est\xE1 habilitado para el cliente."), { status: 409 });
    const zetaCode = product.zetaCode ?? "";
    const id2 = memoryMasterId++;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const item2 = { id: id2, clientId, productId: product.id, zetaCode, operationalName: input.operationalName?.trim() || void 0, active: true, displayOrder: input.displayOrder ?? memoryClientProducts.filter((entry) => entry.clientId === clientId).length, createdAt: now, updatedAt: now, product, controls: initialControl ? [{ id: memoryMasterId++, clientProductId: id2, title: initialControl, displayOrder: 0, active: true }] : [], assets: [] };
    memoryClientProducts.push(item2);
    seedMemoryPalletProductionRules(item2);
    return item2;
  }
  const id = await supabaseServerRequest("/rest/v1/rpc/create_client_product_master_v2", { method: "POST", body: JSON.stringify({ p_client_id: clientId, p_product_id: input.productId, p_operational_name: input.operationalName?.trim() || null, p_control_title: initialControl, p_control_detail: null }) });
  const item = await getClientProduct(id);
  if (!item) throw new Error("La relaci\xF3n se cre\xF3 pero no pudo recuperarse.");
  return item;
}
async function updateClientProduct(id, input) {
  const current = await getClientProduct(id);
  if (!current) return null;
  const zetaCode = current.product.zetaCode ?? current.zetaCode;
  const next = { ...current, zetaCode, operationalName: input.operationalName === void 0 ? current.operationalName : input.operationalName.trim() || void 0, active: input.active ?? current.active, displayOrder: input.displayOrder ?? current.displayOrder };
  if (!next.zetaCode) throw new Error("El c\xF3digo es obligatorio.");
  if (useMemoryStore) {
    Object.assign(current, next, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    if (next.active) seedMemoryPalletProductionRules(current);
    return current;
  }
  await supabaseServerRequest("/rest/v1/rpc/update_client_product_master_v2", { method: "POST", body: JSON.stringify({ p_id: Number(id), p_operational_name: next.operationalName ?? null, p_active: next.active, p_display_order: next.displayOrder }) });
  return getClientProduct(id);
}
async function replaceClientProductControls(id, controls) {
  const normalized = controls.map((control) => ({ title: control.title.trim(), detail: control.detail?.trim() || void 0, active: control.active !== false })).filter((control) => control.title);
  const current = await getClientProduct(id);
  if (!current) return null;
  if (useMemoryStore) {
    current.controls = normalized.map((control, index) => ({ id: memoryMasterId++, clientProductId: current.id, title: control.title, detail: control.detail, active: control.active, displayOrder: index }));
    current.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return current;
  }
  await supabaseServerRequest("/rest/v1/rpc/replace_client_product_controls", { method: "POST", body: JSON.stringify({ p_client_product_id: Number(id), p_controls: normalized }) });
  return getClientProduct(id);
}
async function addClientProductAsset(id, file, input) {
  const current = await getClientProduct(id);
  if (!current) throw Object.assign(new Error("Relaci\xF3n cliente\u2013producto no encontrada."), { status: 404 });
  if (!allowedAssetTypes.includes(file.type)) throw new Error("Use una imagen JPG, PNG o WebP, o un plano PDF.");
  if (file.size <= 0 || file.size > maximumAssetBytes) throw new Error("El archivo debe pesar entre 1 byte y 6 MB.");
  const altText = input.altText.trim();
  if (!altText) throw new Error("Describa brevemente el plano o la fotograf\xEDa.");
  const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${current.clientId}/${current.id}/${crypto.randomUUID()}.${extension}`;
  if (useMemoryStore) {
    if (input.isPrimary) current.assets.forEach((asset2) => {
      asset2.isPrimary = false;
    });
    const asset = { id: memoryMasterId++, clientProductId: current.id, storagePath: path, fileName: file.name, assetType: input.assetType, mimeType: file.type, sizeBytes: file.size, altText, isPrimary: input.isPrimary || !current.assets.some((item) => item.active && item.isPrimary), active: true, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    current.assets.push(asset);
    memoryAssetFiles.set(String(asset.id), { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
    return asset;
  }
  await uploadPrivateAsset(path, file);
  try {
    const assetId = await supabaseServerRequest("/rest/v1/rpc/add_client_product_asset", { method: "POST", body: JSON.stringify({ p_client_product_id: Number(id), p_storage_path: path, p_file_name: file.name, p_asset_type: input.assetType, p_mime_type: file.type, p_size_bytes: file.size, p_alt_text: altText, p_is_primary: input.isPrimary }) });
    const refreshed = await getClientProduct(id);
    const asset = refreshed?.assets.find((item) => String(item.id) === String(assetId));
    if (!asset) throw new Error("El archivo se carg\xF3 pero no pudo recuperarse.");
    return asset;
  } catch (error) {
    await deletePrivateAsset(path).catch(() => void 0);
    throw error;
  }
}
async function softDeleteClientProductAsset(assetId) {
  const item = memoryClientProducts.flatMap((entry) => entry.assets).find((asset) => String(asset.id) === String(assetId));
  if (useMemoryStore) {
    if (!item) return false;
    item.active = false;
    item.isPrimary = false;
    return true;
  }
  await supabaseServerRequest(`/rest/v1/client_product_assets?id=eq.${assetId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ active: false, is_primary: false }) });
  return true;
}
async function getClientProductAssetUrl(assetId) {
  if (useMemoryStore) {
    if (!memoryAssetFiles.has(String(assetId))) return null;
    return `/api/client-product-assets/${assetId}/content`;
  }
  const rows = await supabaseRequest(`/rest/v1/client_product_assets?select=storage_path&id=eq.${assetId}&active=eq.true`);
  return rows[0] ? createPrivateAssetUrl(rows[0].storage_path) : null;
}
function getMemoryClientProductAssetContent(assetId) {
  return useMemoryStore ? memoryAssetFiles.get(String(assetId)) ?? null : null;
}
function dbErrorCode(error) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}
function levelsMigrationError(error) {
  if (["PGRST202", "PGRST204", "PGRST205", "42703", "42P01", "42883"].includes(dbErrorCode(error))) throw new Error("La base todav\xEDa no tiene los niveles de producto: falta aplicar la migraci\xF3n 20261104165453_product_levels_and_catalog_20261104.");
  throw error;
}
async function getProductLevels() {
  if (useMemoryStore) return structuredClone(memoryProductLevels);
  try {
    const rows = await supabaseServerRequest("/rest/v1/product_levels?select=id,label,position,options,system&order=position.asc");
    return rows.length ? rows.map((row) => ({ id: row.id, label: row.label, system: row.system, options: cleanOptions(row.options) })) : structuredClone(defaultProductLevels);
  } catch (error) {
    if (["PGRST205", "42P01"].includes(dbErrorCode(error))) return structuredClone(defaultProductLevels);
    throw error;
  }
}
function countLevelUsage(products2, levels) {
  const usage = {};
  for (const level of levels) {
    const counts = {};
    for (const product of products2) {
      const value = levelValue(product, level.id).toLocaleLowerCase("es");
      if (value) counts[value] = (counts[value] ?? 0) + 1;
    }
    usage[level.id] = counts;
  }
  return usage;
}
async function persistProductLevels(levels) {
  if (useMemoryStore) {
    memoryProductLevels.length = 0;
    memoryProductLevels.push(...structuredClone(levels));
    return;
  }
  await supabaseServerRequest("/rest/v1/rpc/save_product_levels_v1", {
    method: "POST",
    body: JSON.stringify({ p_levels: levels.map((level) => ({ id: level.id, label: level.label, options: level.options })) })
  }).catch(levelsMigrationError);
}
async function saveProductLevels(input) {
  const [current, products2] = await Promise.all([getProductLevels(), getProducts()]);
  const taken = new Set(current.map((level) => level.id));
  const next = [];
  for (const item of input) {
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label) throw new Error("Cada nivel necesita un nombre.");
    const existing = typeof item.id === "string" ? current.find((level) => level.id === item.id) : void 0;
    const id = existing?.id ?? levelSlug(label, taken);
    taken.add(id);
    next.push({ id, label, system: existing?.system ?? false, options: cleanOptions(item.options) });
  }
  if (next[0]?.id !== MEASURE_LEVEL) throw new Error("La Medida es siempre el primer nivel.");
  const duplicate = next.find((level, index) => next.findIndex((other) => other.label.toLocaleLowerCase("es") === level.label.toLocaleLowerCase("es")) !== index);
  if (duplicate) throw new Error(`Hay dos niveles llamados \xAB${duplicate.label}\xBB.`);
  for (const level of current) {
    if (next.some((item) => item.id === level.id)) continue;
    if (level.system) throw new Error(`No se puede quitar el nivel \xAB${level.label}\xBB.`);
    const used = products2.filter((product) => levelValue(product, level.id)).length;
    if (used) throw new Error(`No se puede eliminar el nivel \xAB${level.label}\xBB: ${used} ${used === 1 ? "producto lo usa" : "productos lo usan"}.`);
  }
  await persistProductLevels(next);
  return next;
}
async function rememberLevelOptions(measure, attributes) {
  const levels = await getProductLevels();
  let changed = false;
  const next = levels.map((level) => {
    const value = level.id === MEASURE_LEVEL ? measure?.trim() : attributes[level.id];
    if (!value || level.options.some((option) => option.toLocaleLowerCase("es") === value.toLocaleLowerCase("es"))) return level;
    changed = true;
    return { ...level, options: [...level.options, value] };
  });
  if (changed) await persistProductLevels(next).catch(() => void 0);
}
function resolveAttributes(input, levels) {
  const attributes = cleanAttributes(input.attributes);
  const known = new Set(levels.map((level) => level.id));
  const unknown = Object.keys(attributes).find((key) => key === MEASURE_LEVEL || !known.has(key));
  if (unknown) throw new Error(`El nivel \xAB${unknown}\xBB no existe.`);
  if (!attributes[TREATMENT_LEVEL] && typeof input.requiresTreatment === "boolean") {
    attributes[TREATMENT_LEVEL] = input.requiresTreatment ? "Con HT" : "Sin HT";
  }
  const resolved = applyLevelRules(attributes);
  if (resolved[TREATMENT_LEVEL] && resolved[TREATMENT_LEVEL] !== "Sin HT" && !requiresHeatTreatment(resolved[TREATMENT_LEVEL])) throw new Error("El tratamiento tiene que ser Sin HT o Con HT.");
  return resolved;
}
function validateProductHeight(heightCm) {
  if (heightCm !== void 0 && heightCm !== null && (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 99999.99 || Math.abs(heightCm * 100 - Math.round(heightCm * 100)) > 1e-8))
    throw new Error("La altura debe ser positiva y tener como m\xE1ximo dos decimales.");
}
async function createProduct(input) {
  validateProductHeight(input.heightCm);
  const heightCm = input.kind === "Pallet" ? input.heightCm ?? 10 : input.heightCm ?? null;
  const levels = await getProductLevels();
  const zetaCode = input.zetaCode?.trim().toLocaleUpperCase("es");
  if (!zetaCode || !/^[1-9]\d*$/.test(zetaCode)) throw new Error("Indique un c\xF3digo num\xE9rico.");
  const measure = input.measure?.trim();
  if (!measure) throw new Error("Indique la medida.");
  const attributes = resolveAttributes(input, levels);
  const requiresTreatment = requiresHeatTreatment(attributes[TREATMENT_LEVEL]);
  const stockName = input.stockName?.trim() || buildProductName({ kind: input.kind, measure, attributes, requiresTreatment }, levels);
  const clientIds = [...new Set(input.clientIds ?? [])].filter(Boolean);
  if (!useMemoryStore) {
    const id = await supabaseServerRequest("/rest/v1/rpc/create_catalog_product_v7", {
      method: "POST",
      body: JSON.stringify({ p_kind: input.kind, p_measure: measure, p_height_cm: heightCm, p_attributes: attributes, p_zeta_code: zetaCode, p_stock_name: stockName, p_client_ids: clientIds })
    }).catch(levelsMigrationError);
    await rememberLevelOptions(measure, attributes);
    const product = (await getProducts()).find((item) => item.id === id);
    if (!product) throw new Error("El producto se cre\xF3 pero no pudo recuperarse.");
    return product;
  }
  if (memoryProducts.some((product) => product.zetaCode?.toLocaleUpperCase("es") === zetaCode)) throw new Error(`Ya existe un producto con el c\xF3digo ${zetaCode}.`);
  const draft = { id: `producto-${crypto.randomUUID()}`, kind: input.kind, measure, heightCm: heightCm ?? void 0, attributes, requiresTreatment, zetaCode, stockName };
  const twin = memoryProducts.find((product) => productKey(product) === productKey(draft));
  if (twin) throw new Error(`Ya existe un producto con esa clasificaci\xF3n (c\xF3digo ${twin.zetaCode ?? twin.id}).`);
  memoryProducts.push(draft);
  await rememberLevelOptions(measure, attributes);
  for (const clientId of clientIds) await assignClientToProduct(draft.id, clientId);
  return (await getProducts()).find((item) => item.id === draft.id) ?? draft;
}
async function assignClientToProduct(productId, clientId) {
  const client = (await getClients()).find((item) => item.id === clientId);
  if (!client) throw new Error("El cliente seleccionado no existe.");
  if (useMemoryStore) {
    const product = memoryProducts.find((item) => item.id === productId);
    if (!product) throw new Error("Producto no encontrado.");
    if (memoryClientProducts.some((item) => item.clientId === clientId && item.productId === productId)) return;
    const id = memoryMasterId++;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    memoryClientProducts.push({
      id,
      clientId,
      productId,
      zetaCode: product.zetaCode ?? "",
      active: true,
      displayOrder: memoryClientProducts.filter((item) => item.clientId === clientId).length,
      createdAt: now,
      updatedAt: now,
      product,
      controls: [],
      assets: []
    });
    seedMemoryPalletProductionRules(memoryClientProducts[memoryClientProducts.length - 1]);
    return;
  }
  const query = new URLSearchParams({ select: "id", client_id: `eq.${clientId}`, product_id: `eq.${productId}`, limit: "1" });
  const existing = await supabaseServerRequest(`/rest/v1/client_products?${query}`);
  if (existing.length) return;
  await supabaseServerRequest("/rest/v1/client_products", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ client_id: clientId, product_id: productId, zeta_code: null, active: true })
  });
}
async function updateProduct(id, input) {
  validateProductHeight(input.heightCm);
  const heightCm = input.kind === "Pallet" && input.heightCm === null ? 10 : input.heightCm;
  const levels = await getProductLevels();
  const stockName = input.stockName?.trim();
  const zetaCode = input.zetaCode?.trim().toLocaleUpperCase("es");
  if (input.stockName !== void 0 && !stockName) throw new Error("Indique el nombre del producto.");
  if (input.zetaCode !== void 0 && (!zetaCode || !/^[1-9]\d*$/.test(zetaCode))) throw new Error("Indique un c\xF3digo num\xE9rico.");
  const measure = input.measure?.trim();
  if (!measure) throw new Error("Indique la medida.");
  const attributes = resolveAttributes(input, levels);
  const requiresTreatment = requiresHeatTreatment(attributes[TREATMENT_LEVEL]);
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/update_catalog_product_v5", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_kind: input.kind, p_measure: measure, p_height_cm: heightCm ?? null, p_height_provided: heightCm !== void 0, p_attributes: attributes, p_zeta_code: zetaCode ?? null, p_stock_name: stockName ?? null })
    }).catch(levelsMigrationError);
    await rememberLevelOptions(measure, attributes);
    if (input.clientIds) await supabaseServerRequest("/rest/v1/rpc/set_product_clients_v1", { method: "POST", body: JSON.stringify({ p_product_id: id, p_client_ids: [...new Set(input.clientIds)] }) });
    else if (input.clientId) await assignClientToProduct(id, input.clientId);
    const products2 = await getProducts();
    const product2 = products2.find((item) => item.id === id);
    if (!product2) throw new Error("El producto se actualiz\xF3 pero no pudo recuperarse.");
    return product2;
  }
  const product = memoryProducts.find((item) => item.id === id);
  if (!product) throw new Error("Producto no encontrado.");
  if (zetaCode && memoryProducts.some((item) => item.id !== id && item.zetaCode?.toLocaleUpperCase("es") === zetaCode)) throw new Error(`Ya existe otro producto con el c\xF3digo ${zetaCode}.`);
  const candidate = { ...product, kind: input.kind, measure, attributes, requiresTreatment };
  const twin = memoryProducts.find((item) => item.id !== id && productKey(item) === productKey(candidate));
  if (twin) throw new Error(`Ya existe un producto con esa clasificaci\xF3n (c\xF3digo ${twin.zetaCode ?? twin.id}).`);
  Object.assign(product, { kind: input.kind, measure, attributes, requiresTreatment, ...heightCm !== void 0 ? { heightCm: heightCm ?? void 0 } : {}, ...stockName ? { stockName } : {}, ...zetaCode ? { zetaCode } : {} });
  await rememberLevelOptions(measure, attributes);
  if (zetaCode) memoryClientProducts.filter((item) => item.productId === id).forEach((item) => {
    item.zetaCode = zetaCode;
    item.product.zetaCode = zetaCode;
  });
  if (input.clientIds) {
    const wanted = new Set(input.clientIds);
    for (const clientId of wanted) await assignClientToProduct(id, clientId);
    const usedLink = (linkId) => memoryOrders.some((order) => order.lines.some((line) => String(line.clientProductId) === String(linkId)));
    memoryClientProducts.filter((item) => item.productId === id && !wanted.has(item.clientId)).forEach((item) => {
      item.active = false;
    });
    const kept = memoryClientProducts.filter((item) => item.productId !== id || wanted.has(item.clientId) || usedLink(item.id));
    const keptIds = new Set(kept.map((item) => String(item.id)));
    const keptRules = memoryProductionRules.filter((rule) => rule.clientProductId === void 0 || keptIds.has(String(rule.clientProductId)));
    memoryProductionRules.length = 0;
    memoryProductionRules.push(...keptRules);
    memoryClientProducts.length = 0;
    memoryClientProducts.push(...kept);
  } else if (input.clientId) await assignClientToProduct(id, input.clientId);
  const updated = (await getProducts()).find((item) => item.id === id);
  if (!updated) throw new Error("El producto se actualiz\xF3 pero no pudo recuperarse.");
  return updated;
}
async function deleteProduct(id) {
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/delete_catalog_product_v2", {
      method: "POST",
      body: JSON.stringify({ p_id: id })
    });
    return;
  }
  const index = memoryProducts.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Producto no encontrado.");
  const usedBy = memoryOrders.filter((order) => order.lines.some((line) => line.productId === id));
  if (usedBy.length) throw new Error(`No se puede eliminar: el producto figura en ${usedBy.length} pedido(s) de ${[...new Set(usedBy.map((order) => order.client))].join(", ")}. Cancel\xE1 o elimin\xE1 esos pedidos primero.`);
  const remaining = memoryClientProducts.filter((item) => item.productId !== id);
  const keptRules = memoryProductionRules.filter((rule) => rule.productId !== id);
  memoryProductionRules.length = 0;
  memoryProductionRules.push(...keptRules);
  memoryClientProducts.length = 0;
  memoryClientProducts.push(...remaining);
  memoryProducts.splice(index, 1);
}
async function deleteOrder(id) {
  if (!useMemoryStore) {
    try {
      await supabaseServerRequest("/rest/v1/rpc/delete_operation_order_v1", {
        method: "POST",
        body: JSON.stringify({ p_order_id: id })
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "PGRST202") throw new Error("La base todav\xEDa no permite eliminar pedidos: falta aplicar la migraci\xF3n 20261030120000_delete_order.");
      throw error;
    }
    return;
  }
  const index = memoryOrders.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Pedido no encontrado.");
  const order = memoryOrders[index];
  const lineIds = new Set(order.lines.map((line) => String(line.id)));
  const shipmentLineIds = new Set((order.shipments ?? []).flatMap((shipment) => shipment.lines.map((line) => String(line.id))));
  const hasLedger = memoryStockMovements.some((movement) => movement.orderLineId !== void 0 && lineIds.has(String(movement.orderLineId)) || movement.shipmentLineId !== void 0 && shipmentLineIds.has(String(movement.shipmentLineId))) || memoryTreatmentBatches.some((batch) => lineIds.has(String(batch.orderLineId)));
  if (hasLedger) throw new Error("El pedido ya tiene movimientos de stock o tratamientos HT registrados. Cancelalo para conservar el historial.");
  const keptReservations = memoryStockReservations.filter((item) => !shipmentLineIds.has(String(item.shipmentLineId)));
  memoryStockReservations.length = 0;
  memoryStockReservations.push(...keptReservations);
  memoryHistory.delete(id);
  memoryOrders.splice(index, 1);
}
async function createOrder(input) {
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.some((line) => !line.clientProductId || !Number.isInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("Indique al menos un producto con una cantidad mayor a cero.");
  }
  if (!useMemoryStore) {
    const id2 = await supabaseServerRequest("/rest/v1/rpc/create_operation_order_v7", {
      method: "POST",
      body: JSON.stringify({
        p_lines: input.lines.map((line) => ({ clientProductId: Number(line.clientProductId), quantity: line.quantity })),
        p_order_date: input.orderDate,
        p_planned_date: input.plannedDate,
        p_delivery_date_note: input.deliveryDateNote?.trim() || null,
        p_notes: input.notes?.trim() || null,
        p_required_operations: canonicalOperations(input.requiredOperations)
      })
    });
    const order2 = await getDatabaseOrder(id2);
    if (!order2) throw new Error("El pedido se cre\xF3 pero no pudo recuperarse.");
    return order2;
  }
  const selected = input.lines.map((line) => ({ line, relation: memoryClientProducts.find((item) => String(item.id) === String(line.clientProductId)) }));
  const client = memoryClients.find((item) => item.id === selected[0]?.relation?.clientId);
  if (!client || !client.active || selected.some(({ relation }) => !relation || relation.clientId !== client.id || !relation.active || !clientProductReady(relation))) throw new Error("Los productos deben estar activos y pertenecer al mismo cliente.");
  const requested = input.lines.reduce((sum, line) => sum + line.quantity, 0);
  const resolvedLines = selected.map(({ line, relation }, index) => ({ id: "", product: productLabel(relation.product, relation.operationalName), productId: relation.productId, clientProductId: relation.id, quantity: line.quantity, treatment: relation.product.treatment, index }));
  const resolvedProduct = resolvedLines.map((line) => line.product).join(" \xB7 ");
  const id = `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const order = {
    id,
    reference: `Pedido ${memoryOrders.length + 1}`,
    client: client.name,
    clientId: client.id,
    product: resolvedProduct,
    productId: resolvedLines[0].productId,
    clientProductId: resolvedLines[0].clientProductId,
    requested,
    delivered: 0,
    pending: requested,
    stage: "negociacion",
    orderDate: input.orderDate,
    requestedDeliveryDate: input.plannedDate,
    deliveryDateNote: input.deliveryDateNote?.trim() || void 0,
    zetaCode: selected.map(({ relation }) => relation.zetaCode).join(" \xB7 "),
    plannedDate: input.plannedDate,
    dateLabel: formatPlannedDate(input.plannedDate),
    transport: "Sin definir",
    transportSource: "internal",
    transportDefined: false,
    productionSource: "internal",
    productionDefined: false,
    requiredOperations: canonicalOperations(input.requiredOperations),
    supply: "Producci\xF3n sin planificar",
    preparation: "Pendiente de preparaci\xF3n",
    logistics: "Transporte sin definir",
    delivery: `0 de ${requested} entregados`,
    action: "Preparar y coordinar la entrega.",
    deliveryAddress: client.address,
    notes: input.notes?.trim() || void 0,
    lines: resolvedLines.map((line) => ({ ...line, id: `${id}-${line.index + 1}`, productionAllocations: [] })),
    source: "Alta desde dashboard"
  };
  order.shipments = [{ id: `shipment-${crypto.randomUUID()}`, orderId: id, plannedDate: input.plannedDate, status: "planned", transportSource: "internal", transportLabel: "Sin definir", createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString(), lines: order.lines.map((line) => ({ id: `sl-${crypto.randomUUID()}`, shipmentId: `shipment-${id}`, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: line.quantity, deliveredQuantity: 0 })), events: [] }];
  order.shipments[0].events.push({ id: `se-${crypto.randomUUID()}`, shipmentId: order.shipments[0].id, eventType: "created", nextStatus: "planned", nextDate: input.plannedDate, responsible: "Sistema", createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  memoryOrders.unshift(order);
  return order;
}
async function planOrderProduction(orderId, allocations) {
  if (allocations.some((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate) || !Number.isInteger(item.plannedQuantity) || item.plannedQuantity <= 0 || !item.resourceId)) throw new Error("Revis\xE1 recursos, fechas y cantidades.");
  if (!useMemoryStore) {
    const currentOrder = await getDatabaseOrder(orderId);
    if (!currentOrder) return null;
    for (const line of currentOrder.lines) {
      const fixed = Math.min(line.quantity, (line.productionAllocations ?? []).reduce((sum, item) => sum + (item.status === "completed" ? item.actualQuantity ?? 0 : item.status === "confirmed" ? item.plannedQuantity : 0), 0));
      const planned = allocations.filter((item) => item.orderLineId === line.id).reduce((sum, item) => sum + item.plannedQuantity, 0);
      if (fixed + planned > line.quantity) throw new Error(`La producci\xF3n asignada supera la cantidad de ${line.product}.`);
    }
    await supabaseServerRequest("/rest/v1/rpc/plan_order_production_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_allocations: allocations.map((item) => ({ ...item, status: "draft" })) }) });
    return getDatabaseOrder(orderId);
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  for (const line of order.lines) {
    await replaceProductionAllocations(line.id, allocations.filter((item) => item.orderLineId === line.id).map((item) => ({ resourceId: item.resourceId, plannedDate: item.plannedDate, plannedQuantity: item.plannedQuantity, status: "draft" })));
  }
  const dates = order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled").map((item) => item.plannedDate)).sort();
  order.productionDefined = dates.length > 0;
  order.productionDate = dates[0];
  order.productionEndDate = dates.at(-1);
  order.supply = dates.length ? "Producci\xF3n planificada" : "Producci\xF3n sin planificar";
  return order;
}
async function assignOrderTransport(orderId, input) {
  const providerId = input.providerId?.trim() || generateProviderSlug(input.newProviderName ?? "");
  if (!isActiveProvider({ id: providerId })) throw new Error("El transportista Linares est\xE1 retirado.");
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/assign_order_transport_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_source: input.source, p_provider_id: input.providerId?.trim() || null, p_new_provider_name: input.newProviderName?.trim() || null }) });
    return getDatabaseOrder(orderId);
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  let provider = input.newProviderName?.trim() ? memoryProviders.find((item) => item.name.localeCompare(input.newProviderName.trim(), "es", { sensitivity: "accent" }) === 0) : memoryProviders.find((item) => item.id === input.providerId);
  if (!provider && input.newProviderName?.trim()) {
    provider = { id: generateProviderSlug(input.newProviderName), name: input.newProviderName.trim(), type: "Transporte", supplies: "Transporte", internalTransport: input.source === "internal" };
    memoryProviders.push(provider);
  }
  if (!provider || provider.type !== "Transporte") throw new Error("Seleccion\xE1 un transporte.");
  Object.assign(order, { transportSource: input.source, transportProviderId: provider.id, transport: provider.name, logistics: `${provider.name} \xB7 entrega planificada`, transportDefined: true });
  (order.shipments ?? []).filter((shipment) => shipment.status === "planned").forEach((shipment) => Object.assign(shipment, { transportSource: input.source, transportProviderId: provider.id, transportLabel: provider.name }));
  return order;
}
async function planOrderDrying(orderId, input) {
  const allocations = input.allocations?.filter((item) => item.quantity > 0);
  if (allocations?.length) {
    const dates = allocations.map((item) => item.date).sort();
    input = { ...input, startDate: dates[0], endDate: dates.at(-1) };
  }
  if (!useMemoryStore) {
    if (allocations) {
      const current = await getDatabaseOrder(orderId);
      const lineIds = new Set((current?.lines ?? []).map((line) => line.id));
      if (!current || allocations.some((item) => !lineIds.has(item.orderLineId) || !Number.isInteger(item.quantity))) throw new Error("Las cantidades no corresponden a este pedido.");
    }
    await supabaseServerRequest("/rest/v1/rpc/plan_order_drying_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_start: input.startDate, p_end: input.endDate || null, p_note: input.note?.trim() || null }) });
    if (allocations) {
      const lineIds = (await getDatabaseOrder(orderId))?.lines.map((line) => encodeURIComponent(line.id)) ?? [];
      try {
        if (lineIds.length) await supabaseServerRequest(`/rest/v1/drying_allocations?order_line_id=in.(${lineIds.join(",")})`, { method: "DELETE" });
        await supabaseServerRequest("/rest/v1/drying_allocations", { method: "POST", body: JSON.stringify(allocations.map((item) => ({ order_line_id: item.orderLineId, planned_date: item.date, planned_quantity: item.quantity }))) });
      } catch (error) {
        if (error.code === "PGRST205") throw new Error("Falta crear la tabla de programaci\xF3n del secadero en la base de datos.");
        throw error;
      }
    }
    return getDatabaseOrder(orderId);
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  if (input.endDate && input.endDate < input.startDate) throw new Error("La fecha de fin no puede ser anterior al inicio.");
  Object.assign(order, { dryingStartDate: input.startDate, dryingEndDate: input.endDate || input.startDate, dryingNote: input.note?.trim() || void 0 });
  if (allocations) for (const line of order.lines) line.dryingAllocations = allocations.filter((item) => item.orderLineId === line.id).map((item) => ({ date: item.date, quantity: item.quantity }));
  return order;
}
async function getOrderDetail(id) {
  return useMemoryStore ? memoryOrders.find((item) => item.id === id) ?? null : getDatabaseOrder(id);
}
function refreshMemoryOrder(order) {
  const shipments = (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled");
  order.delivered = shipments.flatMap((shipment) => shipment.lines).reduce((sum, line) => sum + line.deliveredQuantity, 0);
  order.pending = Math.max(order.requested - order.delivered, 0);
  order.delivery = `${order.delivered} de ${order.requested} entregados`;
  if (order.delivered >= order.requested) {
    order.stage = "completado";
    order.deliveryStatus = "completa";
  } else if (order.delivered > 0) order.deliveryStatus = "parcial";
  const next = shipments.filter((shipment) => !["delivered"].includes(shipment.status)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
  if (next) {
    order.plannedDate = next.plannedDate;
    order.dateLabel = formatPlannedDate(next.plannedDate);
  }
}
async function replaceProductionAllocations(orderLineId, allocations) {
  if (!useMemoryStore) {
    const currentOrder = (await getOrders()).find((item) => item.lines.some((line2) => line2.id === orderLineId));
    const currentLine = currentOrder?.lines.find((line2) => line2.id === orderLineId);
    if (!currentLine) throw new Error("L\xEDnea no encontrada.");
    const fixedQuantity2 = Math.min(currentLine.quantity, (currentLine.productionAllocations ?? []).reduce((sum, item) => sum + (item.status === "completed" ? item.actualQuantity ?? 0 : item.status === "confirmed" ? item.plannedQuantity : 0), 0));
    if (fixedQuantity2 + allocations.reduce((sum, item) => sum + item.plannedQuantity, 0) > currentLine.quantity) throw new Error("La producci\xF3n asignada supera la cantidad de la l\xEDnea.");
    await supabaseServerRequest("/rest/v1/rpc/replace_production_allocations_v1", { method: "POST", body: JSON.stringify({ p_order_line_id: orderLineId, p_allocations: allocations }) });
    const order2 = (await getOrders()).find((item) => item.lines.some((line2) => line2.id === orderLineId));
    return order2?.lines.find((line2) => line2.id === orderLineId) ?? null;
  }
  const order = memoryOrders.find((item) => item.lines.some((line2) => line2.id === orderLineId));
  const line = order?.lines.find((item) => item.id === orderLineId);
  if (!line) return null;
  const fixed = (line.productionAllocations ?? []).filter((item) => item.status === "confirmed" || item.status === "completed");
  const previousDrafts = (line.productionAllocations ?? []).filter((item) => item.status === "draft");
  if (allocations.some((item) => item.status !== "draft" || !/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate) || !Number.isInteger(item.plannedQuantity) || item.plannedQuantity <= 0)) throw new Error("Las asignaciones nuevas se guardan en borrador con fecha y cantidad v\xE1lidas.");
  const fixedQuantity = Math.min(line.quantity, fixed.reduce((sum, item) => sum + (item.status === "completed" ? item.actualQuantity ?? 0 : item.plannedQuantity), 0));
  if (fixedQuantity + allocations.reduce((sum, item) => sum + item.plannedQuantity, 0) > line.quantity) throw new Error("La producci\xF3n asignada supera la cantidad de la l\xEDnea.");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  line.productionAllocations = [...fixed, ...allocations.map((item) => {
    const resourceId = item.resourceId?.trim() || void 0;
    const resource = memoryProductionResources.find((entry) => String(entry.id) === resourceId || entry.providerId === resourceId || resourceId === "internal" && entry.resourceType === "internal_factory");
    return { ...item, id: `pa-${crypto.randomUUID()}`, orderLineId, resourceId, productionResourceId: resource?.id, status: "draft", note: item.note?.trim() || void 0, createdAt: now, updatedAt: now };
  })];
  const describe = (entries) => entries.length ? entries.map((entry) => `${formatPlannedDate(entry.plannedDate)} \xB7 ${entry.plannedQuantity} palets \xB7 ${entry.resourceId ?? "Sin recurso"}`).join(" | ") : "Sin distribuir";
  const from = describe(previousDrafts);
  const to = describe(allocations);
  if (order && from !== to) memoryHistory.set(order.id, [{ id: `produccion-${crypto.randomUUID()}`, changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date(now)), kind: "cambio", note: `${line.product}: distribuci\xF3n de producci\xF3n actualizada`, changes: [{ field: "Distribuci\xF3n de producci\xF3n", from, to }] }, ...memoryHistory.get(order.id) ?? []]);
  return line;
}
function validateMemoryShipmentLines(order, shipmentId, lines) {
  if (!lines.length) throw new Error("Indique al menos una l\xEDnea para el viaje.");
  for (const input of lines) {
    const line = order.lines.find((item) => item.id === input.orderLineId);
    if (!line || !Number.isInteger(input.plannedQuantity) || input.plannedQuantity <= 0) throw new Error("Revise las l\xEDneas y cantidades del viaje.");
    void shipmentId;
  }
}
async function createShipment(orderId, input) {
  if (input.transportProviderId && !isActiveProvider({ id: input.transportProviderId })) throw new Error("El transportista Linares est\xE1 retirado.");
  if (!useMemoryStore) {
    const id2 = await supabaseServerRequest("/rest/v1/rpc/create_shipment_v1", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_planned_date: input.plannedDate, p_transport_source: input.transportSource, p_transport_provider_id: input.transportProviderId ?? null, p_lines: input.lines, p_responsible: input.responsible?.trim() || "Operaci\xF3n" }) });
    return (await getDatabaseOrder(orderId))?.shipments?.find((item) => String(item.id) === String(id2)) ?? null;
  }
  const order = memoryOrders.find((item) => item.id === orderId);
  if (!order) return null;
  validateMemoryShipmentLines(order, void 0, input.lines);
  const provider = memoryProviders.find((item) => item.id === input.transportProviderId);
  if (input.transportSource === "external" && input.transportProviderId && provider?.type !== "Transporte") throw new Error("Seleccione un transportista registrado.");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = `shipment-${crypto.randomUUID()}`;
  const shipment = { id, orderId, plannedDate: input.plannedDate, status: "planned", transportSource: input.transportSource, transportProviderId: input.transportProviderId, transportLabel: input.transportSource === "internal" ? "Transporte interno" : provider?.name ?? "Transportista", createdAt: now, updatedAt: now, lines: input.lines.map((item) => {
    const line = order.lines.find((entry) => entry.id === item.orderLineId);
    return { id: `sl-${crypto.randomUUID()}`, shipmentId: id, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: item.plannedQuantity, deliveredQuantity: 0 };
  }), events: [{ id: `se-${crypto.randomUUID()}`, shipmentId: id, eventType: "created", nextStatus: "planned", nextDate: input.plannedDate, responsible: input.responsible?.trim() || "Operaci\xF3n", createdAt: now }] };
  order.shipments ??= [];
  order.shipments.push(shipment);
  refreshMemoryOrder(order);
  return shipment;
}
async function updatePlannedShipment(shipmentId, input) {
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/update_planned_shipment_v1", { method: "POST", body: JSON.stringify({ p_shipment_id: Number(shipmentId), p_planned_date: input.plannedDate, p_transport_source: input.transportSource, p_transport_provider_id: input.transportProviderId ?? null, p_lines: input.lines, p_responsible: input.responsible?.trim() || "Operaci\xF3n" }) });
    return (await getOrders()).flatMap((order2) => order2.shipments ?? []).find((item) => String(item.id) === String(shipmentId)) ?? null;
  }
  const order = memoryOrders.find((item) => item.shipments?.some((shipment2) => String(shipment2.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  if (!order || !shipment) return null;
  if (shipment.status !== "planned") throw new Error("Solo se edita un viaje planificado.");
  validateMemoryShipmentLines(order, shipmentId, input.lines);
  shipment.plannedDate = input.plannedDate;
  shipment.transportSource = input.transportSource;
  shipment.transportProviderId = input.transportProviderId;
  shipment.transportLabel = input.transportSource === "internal" ? "Transporte interno" : memoryProviders.find((item) => item.id === input.transportProviderId)?.name ?? "Transportista";
  shipment.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  shipment.lines = input.lines.map((item) => {
    const line = order.lines.find((entry) => entry.id === item.orderLineId);
    return { id: `sl-${crypto.randomUUID()}`, shipmentId, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: item.plannedQuantity, deliveredQuantity: 0 };
  });
  refreshMemoryOrder(order);
  return shipment;
}
async function transitionShipment(shipmentId, input) {
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/transition_shipment_v3", { method: "POST", body: JSON.stringify({ p_shipment_id: Number(shipmentId), p_next_status: input.nextStatus, p_remittance: input.remittance?.trim() || null, p_shared_remittance_reason: input.sharedRemittanceReason?.trim() || null, p_delivered_lines: input.deliveredLines ?? [], p_loaded_lines: input.loadedLines ?? null, p_responsible: input.responsible?.trim() || "Operaci\xF3n" }) });
    return (await getOrders()).flatMap((order2) => order2.shipments ?? []).find((item) => String(item.id) === String(shipmentId)) ?? null;
  }
  const order = memoryOrders.find((item) => item.shipments?.some((shipment2) => String(shipment2.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  if (!order || !shipment) return null;
  const expected = { planned: "ready", ready: "loaded", loaded: "dispatched", dispatched: "delivered" };
  if (input.nextStatus !== expected[shipment.status] && !(input.nextStatus === "cancelled" && !["dispatched", "delivered", "cancelled"].includes(shipment.status))) throw new Error("La transici\xF3n del viaje no es v\xE1lida.");
  const remittance = input.remittance?.trim() || shipment.remittance;
  if (input.nextStatus === "ready") {
    shipment.deliveryAddressSnapshot = order.deliveryAddress;
    for (const shipmentLine of shipment.lines) {
      const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
      if (!orderLine?.productId) throw new Error("Una l\xEDnea del viaje no tiene producto can\xF3nico.");
      const stock = (await getStockSummary()).find((item) => item.product.id === orderLine.productId);
      const ownClaim = orderStockReservations([order], memoryProducts).get(orderLine.productId)?.ready ?? 0;
      const ownReserved = order.lines.filter((item) => item.productId === orderLine.productId).reduce((sum, item) => sum + (item.readyReservedQuantity ?? 0), 0);
      const activeReserved = memoryStockReservations.filter((item) => item.productId === orderLine.productId && item.status === "active").reduce((sum, item) => sum + item.quantity, 0);
      const quantity = Math.min(
        Math.max((stock?.available ?? 0) + ownClaim - ownReserved, 0),
        Math.max((stock?.ready ?? 0) - activeReserved, 0),
        shipmentLine.plannedQuantity
      );
      if (quantity > 0) memoryStockReservations.push({ id: `reservation-${crypto.randomUUID()}`, shipmentLineId: shipmentLine.id, productId: orderLine.productId, quantity, status: "active" });
      orderLine.readyReservedQuantity = (orderLine.readyReservedQuantity ?? 0) + quantity;
    }
  }
  if (input.nextStatus === "loaded") {
    const loads = shipment.lines.map((shipmentLine) => ({
      shipmentLine,
      loaded: input.loadedLines?.find((item) => String(item.shipmentLineId) === String(shipmentLine.id))?.loadedQuantity ?? shipmentLine.plannedQuantity
    }));
    if (loads.some(({ shipmentLine, loaded }) => !Number.isInteger(loaded) || loaded < 0 || loaded > shipmentLine.plannedQuantity))
      throw new Error("Cantidad cargada inv\xE1lida.");
    for (const { shipmentLine, loaded } of loads) {
      shipmentLine.loadedQuantity = loaded;
      const orderLine = order.lines.find((item) => item.id === shipmentLine.orderLineId);
      if (!orderLine?.productId) throw new Error("Una l\xEDnea del viaje no tiene producto can\xF3nico.");
      const previous = memoryStockReservations.find((item) => String(item.shipmentLineId) === String(shipmentLine.id) && item.status === "active");
      if (previous) {
        previous.status = "released";
        orderLine.readyReservedQuantity = Math.max((orderLine.readyReservedQuantity ?? 0) - previous.quantity, 0);
      }
      const stock = (await getStockSummary()).find((item) => item.product.id === orderLine.productId);
      const ownClaim = orderStockReservations([order], memoryProducts).get(orderLine.productId)?.ready ?? 0;
      const ownReserved = order.lines.filter((item) => item.productId === orderLine.productId).reduce((sum, item) => sum + (item.readyReservedQuantity ?? 0), 0);
      const activeReserved = memoryStockReservations.filter((item) => item.productId === orderLine.productId && item.status === "active").reduce((sum, item) => sum + item.quantity, 0);
      const reserved = Math.min(
        Math.max((stock?.available ?? 0) + ownClaim - ownReserved, 0),
        Math.max((stock?.ready ?? 0) - activeReserved, 0),
        loaded
      );
      if (reserved > 0) memoryStockReservations.push({
        id: `reservation-${crypto.randomUUID()}`,
        shipmentLineId: shipmentLine.id,
        productId: orderLine.productId,
        quantity: reserved,
        status: "active"
      });
      orderLine.readyReservedQuantity = (orderLine.readyReservedQuantity ?? 0) + reserved;
    }
  }
  if (input.nextStatus === "cancelled") for (const shipmentLine of shipment.lines) {
    const reservation = memoryStockReservations.find((item) => String(item.shipmentLineId) === String(shipmentLine.id) && item.status === "active");
    if (!reservation) continue;
    reservation.status = "released";
    const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
    if (orderLine) orderLine.readyReservedQuantity = Math.max((orderLine.readyReservedQuantity ?? 0) - reservation.quantity, 0);
  }
  if (input.nextStatus === "dispatched") for (const shipmentLine of shipment.lines) {
    const reservation = memoryStockReservations.find((item) => String(item.shipmentLineId) === String(shipmentLine.id) && item.status === "active");
    const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
    if (!orderLine?.productId) throw new Error("Una l\xEDnea del viaje no tiene producto can\xF3nico.");
    const actual = shipmentLine.loadedQuantity ?? shipmentLine.plannedQuantity;
    if (actual === 0) continue;
    const now2 = (/* @__PURE__ */ new Date()).toISOString();
    memoryStockMovements.push({ id: `movement-${memoryTreatmentId++}`, productId: orderLine.productId, stockState: "ready", quantity: -actual, movementType: "dispatch", orderLineId: orderLine.id, shipmentLineId: shipmentLine.id, remittance, transformationId: crypto.randomUUID(), performedAt: now2, responsible: input.responsible?.trim() || "Operaci\xF3n", note: `Despacho de viaje ${shipment.id}`, createdAt: now2 });
    if (reservation) {
      reservation.status = "consumed";
      orderLine.readyReservedQuantity = Math.max((orderLine.readyReservedQuantity ?? 0) - reservation.quantity, 0);
    }
  }
  if (input.nextStatus === "delivered") for (const delivered of input.deliveredLines ?? []) {
    const line = shipment.lines.find((item) => String(item.id) === String(delivered.shipmentLineId));
    if (!line || !Number.isInteger(delivered.deliveredQuantity) || delivered.deliveredQuantity < 0 || delivered.deliveredQuantity > (line.loadedQuantity ?? line.plannedQuantity)) throw new Error("Cantidad entregada inv\xE1lida.");
    line.deliveredQuantity = delivered.deliveredQuantity;
  }
  const previousStatus = shipment.status;
  const previousRemittance = shipment.remittance;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  shipment.status = input.nextStatus;
  shipment.remittance = remittance;
  shipment.sharedRemittanceReason = input.sharedRemittanceReason?.trim() || shipment.sharedRemittanceReason;
  shipment.updatedAt = now;
  if (input.nextStatus === "loaded") shipment.loadedAt = now;
  if (input.nextStatus === "dispatched") shipment.dispatchedAt = now;
  if (input.nextStatus === "delivered") shipment.deliveredAt = now;
  shipment.events.push({ id: `se-${crypto.randomUUID()}`, shipmentId, eventType: "transition", previousStatus, nextStatus: input.nextStatus, previousRemittance, nextRemittance: remittance, responsible: input.responsible?.trim() || "Operaci\xF3n", createdAt: now });
  refreshMemoryOrder(order);
  return shipment;
}
async function rescheduleShipment(shipmentId, input) {
  if (input.reason === "other" && !input.note?.trim()) throw new Error("Detalle el motivo de reprogramaci\xF3n.");
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/reschedule_shipment_v1", { method: "POST", body: JSON.stringify({ p_shipment_id: Number(shipmentId), p_new_date: input.newDate, p_reason: input.reason, p_note: input.note?.trim() || null, p_responsible: input.responsible?.trim() || "Operaci\xF3n" }) });
    return (await getOrders()).flatMap((order2) => order2.shipments ?? []).find((item) => String(item.id) === String(shipmentId)) ?? null;
  }
  const order = memoryOrders.find((item) => item.shipments?.some((shipment2) => String(shipment2.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  if (!order || !shipment) return null;
  if (!["planned", "ready"].includes(shipment.status) || shipment.plannedDate === input.newDate) throw new Error("Solo se reprograman viajes planificados o prontos a una fecha distinta.");
  const previousDate = shipment.plannedDate;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  shipment.plannedDate = input.newDate;
  shipment.updatedAt = now;
  shipment.events.push({ id: `se-${crypto.randomUUID()}`, shipmentId, eventType: "rescheduled", previousDate, nextDate: input.newDate, reason: input.reason, note: input.note?.trim() || void 0, responsible: input.responsible?.trim() || "Operaci\xF3n", createdAt: now });
  refreshMemoryOrder(order);
  return shipment;
}
function shipmentHistory(order) {
  return (order.shipments ?? []).flatMap((shipment) => shipment.events.map((event) => {
    const changes = [];
    if (event.eventType === "created") changes.push({ field: "Viaje", from: "\u2014", to: `Creado para ${formatPlannedDate(event.nextDate ?? shipment.plannedDate)}` });
    if (event.eventType === "rescheduled" && event.previousDate && event.nextDate) changes.push({ field: "Fecha de entrega", from: formatPlannedDate(event.previousDate), to: formatPlannedDate(event.nextDate) });
    if (event.eventType === "transition" && event.previousStatus && event.nextStatus) changes.push({ field: "Estado del viaje", from: shipmentHistoryStatus[event.previousStatus], to: shipmentHistoryStatus[event.nextStatus] });
    if ((event.eventType === "transition" || event.eventType === "remittance_corrected") && event.previousRemittance !== event.nextRemittance) changes.push({ field: "Remito", from: event.previousRemittance ?? "\u2014", to: event.nextRemittance ?? "\u2014" });
    if (event.eventType === "incident" && !changes.length) changes.push({ field: "Viaje", from: "Sin incidencia", to: "Incidencia registrada" });
    const reason = event.reason ? `Motivo: ${shipmentHistoryReasons[event.reason]}. ` : "";
    const detail = [reason, event.note, `Responsable: ${event.responsible}`].filter(Boolean).join(" ").trim();
    const kind = event.eventType === "incident" ? "incidencia" : event.nextStatus === "delivered" ? "entrega" : event.nextStatus === "dispatched" ? "despacho" : "cambio";
    return { createdAt: event.createdAt, change: { id: `shipment-${event.id}`, changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt)), kind, note: detail || void 0, changes } };
  })).filter((entry) => entry.change.changes.length > 0);
}
async function getOrderHistory(id) {
  if (useMemoryStore) {
    const order2 = memoryOrders.find((item) => item.id === id);
    return [...order2 ? shipmentHistory(order2).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => entry.change) : [], ...memoryHistory.get(id) ?? []];
  }
  const query = new URLSearchParams({
    select: "id,changed_at,kind,note,order_change_items(field,from_value,to_value,position)",
    order_id: `eq.${id}`,
    order: "changed_at.desc",
    "order_change_items.order": "position.asc"
  });
  const [rows, order] = await Promise.all([supabaseRequest(`/rest/v1/order_changes?${query}`), getDatabaseOrder(id)]);
  const orderChanges = rows.map((row) => ({ createdAt: row.changed_at, change: {
    id: row.id,
    changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.changed_at)),
    kind: row.kind,
    note: row.note ?? void 0,
    changes: [...row.order_change_items].sort((a, b) => a.position - b.position).map((item) => ({
      field: item.field,
      from: item.field === "Fecha planificada" ? formatPlannedDate(item.from_value) : item.from_value,
      to: item.field === "Fecha planificada" ? formatPlannedDate(item.to_value) : item.to_value
    }))
  } }));
  return [...orderChanges, ...order ? shipmentHistory(order) : []].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => entry.change);
}
async function recordOrderUpdate(id, input) {
  if (!useMemoryStore) {
    await supabaseRequest("/rest/v1/rpc/record_operation_update", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_kind: input.kind,
        p_delivered_quantity: input.deliveredQuantity ?? null,
        p_delivery_address: input.deliveryAddress?.trim() || null,
        p_remittance: input.remittance?.trim() || null,
        p_dispatched_at: input.dispatchedAt ?? null,
        p_delivered_at: input.deliveredAt ?? null,
        p_note: input.note?.trim() || null
      })
    });
    const [order2, history] = await Promise.all([getDatabaseOrder(id), getOrderHistory(id)]);
    return order2 ? { order: order2, change: history[0] } : null;
  }
  const order = memoryOrders.find((item) => item.id === id);
  if (!order) return null;
  const changes = [];
  if (input.kind === "entrega") {
    const quantity = input.deliveredQuantity ?? 0;
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Indique una cantidad entregada mayor a cero.");
    if (order.delivered + quantity > order.requested) throw new Error("La entrega no puede superar la cantidad del pedido.");
    const previousDelivered = order.delivered;
    const previousPending = order.pending;
    order.delivered += quantity;
    order.pending = order.requested - order.delivered;
    order.delivery = `${order.delivered} de ${order.requested} entregados`;
    order.deliveryStatus = order.pending === 0 ? "completa" : "parcial";
    order.deliveredAt = input.deliveredAt ?? (/* @__PURE__ */ new Date()).toISOString();
    changes.push(
      { field: "Cantidad entregada", from: String(previousDelivered), to: String(order.delivered) },
      { field: "Saldo", from: String(previousPending), to: String(order.pending) }
    );
    if (order.pending === 0 && getOrderStage(order) !== "completado") {
      changes.push({ field: "Etapa", from: stageLabels[getOrderStage(order)], to: stageLabels.completado });
      order.stage = "completado";
    }
  }
  if (input.kind === "direccion") {
    const address = input.deliveryAddress?.trim();
    if (!address) throw new Error("Indique la direcci\xF3n de entrega.");
    changes.push({ field: "Direcci\xF3n de entrega", from: order.deliveryAddress ?? "\u2014", to: address });
    order.deliveryAddress = address;
  }
  if (input.kind === "despacho") {
    const dispatchedAt = input.dispatchedAt ?? (/* @__PURE__ */ new Date()).toISOString();
    changes.push({ field: "Despacho", from: order.dispatchedAt ?? "\u2014", to: dispatchedAt });
    order.dispatchedAt = dispatchedAt;
    order.deliveryStatus = "en_transito";
    if (getOrderStage(order) === "negociacion") {
      changes.push({ field: "Etapa", from: stageLabels.negociacion, to: stageLabels.logistica });
      order.stage = "logistica";
    }
  }
  if (input.kind === "incidencia") {
    const note = input.note?.trim();
    if (!note) throw new Error("Describa la incidencia.");
    changes.push({ field: "Incidencia", from: "\u2014", to: note });
  }
  const change = {
    id: `actualizacion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(/* @__PURE__ */ new Date()),
    kind: input.kind,
    note: input.note?.trim() || void 0,
    changes
  };
  memoryHistory.set(id, [change, ...memoryHistory.get(id) ?? []]);
  return { order, change };
}
async function updateOrder(id, changes) {
  if (!useMemoryStore) {
    const current = await getDatabaseOrder(id);
    if (!current) return null;
    const productionSource = changes.productionSource ?? current.productionSource ?? "internal";
    const transportSource = changes.transportSource ?? current.transportSource ?? "external";
    await supabaseServerRequest("/rest/v1/rpc/update_operation_order_v3", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_planned_date: changes.plannedDate ?? getOrderPlannedDate(current),
        p_requested: changes.requested ?? current.requested,
        p_stage: changes.stage ?? getOrderStage(current),
        p_production_source: productionSource,
        p_producer_provider_id: productionSource === "internal" ? null : changes.producerProviderId ?? current.producerProviderId ?? null,
        p_production_date: productionSource === "import" ? null : changes.productionDate ?? current.productionDate ?? getOrderPlannedDate(current),
        p_import_arrival_date: productionSource === "import" ? changes.importArrivalDate ?? current.importArrivalDate ?? null : null,
        p_required_operations: canonicalOperations(changes.requiredOperations ?? current.requiredOperations),
        p_transport_source: transportSource,
        p_transport_provider_id: transportSource === "internal" ? null : changes.transportProviderId ?? current.transportProviderId ?? null
      })
    });
    const [order2, history] = await Promise.all([getDatabaseOrder(id), getOrderHistory(id)]);
    return order2 ? { order: order2, change: history[0] } : null;
  }
  const order = memoryOrders.find((item) => item.id === id);
  if (!order) return null;
  if (typeof changes.requested === "number" && changes.requested < order.delivered) {
    throw new Error("La cantidad no puede ser menor que lo ya entregado.");
  }
  const recordedChanges = [];
  if (typeof changes.plannedDate === "string" && changes.plannedDate && changes.plannedDate !== getOrderPlannedDate(order)) {
    const previousDate = getOrderPlannedDate(order);
    order.originalPlannedDate ??= previousDate;
    recordedChanges.push({ field: "Fecha planificada", from: formatPlannedDate(previousDate), to: formatPlannedDate(changes.plannedDate) });
    order.plannedDate = changes.plannedDate;
    order.dateLabel = formatPlannedDate(changes.plannedDate);
  }
  if (typeof changes.requested === "number" && changes.requested !== order.requested) {
    recordedChanges.push({ field: "Cantidad de pallets", from: String(order.requested), to: String(changes.requested) });
    let remainingAdjustment = changes.requested - order.requested;
    for (const line of [...order.lines].reverse()) {
      if (remainingAdjustment >= 0) {
        line.quantity += remainingAdjustment;
        break;
      }
      const reduction = Math.min(line.quantity, Math.abs(remainingAdjustment));
      line.quantity -= reduction;
      remainingAdjustment += reduction;
    }
    order.requested = changes.requested;
    order.pending = Math.max(order.requested - order.delivered, 0);
    order.delivery = `${order.delivered} de ${order.requested} entregados`;
  }
  if (typeof changes.transport === "string" && changes.transport.trim() && changes.transport.trim() !== order.transport) {
    recordedChanges.push({ field: "Transportista", from: order.transport, to: changes.transport.trim() });
    order.logistics = order.logistics.replace(order.transport, changes.transport.trim());
    order.transport = changes.transport.trim();
  }
  if (changes.stage && changes.stage !== getOrderStage(order)) {
    recordedChanges.push({ field: "Etapa", from: stageLabels[getOrderStage(order)], to: stageLabels[changes.stage] });
    order.stage = changes.stage;
  }
  const assignmentFields = [
    ["productionSource", "Origen de producci\xF3n", changes.productionSource],
    ["producerProviderId", "Productor", changes.producerProviderId],
    ["productionDate", "Fecha de producci\xF3n", changes.productionDate],
    ["importArrivalDate", "Llegada de importaci\xF3n", changes.importArrivalDate],
    ["requiredOperations", "Operaciones", changes.requiredOperations],
    ["transportSource", "Origen del transporte", changes.transportSource],
    ["transportProviderId", "Transportista", changes.transportProviderId]
  ];
  for (const [field, label, value] of assignmentFields) {
    if (value === void 0) continue;
    const previous = order[field];
    const normalize3 = (item) => Array.isArray(item) ? item.join(", ") : String(item ?? "\u2014");
    if (normalize3(previous) !== normalize3(value)) {
      recordedChanges.push({ field: label, from: normalize3(previous), to: normalize3(value) });
      order[field] = value;
    }
  }
  if (changes.productionSource === "internal") order.producerProviderId = void 0;
  if (changes.productionSource === "import") order.productionDate = void 0;
  if (changes.productionSource && changes.productionSource !== "import") order.importArrivalDate = void 0;
  if (changes.transportSource === "internal") order.transportProviderId = void 0;
  const change = recordedChanges.length > 0 ? {
    id: `cambio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(/* @__PURE__ */ new Date()),
    changes: recordedChanges
  } : void 0;
  if (change) memoryHistory.set(id, [change, ...memoryHistory.get(id) ?? []]);
  return { order, change };
}
function productionProducts(products2) {
  return products2.map((product) => ({ id: product.id, name: productLabel(product) }));
}
async function getCapacity(from, to) {
  if (useMemoryStore) return buildCapacitySnapshot({ from, to, rules: memoryCapacityRules, internalDefaults: memoryInternalDefaults, availablePeople: memoryAvailablePeople, externalDefaults: memoryExternalDefaults, transportDefaults: memoryTransportDefaults, adjustments: memoryCapacityAdjustments, orders: memoryOrders, providers: memoryProviders, productionResources: memoryProductionResources, productionRules: memoryProductionRules, productionProducts: productionProducts(memoryProducts) });
  const range = `adjustment_date=gte.${from}&adjustment_date=lte.${to}`;
  const [rules, internal, team, external, transport, adjustments, orders2, providers2, resources, productionRules, products2] = await Promise.all([
    supabaseRequest("/rest/v1/capacity_rules?select=operation,people_count,pallet_capacity&order=operation.asc,people_count.asc"),
    supabaseRequest("/rest/v1/internal_production_defaults?select=operation,people_count,manual_capacity"),
    supabaseRequest("/rest/v1/internal_team_capacity?select=available_people&id=eq.true"),
    supabaseRequest("/rest/v1/external_production_defaults?select=id,provider_id,operation,pallet_capacity,status"),
    supabaseRequest("/rest/v1/transport_capacity_defaults?select=id,source,provider_id,pallet_capacity,trip_capacity,status"),
    supabaseRequest(`/rest/v1/capacity_daily_adjustments?select=adjustment_date,resource_type,operation,source,provider_id,pallet_adjustment,trip_adjustment,people_count,responsible,status&${range}`),
    getOrders(),
    getProviders({ includeRetired: true }),
    supabaseRequest("/rest/v1/production_resources?select=*&order=display_order.asc,id.asc"),
    supabaseRequest("/rest/v1/production_capacity_rules?select=*&order=valid_from.desc,id.desc"),
    getProducts()
  ]);
  const productOptions = productionProducts(products2);
  const productNames = new Map(productOptions.map((product) => [product.id, product.name]));
  return buildCapacitySnapshot({
    from,
    to,
    orders: orders2,
    providers: providers2,
    rules: rules.map((item) => ({ operation: item.operation, peopleCount: item.people_count, palletCapacity: item.pallet_capacity })),
    internalDefaults: internal.map((item) => ({ operation: item.operation, peopleCount: item.people_count, manualCapacity: item.manual_capacity ?? void 0 })),
    availablePeople: team[0]?.available_people,
    externalDefaults: external.map((item) => ({ id: item.id, providerId: item.provider_id, operation: item.operation, palletCapacity: item.pallet_capacity, status: item.status })),
    transportDefaults: transport.map((item) => ({ id: item.id, source: item.source, providerId: item.provider_id ?? void 0, palletCapacity: item.pallet_capacity, tripCapacity: item.trip_capacity ?? void 0, status: item.status })),
    adjustments: adjustments.map((item) => ({ date: item.adjustment_date, resourceType: item.resource_type, operation: item.operation ?? void 0, source: item.source ?? void 0, providerId: item.provider_id ?? void 0, palletAdjustment: item.pallet_adjustment, tripAdjustment: item.trip_adjustment, peopleCount: item.people_count ?? void 0, responsible: item.responsible ?? void 0, status: item.status ?? void 0 })),
    productionResources: resources.map(mapProductionResource),
    productionRules: productionRules.map((item) => ({ id: item.id, resourceId: item.resource_id, productId: item.product_id, clientProductId: item.client_product_id ?? void 0, productName: productNames.get(item.product_id) ?? item.product_id, peopleCount: item.people_count ?? void 0, configurationLabel: item.configuration_label, normalUnitsPerDay: item.normal_units_per_day, maximumUnitsPerDay: item.maximum_units_per_day, validFrom: item.valid_from, validTo: item.valid_to ?? void 0, source: item.source, note: item.note ?? void 0, createdAt: item.created_at })),
    productionProducts: productOptions
  });
}
function upsertMemory(items, predicate, value) {
  const index = items.findIndex(predicate);
  if (index === -1) items.push(value);
  else items[index] = value;
}
async function saveInternalProduction(value) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_internal_production_default", { method: "POST", body: JSON.stringify({ p_operation: value.operation, p_people_count: value.peopleCount, p_manual_capacity: value.manualCapacity ?? null }) });
  else upsertMemory(memoryInternalDefaults, (item) => item.operation === value.operation, value);
  return value;
}
async function saveTransportCapacity(value) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_transport_capacity_default", { method: "POST", body: JSON.stringify({ p_source: value.source, p_provider_id: value.providerId ?? null, p_pallet_capacity: value.palletCapacity, p_status: value.status }) });
  else upsertMemory(memoryTransportDefaults, (item) => item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""), { ...value, id: value.id ?? `transport-${Date.now()}` });
  return value;
}
async function saveTransportTripCapacity(value) {
  if (!useMemoryStore) await supabaseServerRequest("/rest/v1/rpc/upsert_transport_trip_capacity_v1", { method: "POST", body: JSON.stringify({ p_source: value.source, p_provider_id: value.providerId ?? null, p_trip_capacity: value.tripCapacity, p_status: value.status }) });
  else {
    const current = memoryTransportDefaults.find((item) => item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""));
    upsertMemory(memoryTransportDefaults, (item) => item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""), { ...current, ...value, palletCapacity: current?.palletCapacity ?? 0, id: value.id ?? current?.id ?? `transport-${Date.now()}` });
  }
  return value;
}
async function saveTransportTripAdjustment(value) {
  if (!useMemoryStore) await supabaseServerRequest("/rest/v1/rpc/upsert_transport_trip_adjustment_v1", { method: "POST", body: JSON.stringify({ p_date: value.date, p_source: value.source, p_provider_id: value.providerId ?? null, p_trip_adjustment: value.tripAdjustment, p_responsible: value.responsible?.trim() || null, p_status: value.status }) });
  else {
    const current = memoryCapacityAdjustments.find((item) => item.date === value.date && item.resourceType === "transport" && item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""));
    upsertMemory(memoryCapacityAdjustments, (item) => item.date === value.date && item.resourceType === "transport" && item.source === value.source && (item.providerId ?? "") === (value.providerId ?? ""), { ...current, ...value, resourceType: "transport", palletAdjustment: current?.palletAdjustment ?? 0 });
  }
  return value;
}
async function saveCapacityAdjustment(value) {
  if (!useMemoryStore) await supabaseRequest("/rest/v1/rpc/upsert_capacity_daily_adjustment", { method: "POST", body: JSON.stringify({ p_date: value.date, p_resource_type: value.resourceType, p_operation: value.operation ?? null, p_source: value.source ?? null, p_provider_id: value.providerId ?? null, p_pallet_adjustment: value.palletAdjustment, p_people_count: value.peopleCount ?? null, p_responsible: value.responsible?.trim() || null, p_status: value.status ?? null }) });
  else upsertMemory(memoryCapacityAdjustments, (item) => item.date === value.date && item.resourceType === value.resourceType && (item.operation ?? "") === (value.operation ?? "") && (item.source ?? "") === (value.source ?? "") && (item.providerId ?? "") === (value.providerId ?? ""), value);
  return value;
}
function productionRuleFromRow(row, product) {
  return {
    id: row.id,
    resourceId: row.resource_id,
    productId: row.product_id,
    clientProductId: row.client_product_id ?? void 0,
    productName: product ? productLabel(product) : row.product_id,
    peopleCount: row.people_count ?? void 0,
    configurationLabel: row.configuration_label,
    normalUnitsPerDay: row.normal_units_per_day,
    maximumUnitsPerDay: row.maximum_units_per_day,
    validFrom: row.valid_from,
    validTo: row.valid_to ?? void 0,
    source: row.source,
    note: row.note ?? void 0,
    createdAt: row.created_at
  };
}
async function createProductionResource(input) {
  const value = { name: input.name.trim(), resourceType: input.resourceType, providerId: input.providerId?.trim() || void 0, active: input.active ?? true, displayOrder: input.displayOrder ?? 100 };
  if (useMemoryStore) {
    if (memoryProductionResources.some((item) => item.active && item.name.toLocaleLowerCase("es") === value.name.toLocaleLowerCase("es"))) throw new Error("Ya existe un recurso activo con ese nombre.");
    const resource = { id: `resource-${memoryProductionId++}`, ...value };
    memoryProductionResources.push(resource);
    return resource;
  }
  const rows = await supabaseServerRequest("/rest/v1/production_resources?select=*", { method: "POST", prefer: "return=representation", body: JSON.stringify({ name: value.name, resource_type: value.resourceType, provider_id: value.providerId ?? null, active: value.active, display_order: value.displayOrder }) });
  const row = rows[0];
  return mapProductionResource(row);
}
async function updateProductionResource(id, changes) {
  if (useMemoryStore) {
    const resource = memoryProductionResources.find((item) => String(item.id) === String(id));
    if (!resource) return null;
    if (changes.name !== void 0) resource.name = changes.name.trim();
    if (changes.active !== void 0) resource.active = changes.active;
    if (changes.displayOrder !== void 0) resource.displayOrder = changes.displayOrder;
    if (changes.productKinds !== void 0) resource.productKinds = changes.productKinds?.length ? changes.productKinds : void 0;
    return resource;
  }
  const body = {};
  if (changes.name !== void 0) body.name = changes.name.trim();
  if (changes.active !== void 0) body.active = changes.active;
  if (changes.displayOrder !== void 0) body.display_order = changes.displayOrder;
  if (changes.productKinds !== void 0) body.product_kinds = changes.productKinds?.length ? changes.productKinds : null;
  const rows = await supabaseServerRequest(`/rest/v1/production_resources?id=eq.${encodeURIComponent(String(id))}&select=*`, { method: "PATCH", prefer: "return=representation", body: JSON.stringify(body) });
  const row = rows[0];
  return row ? mapProductionResource(row) : null;
}
async function createProductionRule(input) {
  const value = { ...input, configurationLabel: input.configurationLabel.trim(), source: input.source.trim(), note: input.note?.trim() || void 0 };
  if (value.clientProductId !== void 0) {
    const link = await getClientProduct(value.clientProductId);
    if (!link || link.productId !== value.productId) throw new Error("El producto no pertenece al cliente seleccionado.");
  }
  if (useMemoryStore) {
    const overlaps = memoryProductionRules.some((item) => String(item.resourceId) === String(value.resourceId) && String(item.clientProductId ?? "") === String(value.clientProductId ?? "") && item.productId === value.productId && (item.peopleCount ?? 0) === (value.peopleCount ?? 0) && item.validFrom <= (value.validTo ?? "9999-12-31") && value.validFrom <= (item.validTo ?? "9999-12-31"));
    if (overlaps) throw new Error("Ya existe una regla vigente para ese recurso, producto y configuraci\xF3n.");
    const product2 = memoryProducts.find((item) => item.id === value.productId);
    const rule = { id: `rule-${memoryProductionId++}`, ...value, productName: product2 ? productLabel(product2) : value.productId, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    memoryProductionRules.push(rule);
    return rule;
  }
  const rows = await supabaseServerRequest("/rest/v1/production_capacity_rules?select=*", { method: "POST", prefer: "return=representation", body: JSON.stringify({ resource_id: value.resourceId, product_id: value.productId, client_product_id: value.clientProductId ?? null, people_count: value.peopleCount ?? null, configuration_label: value.configurationLabel, normal_units_per_day: value.normalUnitsPerDay, maximum_units_per_day: value.maximumUnitsPerDay, valid_from: value.validFrom, valid_to: value.validTo ?? null, source: value.source, note: value.note ?? null }) });
  const row = rows[0];
  const product = (await getProducts()).find((item) => item.id === row.product_id);
  return productionRuleFromRow(row, product);
}
async function updateProductionRule(id, input) {
  const value = { ...input, configurationLabel: input.configurationLabel.trim(), source: input.source.trim(), note: input.note?.trim() || void 0 };
  if (value.clientProductId !== void 0) {
    const link = await getClientProduct(value.clientProductId);
    if (!link || link.productId !== value.productId) throw new Error("El producto no pertenece al cliente seleccionado.");
  }
  if (useMemoryStore) {
    const rule = memoryProductionRules.find((item) => String(item.id) === String(id));
    if (!rule) return null;
    const overlaps = memoryProductionRules.some((item) => String(item.id) !== String(id) && String(item.resourceId) === String(value.resourceId) && String(item.clientProductId ?? "") === String(value.clientProductId ?? "") && item.productId === value.productId && (item.peopleCount ?? 0) === (value.peopleCount ?? 0) && item.validFrom <= (value.validTo ?? "9999-12-31") && value.validFrom <= (item.validTo ?? "9999-12-31"));
    if (overlaps) throw new Error("Ya existe una regla vigente para ese recurso, producto y configuraci\xF3n.");
    const product2 = memoryProducts.find((item) => item.id === value.productId);
    Object.assign(rule, value, { productName: product2 ? productLabel(product2) : value.productId });
    return rule;
  }
  const rows = await supabaseServerRequest(`/rest/v1/production_capacity_rules?id=eq.${encodeURIComponent(String(id))}&select=*`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ resource_id: value.resourceId, product_id: value.productId, client_product_id: value.clientProductId ?? null, people_count: value.peopleCount ?? null, configuration_label: value.configurationLabel, normal_units_per_day: value.normalUnitsPerDay, maximum_units_per_day: value.maximumUnitsPerDay, valid_from: value.validFrom, valid_to: value.validTo ?? null, source: value.source, note: value.note ?? null })
  });
  const row = rows[0];
  if (!row) return null;
  const product = (await getProducts()).find((item) => item.id === row.product_id);
  return productionRuleFromRow(row, product);
}
async function deleteProductionRule(id) {
  if (useMemoryStore) {
    const referenced = memoryOrders.some((order) => order.lines.some((line) => (line.productionAllocations ?? []).some((allocation) => String(allocation.capacityRuleId) === String(id))));
    if (referenced) throw new Error("No se puede eliminar la regla porque est\xE1 siendo utilizada por una asignaci\xF3n de producci\xF3n.");
    const index = memoryProductionRules.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return false;
    memoryProductionRules.splice(index, 1);
    return true;
  }
  try {
    const rows = await supabaseServerRequest(`/rest/v1/production_capacity_rules?id=eq.${encodeURIComponent(String(id))}&select=id`, { method: "DELETE", prefer: "return=representation" });
    return rows.length > 0;
  } catch (error) {
    if (error.code === "23503") throw new Error("No se puede eliminar la regla porque est\xE1 siendo utilizada por una asignaci\xF3n de producci\xF3n.");
    throw error;
  }
}
function findMemoryAllocation(id) {
  for (const order of memoryOrders) for (const line of order.lines) {
    const allocation = (line.productionAllocations ?? []).find((item) => String(item.id) === String(id));
    if (allocation) return { order, line, allocation };
  }
  return null;
}
async function moveProductionAllocation(id, plannedDate) {
  const parsed = /* @__PURE__ */ new Date(`${plannedDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== plannedDate) throw new Error("Seleccione una fecha v\xE1lida.");
  if (useMemoryStore) {
    const found = findMemoryAllocation(id);
    if (!found) return null;
    if (found.allocation.status !== "draft" && found.allocation.status !== "confirmed") throw new Error("Solo se pueden mover asignaciones pendientes de producir.");
    if (found.allocation.plannedDate === plannedDate) return found.order.id;
    const previousDate = found.allocation.plannedDate;
    found.allocation.plannedDate = plannedDate;
    found.allocation.status = "draft";
    found.allocation.capacityRuleId = void 0;
    found.allocation.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const dates = found.order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled").map((item) => item.plannedDate)).sort();
    found.order.productionDefined = dates.length > 0;
    found.order.productionDate = dates[0];
    found.order.productionEndDate = dates.at(-1);
    found.order.supply = dates.length ? "Producci\xF3n planificada" : "Producci\xF3n sin planificar";
    memoryHistory.set(found.order.id, [{ id: `produccion-${crypto.randomUUID()}`, changedAt: new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" }).format(/* @__PURE__ */ new Date()), kind: "cambio", note: `${found.line.product}: fecha de producci\xF3n actualizada`, changes: [{ field: "Fecha de producci\xF3n", from: formatPlannedDate(previousDate), to: formatPlannedDate(plannedDate) }] }, ...memoryHistory.get(found.order.id) ?? []]);
    return found.order.id;
  }
  const rows = await supabaseServerRequest(`/rest/v1/production_allocations?id=eq.${encodeURIComponent(String(id))}&select=*`);
  const allocation = rows[0];
  if (!allocation) return null;
  if (allocation.status !== "draft" && allocation.status !== "confirmed") throw new Error("Solo se pueden mover asignaciones pendientes de producir.");
  const order = (await getOrders()).find((item) => item.lines.some((line) => line.id === allocation.order_line_id));
  if (!order) return null;
  if (allocation.planned_date !== plannedDate) {
    const updated = await supabaseServerRequest(`/rest/v1/production_allocations?id=eq.${encodeURIComponent(String(id))}&status=in.(draft,confirmed)&select=id`, { method: "PATCH", prefer: "return=representation", body: JSON.stringify({ planned_date: plannedDate, status: "draft", capacity_rule_id: null }) });
    if (!updated.length) throw new Error("La asignaci\xF3n cambi\xF3 mientras se mov\xEDa. Actualice el calendario.");
    const dates = order.lines.flatMap((line) => (line.productionAllocations ?? []).filter((item) => item.status !== "cancelled").map((item) => String(item.id) === String(id) ? plannedDate : item.plannedDate)).sort();
    try {
      await supabaseServerRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, { method: "PATCH", body: JSON.stringify({ production_defined: dates.length > 0, production_date: dates[0] ?? null, production_end_date: dates.at(-1) ?? null, supply: dates.length ? "Producci\xF3n planificada" : "Producci\xF3n sin planificar", updated_at: (/* @__PURE__ */ new Date()).toISOString() }) });
    } catch (error) {
      await supabaseServerRequest(`/rest/v1/production_allocations?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", body: JSON.stringify({ planned_date: allocation.planned_date, status: allocation.status, capacity_rule_id: allocation.capacity_rule_id }) });
      throw error;
    }
  }
  return order.id;
}
async function confirmProductionAllocation(id, resourceId, capacityRuleId, overloadNote) {
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/confirm_production_allocation_v1", { method: "POST", body: JSON.stringify({ p_allocation_id: id, p_resource_id: resourceId, p_capacity_rule_id: capacityRuleId, p_overload_note: overloadNote?.trim() || null }) });
    return true;
  }
  const found = findMemoryAllocation(id);
  if (!found || found.allocation.status !== "draft") throw new Error("Solo se confirman asignaciones en borrador.");
  const rule = memoryProductionRules.find((item) => String(item.id) === String(capacityRuleId));
  if (!rule || String(rule.resourceId) !== String(resourceId) || rule.productId !== found.line.productId || String(rule.clientProductId) !== String(found.line.clientProductId)) throw new Error("Seleccione una regla vigente para el recurso y producto del cliente.");
  const previousResource = found.allocation.productionResourceId;
  const previousRule = found.allocation.capacityRuleId;
  found.allocation.productionResourceId = resourceId;
  found.allocation.capacityRuleId = capacityRuleId;
  const snapshot2 = await getCapacity(found.allocation.plannedDate, found.allocation.plannedDate);
  const resource = snapshot2.production.days[0].resources.find((item) => String(item.resource.id) === String(resourceId));
  if (!resource || resource.status === "missing_rule") {
    found.allocation.productionResourceId = previousResource;
    found.allocation.capacityRuleId = previousRule;
    throw new Error("No se pudo calcular la capacidad de la asignaci\xF3n.");
  }
  const selectedResource = memoryProductionResources.find((item) => String(item.id) === String(resourceId));
  found.allocation.resourceId = selectedResource?.providerId ?? (selectedResource?.resourceType === "internal_factory" ? "internal" : String(resourceId));
  found.allocation.status = "confirmed";
  found.allocation.note = overloadNote?.trim() || found.allocation.note;
  found.allocation.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  return true;
}
async function completeProductionAllocation(id, actualQuantity, completionNote) {
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/complete_production_allocation_v1", { method: "POST", body: JSON.stringify({ p_allocation_id: id, p_actual_quantity: actualQuantity, p_completion_note: completionNote?.trim() || null }) });
    return true;
  }
  const found = findMemoryAllocation(id);
  if (!found || found.allocation.status !== "confirmed") throw new Error("Solo se completan asignaciones confirmadas.");
  if (!Number.isInteger(actualQuantity) || actualQuantity < 0 || actualQuantity > found.allocation.plannedQuantity) throw new Error("La cantidad real debe estar entre cero y la cantidad planificada.");
  if (actualQuantity !== found.allocation.plannedQuantity && !completionNote?.trim()) throw new Error("Explique la diferencia entre lo planificado y lo producido.");
  const product = memoryProducts.find((item) => item.id === found.line.productId);
  if (!product) throw new Error("La l\xEDnea no est\xE1 vinculada a un producto del maestro.");
  if (actualQuantity > 0) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    memoryStockMovements.push({
      id: `movement-${memoryTreatmentId++}`,
      productId: product.id,
      stockState: product.requiresTreatment ? "pending_treatment" : "ready",
      quantity: actualQuantity,
      movementType: "production_receipt",
      productionAllocationId: id,
      transformationId: crypto.randomUUID(),
      performedAt: now,
      responsible: "Producci\xF3n",
      note: completionNote?.trim() || "Producci\xF3n completada",
      createdAt: now
    });
  }
  found.allocation.actualQuantity = actualQuantity;
  found.allocation.completedAt = (/* @__PURE__ */ new Date()).toISOString();
  found.allocation.completionNote = completionNote?.trim() || void 0;
  found.allocation.status = "completed";
  found.allocation.updatedAt = found.allocation.completedAt;
  return true;
}
async function recordProductionResult(id, actualQuantity, actualDate, destination, note) {
  const parsedDate = /* @__PURE__ */ new Date(`${actualDate}T12:00:00Z`);
  if (!Number.isInteger(actualQuantity) || actualQuantity < 0) throw new Error("Indique una cantidad real v\xE1lida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actualDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== actualDate) throw new Error("Indique una fecha real v\xE1lida.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
  if (actualDate > today) throw new Error("La fecha real no puede ser futura.");
  if (actualQuantity > 0 && destination !== "client" && destination !== "stock") throw new Error("Indique si la producci\xF3n va al cliente o a stock.");
  if (!useMemoryStore) {
    await supabaseServerRequest("/rest/v1/rpc/record_production_result_v1", { method: "POST", body: JSON.stringify({ p_allocation_id: id, p_actual_quantity: actualQuantity, p_actual_date: actualDate, p_destination: actualQuantity ? destination : null, p_note: note?.trim() || null }) });
    return true;
  }
  const found = findMemoryAllocation(id);
  if (!found || found.allocation.status !== "draft" && found.allocation.status !== "confirmed") throw new Error("Esta asignaci\xF3n ya tiene un resultado o fue cancelada.");
  if (!found.allocation.productionResourceId) throw new Error("Indique qui\xE9n realiz\xF3 la producci\xF3n.");
  const product = memoryProducts.find((item) => item.id === found.line.productId);
  if (!product) throw new Error("La l\xEDnea no est\xE1 vinculada a un producto del maestro.");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (actualQuantity > 0) memoryStockMovements.push({
    id: `movement-${memoryTreatmentId++}`,
    productId: product.id,
    stockState: product.requiresTreatment ? "pending_treatment" : "ready",
    quantity: actualQuantity,
    movementType: "production_receipt",
    productionAllocationId: id,
    orderLineId: destination === "client" ? found.line.id : void 0,
    clientId: destination === "client" ? found.order.clientId : void 0,
    transformationId: crypto.randomUUID(),
    performedAt: (/* @__PURE__ */ new Date(`${actualDate}T12:00:00-03:00`)).toISOString(),
    responsible: "Producci\xF3n",
    note: note?.trim() || "Producci\xF3n registrada",
    createdAt: now
  });
  found.allocation.actualQuantity = actualQuantity;
  found.allocation.actualDate = actualDate;
  found.allocation.resultDestination = actualQuantity ? destination : void 0;
  found.allocation.completedAt = now;
  found.allocation.completionNote = note?.trim() || void 0;
  found.allocation.status = "completed";
  found.allocation.updatedAt = now;
  return true;
}
function mapStockMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    stockState: row.stock_state,
    quantity: row.quantity,
    movementType: row.movement_type,
    treatmentBatchId: row.treatment_batch_id ?? void 0,
    productionAllocationId: row.production_allocation_id ?? void 0,
    transformationId: row.transformation_id,
    performedAt: row.performed_at,
    responsible: row.responsible,
    note: row.note ?? void 0,
    orderLineId: row.order_line_id ?? void 0,
    shipmentLineId: row.shipment_line_id ?? void 0,
    clientId: row.client_id ?? void 0,
    providerId: row.provider_id ?? void 0,
    remittance: row.remittance ?? void 0,
    sourceReference: row.source_reference ?? void 0,
    correctionOfMovementId: row.correction_of_movement_id ?? void 0,
    createdAt: row.created_at
  };
}
async function loadDatabaseTreatmentBatches(filters) {
  const [rows, products2, clients, clientProducts, lines, orders2] = await Promise.all([
    supabaseRequest(`/rest/v1/treatment_batches?select=*,treatment_control_checks(*),stock_movements(*)&${filters}&order=performed_at.desc,id.desc&treatment_control_checks.order=id.asc&stock_movements.order=id.asc`),
    getProducts(),
    getClients(),
    supabaseRequest("/rest/v1/client_products?select=id,client_id"),
    supabaseRequest("/rest/v1/order_lines?select=id,order_id"),
    supabaseRequest("/rest/v1/orders?select=id,reference")
  ]);
  const productMap = new Map(products2.map((product) => [product.id, productTreatmentLabel(product)]));
  const clientMap = new Map(clients.map((client) => [client.id, client.name]));
  const clientProductMap = new Map(clientProducts.map((item) => [String(item.id), item.client_id]));
  const lineMap = new Map(lines.map((line) => [line.id, line.order_id]));
  const orderMap = new Map(orders2.map((order) => [order.id, order.reference]));
  const postedIds = rows.filter((row) => row.status === "posted").map((row) => row.id);
  const reversals = postedIds.length ? await supabaseRequest(`/rest/v1/treatment_batches?select=id,reversal_of_batch_id&reversal_of_batch_id=in.(${postedIds.join(",")})`) : [];
  const reversedBy = new Map(reversals.map((row) => [String(row.reversal_of_batch_id), row.id]));
  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: productMap.get(row.product_id) ?? row.product_id,
    clientProductId: row.client_product_id ?? void 0,
    clientName: row.client_product_id === null ? void 0 : clientMap.get(clientProductMap.get(String(row.client_product_id)) ?? ""),
    orderLineId: row.order_line_id ?? void 0,
    orderReference: row.order_line_id === null ? void 0 : orderMap.get(lineMap.get(row.order_line_id) ?? ""),
    quantity: row.quantity,
    performedAt: row.performed_at,
    responsible: row.responsible,
    status: row.status,
    note: row.note ?? void 0,
    reversalOfBatchId: row.reversal_of_batch_id ?? void 0,
    reversedByBatchId: reversedBy.get(String(row.id)),
    createdAt: row.created_at,
    checks: (row.treatment_control_checks ?? []).map((check) => ({ id: check.id, batchId: check.batch_id, controlId: check.control_id, title: check.control_title_snapshot, result: check.result, note: check.note ?? void 0 })),
    movements: (row.stock_movements ?? []).map(mapStockMovement)
  }));
}
async function getStockMovements() {
  if (useMemoryStore) return memoryStockMovements;
  const rows = [];
  const pageSize = 1e3;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest(`/rest/v1/stock_movements?select=*&order=performed_at.asc,id.asc&limit=${pageSize}&offset=${offset}`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map(mapStockMovement);
}
async function getLogisticsTreatmentProgress() {
  if (useMemoryStore) return memoryTreatmentBatches.map((batch) => ({ orderLineId: batch.orderLineId, quantity: batch.quantity, status: batch.status }));
  const rows = await supabaseServerRequest(
    "/rest/v1/treatment_batches?select=order_line_id,quantity,status&order_line_id=not.is.null"
  );
  return rows.map((row) => ({ orderLineId: row.order_line_id ?? void 0, quantity: row.quantity, status: row.status }));
}
function addDays(date, days) {
  const value = /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function treatmentDateKey(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function getTreatmentBatchesBetween(from, until) {
  if (useMemoryStore) return Promise.resolve(memoryTreatmentBatches.filter((batch) => treatmentDateKey(batch.performedAt) >= from && treatmentDateKey(batch.performedAt) < until));
  return loadDatabaseTreatmentBatches(`performed_at=gte.${encodeURIComponent(`${from}T00:00:00-03:00`)}&performed_at=lt.${encodeURIComponent(`${until}T00:00:00-03:00`)}`);
}
async function getTreatmentDashboard(date) {
  const batches = await getTreatmentBatchesBetween(date, addDays(date, 1));
  const balances = calculateStockBalances(await getStockMovements());
  const dayBatches = batches.filter((batch) => treatmentDateKey(batch.performedAt) === date);
  const summary = summarizeTreatmentDay(date, dayBatches.map((batch) => ({ ...batch, performedAt: `${date}T12:00:00Z` })), balances);
  return { date, summary, batches: dayBatches.sort((a, b) => b.performedAt.localeCompare(a.performedAt)) };
}
async function getTreatmentNotPerformed(from, until) {
  const rows = useMemoryStore ? [...memoryHistory.entries()].flatMap(([order_id, history]) => history.filter((change) => change.kind === "incidencia").map(({ note }) => ({ order_id, note }))) : await supabaseRequest(`/rest/v1/order_changes?${new URLSearchParams([
    ["select", "order_id,note"],
    ["kind", "eq.incidencia"],
    ["note", `gte.${treatmentNotPerformedPrefix}${from}`],
    ["note", `lt.${treatmentNotPerformedPrefix}${until}`],
    ["order", "changed_at.desc,id.desc"]
  ])}`);
  const results = /* @__PURE__ */ new Map();
  for (const { order_id: orderId, note: event } of rows) {
    if (!event?.startsWith(treatmentNotPerformedPrefix)) continue;
    const [key, responsibleLine, ...details] = event.slice(treatmentNotPerformedPrefix.length).split("\n");
    const [date, orderLineId] = key.split(" \xB7 ");
    const responsible = responsibleLine?.replace(/^Responsable: /, "");
    if (!orderLineId || !responsible || date < from || date >= until || results.has(key)) continue;
    results.set(key, { orderId, orderLineId, date, responsible, note: details.join("\n") || void 0 });
  }
  return [...results.values()];
}
async function getTreatmentWeek(from, to) {
  const until = addDays(to, 1);
  const [batches, notPerformed] = await Promise.all([getTreatmentBatchesBetween(from, until), getTreatmentNotPerformed(from, until)]);
  return { batches, notPerformed };
}
async function recordTreatmentNotPerformed(input) {
  const order = await getOrderDetail(input.orderId);
  const line = order?.lines.find((item) => item.id === input.orderLineId);
  if (!order?.dryingStartDate || !line || isOrderClosed(order) || input.date < order.dryingStartDate || input.date > (order.dryingEndDate ?? order.dryingStartDate)) {
    throw new Error("El lote ya no est\xE1 programado para esa fecha.");
  }
  if (!line.treatment && !(await getProducts()).some((product) => product.id === line.productId && product.requiresTreatment)) throw new Error("El producto no requiere HT.");
  const existing = await getTreatmentNotPerformed(input.date, addDays(input.date, 1));
  if (existing.some((result) => result.orderLineId === input.orderLineId)) return;
  const note = [`${treatmentNotPerformedPrefix}${input.date} \xB7 ${input.orderLineId}`, `Responsable: ${input.responsible}`, input.note].filter(Boolean).join("\n");
  await recordOrderUpdate(input.orderId, { kind: "incidencia", note });
}
async function getTreatmentOptions() {
  const [products2, movements, clients, orders2] = await Promise.all([getProducts(), getStockMovements(), getClients(), getOrders()]);
  const relations = useMemoryStore ? memoryClientProducts : (await supabaseRequest(`/rest/v1/client_products?select=${masterSelect}&order=display_order.asc,id.asc`)).map(mapClientProduct);
  const balances = calculateStockBalances(movements);
  const clientMap = new Map(clients.map((client) => [client.id, client.name]));
  const relationDestinations = await Promise.all(relations.map(async (relation) => {
    const primary = relation.assets.find((asset) => asset.active && asset.isPrimary);
    const url = primary ? await getClientProductAssetUrl(primary.id) : null;
    const base = {
      clientProductId: relation.id,
      clientName: clientMap.get(relation.clientId) ?? relation.clientId,
      controls: relation.controls.filter((control) => control.active).map((control) => ({ id: control.id, title: control.title, detail: control.detail })),
      primaryAsset: primary && url ? { id: primary.id, url, mimeType: primary.mimeType, altText: primary.altText } : void 0
    };
    const destinations = relation.active ? [{ key: `client:${relation.id}`, label: base.clientName, ...base }] : [];
    for (const order of orders2.filter((item) => !isOrderClosed(item))) for (const line of order.lines.filter((item) => String(item.clientProductId) === String(relation.id))) {
      destinations.push({ key: `order:${line.id}`, label: `${base.clientName} \xB7 ${order.reference}`, ...base, orderLineId: line.id, orderReference: order.reference });
    }
    return { productId: relation.productId, destinations };
  }));
  return products2.filter((product) => product.requiresTreatment).map((product) => {
    const balance = balances.get(product.id) ?? { pending: 0, ready: 0 };
    return {
      product,
      label: productTreatmentLabel(product),
      pending: balance.pending,
      ready: balance.ready,
      destinations: [{ key: "general", label: "Stock general", controls: [] }, ...relationDestinations.filter((entry) => entry.productId === product.id).flatMap((entry) => entry.destinations)]
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "es"));
}
function refreshMemoryTreatmentProgress(orderLineId) {
  if (!orderLineId) return;
  const order = memoryOrders.find((item) => item.lines.some((line2) => line2.id === orderLineId));
  const line = order?.lines.find((item) => item.id === orderLineId);
  if (!line) return;
  const treated = memoryTreatmentBatches.filter((batch) => batch.orderLineId === orderLineId).reduce((sum, batch) => sum + (batch.status === "posted" ? batch.quantity : batch.status === "reversal" ? -batch.quantity : 0), 0);
  line.treatedQuantity = Math.max(treated, 0);
  line.treatmentPendingQuantity = Math.max(line.quantity - line.treatedQuantity, 0);
}
async function recordTreatmentBatch(input) {
  if (!useMemoryStore) {
    return supabaseServerRequest("/rest/v1/rpc/record_treatment_batch_v1", { method: "POST", body: JSON.stringify({
      p_product_id: input.productId,
      p_client_product_id: input.clientProductId === void 0 ? null : Number(input.clientProductId),
      p_order_line_id: input.orderLineId ?? null,
      p_quantity: input.quantity,
      p_performed_at: input.performedAt,
      p_responsible: input.responsible.trim(),
      p_note: input.note?.trim() || null,
      p_controls: input.controls
    }) });
  }
  const product = memoryProducts.find((item) => item.id === input.productId);
  if (!product || !product.requiresTreatment) throw new Error("El producto no requiere HT.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  if (!input.responsible.trim()) throw new Error("Indique qui\xE9n realiz\xF3 el HT.");
  let relation = input.clientProductId === void 0 ? void 0 : memoryClientProducts.find((item) => String(item.id) === String(input.clientProductId));
  if (input.orderLineId) {
    const order = memoryOrders.find((item) => item.lines.some((line2) => line2.id === input.orderLineId));
    const line = order?.lines.find((item) => item.id === input.orderLineId);
    if (!line || line.productId !== product.id) throw new Error("La l\xEDnea no corresponde al producto seleccionado.");
    const lineRelation = memoryClientProducts.find((item) => String(item.id) === String(line.clientProductId));
    if (!lineRelation || relation && String(relation.id) !== String(lineRelation.id)) throw new Error("La l\xEDnea no corresponde al cliente/producto seleccionado.");
    relation = lineRelation;
  }
  if (relation) {
    if (relation.productId !== product.id) throw new Error("El cliente/producto no coincide con el producto.");
    const activeControls = relation.controls.filter((control) => control.active);
    if (input.controls.some((check) => !activeControls.some((control) => String(control.id) === String(check.controlId)))) throw new Error("Uno de los controles no pertenece a la ficha seleccionada.");
  } else if (input.controls.length) throw new Error("Stock general no admite controles espec\xEDficos de cliente.");
  const failed = input.controls.filter((control) => control.result === "fail");
  if (failed.some((control) => !control.note?.trim())) throw new Error("Explique cada control no conforme.");
  if (failed.length && !input.note?.trim()) throw new Error("Explique el rechazo del lote.");
  const balances = calculateStockBalances(memoryStockMovements);
  const previous = balances.get(product.id) ?? { pending: 0, ready: 0 };
  const status = failed.length ? "rejected" : "posted";
  const id = `batch-${memoryTreatmentId++}`;
  const transformationId = crypto.randomUUID();
  const checks = input.controls.map((check) => {
    const control = relation?.controls.find((item) => String(item.id) === String(check.controlId));
    return { id: `check-${memoryTreatmentId++}`, batchId: id, controlId: check.controlId, title: control?.title ?? "Control", result: check.result, note: check.note?.trim() || void 0 };
  });
  const batch = {
    id,
    productId: product.id,
    productName: productTreatmentLabel(product),
    clientProductId: relation?.id,
    clientName: relation ? memoryClients.find((client) => client.id === relation.clientId)?.name : void 0,
    orderLineId: input.orderLineId,
    orderReference: input.orderLineId ? memoryOrders.find((order) => order.lines.some((line) => line.id === input.orderLineId))?.reference : void 0,
    quantity: input.quantity,
    performedAt: input.performedAt,
    responsible: input.responsible.trim(),
    status,
    note: input.note?.trim() || void 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    checks,
    movements: []
  };
  if (status === "posted") {
    const base = { productId: product.id, treatmentBatchId: id, transformationId, performedAt: input.performedAt, responsible: input.responsible.trim(), note: input.note?.trim() || void 0, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    batch.movements = [
      { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "pending_treatment", quantity: -input.quantity, movementType: "treatment_out" },
      { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "ready", quantity: input.quantity, movementType: "treatment_in" }
    ];
    memoryStockMovements.push(...batch.movements);
  }
  memoryTreatmentBatches.push(batch);
  refreshMemoryTreatmentProgress(input.orderLineId);
  return { batchId: id, status, transformationId: status === "posted" ? transformationId : void 0, previousPending: previous.pending, newPending: previous.pending - (status === "posted" ? input.quantity : 0), previousReady: previous.ready, newReady: previous.ready + (status === "posted" ? input.quantity : 0) };
}
async function reverseTreatmentBatch(id, input) {
  if (!useMemoryStore) return supabaseServerRequest("/rest/v1/rpc/reverse_treatment_batch_v1", { method: "POST", body: JSON.stringify({ p_batch_id: id, p_performed_at: input.performedAt, p_responsible: input.responsible.trim(), p_note: input.note.trim() }) });
  const original = memoryTreatmentBatches.find((batch) => String(batch.id) === String(id));
  if (!original || original.status !== "posted") throw new Error("Solo se revierte un lote confirmado.");
  if (memoryTreatmentBatches.some((batch) => String(batch.reversalOfBatchId) === String(id))) throw new Error("El lote ya fue revertido.");
  if (!input.responsible.trim() || !input.note.trim()) throw new Error("Responsable y motivo son obligatorios para revertir.");
  const previous = calculateStockBalances(memoryStockMovements).get(original.productId) ?? { pending: 0, ready: 0 };
  if (previous.ready < original.quantity) throw new Error("El stock listo ya no alcanza; use un ajuste autorizado de stock.");
  const reversalId = `batch-${memoryTreatmentId++}`;
  const transformationId = crypto.randomUUID();
  const base = { productId: original.productId, treatmentBatchId: reversalId, transformationId, performedAt: input.performedAt, responsible: input.responsible.trim(), note: input.note.trim(), createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  const movements = [
    { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "ready", quantity: -original.quantity, movementType: "treatment_reversal_out" },
    { ...base, id: `movement-${memoryTreatmentId++}`, stockState: "pending_treatment", quantity: original.quantity, movementType: "treatment_reversal_in" }
  ];
  original.reversedByBatchId = reversalId;
  memoryTreatmentBatches.push({ ...original, id: reversalId, status: "reversal", reversalOfBatchId: original.id, reversedByBatchId: void 0, performedAt: input.performedAt, responsible: input.responsible.trim(), note: input.note.trim(), createdAt: (/* @__PURE__ */ new Date()).toISOString(), checks: [], movements });
  memoryStockMovements.push(...movements);
  refreshMemoryTreatmentProgress(original.orderLineId);
  return { batchId: reversalId, status: "reversal", transformationId, previousPending: previous.pending, newPending: previous.pending + original.quantity, previousReady: previous.ready, newReady: previous.ready - original.quantity };
}
async function getTreatmentBatchDetail(id) {
  const batch = useMemoryStore ? memoryTreatmentBatches.find((item) => String(item.id) === String(id)) ?? null : (await loadDatabaseTreatmentBatches(`id=eq.${encodeURIComponent(String(id))}`))[0] ?? null;
  if (!batch?.clientProductId) return batch;
  const relation = await getClientProduct(batch.clientProductId);
  const primary = relation?.assets.find((asset) => asset.active && asset.isPrimary);
  const url = primary ? await getClientProductAssetUrl(primary.id) : null;
  return {
    ...batch,
    primaryAsset: primary && url ? { id: primary.id, url, mimeType: primary.mimeType, altText: primary.altText } : void 0
  };
}
async function getStockSummary(includeOrderCommitments = false) {
  const allProducts = await getProducts();
  if (useMemoryStore) {
    const balances2 = calculateStockBalances(memoryStockMovements);
    const products2 = allProducts.filter((product) => product.stockActive !== false || (balances2.get(product.id)?.pending ?? 0) + (balances2.get(product.id)?.ready ?? 0) > 0);
    const orderReservations2 = orderStockReservations(memoryOrders, products2);
    const rows2 = products2.map((product) => {
      const balance = balances2.get(product.id) ?? { pending: 0, ready: 0 };
      const shipmentReserved = memoryStockReservations.filter((item) => item.productId === product.id && item.status === "active").reduce((sum, item) => sum + item.quantity, 0);
      const assigned = orderReservations2.get(product.id) ?? { pending: 0, ready: 0, orders: [] };
      const readyReserved = Math.min(Math.max(balance.ready, 0), Math.max(shipmentReserved, assigned.ready));
      const pendingReserved = Math.min(balance.pending, assigned.pending);
      const reserved = readyReserved + pendingReserved;
      const available = Math.max(balance.ready - readyReserved, 0);
      return { product, pending: balance.pending, ready: balance.ready, reserved, available, physical: balance.pending + balance.ready, ...includeOrderCommitments ? { orderCommitments: assigned.orders } : {} };
    });
    return includeOrderCommitments ? scopeStockInventory(rows2, memoryOrders) : rows2;
  }
  const [rows, orders2, movements] = await Promise.all([
    supabaseRequest("/rest/v1/stock_balances?select=*&order=product_id.asc"),
    getOrders(),
    getStockMovements()
  ]);
  const balances = calculateStockBalances(movements);
  const balanceProductIds = new Set(rows.map((row) => row.product_id));
  const extraProducts = allProducts.filter((product) => !balanceProductIds.has(product.id) && (balances.get(product.id)?.pending ?? 0) + (balances.get(product.id)?.ready ?? 0) > 0);
  const productMap = new Map(allProducts.map((product) => [product.id, product]));
  const orderReservations = orderStockReservations(orders2, allProducts);
  const balanceRows = rows.map((row) => {
    const deliveries = orders2.flatMap((order) => (order.shipments ?? []).filter((shipment) => !["cancelled", "delivered"].includes(shipment.status)).flatMap((shipment) => shipment.lines.flatMap((shipmentLine) => {
      const orderLine = order.lines.find((line) => line.id === shipmentLine.orderLineId);
      return orderLine?.productId === row.product_id ? [{ date: shipment.plannedDate, quantity: shipmentLine.plannedQuantity, client: order.client }] : [];
    }))).sort((a, b) => a.date.localeCompare(b.date));
    const assigned = orderReservations.get(row.product_id) ?? { pending: 0, ready: 0, orders: [] };
    const readyReserved = Math.min(Math.max(row.ready_quantity, 0), Math.max(row.reserved_quantity, assigned.ready));
    const pendingReserved = Math.min(row.pending_quantity, assigned.pending);
    const available = Math.max(row.ready_quantity - readyReserved, 0);
    return {
      product: productMap.get(row.product_id) ?? { id: row.product_id, kind: "Pallet", requiresTreatment: false, stockName: row.product_id },
      pending: row.pending_quantity,
      ready: row.ready_quantity,
      reserved: readyReserved + pendingReserved,
      available,
      physical: row.physical_quantity,
      nextDelivery: deliveries[0],
      lastMovementAt: row.last_movement_at ?? void 0,
      ...includeOrderCommitments ? { orderCommitments: assigned.orders } : {}
    };
  });
  const extraRows = extraProducts.map((product) => {
    const balance = balances.get(product.id);
    const assigned = orderReservations.get(product.id) ?? { pending: 0, ready: 0, orders: [] };
    const pending = Math.max(balance.pending, 0);
    const ready = balance.ready;
    const reserved = Math.min(pending, assigned.pending) + Math.min(Math.max(ready, 0), assigned.ready);
    return { product, pending, ready, reserved, available: Math.max(ready - assigned.ready, 0), physical: pending + ready, ...includeOrderCommitments ? { orderCommitments: assigned.orders } : {} };
  });
  const summary = [...balanceRows, ...extraRows];
  return includeOrderCommitments ? scopeStockInventory(summary, orders2) : summary;
}
async function getStockDetail(productId) {
  const summary = (await getStockSummary()).find((row) => row.product.id === productId);
  if (!summary) return null;
  if (useMemoryStore) {
    return { summary, movements: memoryStockMovements.filter((movement) => movement.productId === productId).sort((a, b) => b.performedAt.localeCompare(a.performedAt)) };
  }
  const movementRows = await supabaseRequest(`/rest/v1/stock_movements?select=*&product_id=eq.${encodeURIComponent(productId)}&order=performed_at.desc,id.desc&limit=150`);
  return { summary, movements: movementRows.map(mapStockMovement) };
}
async function getStockImportReport() {
  if (useMemoryStore) return [];
  return supabaseRequest("/rest/v1/stock_import_runs?select=*&order=source_catalog.asc");
}
async function recordStockReceipt(input) {
  if (!useMemoryStore) return supabaseServerRequest("/rest/v1/rpc/record_stock_receipt_v1", { method: "POST", body: JSON.stringify({ p_product_id: input.productId, p_stock_state: input.stockState, p_quantity: input.quantity, p_movement_type: input.movementType, p_provider_id: input.providerId ?? null, p_source_reference: input.sourceReference?.trim() || null, p_occurred_at: input.occurredAt, p_responsible: input.responsible.trim(), p_note: input.note?.trim() || null }) });
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || !input.responsible.trim()) throw new Error("Cantidad y responsable son obligatorios.");
  if (!memoryProducts.some((product) => product.id === input.productId)) throw new Error("Producto no encontrado.");
  const id = `movement-${memoryTreatmentId++}`;
  memoryStockMovements.push({ id, productId: input.productId, stockState: input.stockState, quantity: input.quantity, movementType: input.movementType, providerId: input.providerId, sourceReference: input.sourceReference?.trim() || void 0, transformationId: crypto.randomUUID(), performedAt: input.occurredAt, responsible: input.responsible.trim(), note: input.note?.trim() || void 0, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  return id;
}
async function recordStockAdjustment(input) {
  if (!useMemoryStore) return supabaseServerRequest("/rest/v1/rpc/record_stock_adjustment_v1", { method: "POST", body: JSON.stringify({ p_product_id: input.productId, p_stock_state: input.stockState, p_quantity_delta: input.quantityDelta, p_occurred_at: input.occurredAt, p_responsible: input.responsible.trim(), p_reason: input.reason.trim() }) });
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0 || !input.responsible.trim() || !input.reason.trim()) throw new Error("Cantidad, responsable y motivo son obligatorios.");
  const balance = calculateStockBalances(memoryStockMovements).get(input.productId) ?? { pending: 0, ready: 0 };
  const current = input.stockState === "ready" ? balance.ready : balance.pending;
  if (current + input.quantityDelta < 0) throw new Error("El ajuste dejar\xEDa stock negativo.");
  const id = `movement-${memoryTreatmentId++}`;
  memoryStockMovements.push({ id, productId: input.productId, stockState: input.stockState, quantity: input.quantityDelta, movementType: "adjustment", transformationId: crypto.randomUUID(), performedAt: input.occurredAt, responsible: input.responsible.trim(), note: input.reason.trim(), createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  return id;
}
async function reverseStockMovement(id, input) {
  if (!useMemoryStore) return supabaseServerRequest("/rest/v1/rpc/reverse_stock_movement_v1", { method: "POST", body: JSON.stringify({ p_movement_id: Number(id), p_occurred_at: input.occurredAt, p_responsible: input.responsible.trim(), p_reason: input.reason.trim() }) });
  const original = memoryStockMovements.find((movement) => String(movement.id) === String(id));
  if (!original || original.movementType === "reversal" || memoryStockMovements.some((movement) => String(movement.correctionOfMovementId) === String(id))) throw new Error("El movimiento no existe o ya fue revertido.");
  return recordStockAdjustment({ productId: original.productId, stockState: original.stockState, quantityDelta: -original.quantity, occurredAt: input.occurredAt, responsible: input.responsible, reason: input.reason }).then((newId) => {
    const movement = memoryStockMovements.find((item) => String(item.id) === String(newId));
    if (movement) {
      movement.movementType = "reversal";
      movement.correctionOfMovementId = original.id;
    }
    return newId;
  });
}
var useMemoryStore, memoryOrders, memoryHistory, memoryProducts, memoryProductLevels, memoryProviders, memoryClients, memoryClientProducts, memoryAssetFiles, memoryMasterId, memoryCapacityRules, memoryInternalDefaults, memoryAvailablePeople, memoryExternalDefaults, memoryTransportDefaults, memoryCapacityAdjustments, memoryProductionResources, memoryProductionRules, memoryProductionId, memoryStockMovements, memoryStockReservations, memoryTreatmentBatches, memoryTreatmentId, masterSelect, shipmentHistoryStatus, shipmentHistoryReasons, mapProductionResource, treatmentNotPerformedPrefix;
var init_store = __esm({
  "app/api/store.ts"() {
    "use strict";
    init_data();
    init_production_rule_defaults();
    init_capacity();
    init_classification();
    init_supabase();
    init_master_data();
    init_treatment();
    init_stock();
    useMemoryStore = process.env.ECOASE_DATA_BACKEND === "memory";
    memoryOrders = structuredClone(orders);
    memoryHistory = /* @__PURE__ */ new Map();
    memoryProducts = structuredClone(products);
    memoryProductLevels = structuredClone(defaultProductLevels);
    memoryProviders = structuredClone(providers);
    memoryClients = [...new Set(orders.map((order) => order.client))].map((name, index) => {
      const address = orders.find((order) => order.client === name)?.deliveryAddress;
      return { id: `cliente-${index + 1}`, name, address, active: Boolean(address), updatedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
    });
    memoryClientProducts = [];
    memoryAssetFiles = /* @__PURE__ */ new Map();
    memoryMasterId = 1;
    memoryCapacityRules = [];
    memoryInternalDefaults = [];
    memoryExternalDefaults = [];
    memoryTransportDefaults = [];
    memoryCapacityAdjustments = [];
    memoryProductionResources = [
      { id: "internal", name: "F\xE1brica", resourceType: "internal_factory", active: true, displayOrder: 10 },
      { id: "blanc", name: "Blanc", resourceType: "external_supplier", providerId: "blanc", active: true, displayOrder: 20 },
      { id: "mirasol", name: "Mirasol", resourceType: "external_supplier", providerId: "mirasol", active: true, displayOrder: 30 },
      { id: "sandro_raul", name: "Sandro Raul", resourceType: "internal_crew", active: true, displayOrder: 40 },
      { id: "fabrica_john", name: "F\xE1brica John", resourceType: "internal_factory", active: true, displayOrder: 50 },
      { id: "fabrica_omar", name: "F\xE1brica Omar", resourceType: "internal_factory", active: true, displayOrder: 60 },
      { id: "john_esteban", name: "John y Esteban", resourceType: "internal_crew", active: true, displayOrder: 70 },
      { id: "enzo", name: "Enzo", resourceType: "internal_crew", active: true, displayOrder: 80 },
      { id: "lito", name: "Lito", resourceType: "internal_crew", active: true, displayOrder: 90 }
    ];
    memoryProductionRules = [];
    memoryProductionId = 1;
    memoryStockMovements = [];
    memoryStockReservations = [];
    memoryTreatmentBatches = [];
    memoryTreatmentId = 1;
    for (const order of memoryOrders) {
      const createdAt = (/* @__PURE__ */ new Date(0)).toISOString();
      order.requiredOperations = canonicalOperations(order.requiredOperations);
      order.product = canonicalProductName(order.product);
      for (const line of order.lines) {
        line.treatment = treatmentFromLabel(line.product);
        line.product = canonicalProductName(line.product);
        const resourceId = order.producerProviderId ?? (order.productionSource === "internal" ? "internal" : void 0);
        line.productionAllocations = [{ id: `pa-${line.id}`, orderLineId: line.id, resourceId, productionResourceId: resourceId, plannedDate: order.productionDate ?? order.importArrivalDate ?? getOrderPlannedDate(order), plannedQuantity: line.quantity, status: "draft", note: "Planificaci\xF3n hist\xF3rica", createdAt, updatedAt: createdAt }];
      }
      const shipmentStatus = getOrderStage(order) === "completado" ? "delivered" : order.dispatchedAt ? "dispatched" : "planned";
      order.shipments = [{
        id: `shipment-${order.id}`,
        orderId: order.id,
        plannedDate: getOrderPlannedDate(order),
        status: shipmentStatus,
        transportSource: order.transportSource ?? "internal",
        transportProviderId: order.transportProviderId,
        transportLabel: order.transport,
        remittance: shipmentStatus === "planned" ? order.remittance : order.remittance ?? "Remito hist\xF3rico no informado",
        deliveryAddressSnapshot: shipmentStatus === "planned" ? void 0 : order.deliveryAddress ?? "Direcci\xF3n hist\xF3rica no informada",
        loadedAt: shipmentStatus === "planned" ? void 0 : order.dispatchedAt ?? createdAt,
        dispatchedAt: ["dispatched", "delivered"].includes(shipmentStatus) ? order.dispatchedAt ?? createdAt : void 0,
        deliveredAt: shipmentStatus === "delivered" ? order.deliveredAt ?? createdAt : void 0,
        createdAt,
        updatedAt: createdAt,
        lines: order.lines.map((line, index) => ({ id: `sl-${line.id}`, shipmentId: `shipment-${order.id}`, orderLineId: line.id, product: line.product, treatment: line.treatment, plannedQuantity: line.quantity, deliveredQuantity: Math.min(line.quantity, Math.max(order.delivered - order.lines.slice(0, index).reduce((sum, item) => sum + item.quantity, 0), 0)) })),
        events: [{ id: `se-${order.id}`, shipmentId: `shipment-${order.id}`, eventType: "created", nextStatus: shipmentStatus, nextDate: getOrderPlannedDate(order), responsible: "Migraci\xF3n", createdAt }]
      }];
    }
    masterSelect = "id,client_id,product_id,zeta_code,operational_name,active,display_order,created_at,updated_at,products(*),client_product_controls(id,client_product_id,title,detail,display_order,active),client_product_assets(id,client_product_id,storage_path,file_name,asset_type,mime_type,size_bytes,alt_text,is_primary,active,created_at)";
    shipmentHistoryStatus = { planned: "Planificado", ready: "Pronto", loaded: "Cargado", dispatched: "En viaje", delivered: "Entregado", cancelled: "Cancelado" };
    shipmentHistoryReasons = { production: "Producci\xF3n", logistics: "Log\xEDstica", client: "Cliente", weather: "Clima / lluvia", other: "Otro" };
    mapProductionResource = (row) => ({ id: row.id, name: row.name, resourceType: row.resource_type, providerId: row.provider_id ?? void 0, active: row.active, displayOrder: row.display_order, productKinds: row.product_kinds?.length ? row.product_kinds : void 0 });
    treatmentNotPerformedPrefix = "HT no realizado \xB7 ";
  }
});

// app/logistics.ts
function palletDimensionsCm(measure) {
  const match = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?$/i.exec(measure?.trim() ?? "");
  if (!match) return void 0;
  const lengthCm = Number(match[1].replace(",", "."));
  const widthCm = Number(match[2].replace(",", "."));
  if (widthCm <= 0 || lengthCm <= 0) return void 0;
  return { lengthCm, widthCm };
}
function palletFootprintM2(measure) {
  const dimensions = palletDimensionsCm(measure);
  return dimensions ? dimensions.lengthCm * dimensions.widthCm / 1e4 : void 0;
}
function classifyPallet(product, override) {
  if (override) return override;
  if (product.kind !== "Pallet") return "unclassified";
  const footprintM2 = palletFootprintM2(product.measure);
  if (footprintM2 === void 0) return "unclassified";
  return footprintM2 <= 1.2 ? "small" : "large";
}
function loadWarnings(counts) {
  const warnings = [];
  if (counts.unclassified > 0) warnings.push("Hay productos sin tama\xF1o log\xEDstico definido.");
  return warnings;
}
function calculateLineAvailability(orders2, stock, movements, batches) {
  const stockByProduct = new Map(stock.map((row) => [row.product.id, row]));
  const readyLeft = new Map(stock.map((row) => [row.product.id, Math.max(row.ready, 0)]));
  const pendingLeft = new Map(stock.map((row) => [row.product.id, Math.max(row.pending, 0)]));
  const rows = orders2.flatMap((order) => order.lines.map((line) => {
    const pending = Math.max(line.quantity - (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled").flatMap((shipment) => shipment.lines).filter((entry) => entry.orderLineId === line.id).reduce((sum, entry) => sum + entry.deliveredQuantity, 0), 0);
    const own = movements.filter((movement) => movement.orderLineId === line.id);
    const producedReady = own.filter((movement) => movement.movementType === "production_receipt" && movement.stockState === "ready").reduce((sum, movement) => sum + movement.quantity, 0);
    const producedPending = own.filter((movement) => movement.movementType === "production_receipt" && movement.stockState === "pending_treatment").reduce((sum, movement) => sum + movement.quantity, 0);
    const dispatched = -own.filter((movement) => movement.movementType === "dispatch").reduce((sum, movement) => sum + movement.quantity, 0);
    const treated = batches.filter((batch) => batch.orderLineId === line.id).reduce((sum, batch) => sum + (batch.status === "posted" ? batch.quantity : batch.status === "reversal" ? -batch.quantity : 0), 0);
    const productStock = stockByProduct.get(line.productId ?? "");
    const reservedForThisOrder = Math.max(line.readyReservedQuantity ?? 0, 0);
    const productId = line.productId ?? "";
    const readyAttributed = Math.min(pending, Math.max(producedReady + treated - dispatched, 0), readyLeft.get(productId) ?? 0);
    readyLeft.set(productId, (readyLeft.get(productId) ?? 0) - readyAttributed);
    const pendingHT = Math.min(
      Math.max(pending - readyAttributed, 0),
      Math.max(producedPending - treated, 0),
      pendingLeft.get(productId) ?? 0
    );
    pendingLeft.set(productId, (pendingLeft.get(productId) ?? 0) - pendingHT);
    const remaining = Math.max(pending - readyAttributed - pendingHT, 0);
    const physicallyProduced = Math.max(producedReady + producedPending - dispatched, 0);
    const unproduced = Math.min(remaining, Math.max(pending - physicallyProduced, 0));
    const unassigned = remaining - unproduced;
    return {
      orderId: order.id,
      orderLineId: line.id,
      productId: line.productId,
      product: line.product,
      pending,
      readyAttributed,
      generalAssignable: 0,
      pendingHT,
      inHT: void 0,
      unproduced,
      unassigned,
      reservedForThisOrder,
      reservedForOtherTrips: Math.max((productStock?.reserved ?? 0) - reservedForThisOrder, 0)
    };
  }));
  const attributed = /* @__PURE__ */ new Map();
  for (const row of rows) if (row.productId) attributed.set(
    row.productId,
    (attributed.get(row.productId) ?? 0) + row.readyAttributed
  );
  const generalLeft = new Map(stock.map((row) => [
    row.product.id,
    Math.max(Math.min(row.available, row.ready - (attributed.get(row.product.id) ?? 0)), 0)
  ]));
  for (const row of rows) {
    if (!row.productId) continue;
    row.generalAssignable = Math.min(
      Math.max(row.pending - row.readyAttributed - row.pendingHT, 0),
      generalLeft.get(row.productId) ?? 0
    );
    generalLeft.set(row.productId, (generalLeft.get(row.productId) ?? 0) - row.generalAssignable);
    const resolvesUnassigned = Math.min(row.unassigned, row.generalAssignable);
    row.unassigned -= resolvesUnassigned;
    row.unproduced -= row.generalAssignable - resolvesUnassigned;
  }
  return rows;
}
function tripWarnings(run, runs, settings) {
  const warnings = [];
  if (!run.plannedStartAt || !run.plannedEndAt)
    warnings.push("Faltan horarios para evaluar la vuelta.");
  if (!run.destinationAddress) warnings.push("Falta direcci\xF3n de destino.");
  const atShift = (time) => run.plannedDate && time ? Date.parse(`${run.plannedDate}T${time.slice(0, 5)}:00-03:00`) : Number.NaN;
  const shiftStart = atShift(settings.shiftStart), shiftEnd = atShift(settings.shiftEnd);
  if (run.plannedStartAt && Number.isFinite(shiftStart) && Date.parse(run.plannedStartAt) < shiftStart) warnings.push(`La salida es antes del inicio de la jornada (${settings.shiftStart.slice(0, 5)}).`);
  if (run.plannedEndAt && Number.isFinite(shiftEnd) && Date.parse(run.plannedEndAt) > shiftEnd) warnings.push(`La vuelta termina despu\xE9s del fin de la jornada (${settings.shiftEnd.slice(0, 5)}).`);
  if (run.plannedStartAt && run.plannedEndAt) {
    for (const other of runs) {
      if (String(other.id) === String(run.id) || other.status === "cancelled" || !other.plannedStartAt || !other.plannedEndAt) continue;
      if (!(run.plannedStartAt < other.plannedEndAt && other.plannedStartAt < run.plannedEndAt)) continue;
      if (run.vehicleId && run.vehicleId === other.vehicleId) warnings.push("El veh\xEDculo se solapa con otra salida.");
      if (run.driverId && run.driverId === other.driverId) warnings.push("El chofer se solapa con otra salida.");
    }
  }
  return [...new Set(warnings)];
}
var LARGE_REFERENCE_FOOTPRINT_M2;
var init_logistics = __esm({
  "app/logistics.ts"() {
    "use strict";
    LARGE_REFERENCE_FOOTPRINT_M2 = 2.2 * 1.17;
  }
});

// app/api/logistics-store.ts
function str(value) {
  return typeof value === "string" ? value : void 0;
}
function num(value) {
  return typeof value === "number" ? value : void 0;
}
function validCount(value) {
  return value === void 0 || value === null || Number.isInteger(value) && Number(value) >= 0;
}
function runFromRow(row) {
  return {
    id: row.id,
    mode: row.mode,
    shipmentId: num(row.shipment_id),
    providerId: str(row.provider_id),
    orderId: str(row.order_id),
    vehicleId: str(row.vehicle_id),
    driverId: str(row.driver_id),
    plannedDate: String(row.planned_date),
    plannedStartAt: str(row.planned_start_at),
    plannedEndAt: str(row.planned_end_at),
    endTimeSource: row.end_time_source,
    destinationAddress: str(row.destination_address),
    destinationLatitude: num(row.destination_latitude),
    destinationLongitude: num(row.destination_longitude),
    destinationPrecision: row.destination_precision,
    routeDistanceM: num(row.route_distance_m),
    routeDurationS: num(row.route_duration_s),
    routeGeometry: row.route_geometry,
    routeCheckedAt: str(row.route_checked_at),
    routeStatus: row.route_status,
    routeReason: str(row.route_reason),
    status: row.status,
    note: str(row.note),
    responsible: String(row.responsible ?? "Operaci\xF3n")
  };
}
function vehicleFromRow(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    smallCapacity: num(row.small_capacity),
    largeCapacity: num(row.large_capacity),
    habitualDriverId: str(row.habitual_driver_id),
    lengthM: num(row.length_m),
    widthM: num(row.width_m),
    heightM: num(row.height_m),
    weightT: num(row.weight_t),
    active: row.active !== false
  };
}
function transportCapacityFromRow(row) {
  return {
    id: String(row.id),
    kind: row.kind,
    providerId: str(row.provider_id),
    largeCapacity: num(row.large_capacity),
    smallCapacity: num(row.small_capacity)
  };
}
function clientLimitFromRow(row) {
  return {
    clientId: String(row.client_id),
    distanceKm: num(row.distance_km),
    travelHours: num(row.travel_hours),
    handlingMinutes: num(row.handling_minutes),
    routeCheckedAt: str(row.route_checked_at),
    ordersPerDay: num(row.orders_per_day)
  };
}
function settingsFromRow(row) {
  return row ? {
    originAddress: String(row.origin_address ?? "Paysand\xFA, Uruguay"),
    originLatitude: num(row.origin_latitude),
    originLongitude: num(row.origin_longitude),
    originPrecision: row.origin_precision ?? "city",
    shiftStart: str(row.shift_start),
    shiftEnd: str(row.shift_end),
    breakMinutes: num(row.break_minutes),
    loadMinutes: num(row.load_minutes),
    unloadMinutes: num(row.unload_minutes),
    marginMinutes: num(row.margin_minutes)
  } : defaultSettings;
}
function locationFromRow(row) {
  return {
    entityType: row.entity_type,
    entityId: String(row.entity_id),
    address: String(row.address),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    precision: row.precision,
    verified: row.verified === true
  };
}
async function listConfiguration() {
  if (memory) return {
    vehicles: memoryVehicles,
    drivers: memoryDrivers,
    settings: memorySettings,
    classes: Object.fromEntries(memoryClasses),
    locations: memoryLocations,
    transportCapacities: memoryTransportCapacities,
    clientLimits: memoryClientLimits,
    limitsSchemaReady: true,
    runs: memoryRuns
  };
  const optionalRows = async (table) => {
    try {
      return { rows: await supabaseServerRequest(`/rest/v1/${table}?select=*`), available: true };
    } catch (error) {
      if (error.code === "PGRST205") return { rows: [], available: false };
      throw error;
    }
  };
  const [vehicles, drivers, settings, classes, locations, runs, transportCapacities, clientLimits] = await Promise.all([
    supabaseServerRequest("/rest/v1/logistics_vehicles?select=*&order=name.asc"),
    supabaseServerRequest("/rest/v1/logistics_drivers?select=*&order=name.asc"),
    supabaseServerRequest("/rest/v1/logistics_settings?select=*&id=eq.1"),
    supabaseServerRequest("/rest/v1/logistics_product_classes?select=*"),
    supabaseServerRequest("/rest/v1/logistics_locations?select=*"),
    supabaseServerRequest("/rest/v1/logistics_runs?select=*&order=planned_date.asc,planned_start_at.asc"),
    optionalRows("logistics_transport_capacities"),
    optionalRows("logistics_client_delivery_limits")
  ]);
  return {
    vehicles: vehicles.map(vehicleFromRow),
    drivers: drivers.map((row) => ({ id: String(row.id), name: String(row.name), active: row.active !== false })),
    settings: settingsFromRow(settings[0]),
    classes: Object.fromEntries(classes.map((row) => [String(row.product_id), row.pallet_class])),
    locations: locations.map(locationFromRow),
    transportCapacities: transportCapacities.rows.map(transportCapacityFromRow),
    clientLimits: clientLimits.rows.map(clientLimitFromRow),
    limitsSchemaReady: transportCapacities.available && clientLimits.available,
    runs: runs.map(runFromRow)
  };
}
async function getLogisticsRuns(orderId) {
  const { runs } = await listConfiguration();
  return orderId ? runs.filter((run) => run.orderId === orderId) : runs;
}
async function getTransportRuns(from, to) {
  const { runs, vehicles } = await listConfiguration();
  return runs.filter((run) => run.status !== "cancelled" && run.plannedDate >= from && run.plannedDate <= to).map((run) => ({ ...run, vehicleName: vehicles.find((vehicle) => vehicle.id === run.vehicleId)?.name }));
}
async function getLogisticsSnapshot() {
  const [config, orders2, products2, clients, providers2, stock, movements, batches] = await Promise.all([
    listConfiguration(),
    getOrders(),
    getProducts(),
    getClients(),
    getProviders(),
    getStockSummary(),
    getStockMovements(),
    getLogisticsTreatmentProgress()
  ]);
  return {
    ...config,
    orders: orders2,
    products: products2,
    clients: clients.map((client) => ({ id: client.id, name: client.name, address: client.address, department: client.department })),
    providers: providers2,
    availability: calculateLineAvailability(orders2, stock, movements, batches),
    stock: stock.map((row) => ({ productId: row.product.id, ready: row.ready, pending: row.pending, available: row.available, reserved: row.reserved }))
  };
}
async function upsert(table, conflict, row) {
  return supabaseServerRequest(`/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(row)
  });
}
function updateById(items, id, replacement, key) {
  const index = items.findIndex((item) => key(item) === id);
  if (index < 0) items.push(replacement);
  else items[index] = replacement;
}
async function saveLogisticsConfig(kind, payload) {
  if (kind === "settings") {
    if ([payload.breakMinutes, payload.loadMinutes, payload.unloadMinutes, payload.marginMinutes].some((value) => !validCount(value)))
      throw new Error("Los tiempos deben ser minutos enteros no negativos.");
    const settings = {
      originAddress: str(payload.originAddress)?.trim() || "Paysand\xFA, Uruguay",
      originLatitude: num(payload.originLatitude),
      originLongitude: num(payload.originLongitude),
      originPrecision: payload.originPrecision || "city",
      shiftStart: str(payload.shiftStart),
      shiftEnd: str(payload.shiftEnd),
      breakMinutes: num(payload.breakMinutes),
      loadMinutes: num(payload.loadMinutes),
      unloadMinutes: num(payload.unloadMinutes),
      marginMinutes: num(payload.marginMinutes)
    };
    if (memory) {
      memorySettings = settings;
      return settings;
    }
    await upsert("logistics_settings", "id", {
      id: 1,
      origin_address: settings.originAddress,
      origin_latitude: settings.originLatitude ?? null,
      origin_longitude: settings.originLongitude ?? null,
      origin_precision: settings.originPrecision,
      shift_start: settings.shiftStart ?? null,
      shift_end: settings.shiftEnd ?? null,
      break_minutes: settings.breakMinutes ?? null,
      load_minutes: settings.loadMinutes ?? null,
      unload_minutes: settings.unloadMinutes ?? null,
      margin_minutes: settings.marginMinutes ?? null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return settings;
  }
  if (kind === "vehicle") {
    const id = str(payload.id)?.trim();
    const name = str(payload.name)?.trim();
    if (!id || !name) throw new Error("Veh\xEDculo y nombre son obligatorios.");
    if (!validCount(payload.smallCapacity) || !validCount(payload.largeCapacity))
      throw new Error("Los l\xEDmites deben ser cantidades enteras no negativas.");
    const largeCapacity = num(payload.largeCapacity);
    const smallCapacity = num(payload.smallCapacity);
    if (largeCapacity !== void 0 && smallCapacity !== void 0 && largeCapacity > smallCapacity)
      throw new Error("La capacidad m\xEDnima no puede superar la m\xE1xima.");
    const vehicle = {
      id,
      name,
      smallCapacity,
      largeCapacity,
      habitualDriverId: str(payload.habitualDriverId),
      lengthM: num(payload.lengthM),
      widthM: num(payload.widthM),
      heightM: num(payload.heightM),
      weightT: num(payload.weightT),
      active: payload.active !== false
    };
    if (memory) {
      updateById(memoryVehicles, id, vehicle, (item) => item.id);
      return vehicle;
    }
    await upsert("logistics_vehicles", "id", {
      id,
      name,
      small_capacity: vehicle.smallCapacity ?? null,
      large_capacity: vehicle.largeCapacity ?? null,
      habitual_driver_id: vehicle.habitualDriverId ?? null,
      length_m: vehicle.lengthM ?? null,
      width_m: vehicle.widthM ?? null,
      height_m: vehicle.heightM ?? null,
      weight_t: vehicle.weightT ?? null,
      active: vehicle.active
    });
    return vehicle;
  }
  if (kind === "transport_capacity") {
    const source = payload.source;
    const providerId = str(payload.providerId);
    if (source !== "provider" && source !== "customer_pickup") throw new Error("Tipo de transporte inv\xE1lido.");
    if (source === "provider" && (!providerId || !(await getProviders()).some((item) => item.id === providerId && item.type === "Transporte" && !item.internalTransport)))
      throw new Error("Transportista no encontrado.");
    if (!validCount(payload.largeCapacity) || !validCount(payload.smallCapacity)) throw new Error("Las capacidades deben ser enteros no negativos.");
    const largeCapacity = num(payload.largeCapacity);
    const smallCapacity = num(payload.smallCapacity);
    if (largeCapacity !== void 0 && smallCapacity !== void 0 && largeCapacity > smallCapacity)
      throw new Error("La capacidad m\xEDnima no puede superar la m\xE1xima.");
    const id = source === "provider" ? `provider:${providerId}` : "customer_pickup";
    const capacity = { id, kind: source, providerId: source === "provider" ? providerId : void 0, largeCapacity, smallCapacity };
    if (memory) {
      updateById(memoryTransportCapacities, id, capacity, (item) => item.id);
      return capacity;
    }
    await upsert("logistics_transport_capacities", "id", {
      id,
      kind: source,
      provider_id: capacity.providerId ?? null,
      large_capacity: largeCapacity ?? null,
      small_capacity: smallCapacity ?? null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return capacity;
  }
  if (kind === "client_limit") {
    const clientId = str(payload.clientId);
    if (!clientId || !(await getClients()).some((item) => item.id === clientId)) throw new Error("Cliente no encontrado.");
    const distanceKm = num(payload.distanceKm);
    const travelHours = num(payload.travelHours);
    const handlingMinutes = num(payload.handlingMinutes);
    const ordersPerDay = num(payload.ordersPerDay);
    if (payload.distanceKm !== void 0 && payload.distanceKm !== null && (distanceKm === void 0 || !Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 99999999e-1))
      throw new Error("La distancia debe ser un n\xFAmero no negativo en kil\xF3metros.");
    if (payload.travelHours !== void 0 && payload.travelHours !== null && (travelHours === void 0 || !Number.isFinite(travelHours) || travelHours < 0 || travelHours > 999.99))
      throw new Error("Las horas de viaje deben ser un n\xFAmero no negativo.");
    if (payload.handlingMinutes !== void 0 && payload.handlingMinutes !== null && (handlingMinutes === void 0 || !Number.isInteger(handlingMinutes) || handlingMinutes < 0))
      throw new Error("La carga y descarga debe indicarse en minutos enteros no negativos.");
    if (payload.ordersPerDay !== void 0 && payload.ordersPerDay !== null && (ordersPerDay === void 0 || !Number.isInteger(ordersPerDay) || ordersPerDay < 0))
      throw new Error("Los pedidos por d\xEDa deben ser un entero no negativo.");
    const previous = (await listConfiguration()).clientLimits.find((item) => item.clientId === clientId);
    const routeCheckedAt = distanceKm === previous?.distanceKm && travelHours === previous?.travelHours ? previous?.routeCheckedAt : void 0;
    const limit = { clientId, distanceKm, travelHours, handlingMinutes, routeCheckedAt, ordersPerDay };
    if (memory) {
      updateById(memoryClientLimits, clientId, limit, (item) => item.clientId);
      return limit;
    }
    await upsert("logistics_client_delivery_limits", "client_id", {
      client_id: clientId,
      distance_km: distanceKm ?? null,
      travel_hours: travelHours ?? null,
      handling_minutes: handlingMinutes ?? null,
      route_checked_at: routeCheckedAt ?? null,
      orders_per_day: ordersPerDay ?? null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return limit;
  }
  if (kind === "driver") {
    const id = str(payload.id)?.trim();
    const name = str(payload.name)?.trim();
    if (!id || !name) throw new Error("Chofer y nombre son obligatorios.");
    const driver = { id, name, active: payload.active !== false };
    if (memory) {
      updateById(memoryDrivers, id, driver, (item) => item.id);
      return driver;
    }
    await upsert("logistics_drivers", "id", driver);
    return driver;
  }
  if (kind === "class") {
    const productId = str(payload.productId);
    const palletClass = payload.palletClass;
    if (!productId || !["small", "large", "unclassified", "auto"].includes(palletClass)) throw new Error("Clasificaci\xF3n inv\xE1lida.");
    if (palletClass === "auto") {
      if (memory) memoryClasses.delete(productId);
      else await supabaseServerRequest(`/rest/v1/logistics_product_classes?product_id=eq.${encodeURIComponent(productId)}`, { method: "DELETE" });
      return { productId, palletClass };
    }
    if (memory) {
      memoryClasses.set(productId, palletClass);
      return { productId, palletClass };
    }
    await upsert("logistics_product_classes", "product_id", {
      product_id: productId,
      pallet_class: palletClass,
      reason: str(payload.reason) ?? null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { productId, palletClass };
  }
  const entityType = payload.entityType;
  const entityId = str(payload.entityId);
  const address = str(payload.address)?.trim();
  if (!["client", "provider"].includes(entityType) || !entityId || !address) throw new Error("Ubicaci\xF3n inv\xE1lida.");
  const location = {
    entityType,
    entityId,
    address,
    latitude: num(payload.latitude),
    longitude: num(payload.longitude),
    precision: payload.precision || "unknown",
    verified: payload.verified === true
  };
  if (memory) {
    updateById(memoryLocations, `${entityType}:${entityId}`, location, (item) => `${item.entityType}:${item.entityId}`);
    return location;
  }
  await upsert("logistics_locations", "entity_type,entity_id", {
    entity_type: entityType,
    entity_id: entityId,
    address,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
    precision: location.precision,
    verified: location.verified,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return location;
}
async function saveLogisticsRun(payload) {
  const mode = payload.mode;
  const plannedDate = str(payload.plannedDate);
  if (!["delivery", "supplier_pickup", "customer_pickup"].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate ?? ""))
    throw new Error("Modalidad y fecha v\xE1lidas son obligatorias.");
  const shipmentId = payload.shipmentId;
  const providerId = str(payload.providerId);
  if (mode === "supplier_pickup" && !providerId || mode !== "supplier_pickup" && !shipmentId)
    throw new Error("Seleccione el viaje o proveedor correspondiente.");
  const config = await listConfiguration();
  const orders2 = await getOrders();
  const shipmentOrder = orders2.find((order) => order.shipments?.some((shipment) => String(shipment.id) === String(shipmentId)));
  if (mode !== "supplier_pickup" && !shipmentOrder) throw new Error("Viaje no encontrado.");
  const vehicleId = mode === "customer_pickup" ? void 0 : str(payload.vehicleId);
  const vehicle = config.vehicles.find((item) => item.id === vehicleId);
  const driverId = mode === "customer_pickup" ? void 0 : str(payload.driverId) || vehicle?.habitualDriverId;
  if (vehicleId && !vehicle || driverId && !config.drivers.some((item) => item.id === driverId))
    throw new Error("Veh\xEDculo o chofer no encontrado.");
  const provider = mode === "supplier_pickup" ? (await getProviders()).find((item) => item.id === providerId) : void 0;
  if (mode === "supplier_pickup" && !provider) throw new Error("Proveedor no encontrado.");
  const destinationLocation = config.locations.find((item) => item.entityType === (mode === "supplier_pickup" ? "provider" : "client") && item.entityId === (mode === "supplier_pickup" ? providerId : shipmentOrder?.clientId));
  const previousRun = config.runs.find((item) => String(item.id) === String(payload.id));
  if (payload.id !== void 0 && !previousRun) throw new Error("Salida no encontrada.");
  const plannedStartAt = str(payload.plannedStartAt);
  const plannedEndAt = str(payload.plannedEndAt);
  if (plannedStartAt && !Number.isFinite(Date.parse(plannedStartAt)) || plannedEndAt && !Number.isFinite(Date.parse(plannedEndAt)) || plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt)
    throw new Error("Horario de salida o regreso inv\xE1lido.");
  const run = {
    id: payload.id ?? `run-${crypto.randomUUID()}`,
    mode,
    shipmentId: mode === "supplier_pickup" ? void 0 : shipmentId,
    providerId: mode === "supplier_pickup" ? providerId : void 0,
    orderId: shipmentOrder?.id ?? str(payload.orderId),
    vehicleId,
    driverId,
    plannedDate,
    plannedStartAt,
    plannedEndAt,
    endTimeSource: str(payload.plannedEndAt) ? payload.endTimeSource ?? "manual" : void 0,
    destinationAddress: str(payload.destinationAddress)?.trim() || destinationLocation?.address || shipmentOrder?.deliveryAddress,
    destinationLatitude: num(payload.destinationLatitude) ?? destinationLocation?.latitude,
    destinationLongitude: num(payload.destinationLongitude) ?? destinationLocation?.longitude,
    destinationPrecision: payload.destinationPrecision ?? destinationLocation?.precision ?? "unknown",
    status: payload.status ?? "planned",
    note: str(payload.note),
    responsible: str(payload.responsible)?.trim() || "Operaci\xF3n"
  };
  const row = {
    mode: run.mode,
    shipment_id: run.shipmentId ?? null,
    provider_id: run.providerId ?? null,
    order_id: run.orderId ?? null,
    vehicle_id: run.vehicleId ?? null,
    driver_id: run.driverId ?? null,
    planned_date: run.plannedDate,
    planned_start_at: run.plannedStartAt ?? null,
    planned_end_at: run.plannedEndAt ?? null,
    end_time_source: run.endTimeSource ?? null,
    destination_address: run.destinationAddress ?? null,
    destination_latitude: run.destinationLatitude ?? null,
    destination_longitude: run.destinationLongitude ?? null,
    destination_precision: run.destinationPrecision ?? "unknown",
    status: run.status,
    note: run.note ?? null,
    responsible: run.responsible
  };
  let saved;
  if (memory) {
    saved = {
      ...previousRun,
      ...run,
      routeDistanceM: void 0,
      routeDurationS: void 0,
      routeGeometry: void 0,
      routeCheckedAt: void 0,
      routeStatus: void 0,
      routeReason: void 0
    };
    updateById(memoryRuns, String(run.id), saved, (item) => String(item.id));
  } else if (payload.id !== void 0) {
    const rows = await supabaseServerRequest(
      `/rest/v1/logistics_runs?id=eq.${encodeURIComponent(String(payload.id))}&select=*`,
      { method: "PATCH", prefer: "return=representation", body: JSON.stringify({
        ...row,
        route_distance_m: null,
        route_duration_s: null,
        route_geometry: null,
        route_checked_at: null,
        route_status: null,
        route_reason: null
      }) }
    );
    if (!rows.length) throw new Error("Salida no encontrada.");
    saved = runFromRow(rows[0]);
  } else {
    const rows = await supabaseServerRequest("/rest/v1/logistics_runs?select=*", { method: "POST", prefer: "return=representation", body: JSON.stringify(row) });
    saved = runFromRow(rows[0]);
  }
  if (saved.mode !== "customer_pickup" && saved.status === "planned" && saved.vehicleId && saved.plannedStartAt && saved.destinationAddress && process.env.OPENROUTESERVICE_API_KEY) {
    try {
      await evaluateLogisticsRoute(saved.id);
    } catch {
    }
  }
  return saved;
}
async function auditLoadedShipment(shipmentId) {
  const config = await listConfiguration();
  const run = config.runs.find((item) => String(item.shipmentId) === String(shipmentId));
  const vehicle = config.vehicles.find((item) => item.id === run?.vehicleId);
  if (!run || !vehicle) return [];
  const [orders2, products2] = await Promise.all([getOrders(), getProducts()]);
  const order = orders2.find((item) => item.shipments?.some((shipment2) => String(shipment2.id) === String(shipmentId)));
  const shipment = order?.shipments?.find((item) => String(item.id) === String(shipmentId));
  const counts = { small: 0, large: 0, unclassified: 0 };
  for (const line of shipment?.lines ?? []) {
    const productId = order?.lines.find((item) => item.id === line.orderLineId)?.productId;
    const product = products2.find((item) => item.id === productId);
    const kind = product ? classifyPallet(product, config.classes[product.id]) : "unclassified";
    counts[kind] += line.loadedQuantity ?? line.plannedQuantity;
  }
  const warnings = loadWarnings(counts);
  return warnings;
}
async function geocode(address, key) {
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("text", address);
  url.searchParams.set("size", "1");
  const response = await fetch(url, { signal: AbortSignal.timeout(12e3) });
  if (!response.ok) return void 0;
  const body = await response.json();
  const point = body.features?.[0]?.geometry?.coordinates;
  return point?.length === 2 ? [point[0], point[1]] : void 0;
}
async function evaluateLogisticsRoute(id) {
  const config = await listConfiguration();
  const run = config.runs.find((item) => String(item.id) === String(id));
  if (!run) throw new Error("Salida no encontrada.");
  const key = process.env.OPENROUTESERVICE_API_KEY;
  const settings = config.settings;
  let status = "no_data";
  let reason = "Faltan la clave de rutas o ubicaciones para estimar el recorrido.";
  let origin = settings.originLongitude !== void 0 && settings.originLatitude !== void 0 ? [settings.originLongitude, settings.originLatitude] : void 0;
  let destination = run.destinationLongitude !== void 0 && run.destinationLatitude !== void 0 ? [run.destinationLongitude, run.destinationLatitude] : void 0;
  let distance;
  let duration;
  let geometry;
  if (run.mode === "customer_pickup") {
    reason = "Retira el cliente: no se calcula un recorrido de la flota.";
  } else if (key && run.destinationAddress) {
    try {
      origin ??= await geocode(settings.originAddress, key);
      destination ??= await geocode(run.destinationAddress, key);
      if (origin && destination) {
        if (settings.originLatitude === void 0 && settings.originLongitude === void 0) {
          if (memory) memorySettings = { ...memorySettings, originLatitude: origin[1], originLongitude: origin[0] };
          else await supabaseServerRequest("/rest/v1/logistics_settings?id=eq.1", {
            method: "PATCH",
            body: JSON.stringify({ origin_latitude: origin[1], origin_longitude: origin[0] })
          });
        }
        const vehicle = config.vehicles.find((item) => item.id === run.vehicleId);
        const restrictions = Object.fromEntries([
          ["length", vehicle?.lengthM],
          ["width", vehicle?.widthM],
          ["height", vehicle?.heightM],
          ["weight", vehicle?.weightT]
        ].filter((pair) => typeof pair[1] === "number"));
        const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/json" },
          body: JSON.stringify({
            coordinates: [origin, destination, origin],
            options: { vehicle_type: "hgv", ...Object.keys(restrictions).length ? { profile_params: { restrictions } } : {} }
          }),
          signal: AbortSignal.timeout(16e3)
        });
        if (!response.ok) throw new Error(`Servicio de rutas: ${response.status}`);
        const body = await response.json();
        const route = body.features?.[0];
        if (!route) throw new Error("El servicio no devolvi\xF3 un recorrido.");
        geometry = route.geometry;
        distance = Math.round(route.properties.summary.distance);
        duration = Math.round(route.properties.summary.duration);
        const warnings = tripWarnings({ ...run, destinationLatitude: destination[1], destinationLongitude: destination[0] }, config.runs, settings);
        const dimensionMissing = Boolean(vehicle && [vehicle.lengthM, vehicle.widthM, vehicle.heightM, vehicle.weightT].some((value) => value === void 0));
        const timeMissing = !run.plannedStartAt || !settings.shiftStart || !settings.shiftEnd || settings.loadMinutes === void 0 || settings.unloadMinutes === void 0 || settings.marginMinutes === void 0 || settings.breakMinutes === void 0 || dimensionMissing;
        const handlingMinutes = (settings.loadMinutes ?? 0) + (settings.unloadMinutes ?? 0) + (settings.marginMinutes ?? 0) + (settings.breakMinutes ?? 0);
        const estimatedEnd = run.plannedStartAt ? new Date(new Date(run.plannedStartAt).getTime() + duration * 1e3 + handlingMinutes * 6e4).toISOString() : void 0;
        const evaluatedEnd = estimatedEnd;
        const shiftStart = run.plannedDate && settings.shiftStart ? (/* @__PURE__ */ new Date(`${run.plannedDate}T${settings.shiftStart.slice(0, 5)}:00-03:00`)).toISOString() : void 0;
        const shiftEnd = run.plannedDate && settings.shiftEnd ? (/* @__PURE__ */ new Date(`${run.plannedDate}T${settings.shiftEnd.slice(0, 5)}:00-03:00`)).toISOString() : void 0;
        const overlap = warnings.some((message) => message.includes("solapa")) || config.runs.some((other) => {
          if (String(other.id) === String(run.id) || other.status === "cancelled" || !other.plannedStartAt || !run.plannedStartAt) return false;
          if (!(run.vehicleId && run.vehicleId === other.vehicleId || run.driverId && run.driverId === other.driverId)) return false;
          const otherEnd = other.plannedEndAt || (other.routeDurationS !== void 0 ? new Date(new Date(other.plannedStartAt).getTime() + other.routeDurationS * 1e3 + handlingMinutes * 6e4).toISOString() : void 0);
          return Boolean(otherEnd && run.plannedStartAt < otherEnd && other.plannedStartAt < (evaluatedEnd ?? ""));
        });
        const outsideShift = Boolean(run.plannedStartAt && shiftStart && run.plannedStartAt < shiftStart || evaluatedEnd && shiftEnd && evaluatedEnd > shiftEnd);
        status = timeMissing ? "no_data" : overlap || outsideShift ? "not_viable" : warnings.length ? "tight" : "viable";
        reason = timeMissing ? dimensionMissing ? "Faltan dimensiones del veh\xEDculo para evaluar restricciones de ruta." : "Faltan horarios o tiempos de carga, descarga, pausa y margen." : overlap ? "Hay solapamiento de veh\xEDculo o chofer." : status === "not_viable" ? "La vuelta cae fuera del turno." : warnings.join(" ") || "La vuelta entra en el horario configurado.";
        if (estimatedEnd) {
          run.plannedEndAt = estimatedEnd;
          run.endTimeSource = "route";
        }
      }
    } catch (error) {
      reason = error instanceof Error ? error.message : "No se pudo calcular la ruta.";
    }
  }
  const update = {
    destination_latitude: destination?.[1] ?? null,
    destination_longitude: destination?.[0] ?? null,
    route_distance_m: distance ?? null,
    route_duration_s: duration ?? null,
    route_geometry: geometry ?? null,
    route_checked_at: (/* @__PURE__ */ new Date()).toISOString(),
    route_status: status,
    route_reason: reason,
    planned_end_at: run.plannedEndAt ?? null,
    end_time_source: run.endTimeSource ?? null
  };
  if (memory) Object.assign(run, {
    destinationLatitude: destination?.[1],
    destinationLongitude: destination?.[0],
    routeDistanceM: distance,
    routeDurationS: duration,
    routeGeometry: geometry,
    routeCheckedAt: update.route_checked_at,
    routeStatus: status,
    routeReason: reason,
    plannedEndAt: run.plannedEndAt,
    endTimeSource: run.endTimeSource
  });
  else await supabaseServerRequest(`/rest/v1/logistics_runs?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", body: JSON.stringify(update) });
  return { status, reason, distanceM: distance, durationS: duration, geometry, origin, destination, checkedAt: update.route_checked_at };
}
var memory, defaultDrivers, defaultVehicles, defaultSettings, memoryDrivers, memoryVehicles, memorySettings, memoryClasses, memoryLocations, memoryTransportCapacities, memoryClientLimits, memoryRuns;
var init_logistics_store = __esm({
  "app/api/logistics-store.ts"() {
    "use strict";
    init_logistics();
    init_store();
    init_supabase();
    memory = process.env.ECOASE_DATA_BACKEND === "memory";
    defaultDrivers = [{ id: "susalla", name: "Susalla", active: true }, { id: "giossa", name: "Giossa", active: true }];
    defaultVehicles = [
      { id: "howo", name: "HOWO grande", smallCapacity: 638, largeCapacity: 273, active: true },
      { id: "vw_camion", name: "Volkswagen cami\xF3n", smallCapacity: 638, largeCapacity: 273, habitualDriverId: "susalla", active: true },
      { id: "vw_tractor", name: "Volkswagen tractor", smallCapacity: 560, largeCapacity: 251, habitualDriverId: "giossa", active: true },
      { id: "internacional", name: "Internacional", smallCapacity: 638, largeCapacity: 273, active: true }
    ];
    defaultSettings = { originAddress: "Paysand\xFA, Uruguay", originPrecision: "city" };
    memoryDrivers = structuredClone(defaultDrivers);
    memoryVehicles = structuredClone(defaultVehicles);
    memorySettings = { ...defaultSettings };
    memoryClasses = /* @__PURE__ */ new Map();
    memoryLocations = [];
    memoryTransportCapacities = [];
    memoryClientLimits = [];
    memoryRuns = [];
  }
});

// app/api/calendar/route.ts
var route_exports = {};
__export(route_exports, {
  GET: () => GET
});
function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function productLabel2(value) {
  return canonicalProductName(value).trim();
}
function treatmentSummary(lines) {
  const labels = new Set(lines.map((line) => productHeatTreatmentLabel(line.product)).filter(Boolean));
  return ["Con HT", "Sin HT"].filter((label) => labels.has(label)).join(" y ");
}
async function GET(request) {
  const url = new URL(request.url);
  const hasRange = url.searchParams.has("from") || url.searchParams.has("to");
  const now = /* @__PURE__ */ new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from") : iso(monday);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to") : iso(sunday);
  if (from > to) return Response.json({ error: "El rango de fechas no es v\xE1lido." }, { status: 400 });
  const [orders2, capacity, providers2] = await Promise.all([getOrders(), getCapacity(from, to), getProviders()]);
  const calendar = orders2.filter((order) => hasRange || !isOrderClosed(order)).flatMap((order) => (order.shipments ?? []).filter((shipment) => shipment.status !== "cancelled" && (!hasRange || shipment.plannedDate >= from && shipment.plannedDate <= to)).map((shipment) => ({
    ...shipment,
    orderId: order.id,
    client: order.client,
    reference: order.reference,
    requestedDeliveryDate: order.requestedDeliveryDate,
    totalQuantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0),
    productLines: shipment.lines.map((line) => `${productLabel2(line.product)} (${line.plannedQuantity})`),
    productSummary: shipment.lines.map((line) => `${productLabel2(line.product)} (${line.plannedQuantity})`).join(" \xB7 "),
    treatmentSummary: treatmentSummary(shipment.lines)
  })));
  const inRange = (date) => Boolean(date && date >= from && date <= to);
  const production = orders2.filter((order) => getOrderOperationalStatus(order) !== "cancelled").flatMap((order) => {
    const byDay = /* @__PURE__ */ new Map();
    for (const line of order.lines) for (const allocation of line.productionAllocations ?? []) {
      if (allocation.status === "cancelled" || !inRange(allocation.plannedDate)) continue;
      byDay.set(allocation.plannedDate, (byDay.get(allocation.plannedDate) ?? 0) + allocation.plannedQuantity);
    }
    return Array.from(byDay, ([date, quantity]) => ({ id: `${order.id}-${date}`, orderId: order.id, client: order.client, date, quantity }));
  });
  const deliveries = orders2.filter((order) => getOrderOperationalStatus(order) !== "cancelled").flatMap((order) => {
    const date = getOrderRequestedDate(order);
    return inRange(date) ? [{ id: `${order.id}-entrega`, orderId: order.id, client: order.client, date, quantity: order.requested }] : [];
  });
  const runs = await getTransportRuns(from, to);
  const time = (value) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
  const transport = runs.flatMap((run) => {
    const order = orders2.find((item) => item.id === run.orderId);
    const shipment = order?.shipments?.find((item) => String(item.id) === String(run.shipmentId));
    if (run.mode !== "supplier_pickup" && !order) return [];
    const quantity = shipment?.lines.reduce((sum, line) => sum + (line.loadedQuantity ?? line.plannedQuantity), 0);
    const start = time(run.plannedStartAt), end = time(run.plannedEndAt);
    const detail = run.mode === "customer_pickup" ? "Retira el cliente" : run.vehicleName ?? shipment?.transportLabel ?? "Transporte tercero";
    return [{
      id: `run-${run.id}`,
      orderId: order?.id,
      client: run.mode === "supplier_pickup" ? "Retiro de proveedor" : order.client,
      date: run.plannedDate,
      quantity,
      detail,
      time: [start, end].filter(Boolean).join(" a ") || void 0,
      done: run.status === "completed" || shipment?.status === "delivered"
    }];
  });
  return Response.json({ from, to, calendar, transport, production, deliveries, capacity, transporters: providers2.filter((provider) => provider.type === "Transporte").map((provider) => ({ id: provider.id, name: provider.name })) });
}
var init_route = __esm({
  "app/api/calendar/route.ts"() {
    "use strict";
    init_store();
    init_logistics_store();
    init_data();
    init_classification();
  }
});

// app/api/capacity/adjustments/route.ts
var route_exports2 = {};
__export(route_exports2, {
  PUT: () => PUT
});
async function PUT(request) {
  const payload = await request.json();
  const adjustment = Number(payload.palletAdjustment);
  const peopleCount = payload.peopleCount === void 0 ? void 0 : Number(payload.peopleCount);
  const responsible = payload.responsible?.trim() ?? "";
  const validDate = Boolean(payload.date && isoDate.test(payload.date));
  const validAmount = Number.isInteger(adjustment);
  const validPeople = payload.resourceType === "internal_production" ? peopleCount !== void 0 && Number.isInteger(peopleCount) && peopleCount >= 0 : peopleCount === void 0;
  const providers2 = await getProviders();
  const validResource = payload.resourceType === "internal_production" && Boolean(payload.operation && operations.includes(payload.operation)) && !payload.providerId && !payload.source || payload.resourceType === "external_production" && Boolean(payload.operation && operations.includes(payload.operation)) && providers2.some((provider) => provider.id === payload.providerId && provider.type === "Aserradero") && !payload.source || payload.resourceType === "transport" && Boolean(payload.source && ["internal", "external"].includes(payload.source)) && !payload.operation && (payload.source === "internal" ? !payload.providerId : providers2.some((provider) => provider.id === payload.providerId && provider.type === "Transporte"));
  if (payload.resourceType === "internal_production" && validDate && validPeople) {
    const day = (await getCapacity(payload.date, payload.date)).days[0];
    const operation = day?.internalProduction.find((entry) => entry.operation === payload.operation);
    const maximum = day?.internalTeam.availablePeople === void 0 || !operation ? void 0 : Math.max(day.internalTeam.availablePeople - day.internalTeam.basePeople - (day.internalTeam.additionalPeople - operation.peopleAdditional), 0);
    if (maximum !== void 0 && peopleCount > maximum) {
      return Response.json({ error: `Solo hay ${maximum} personas disponibles para refuerzo en esa fecha.` }, { status: 400 });
    }
  }
  const requiresResponsible = payload.resourceType !== "internal_production" && adjustment !== 0;
  if (!validDate || !validAmount || !validPeople || !validResource || requiresResponsible && !responsible) {
    return Response.json({ error: "Indique las personas asignadas o el recurso que aporta la capacidad para ese d\xEDa." }, { status: 400 });
  }
  return Response.json({ adjustment: await saveCapacityAdjustment({
    date: payload.date,
    resourceType: payload.resourceType,
    operation: payload.operation,
    source: payload.source,
    providerId: payload.providerId,
    palletAdjustment: adjustment,
    peopleCount,
    responsible: responsible || void 0,
    status: payload.status
  }) });
}
var isoDate, operations;
var init_route2 = __esm({
  "app/api/capacity/adjustments/route.ts"() {
    "use strict";
    init_store();
    isoDate = /^\d{4}-\d{2}-\d{2}$/;
    operations = ["assembly", "marking", "ht"];
  }
});

// app/api/capacity/internal-production/route.ts
var route_exports3 = {};
__export(route_exports3, {
  PUT: () => PUT2
});
async function PUT2(request) {
  const payload = await request.json();
  const peopleCount = Number(payload.peopleCount);
  const manualCapacity = payload.manualCapacity === null || payload.manualCapacity === void 0 || payload.manualCapacity === "" ? void 0 : Number(payload.manualCapacity);
  if (!payload.operation || !operations2.includes(payload.operation) || !Number.isInteger(peopleCount) || peopleCount < 0 || manualCapacity !== void 0 && (!Number.isInteger(manualCapacity) || manualCapacity < 0)) {
    return Response.json({ error: "Revise la operaci\xF3n, la dotaci\xF3n y la capacidad." }, { status: 400 });
  }
  return Response.json({ entry: await saveInternalProduction({ operation: payload.operation, peopleCount, manualCapacity }) });
}
var operations2;
var init_route3 = __esm({
  "app/api/capacity/internal-production/route.ts"() {
    "use strict";
    init_store();
    operations2 = ["assembly", "marking", "ht"];
  }
});

// app/api/capacity/resources/route.ts
var route_exports4 = {};
__export(route_exports4, {
  GET: () => GET2,
  PATCH: () => PATCH,
  POST: () => POST
});
async function GET2() {
  const today = iso2(/* @__PURE__ */ new Date());
  return Response.json({ resources: (await getCapacity(today, today)).production.resources });
}
async function POST(request) {
  try {
    const payload = await request.json();
    const resourceType = payload.resourceType;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const providerId = typeof payload.providerId === "string" ? payload.providerId.trim() : void 0;
    const displayOrder = payload.displayOrder === void 0 ? 100 : Number(payload.displayOrder);
    const providers2 = await getProviders();
    if (!name || !types.includes(resourceType) || !Number.isInteger(displayOrder) || displayOrder < 0 || resourceType === "external_supplier" !== Boolean(providerId) || providerId && !providers2.some((provider) => provider.id === providerId && provider.type === "Aserradero")) {
      return Response.json({ error: "Revise nombre, tipo, proveedor y orden del recurso." }, { status: 400 });
    }
    return Response.json({ resource: await createProductionResource({ name, resourceType, providerId, displayOrder }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el recurso." }, { status: 400 });
  }
}
async function PATCH(request) {
  try {
    const payload = await request.json();
    const id = typeof payload.id === "string" || typeof payload.id === "number" ? payload.id : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : void 0;
    const active = typeof payload.active === "boolean" ? payload.active : void 0;
    const displayOrder = payload.displayOrder === void 0 ? void 0 : Number(payload.displayOrder);
    const kinds2 = ["Pallet", "Bin", "Piso"];
    const productKinds2 = payload.productKinds === void 0 ? void 0 : Array.isArray(payload.productKinds) ? payload.productKinds.filter((item) => kinds2.includes(item)) : null;
    if (!id || name === "" || displayOrder !== void 0 && (!Number.isInteger(displayOrder) || displayOrder < 0) || name === void 0 && active === void 0 && displayOrder === void 0 && productKinds2 === void 0) return Response.json({ error: "Indique el recurso y al menos un cambio v\xE1lido." }, { status: 400 });
    const resource = await updateProductionResource(id, { name, active, displayOrder, productKinds: productKinds2 && productKinds2.length === kinds2.length ? null : productKinds2 });
    return resource ? Response.json({ resource }) : Response.json({ error: "Recurso no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el recurso." }, { status: 400 });
  }
}
var types, iso2;
var init_route4 = __esm({
  "app/api/capacity/resources/route.ts"() {
    "use strict";
    init_store();
    types = ["internal_factory", "internal_crew", "external_supplier"];
    iso2 = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
});

// app/api/capacity/route.ts
var route_exports5 = {};
__export(route_exports5, {
  GET: () => GET3
});
async function GET3(request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isoDate2.test(from) || !isoDate2.test(to) || from > to) {
    return Response.json({ error: "Indique un rango de fechas v\xE1lido." }, { status: 400 });
  }
  return Response.json({ capacity: await getCapacity(from, to) });
}
var isoDate2;
var init_route5 = __esm({
  "app/api/capacity/route.ts"() {
    "use strict";
    init_store();
    isoDate2 = /^\d{4}-\d{2}-\d{2}$/;
  }
});

// app/api/capacity/rules/route.ts
var route_exports6 = {};
__export(route_exports6, {
  DELETE: () => DELETE,
  PATCH: () => PATCH2,
  POST: () => POST2
});
function parseRule(payload) {
  const resourceId = typeof payload.resourceId === "string" || typeof payload.resourceId === "number" ? payload.resourceId : "";
  const productId = typeof payload.productId === "string" ? payload.productId.trim() : "";
  const clientProductId = typeof payload.clientProductId === "string" || typeof payload.clientProductId === "number" ? payload.clientProductId : void 0;
  const peopleCount = payload.peopleCount === "" || payload.peopleCount === null || payload.peopleCount === void 0 ? void 0 : Number(payload.peopleCount);
  const configurationLabel = typeof payload.configurationLabel === "string" ? payload.configurationLabel.trim() : "";
  const normalUnitsPerDay = Number(payload.normalUnitsPerDay);
  const maximumUnitsPerDay = Number(payload.maximumUnitsPerDay);
  const validFrom = typeof payload.validFrom === "string" ? payload.validFrom : "";
  const validTo = typeof payload.validTo === "string" && payload.validTo ? payload.validTo : void 0;
  const source = typeof payload.source === "string" ? payload.source.trim() : "manual";
  const note = typeof payload.note === "string" ? payload.note.trim() || void 0 : void 0;
  if (!resourceId || !productId || !clientProductId || !configurationLabel || !source || !Number.isInteger(normalUnitsPerDay) || normalUnitsPerDay <= 0 || !Number.isInteger(maximumUnitsPerDay) || maximumUnitsPerDay < normalUnitsPerDay || peopleCount !== void 0 && (!Number.isInteger(peopleCount) || peopleCount <= 0) || !isoDate3.test(validFrom) || validTo !== void 0 && (!isoDate3.test(validTo) || validTo < validFrom)) return null;
  return { resourceId, productId, clientProductId, peopleCount, configurationLabel, normalUnitsPerDay, maximumUnitsPerDay, validFrom, validTo, source, note };
}
async function POST2(request) {
  try {
    const input = parseRule(await request.json());
    if (!input) return Response.json({ error: "Revise recurso, producto, configuraci\xF3n, capacidades y vigencia." }, { status: 400 });
    return Response.json({ rule: await createProductionRule(input) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la regla." }, { status: 400 });
  }
}
async function PATCH2(request) {
  try {
    const payload = await request.json();
    const id = typeof payload.id === "string" || typeof payload.id === "number" ? payload.id : "";
    const input = parseRule(payload);
    if (!id || !input) return Response.json({ error: "Revise la regla y todos sus valores." }, { status: 400 });
    const rule = await updateProductionRule(id, input);
    return rule ? Response.json({ rule }) : Response.json({ error: "Regla no encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo editar la regla." }, { status: 400 });
  }
}
async function DELETE(request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "Indique la regla que desea eliminar." }, { status: 400 });
    const deleted = await deleteProductionRule(id);
    return deleted ? Response.json({ deleted: true }) : Response.json({ error: "Regla no encontrada." }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar la regla.";
    return Response.json({ error: message }, { status: message.includes("est\xE1 siendo utilizada") ? 409 : 400 });
  }
}
var isoDate3;
var init_route6 = __esm({
  "app/api/capacity/rules/route.ts"() {
    "use strict";
    init_store();
    isoDate3 = /^\d{4}-\d{2}-\d{2}$/;
  }
});

// app/api/capacity/transport/route.ts
var route_exports7 = {};
__export(route_exports7, {
  PUT: () => PUT3
});
async function PUT3(request) {
  const payload = await request.json();
  const usesTripCapacity = payload.tripCapacity !== void 0;
  const capacity = Number(usesTripCapacity ? payload.tripCapacity : payload.palletCapacity);
  const provider = payload.source === "external" ? (await getProviders()).find((item) => item.id === payload.providerId && item.type === "Transporte") : void 0;
  if (!payload.source || !["internal", "external"].includes(payload.source) || payload.source === "external" && !provider || !Number.isInteger(capacity) || capacity < 0 || !payload.status || !["estimated", "confirmed"].includes(payload.status)) {
    return Response.json({ error: "Revise el origen, el transportista y la capacidad." }, { status: 400 });
  }
  const status = payload.source === "internal" ? "confirmed" : payload.status;
  const entry = usesTripCapacity ? await saveTransportTripCapacity({ source: payload.source, providerId: provider?.id, tripCapacity: capacity, status }) : await saveTransportCapacity({ source: payload.source, providerId: provider?.id, palletCapacity: capacity, status });
  return Response.json({ entry });
}
var init_route7 = __esm({
  "app/api/capacity/transport/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/capacity/trip-adjustments/route.ts
var route_exports8 = {};
__export(route_exports8, {
  PUT: () => PUT4
});
async function PUT4(request) {
  const payload = await request.json();
  const tripCapacity = Number(payload.tripCapacity);
  const responsible = payload.responsible?.trim() ?? "";
  const status = payload.source === "internal" ? "confirmed" : payload.status;
  const provider = payload.source === "external" ? (await getProviders()).find((item) => item.id === payload.providerId && item.type === "Transporte") : void 0;
  if (!payload.date || !isoDate4.test(payload.date) || !payload.source || !["internal", "external"].includes(payload.source) || payload.source === "external" && !provider || !Number.isInteger(tripCapacity) || tripCapacity < 0 || !status || !["estimated", "confirmed"].includes(status) || !responsible) {
    return Response.json({ error: "Revise la fecha, el origen, los cupos y el responsable." }, { status: 400 });
  }
  const day = (await getCapacity(payload.date, payload.date)).days[0];
  const current = day?.transport.find((entry) => entry.source === payload.source && (entry.providerId ?? "") === (provider?.id ?? ""));
  const tripAdjustment = tripCapacity - (current?.baseTripCapacity ?? 0);
  const adjustment = await saveTransportTripAdjustment({ date: payload.date, source: payload.source, providerId: provider?.id, tripAdjustment, responsible, status });
  return Response.json({ adjustment });
}
var isoDate4;
var init_route8 = __esm({
  "app/api/capacity/trip-adjustments/route.ts"() {
    "use strict";
    init_store();
    isoDate4 = /^\d{4}-\d{2}-\d{2}$/;
  }
});

// app/api/clients/route.ts
var route_exports9 = {};
__export(route_exports9, {
  GET: () => GET4,
  POST: () => POST3
});
async function GET4() {
  const clients = /* @__PURE__ */ new Map();
  (await getClients()).forEach((client) => clients.set(client.name, { id: client.id, name: client.name, address: client.address, department: client.department, active: client.active, updatedAt: client.updatedAt, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0, activePallets: 0 }));
  (await getOrders()).forEach((order) => {
    const client = clients.get(order.client) ?? { name: order.client, orders: 0, requested: 0, delivered: 0, pending: 0, activeOrders: 0, activePallets: 0 };
    client.orders += 1;
    client.requested += order.requested;
    client.delivered += order.delivered;
    client.pending += order.pending;
    if (!isOrderClosed(order)) {
      client.activeOrders += 1;
      client.activePallets += order.requested;
    }
    clients.set(order.client, client);
  });
  return Response.json({ clients: [...clients.values()] });
}
async function POST3(request) {
  try {
    const body = await request.json();
    const client = await createClient({ name: typeof body.name === "string" ? body.name : "", address: typeof body.address === "string" ? body.address : void 0, department: typeof body.department === "string" ? body.department : void 0 });
    return Response.json({ client }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el cliente." }, { status: 400 });
  }
}
var init_route9 = __esm({
  "app/api/clients/route.ts"() {
    "use strict";
    init_store();
    init_data();
  }
});

// app/api/history/route.ts
var route_exports10 = {};
__export(route_exports10, {
  GET: () => GET5
});
async function GET5() {
  return Response.json({ history: (await getOrders()).filter(isOrderClosed) });
}
var init_route10 = __esm({
  "app/api/history/route.ts"() {
    "use strict";
    init_store();
    init_data();
  }
});

// app/api/logistics/config/route.ts
var route_exports11 = {};
__export(route_exports11, {
  GET: () => GET6,
  PUT: () => PUT5
});
async function GET6() {
  try {
    const { vehicles, drivers, settings, classes, locations, transportCapacities, clientLimits, limitsSchemaReady } = await getLogisticsSnapshot();
    return Response.json({ vehicles, drivers, settings, classes, locations, transportCapacities, clientLimits, limitsSchemaReady });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar la configuraci\xF3n." }, { status: 500 });
  }
}
async function PUT5(request) {
  try {
    const body = await request.json();
    const kind = body.kind;
    if (!kinds.includes(kind)) return Response.json({ error: "Configuraci\xF3n inv\xE1lida." }, { status: 400 });
    return Response.json({ value: await saveLogisticsConfig(kind, body) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuraci\xF3n." }, { status: 400 });
  }
}
var kinds;
var init_route11 = __esm({
  "app/api/logistics/config/route.ts"() {
    "use strict";
    init_logistics_store();
    kinds = ["settings", "vehicle", "driver", "class", "location", "transport_capacity", "client_limit"];
  }
});

// app/api/logistics/route.ts
var route_exports12 = {};
__export(route_exports12, {
  GET: () => GET7
});
async function GET7() {
  const logistics = (await getOrders()).filter((order) => !isOrderClosed(order)).map(({ id, client, reference, product, dateLabel, transport, logistics: logistics2, delivery }) => ({
    id,
    client,
    reference,
    product,
    dateLabel,
    transport,
    logistics: logistics2,
    delivery
  }));
  return Response.json({ logistics });
}
var init_route12 = __esm({
  "app/api/logistics/route.ts"() {
    "use strict";
    init_store();
    init_data();
  }
});

// app/api/logistics/runs/route.ts
var route_exports13 = {};
__export(route_exports13, {
  GET: () => GET8,
  PATCH: () => PATCH3,
  POST: () => POST4
});
async function GET8(request) {
  try {
    return Response.json({ runs: await getLogisticsRuns(new URL(request.url).searchParams.get("orderId") ?? void 0) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar las salidas." }, { status: 500 });
  }
}
async function POST4(request) {
  try {
    return Response.json({ run: await saveLogisticsRun(await request.json()) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la salida." }, { status: 400 });
  }
}
async function PATCH3(request) {
  return POST4(request);
}
var init_route13 = __esm({
  "app/api/logistics/runs/route.ts"() {
    "use strict";
    init_logistics_store();
  }
});

// app/api/logistics/snapshot/route.ts
var route_exports14 = {};
__export(route_exports14, {
  GET: () => GET9
});
async function GET9() {
  try {
    return Response.json(await getLogisticsSnapshot());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar Log\xEDstica." }, { status: 500 });
  }
}
var init_route14 = __esm({
  "app/api/logistics/snapshot/route.ts"() {
    "use strict";
    init_logistics_store();
  }
});

// app/api/orders/route.ts
var route_exports15 = {};
__export(route_exports15, {
  GET: () => GET10,
  POST: () => POST5
});
async function GET10() {
  return Response.json({ orders: (await getOrders()).filter((order) => !isOrderClosed(order)) });
}
async function POST5(request) {
  const payload = await request.json();
  const rawLines = Array.isArray(payload.lines) ? payload.lines : payload.clientProductId !== void 0 ? [{ clientProductId: payload.clientProductId, quantity: payload.requested }] : [];
  const lines = rawLines.map((line) => ({ clientProductId: line.clientProductId, quantity: Number(line.quantity) })).filter((line) => (typeof line.clientProductId === "number" || typeof line.clientProductId === "string") && Number.isInteger(line.quantity) && line.quantity > 0);
  const orderDate = typeof payload.orderDate === "string" && isoDate5.test(payload.orderDate) ? payload.orderDate : "";
  const plannedDate = typeof payload.plannedDate === "string" && isoDate5.test(payload.plannedDate) ? payload.plannedDate : "";
  const requiredOperations = Array.isArray(payload.requiredOperations) ? payload.requiredOperations.filter((item) => operations3.includes(item)) : [];
  if (!lines.length || !orderDate || !plannedDate) {
    return Response.json({ error: "Cliente, al menos un producto con cantidad, fecha del pedido y fecha de entrega son obligatorios." }, { status: 400 });
  }
  try {
    const order = await createOrder({
      lines,
      orderDate,
      plannedDate,
      deliveryDateNote: typeof payload.deliveryDateNote === "string" ? payload.deliveryDateNote : void 0,
      notes: typeof payload.notes === "string" ? payload.notes : void 0,
      requiredOperations: requiredOperations.length ? ["assembly", ...requiredOperations.filter((item) => item !== "assembly")] : ["assembly"]
    });
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el pedido." }, { status: 400 });
  }
}
var isoDate5, operations3;
var init_route15 = __esm({
  "app/api/orders/route.ts"() {
    "use strict";
    init_store();
    init_data();
    isoDate5 = /^\d{4}-\d{2}-\d{2}$/;
    operations3 = ["assembly", "treatment"];
  }
});

// app/api/product-levels/route.ts
var route_exports16 = {};
__export(route_exports16, {
  GET: () => GET11,
  PUT: () => PUT6
});
async function snapshot() {
  const [levels, products2] = await Promise.all([getProductLevels(), getProducts()]);
  return { levels, usage: countLevelUsage(products2, levels) };
}
async function GET11() {
  try {
    return Response.json(await snapshot());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar los niveles." }, { status: 500 });
  }
}
async function PUT6(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.levels)) return Response.json({ error: "Falta la lista de niveles." }, { status: 400 });
    await saveProductLevels(body.levels.map((item) => {
      const level = item && typeof item === "object" ? item : {};
      return { id: typeof level.id === "string" ? level.id : void 0, label: typeof level.label === "string" ? level.label : void 0, options: level.options };
    }));
    return Response.json(await snapshot());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar los niveles." }, { status: 400 });
  }
}
var init_route16 = __esm({
  "app/api/product-levels/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/products/parse.ts
function parseClassification(body) {
  return { measure: text(body.measure), attributes: cleanAttributes(body.attributes) };
}
function parseKind(value) {
  return typeof value === "string" && productKinds.has(value) ? value : void 0;
}
function parseClientIds(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : void 0;
}
function parseHeightCm(body) {
  if (!("heightCm" in body)) return void 0;
  if (body.heightCm === null || body.heightCm === "") return null;
  if (typeof body.heightCm !== "number" || !Number.isFinite(body.heightCm) || body.heightCm <= 0 || body.heightCm > 99999.99 || Math.abs(body.heightCm * 100 - Math.round(body.heightCm * 100)) > 1e-8)
    throw new Error("La altura debe ser positiva y tener como m\xE1ximo dos decimales.");
  return body.heightCm;
}
function parseRequiresTreatment(body) {
  return typeof body.requiresTreatment === "boolean" ? body.requiresTreatment : void 0;
}
var productKinds, text;
var init_parse = __esm({
  "app/api/products/parse.ts"() {
    "use strict";
    init_classification();
    productKinds = /* @__PURE__ */ new Set(["Pallet", "Piso", "Bin"]);
    text = (value) => typeof value === "string" && value.trim() ? value.trim() : void 0;
  }
});

// app/api/products/route.ts
var route_exports17 = {};
__export(route_exports17, {
  GET: () => GET12,
  POST: () => POST6
});
async function GET12() {
  return Response.json({ products: await getProducts() });
}
async function POST6(request) {
  try {
    const body = await request.json();
    const kind = parseKind(body.kind);
    if (!kind) return Response.json({ error: "Revise el tipo del producto." }, { status: 400 });
    const product = await createProduct({
      kind,
      ...parseClassification(body),
      heightCm: parseHeightCm(body),
      requiresTreatment: parseRequiresTreatment(body),
      zetaCode: typeof body.zetaCode === "string" ? body.zetaCode : "",
      stockName: typeof body.stockName === "string" ? body.stockName : void 0,
      clientIds: parseClientIds(body.clientIds) ?? []
    });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el producto." }, { status: 400 });
  }
}
var init_route17 = __esm({
  "app/api/products/route.ts"() {
    "use strict";
    init_store();
    init_parse();
  }
});

// app/api/providers/route.ts
var route_exports18 = {};
__export(route_exports18, {
  GET: () => GET13,
  POST: () => POST7
});
async function GET13() {
  return Response.json({ providers: await getProviders() });
}
async function POST7(request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name : "";
    const type = typeof body.type === "string" ? body.type : "";
    const supplies = typeof body.supplies === "string" ? body.supplies : "";
    const provider = await createProvider({ name, type, supplies });
    return Response.json({ provider }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el proveedor." },
      { status: 400 }
    );
  }
}
var init_route18 = __esm({
  "app/api/providers/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/stock/movements/adjustments/route.ts
var route_exports19 = {};
__export(route_exports19, {
  POST: () => POST8
});
async function POST8(request) {
  try {
    const body = await request.json();
    const quantityDelta = Number(body.quantityDelta);
    const stockState = body.stockState === "ready" ? "ready" : body.stockState === "pending_treatment" ? "pending_treatment" : null;
    const input = { productId: typeof body.productId === "string" ? body.productId : "", stockState, quantityDelta, occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : "", responsible: typeof body.responsible === "string" ? body.responsible.trim() : "", reason: typeof body.reason === "string" ? body.reason.trim() : "" };
    if (!input.productId || !stockState || !Number.isInteger(quantityDelta) || quantityDelta === 0 || Number.isNaN(Date.parse(input.occurredAt)) || !input.responsible || !input.reason) return Response.json({ error: "Complete estado, diferencia, momento, responsable y motivo." }, { status: 400 });
    return Response.json({ movementId: await recordStockAdjustment({ productId: input.productId, stockState, quantityDelta, occurredAt: input.occurredAt, responsible: input.responsible, reason: input.reason }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el ajuste." }, { status: 400 });
  }
}
var init_route19 = __esm({
  "app/api/stock/movements/adjustments/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/stock/movements/receipts/route.ts
var route_exports20 = {};
__export(route_exports20, {
  POST: () => POST9
});
async function POST9(request) {
  try {
    const body = await request.json();
    const quantity = Number(body.quantity);
    const productId = typeof body.productId === "string" ? body.productId : "";
    const stockState = body.stockState === "ready" ? "ready" : body.stockState === "pending_treatment" ? "pending_treatment" : null;
    const movementType = ["internal_production", "supplier_receipt", "return"].includes(String(body.movementType)) ? body.movementType : null;
    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : "";
    const responsible = typeof body.responsible === "string" ? body.responsible.trim() : "";
    if (!productId || !stockState || !movementType || !Number.isInteger(quantity) || quantity <= 0 || Number.isNaN(Date.parse(occurredAt)) || !responsible) return Response.json({ error: "Complete producto, estado, cantidad, momento y responsable." }, { status: 400 });
    const movementId = await recordStockReceipt({ productId, stockState, quantity, movementType, providerId: typeof body.providerId === "string" ? body.providerId : void 0, sourceReference: typeof body.sourceReference === "string" ? body.sourceReference : void 0, occurredAt, responsible, note: typeof body.note === "string" ? body.note : void 0 });
    return Response.json({ movementId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar la entrada." }, { status: 400 });
  }
}
var init_route20 = __esm({
  "app/api/stock/movements/receipts/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/stock/summary/route.ts
var route_exports21 = {};
__export(route_exports21, {
  GET: () => GET14
});
async function GET14(request) {
  try {
    const includeOrderCommitments = new URL(request.url).searchParams.get("destinos") === "1";
    const [stock, imports] = await Promise.all([getStockSummary(includeOrderCommitments), getStockImportReport()]);
    return Response.json({ stock, imports });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el stock." }, { status: 500 });
  }
}
var init_route21 = __esm({
  "app/api/stock/summary/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/treatment/batches/route.ts
var route_exports22 = {};
__export(route_exports22, {
  POST: () => POST10
});
async function POST10(request) {
  try {
    const body = await request.json();
    const controls = Array.isArray(body.controls) ? body.controls.map((item) => item).map((item) => ({
      controlId: typeof item.controlId === "string" || typeof item.controlId === "number" ? item.controlId : "",
      result: item.result,
      note: typeof item.note === "string" ? item.note : void 0
    })) : [];
    const input = {
      productId: typeof body.productId === "string" ? body.productId : "",
      clientProductId: typeof body.clientProductId === "string" || typeof body.clientProductId === "number" ? body.clientProductId : void 0,
      orderLineId: typeof body.orderLineId === "string" && body.orderLineId ? body.orderLineId : void 0,
      quantity: Number(body.quantity),
      performedAt: typeof body.performedAt === "string" ? body.performedAt : "",
      responsible: typeof body.responsible === "string" ? body.responsible : "",
      note: typeof body.note === "string" ? body.note : void 0,
      controls
    };
    if (!input.productId || !Number.isInteger(input.quantity) || input.quantity <= 0 || !input.responsible.trim() || Number.isNaN(Date.parse(input.performedAt)) || controls.some((control) => !control.controlId || !["pass", "fail"].includes(control.result))) {
      return Response.json({ error: "Revise producto, cantidad, momento, responsable y controles." }, { status: 400 });
    }
    return Response.json({ result: await recordTreatmentBatch(input) }, { status: 201 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el HT." }, { status: Number.isFinite(status) ? status : 400 });
  }
}
var init_route22 = __esm({
  "app/api/treatment/batches/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/treatment/options/route.ts
var route_exports23 = {};
__export(route_exports23, {
  GET: () => GET15
});
async function GET15() {
  try {
    return Response.json({ options: await getTreatmentOptions() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar las opciones de HT." }, { status: 500 });
  }
}
var init_route23 = __esm({
  "app/api/treatment/options/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/drying.ts
var dryingDayMs, parseDryingDay, shiftDryingDay;
var init_drying = __esm({
  "app/drying.ts"() {
    "use strict";
    init_classification();
    init_master_data();
    dryingDayMs = 864e5;
    parseDryingDay = (date) => /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
    shiftDryingDay = (date, days) => new Date(parseDryingDay(date).valueOf() + days * dryingDayMs).toISOString().slice(0, 10);
  }
});

// app/api/treatment/results/route.ts
var route_exports24 = {};
__export(route_exports24, {
  GET: () => GET16,
  POST: () => POST11
});
function validDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parseDryingDay(value).valueOf()) && shiftDryingDay(value, 0) === value;
}
async function GET16(request) {
  const query = new URL(request.url).searchParams;
  const from = query.get("from");
  const to = query.get("to");
  if (!validDay(from) || !validDay(to) || to < from || to > shiftDryingDay(from, 6)) {
    return Response.json({ error: "Indique un rango de hasta siete d\xEDas." }, { status: 400 });
  }
  try {
    return Response.json({ week: await getTreatmentWeek(from, to) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar los resultados de HT." }, { status: 500 });
  }
}
async function POST11(request) {
  try {
    const body = await request.json();
    const { orderId, orderLineId, date } = body;
    const responsible = typeof body.responsible === "string" ? body.responsible.replace(/\s+/g, " ").trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : void 0;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(/* @__PURE__ */ new Date());
    if (typeof orderId !== "string" || !orderId || typeof orderLineId !== "string" || !orderLineId || !validDay(date) || date > today || !responsible) {
      return Response.json({ error: "Revise el pedido, la fecha y el responsable." }, { status: 400 });
    }
    await recordTreatmentNotPerformed({ orderId, orderLineId, date, responsible, note });
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el resultado." }, { status: 400 });
  }
}
var init_route24 = __esm({
  "app/api/treatment/results/route.ts"() {
    "use strict";
    init_store();
    init_drying();
  }
});

// app/api/treatment/route.ts
var route_exports25 = {};
__export(route_exports25, {
  GET: () => GET17
});
async function GET17(request) {
  const date = new URL(request.url).searchParams.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(/* @__PURE__ */ new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Indique una fecha v\xE1lida." }, { status: 400 });
  try {
    return Response.json({ treatment: await getTreatmentDashboard(date) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el registro diario." }, { status: 500 });
  }
}
var init_route25 = __esm({
  "app/api/treatment/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/client-product-assets/[id]/content/route.ts
var route_exports26 = {};
__export(route_exports26, {
  GET: () => GET18
});
async function GET18(_request, { params }) {
  const { id } = await params;
  const content = getMemoryClientProductAssetContent(id);
  return content ? new Response(content.bytes, { headers: { "content-type": content.mimeType, "cache-control": "private, max-age=60" } }) : Response.json({ error: "Archivo no encontrado." }, { status: 404 });
}
var init_route26 = __esm({
  "app/api/client-product-assets/[id]/content/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/client-product-assets/[id]/route.ts
var route_exports27 = {};
__export(route_exports27, {
  DELETE: () => DELETE2
});
async function DELETE2(_request, { params }) {
  const { id } = await params;
  return await softDeleteClientProductAsset(id) ? new Response(null, { status: 204 }) : Response.json({ error: "Archivo no encontrado." }, { status: 404 });
}
var init_route27 = __esm({
  "app/api/client-product-assets/[id]/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/client-product-assets/[id]/signed-url/route.ts
var route_exports28 = {};
__export(route_exports28, {
  POST: () => POST12
});
async function POST12(_request, { params }) {
  const { id } = await params;
  const url = await getClientProductAssetUrl(id);
  return url ? Response.json({ url }) : Response.json({ error: "Archivo no encontrado." }, { status: 404 });
}
var init_route28 = __esm({
  "app/api/client-product-assets/[id]/signed-url/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/client-products/[id]/assets/route.ts
var route_exports29 = {};
__export(route_exports29, {
  POST: () => POST13
});
async function POST13(request, { params }) {
  const { id } = await params;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Seleccione un archivo." }, { status: 400 });
    const asset = await addClientProductAsset(id, file, { altText: String(form.get("altText") ?? ""), assetType: form.get("assetType") === "plan" ? "plan" : "photo", isPrimary: form.get("isPrimary") !== "false" });
    return Response.json({ asset }, { status: 201 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el archivo." }, { status });
  }
}
var init_route29 = __esm({
  "app/api/client-products/[id]/assets/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/client-products/[id]/controls/route.ts
var route_exports30 = {};
__export(route_exports30, {
  PUT: () => PUT7
});
async function PUT7(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const product = await replaceClientProductControls(id, (body.controls ?? []).map((control) => ({ title: typeof control.title === "string" ? control.title : "", detail: typeof control.detail === "string" ? control.detail : void 0, active: typeof control.active === "boolean" ? control.active : void 0 })));
    return product ? Response.json({ product }) : Response.json({ error: "Relaci\xF3n no encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar los controles." }, { status: 400 });
  }
}
var init_route30 = __esm({
  "app/api/client-products/[id]/controls/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/client-products/[id]/route.ts
var route_exports31 = {};
__export(route_exports31, {
  PATCH: () => PATCH4
});
async function PATCH4(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const product = await updateClientProduct(id, {
      operationalName: typeof body.operationalName === "string" ? body.operationalName : void 0,
      active: typeof body.active === "boolean" ? body.active : void 0,
      displayOrder: typeof body.displayOrder === "number" ? body.displayOrder : void 0
    });
    return product ? Response.json({ product }) : Response.json({ error: "Relaci\xF3n no encontrada." }, { status: 404 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && error.status === 409 ? 409 : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar." }, { status });
  }
}
var init_route31 = __esm({
  "app/api/client-products/[id]/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/clients/[clientId]/products/route.ts
var route_exports32 = {};
__export(route_exports32, {
  GET: () => GET19,
  POST: () => POST14
});
function statusOf(error) {
  return typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400;
}
async function GET19(request, { params }) {
  const { clientId } = await params;
  const activeOnly = new URL(request.url).searchParams.get("active") === "true";
  return Response.json({ products: await getClientProductOptions(clientId, activeOnly) });
}
async function POST14(request, { params }) {
  const { clientId } = await params;
  try {
    const body = await request.json();
    const product = await createClientProduct(clientId, {
      productId: typeof body.productId === "string" ? body.productId : "",
      operationalName: typeof body.operationalName === "string" ? body.operationalName : void 0,
      initialControl: typeof body.initialControl === "string" ? body.initialControl : "",
      displayOrder: typeof body.displayOrder === "number" ? body.displayOrder : void 0
    });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo habilitar el producto." }, { status: statusOf(error) });
  }
}
var init_route32 = __esm({
  "app/api/clients/[clientId]/products/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/clients/[clientId]/route.ts
var route_exports33 = {};
__export(route_exports33, {
  DELETE: () => DELETE3,
  GET: () => GET20,
  PATCH: () => PATCH5
});
async function GET20(_request, { params }) {
  const { clientId } = await params;
  const detail = await getClientDetail(clientId);
  return detail ? Response.json(detail) : Response.json({ error: "Cliente no encontrado." }, { status: 404 });
}
async function PATCH5(request, { params }) {
  const { clientId } = await params;
  try {
    const body = await request.json();
    const client = await updateClientMaster(clientId, { name: typeof body.name === "string" ? body.name : void 0, address: typeof body.address === "string" ? body.address : void 0, department: typeof body.department === "string" ? body.department : void 0, active: typeof body.active === "boolean" ? body.active : void 0 });
    return client ? Response.json({ client }) : Response.json({ error: "Cliente no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el cliente." }, { status: 400 });
  }
}
async function DELETE3(_request, { params }) {
  const { clientId } = await params;
  try {
    await deleteClient(clientId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el cliente." }, { status: 400 });
  }
}
var init_route33 = __esm({
  "app/api/clients/[clientId]/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/logistics/routes/[id]/route.ts
var route_exports34 = {};
__export(route_exports34, {
  POST: () => POST15
});
async function POST15(_request, context) {
  try {
    return Response.json(await evaluateLogisticsRoute((await context.params).id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo calcular la ruta." }, { status: 400 });
  }
}
var init_route34 = __esm({
  "app/api/logistics/routes/[id]/route.ts"() {
    "use strict";
    init_logistics_store();
  }
});

// app/api/order-lines/[id]/production-allocations/route.ts
var route_exports35 = {};
__export(route_exports35, {
  PUT: () => PUT8
});
async function PUT8(request, context) {
  const payload = await request.json();
  const allocations = Array.isArray(payload.allocations) ? payload.allocations.map((item) => ({ resourceId: typeof item.resourceId === "string" ? item.resourceId : void 0, plannedDate: typeof item.plannedDate === "string" ? item.plannedDate : "", plannedQuantity: Number(item.plannedQuantity), status: statuses.includes(item.status) ? item.status : "draft", note: typeof item.note === "string" ? item.note : void 0 })) : [];
  if (allocations.some((item) => !isoDate6.test(item.plannedDate) || !Number.isInteger(item.plannedQuantity) || item.plannedQuantity <= 0)) return Response.json({ error: "Revise fechas y cantidades." }, { status: 400 });
  try {
    const line = await replaceProductionAllocations((await context.params).id, allocations);
    return line ? Response.json({ line }) : Response.json({ error: "L\xEDnea no encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la producci\xF3n." }, { status: 400 });
  }
}
var isoDate6, statuses;
var init_route35 = __esm({
  "app/api/order-lines/[id]/production-allocations/route.ts"() {
    "use strict";
    init_store();
    isoDate6 = /^\d{4}-\d{2}-\d{2}$/;
    statuses = ["draft"];
  }
});

// app/api/orders/[id]/drying/route.ts
var route_exports36 = {};
__export(route_exports36, {
  POST: () => POST16
});
async function POST16(request, { params }) {
  const payload = await request.json();
  const startDate = typeof payload.startDate === "string" && isoDate7.test(payload.startDate) ? payload.startDate : "";
  const endDate = typeof payload.endDate === "string" && isoDate7.test(payload.endDate) ? payload.endDate : void 0;
  const allocations = Array.isArray(payload.allocations) ? payload.allocations.flatMap((item) => {
    const row = item;
    return typeof row.orderLineId === "string" && typeof row.date === "string" && isoDate7.test(row.date) && typeof row.quantity === "number" && Number.isInteger(row.quantity) && row.quantity > 0 ? [{ orderLineId: row.orderLineId, date: row.date, quantity: row.quantity }] : [];
  }) : void 0;
  if (!startDate && !allocations?.length) return Response.json({ error: "Indic\xE1 la fecha de inicio del secado." }, { status: 400 });
  try {
    const order = await planOrderDrying((await params).id, { startDate, endDate, note: typeof payload.note === "string" ? payload.note : void 0, allocations });
    return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo programar el secado." }, { status: 400 });
  }
}
var isoDate7;
var init_route36 = __esm({
  "app/api/orders/[id]/drying/route.ts"() {
    "use strict";
    init_store();
    isoDate7 = /^\d{4}-\d{2}-\d{2}$/;
  }
});

// app/api/orders/[id]/history/route.ts
var route_exports37 = {};
__export(route_exports37, {
  GET: () => GET21
});
async function GET21(_request, context) {
  const { id } = await context.params;
  return Response.json({ history: await getOrderHistory(id) });
}
var init_route37 = __esm({
  "app/api/orders/[id]/history/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/orders/[id]/production-plan/route.ts
var route_exports38 = {};
__export(route_exports38, {
  POST: () => POST17
});
async function POST17(request, { params }) {
  const payload = await request.json();
  const allocations = Array.isArray(payload.allocations) ? payload.allocations.map((item) => ({ orderLineId: String(item.orderLineId ?? ""), resourceId: String(item.resourceId ?? ""), plannedDate: String(item.plannedDate ?? ""), plannedQuantity: Number(item.plannedQuantity) })) : [];
  try {
    const order = await planOrderProduction((await params).id, allocations);
    return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la planificaci\xF3n." }, { status: 400 });
  }
}
var init_route38 = __esm({
  "app/api/orders/[id]/production-plan/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/orders/[id]/route.ts
var route_exports39 = {};
__export(route_exports39, {
  DELETE: () => DELETE4,
  GET: () => GET22,
  PATCH: () => PATCH6
});
async function GET22(_request, context) {
  const order = await getOrderDetail((await context.params).id);
  return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
}
async function PATCH6(request, context) {
  const { id } = await context.params;
  const payload = await request.json();
  const transportCandidate = typeof payload.transport === "string" ? payload.transport.trim() : void 0;
  const plannedDate = typeof payload.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate) ? payload.plannedDate : void 0;
  const requested = typeof payload.requested === "number" && Number.isFinite(payload.requested) && payload.requested > 0 ? payload.requested : void 0;
  const cancelled = payload.cancelled === true;
  const providers2 = await getProviders();
  const productionSource = typeof payload.productionSource === "string" && ["internal", "sawmill", "import"].includes(payload.productionSource) ? payload.productionSource : void 0;
  const transportSource = typeof payload.transportSource === "string" && ["internal", "external"].includes(payload.transportSource) ? payload.transportSource : transportCandidate ? "external" : void 0;
  const producerProviderId = typeof payload.producerProviderId === "string" ? payload.producerProviderId : void 0;
  const transportProviderId = typeof payload.transportProviderId === "string" ? payload.transportProviderId : void 0;
  const productionDate = typeof payload.productionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.productionDate) ? payload.productionDate : void 0;
  const importArrivalDate = typeof payload.importArrivalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.importArrivalDate) ? payload.importArrivalDate : void 0;
  const requiredOperations = Array.isArray(payload.requiredOperations) ? payload.requiredOperations.filter((value) => ["assembly", "treatment"].includes(String(value))) : void 0;
  const transporter = providers2.find((provider) => provider.id === transportProviderId) ?? providers2.find((provider) => provider.type === "Transporte" && provider.name === transportCandidate);
  const producer = providers2.find((provider) => provider.id === producerProviderId);
  if (productionSource === "sawmill" && producer?.type !== "Aserradero") return Response.json({ error: "Seleccione un aserradero registrado." }, { status: 400 });
  if (productionSource === "import" && (producer?.type !== "Importador" || !importArrivalDate)) return Response.json({ error: "Seleccione un importador y su fecha de llegada." }, { status: 400 });
  if (transportSource === "external" && transporter?.type !== "Transporte") return Response.json({ error: "Seleccione un transportista registrado." }, { status: 400 });
  const transport = transportSource === "internal" ? "Interno" : transporter?.name;
  if (!transport && !plannedDate && !requested && !cancelled && !productionSource && !productionDate && !importArrivalDate && !requiredOperations && !transportSource) {
    return Response.json({ error: "Indique al menos un cambio v\xE1lido." }, { status: 400 });
  }
  try {
    const result = await updateOrder(id, { transport, plannedDate, requested, stage: cancelled ? "cancelado" : void 0, productionSource, producerProviderId, productionDate, importArrivalDate, requiredOperations, transportSource, transportProviderId: transporter?.id });
    if (!result) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el pedido." }, { status: 400 });
  }
}
async function DELETE4(_request, context) {
  const { id } = await context.params;
  try {
    await deleteOrder(id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar el pedido.";
    return Response.json({ error: message }, { status: message === "Pedido no encontrado." ? 404 : 409 });
  }
}
var init_route39 = __esm({
  "app/api/orders/[id]/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/orders/[id]/shipments/route.ts
var route_exports40 = {};
__export(route_exports40, {
  POST: () => POST18
});
async function POST18(request, context) {
  const payload = await request.json();
  const lines = Array.isArray(payload.lines) ? payload.lines.map((item) => item).map((item) => ({ orderLineId: String(item.orderLineId ?? ""), plannedQuantity: Number(item.plannedQuantity) })) : [];
  const transportSource = payload.transportSource === "external" ? "external" : "internal";
  if (typeof payload.plannedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate) || !lines.length || lines.some((line) => !line.orderLineId || !Number.isInteger(line.plannedQuantity) || line.plannedQuantity <= 0)) return Response.json({ error: "Indique fecha y cantidades v\xE1lidas." }, { status: 400 });
  try {
    const shipment = await createShipment((await context.params).id, { plannedDate: payload.plannedDate, transportSource, transportProviderId: typeof payload.transportProviderId === "string" ? payload.transportProviderId : void 0, responsible: typeof payload.responsible === "string" ? payload.responsible : void 0, lines });
    return shipment ? Response.json({ shipment }, { status: 201 }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el viaje." }, { status: 400 });
  }
}
var init_route40 = __esm({
  "app/api/orders/[id]/shipments/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/orders/[id]/transport/route.ts
var route_exports41 = {};
__export(route_exports41, {
  POST: () => POST19
});
async function POST19(request, { params }) {
  const payload = await request.json();
  const source = payload.source === "internal" || payload.source === "external" ? payload.source : void 0;
  const providerId = typeof payload.providerId === "string" ? payload.providerId : void 0;
  const newProviderName = typeof payload.newProviderName === "string" ? payload.newProviderName : void 0;
  if (!source || !providerId && !newProviderName?.trim()) return Response.json({ error: "Eleg\xED un transporte interno o un transportista externo." }, { status: 400 });
  try {
    const order = await assignOrderTransport((await params).id, { source, providerId, newProviderName });
    return order ? Response.json({ order }) : Response.json({ error: "Pedido no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo asignar el transporte." }, { status: 400 });
  }
}
var init_route41 = __esm({
  "app/api/orders/[id]/transport/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/orders/[id]/updates/route.ts
var route_exports42 = {};
__export(route_exports42, {
  POST: () => POST20
});
async function POST20(request, { params }) {
  const { id } = await params;
  const payload = await request.json();
  const kind = payload.kind;
  if (!kind || !updateKinds.has(kind)) {
    return Response.json({ error: "Seleccione el tipo de actualizaci\xF3n." }, { status: 400 });
  }
  const deliveredQuantity = payload.deliveredQuantity === void 0 ? void 0 : Number(payload.deliveredQuantity);
  const dispatchedAt = typeof payload.dispatchedAt === "string" && payload.dispatchedAt ? payload.dispatchedAt : void 0;
  const deliveredAt = typeof payload.deliveredAt === "string" && payload.deliveredAt ? payload.deliveredAt : void 0;
  if (kind === "entrega" && (deliveredQuantity === void 0 || !Number.isInteger(deliveredQuantity) || deliveredQuantity <= 0)) {
    return Response.json({ error: "Indique una cantidad entregada mayor a cero." }, { status: 400 });
  }
  if (kind === "direccion" && !payload.deliveryAddress?.trim()) {
    return Response.json({ error: "Indique la direcci\xF3n de entrega." }, { status: 400 });
  }
  if (kind === "incidencia" && !payload.note?.trim()) {
    return Response.json({ error: "Describa la incidencia." }, { status: 400 });
  }
  try {
    const result = await recordOrderUpdate(id, {
      kind,
      deliveredQuantity,
      deliveryAddress: payload.deliveryAddress,
      dispatchedAt,
      deliveredAt,
      note: payload.note
    });
    if (!result) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la actualizaci\xF3n." }, { status: 400 });
  }
}
var updateKinds;
var init_route42 = __esm({
  "app/api/orders/[id]/updates/route.ts"() {
    "use strict";
    init_store();
    updateKinds = /* @__PURE__ */ new Set(["entrega", "direccion", "despacho", "incidencia"]);
  }
});

// app/api/production-allocations/[id]/complete/route.ts
var route_exports43 = {};
__export(route_exports43, {
  POST: () => POST21
});
async function POST21(request, context) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const actualQuantity = Number(payload.actualQuantity);
    const completionNote = typeof payload.completionNote === "string" ? payload.completionNote : void 0;
    if (!id || !Number.isInteger(actualQuantity) || actualQuantity < 0) return Response.json({ error: "Indique una cantidad real v\xE1lida." }, { status: 400 });
    await completeProductionAllocation(id, actualQuantity, completionNote);
    return Response.json({ completed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo completar la asignaci\xF3n." }, { status: 400 });
  }
}
var init_route43 = __esm({
  "app/api/production-allocations/[id]/complete/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/production-allocations/[id]/confirm/route.ts
var route_exports44 = {};
__export(route_exports44, {
  POST: () => POST22
});
async function POST22(request, context) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const resourceId = typeof payload.resourceId === "string" || typeof payload.resourceId === "number" ? payload.resourceId : "";
    const capacityRuleId = typeof payload.capacityRuleId === "string" || typeof payload.capacityRuleId === "number" ? payload.capacityRuleId : "";
    const overloadNote = typeof payload.overloadNote === "string" ? payload.overloadNote : void 0;
    if (!id || !resourceId || !capacityRuleId) return Response.json({ error: "Seleccione recurso y regla de capacidad." }, { status: 400 });
    await confirmProductionAllocation(id, resourceId, capacityRuleId, overloadNote);
    return Response.json({ confirmed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo confirmar la asignaci\xF3n." }, { status: 400 });
  }
}
var init_route44 = __esm({
  "app/api/production-allocations/[id]/confirm/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/production-allocations/[id]/move/route.ts
var route_exports45 = {};
__export(route_exports45, {
  PATCH: () => PATCH7
});
async function PATCH7(request, context) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const orderId = await moveProductionAllocation(id, typeof payload.plannedDate === "string" ? payload.plannedDate : "");
    return orderId ? Response.json({ orderId }) : Response.json({ error: "Asignaci\xF3n no encontrada." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo mover la asignaci\xF3n." }, { status: 400 });
  }
}
var init_route45 = __esm({
  "app/api/production-allocations/[id]/move/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/production-allocations/[id]/result/route.ts
var route_exports46 = {};
__export(route_exports46, {
  POST: () => POST23
});
async function POST23(request, context) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const actualQuantity = typeof payload.actualQuantity === "number" ? payload.actualQuantity : Number.NaN;
    const actualDate = typeof payload.actualDate === "string" ? payload.actualDate : "";
    const destination = payload.destination === "client" || payload.destination === "stock" ? payload.destination : void 0;
    const note = typeof payload.note === "string" ? payload.note : void 0;
    if (!id) return Response.json({ error: "Asignaci\xF3n no encontrada." }, { status: 400 });
    await recordProductionResult(id, actualQuantity, actualDate, destination, note);
    return Response.json({ recorded: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar la producci\xF3n." }, { status: 400 });
  }
}
var init_route46 = __esm({
  "app/api/production-allocations/[id]/result/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/products/[id]/route.ts
var route_exports47 = {};
__export(route_exports47, {
  DELETE: () => DELETE5,
  PATCH: () => PATCH8
});
async function PATCH8(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const kind = parseKind(body.kind);
    if (!kind) return Response.json({ error: "El tipo indicado no es v\xE1lido." }, { status: 400 });
    const product = await updateProduct(id, {
      kind,
      ...parseClassification(body),
      heightCm: parseHeightCm(body),
      requiresTreatment: parseRequiresTreatment(body),
      stockName: typeof body.stockName === "string" ? body.stockName : void 0,
      zetaCode: typeof body.zetaCode === "string" ? body.zetaCode : void 0,
      clientId: typeof body.clientId === "string" && body.clientId ? body.clientId : void 0,
      clientIds: parseClientIds(body.clientIds)
    });
    return Response.json({ product });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el producto." }, { status: 400 });
  }
}
async function DELETE5(_, { params }) {
  try {
    const { id } = await params;
    await deleteProduct(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el producto." }, { status: 409 });
  }
}
var init_route47 = __esm({
  "app/api/products/[id]/route.ts"() {
    "use strict";
    init_store();
    init_parse();
  }
});

// app/api/providers/[id]/route.ts
var route_exports48 = {};
__export(route_exports48, {
  DELETE: () => DELETE6,
  PATCH: () => PATCH9
});
async function PATCH9(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    let type;
    if (typeof body.type === "string") {
      if (!validProviderTypes.has(body.type)) {
        return Response.json({ error: "El tipo de proveedor indicado no es v\xE1lido." }, { status: 400 });
      }
      type = body.type;
    }
    const provider = await updateProvider(id, {
      name: typeof body.name === "string" ? body.name : void 0,
      type,
      supplies: typeof body.supplies === "string" ? body.supplies : void 0
    });
    return Response.json({ provider });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el proveedor." },
      { status: 400 }
    );
  }
}
async function DELETE6(_, { params }) {
  try {
    const { id } = await params;
    await deleteProvider(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar el proveedor." },
      { status: 400 }
    );
  }
}
var validProviderTypes;
var init_route48 = __esm({
  "app/api/providers/[id]/route.ts"() {
    "use strict";
    init_store();
    validProviderTypes = /* @__PURE__ */ new Set(["Aserradero", "Transporte", "Importador"]);
  }
});

// app/api/shipments/[id]/reschedule/route.ts
var route_exports49 = {};
__export(route_exports49, {
  POST: () => POST24
});
async function POST24(request, context) {
  const payload = await request.json();
  if (typeof payload.newDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.newDate) || !reasons.includes(payload.reason)) return Response.json({ error: "Fecha y motivo son obligatorios." }, { status: 400 });
  try {
    const shipment = await rescheduleShipment((await context.params).id, { newDate: payload.newDate, reason: payload.reason, note: typeof payload.note === "string" ? payload.note : void 0, responsible: typeof payload.responsible === "string" ? payload.responsible : void 0 });
    return shipment ? Response.json({ shipment }) : Response.json({ error: "Viaje no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo reprogramar." }, { status: 400 });
  }
}
var reasons;
var init_route49 = __esm({
  "app/api/shipments/[id]/reschedule/route.ts"() {
    "use strict";
    init_store();
    reasons = ["production", "logistics", "client", "weather", "other"];
  }
});

// app/api/shipments/[id]/route.ts
var route_exports50 = {};
__export(route_exports50, {
  PATCH: () => PATCH10
});
async function PATCH10(request, context) {
  const payload = await request.json();
  const lines = Array.isArray(payload.lines) ? payload.lines.map((item) => item).map((item) => ({ orderLineId: String(item.orderLineId ?? ""), plannedQuantity: Number(item.plannedQuantity) })) : [];
  if (typeof payload.plannedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.plannedDate) || !lines.length) return Response.json({ error: "Indique fecha y l\xEDneas v\xE1lidas." }, { status: 400 });
  try {
    const shipment = await updatePlannedShipment((await context.params).id, { plannedDate: payload.plannedDate, transportSource: payload.transportSource === "external" ? "external" : "internal", transportProviderId: typeof payload.transportProviderId === "string" ? payload.transportProviderId : void 0, responsible: typeof payload.responsible === "string" ? payload.responsible : void 0, lines });
    return shipment ? Response.json({ shipment }) : Response.json({ error: "Viaje no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo editar el viaje." }, { status: 400 });
  }
}
var init_route50 = __esm({
  "app/api/shipments/[id]/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/shipments/[id]/transition/route.ts
var route_exports51 = {};
__export(route_exports51, {
  POST: () => POST25
});
async function POST25(request, context) {
  const payload = await request.json();
  if (!statuses2.includes(payload.nextStatus)) return Response.json({ error: "Estado de viaje inv\xE1lido." }, { status: 400 });
  try {
    const shipment = await transitionShipment((await context.params).id, { nextStatus: payload.nextStatus, remittance: typeof payload.remittance === "string" ? payload.remittance : void 0, sharedRemittanceReason: typeof payload.sharedRemittanceReason === "string" ? payload.sharedRemittanceReason : void 0, responsible: typeof payload.responsible === "string" ? payload.responsible : void 0, deliveredLines: Array.isArray(payload.deliveredLines) ? payload.deliveredLines.map((item) => item).map((item) => ({ shipmentLineId: String(item.shipmentLineId ?? ""), deliveredQuantity: Number(item.deliveredQuantity) })) : [], loadedLines: Array.isArray(payload.loadedLines) ? payload.loadedLines.map((item) => item).map((item) => ({ shipmentLineId: String(item.shipmentLineId ?? ""), loadedQuantity: Number(item.loadedQuantity) })) : void 0 });
    let auditWarning;
    if (shipment && payload.nextStatus === "loaded") {
      try {
        await auditLoadedShipment(shipment.id);
      } catch (error) {
        auditWarning = error instanceof Error ? error.message : "No se pudo registrar la auditor\xEDa de capacidad.";
      }
    }
    return shipment ? Response.json({ shipment, ...auditWarning ? { auditWarning } : {} }) : Response.json({ error: "Viaje no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo avanzar el viaje." }, { status: 400 });
  }
}
var statuses2;
var init_route51 = __esm({
  "app/api/shipments/[id]/transition/route.ts"() {
    "use strict";
    init_store();
    init_logistics_store();
    statuses2 = ["ready", "loaded", "dispatched", "delivered", "cancelled"];
  }
});

// app/api/stock/[productId]/route.ts
var route_exports52 = {};
__export(route_exports52, {
  GET: () => GET23
});
async function GET23(_, { params }) {
  try {
    const stock = await getStockDetail((await params).productId);
    return stock ? Response.json({ stock }) : Response.json({ error: "Producto no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el producto." }, { status: 500 });
  }
}
var init_route52 = __esm({
  "app/api/stock/[productId]/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/stock/movements/[id]/reverse/route.ts
var route_exports53 = {};
__export(route_exports53, {
  POST: () => POST26
});
async function POST26(request, { params }) {
  try {
    const body = await request.json();
    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : "";
    const responsible = typeof body.responsible === "string" ? body.responsible.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (Number.isNaN(Date.parse(occurredAt)) || !responsible || !reason) return Response.json({ error: "Momento, responsable y motivo son obligatorios." }, { status: 400 });
    return Response.json({ movementId: await reverseStockMovement((await params).id, { occurredAt, responsible, reason }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo revertir el movimiento." }, { status: 400 });
  }
}
var init_route53 = __esm({
  "app/api/stock/movements/[id]/reverse/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/treatment/batches/[id]/reverse/route.ts
var route_exports54 = {};
__export(route_exports54, {
  POST: () => POST27
});
async function POST27(request, context) {
  try {
    const body = await request.json();
    const performedAt = typeof body.performedAt === "string" ? body.performedAt : "";
    const responsible = typeof body.responsible === "string" ? body.responsible.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!responsible || !note || Number.isNaN(Date.parse(performedAt))) return Response.json({ error: "Momento, responsable y motivo son obligatorios." }, { status: 400 });
    return Response.json({ result: await reverseTreatmentBatch((await context.params).id, { performedAt, responsible, note }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo revertir el lote." }, { status: 400 });
  }
}
var init_route54 = __esm({
  "app/api/treatment/batches/[id]/reverse/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/api/treatment/batches/[id]/route.ts
var route_exports55 = {};
__export(route_exports55, {
  GET: () => GET24
});
async function GET24(_request, context) {
  try {
    const batch = await getTreatmentBatchDetail((await context.params).id);
    return batch ? Response.json({ batch }) : Response.json({ error: "Lote no encontrado." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el lote." }, { status: 500 });
  }
}
var init_route55 = __esm({
  "app/api/treatment/batches/[id]/route.ts"() {
    "use strict";
    init_store();
  }
});

// app/mcp/operational.ts
function normalize(value) {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "");
}
function dateDiffInDays(from, to) {
  return Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);
}
function openShipmentDate(order) {
  return (order.shipments ?? []).filter((shipment) => !["delivered", "cancelled"].includes(shipment.status)).map((shipment) => shipment.plannedDate).sort()[0] ?? getOrderPlannedDate(order);
}
function filterOperationalOrders(orders2, filters) {
  const clientSet = new Set((filters.clients ?? []).map(normalize).filter(Boolean));
  return orders2.filter((order) => {
    if (isOrderClosed(order)) return false;
    const date = openShipmentDate(order);
    if (date < filters.from || date > filters.to) return false;
    return clientSet.size === 0 || clientSet.has(normalize(order.client));
  });
}
function buildOperationalAlerts(orders2, today) {
  const alerts = [];
  for (const order of orders2) {
    const plannedDate = openShipmentDate(order);
    const daysUntilDelivery = dateDiffInDays(today, plannedDate);
    const base = { orderId: order.id, reference: order.reference, client: order.client, plannedDate };
    if (daysUntilDelivery < 0) {
      alerts.push({
        ...base,
        id: `overdue:${order.id}`,
        severity: "critical",
        kind: "overdue",
        title: `${order.client}: entrega atrasada`,
        detail: `${order.reference} deb\xEDa entregarse el ${plannedDate} y mantiene ${order.pending} unidades pendientes.`,
        action: "Confirmar una nueva fecha y registrar el motivo de la reprogramaci\xF3n."
      });
    }
    for (const line of order.lines) {
      const treatmentPending = line.treatmentPendingQuantity;
      if (line.treatment && typeof treatmentPending === "number" && treatmentPending > 0 && daysUntilDelivery <= 3) {
        alerts.push({
          ...base,
          id: `treatment:${order.id}:${line.id}`,
          severity: daysUntilDelivery <= 1 ? "critical" : "high",
          kind: "treatment",
          title: `${order.client}: HT pendiente`,
          detail: `${line.product}: faltan tratar con HT ${treatmentPending} unidades y la entrega est\xE1 prevista para el ${plannedDate}.`,
          action: "Programar o confirmar el HT antes de preparar la carga."
        });
      }
      const activeAllocations = (line.productionAllocations ?? []).filter((allocation) => allocation.status !== "cancelled");
      const allocated = activeAllocations.reduce((sum, allocation) => sum + allocation.plannedQuantity, 0);
      if (allocated < line.quantity && daysUntilDelivery <= 7) {
        alerts.push({
          ...base,
          id: `production:${order.id}:${line.id}`,
          severity: daysUntilDelivery <= 3 ? "high" : "medium",
          kind: "production",
          title: `${order.client}: producci\xF3n incompleta`,
          detail: `${line.product}: hay ${allocated} de ${line.quantity} unidades asignadas a producci\xF3n.`,
          action: "Completar la asignaci\xF3n de producci\xF3n o definir otra fuente de abastecimiento."
        });
      }
    }
    const openShipments = (order.shipments ?? []).filter((shipment) => !["delivered", "cancelled"].includes(shipment.status));
    const transportMissing = openShipments.length === 0 || openShipments.some((shipment) => {
      const label = normalize(shipment.transportLabel ?? "");
      return !label || label === "transportista" || label === "no registrado";
    });
    if (transportMissing && daysUntilDelivery <= 3) {
      alerts.push({
        ...base,
        id: `transport:${order.id}`,
        severity: daysUntilDelivery <= 1 ? "critical" : "high",
        kind: "transport",
        title: `${order.client}: transporte sin confirmar`,
        detail: `${order.reference} est\xE1 previsto para el ${plannedDate} y no tiene un transporte confirmado.`,
        action: "Asignar transporte o reprogramar la entrega."
      });
    }
  }
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.plannedDate ?? "9999-12-31").localeCompare(b.plannedDate ?? "9999-12-31") || a.title.localeCompare(b.title, "es"));
}
function summarizeOrder(order) {
  const status = getOrderOperationalStatus(order);
  return {
    id: order.id,
    reference: order.reference,
    client: order.client,
    status,
    statusLabel: orderOperationalStatusLabels[status],
    plannedDate: openShipmentDate(order),
    requestedDeliveryDate: order.requestedDeliveryDate,
    requested: order.requested,
    delivered: order.delivered,
    pending: order.pending,
    transport: order.transport,
    products: order.lines.map((line) => ({
      id: line.id,
      product: line.product,
      quantity: line.quantity,
      treatment: line.treatment,
      treatedQuantity: line.treatedQuantity,
      treatmentPendingQuantity: line.treatmentPendingQuantity,
      production: (line.productionAllocations ?? []).map((allocation) => ({
        id: allocation.id,
        date: allocation.plannedDate,
        quantity: allocation.plannedQuantity,
        actualQuantity: allocation.actualQuantity,
        status: allocation.status,
        resourceId: allocation.resourceId ?? allocation.productionResourceId
      }))
    })),
    shipments: (order.shipments ?? []).map((shipment) => ({
      id: shipment.id,
      date: shipment.plannedDate,
      status: shipment.status,
      transport: shipment.transportLabel,
      remittance: shipment.remittance,
      quantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0)
    })),
    notes: order.notes,
    nextAction: order.action,
    source: order.source
  };
}
var severityRank;
var init_operational = __esm({
  "app/mcp/operational.ts"() {
    "use strict";
    init_data();
    severityRank = {
      critical: 0,
      high: 1,
      medium: 2
    };
  }
});

// app/mcp/bridge.ts
async function callApi({ method, path, query, body }) {
  const { dispatch: dispatch2 } = await Promise.resolve().then(() => (init_router(), router_exports));
  const url = new URL(`http://interno.ecoase${path}`);
  for (const [key, value] of Object.entries(query ?? {})) if (value !== void 0 && value !== "") url.searchParams.set(key, String(value));
  const init = { method, headers: { accept: "application/json", ...body !== void 0 ? { "content-type": "application/json" } : {} } };
  if (body !== void 0) init.body = JSON.stringify(body);
  const response = await dispatch2(new Request(url, init));
  const text2 = await response.text();
  let data = text2;
  if (!text2) data = { ok: response.ok };
  else {
    try {
      data = JSON.parse(text2);
    } catch {
    }
  }
  return { ok: response.ok, status: response.status, data };
}
function apiErrorMessage(response) {
  const data = response.data;
  const message = typeof data === "object" && data && typeof data.error === "string" ? data.error : typeof data === "string" && data ? data : "";
  if (response.status === 404) return message || "No se encontr\xF3 lo que se pidi\xF3. Revis\xE1 el identificador.";
  if (response.status === 405) return "Esa operaci\xF3n no est\xE1 disponible.";
  if (response.status >= 500) return message || "El servidor no pudo completar la operaci\xF3n. Prob\xE1 de nuevo en unos segundos.";
  return message || `La operaci\xF3n fue rechazada (c\xF3digo ${response.status}).`;
}
function shrink(value) {
  if (JSON.stringify(value)?.length <= MAX_CHARS) return value;
  const trim = (item, depth) => {
    if (Array.isArray(item)) {
      const kept = item.slice(0, MAX_ITEMS).map((entry) => trim(entry, depth + 1));
      return item.length > MAX_ITEMS ? [...kept, { _omitidos: item.length - MAX_ITEMS, _aviso: "Lista recortada: ped\xED un rango o filtro m\xE1s acotado." }] : kept;
    }
    if (item && typeof item === "object" && depth < 8) return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, trim(entry, depth + 1)]));
    return item;
  };
  return trim(value, 0);
}
var MAX_CHARS, MAX_ITEMS;
var init_bridge = __esm({
  "app/mcp/bridge.ts"() {
    "use strict";
    MAX_CHARS = 12e4;
    MAX_ITEMS = 100;
  }
});

// app/mcp/kit.ts
import { z } from "zod";
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
}
function addDays2(date, days) {
  const value = /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function normalize2(value) {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "");
}
function fail(message) {
  return { ok: false, message };
}
function done(summary, data) {
  return { ok: true, summary, data };
}
function clean(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0));
}
function format(outcome) {
  if (!outcome.ok) return { isError: true, content: [{ type: "text", text: outcome.message }] };
  const payload = outcome.data === void 0 ? "" : `
${JSON.stringify(shrink(outcome.data))}`;
  return { content: [{ type: "text", text: `${outcome.summary}${payload}` }] };
}
function tool(server, context, spec) {
  if (spec.access === "write" && !context.canWrite) return;
  const readOnly = spec.access === "read";
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input,
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: readOnly ? false : Boolean(spec.destructive),
        idempotentHint: readOnly ? true : Boolean(spec.idempotent),
        openWorldHint: false
      }
    },
    (async (args) => {
      try {
        return format(await spec.run(args));
      } catch (error) {
        return format(fail(error instanceof Error ? error.message : "No se pudo completar la operaci\xF3n."));
      }
    })
  );
}
function apiTool(server, context, spec) {
  tool(server, context, {
    ...spec,
    run: async (args) => {
      const response = await callApi(spec.request(args));
      if (!response.ok) return fail(apiErrorMessage(response));
      const data = spec.pick ? spec.pick(response.data, args) : response.data;
      return done(typeof spec.summary === "function" ? spec.summary(response.data, args) : spec.summary, data);
    }
  });
}
function pickKeys(data, keys) {
  if (!keys?.length || !data || typeof data !== "object") return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => keys.includes(key)));
}
function count(value, key) {
  const list = value?.[key];
  return Array.isArray(list) ? list.length : 0;
}
var isoDate8, RESPONSABLE, fecha, identificador, cantidad, momento;
var init_kit = __esm({
  "app/mcp/kit.ts"() {
    "use strict";
    init_bridge();
    isoDate8 = /^\d{4}-\d{2}-\d{2}$/;
    RESPONSABLE = "Claude (MCP)";
    fecha = (detalle = "Fecha en formato AAAA-MM-DD.") => z.string().regex(isoDate8, "Us\xE1 el formato AAAA-MM-DD.").describe(detalle);
    identificador = (detalle) => z.union([z.string().min(1), z.number()]).describe(detalle);
    cantidad = (detalle) => z.number().int().positive().describe(detalle);
    momento = (detalle = "Fecha y hora ISO 8601, por ejemplo 2026-11-12T14:30:00-03:00.") => z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Us\xE1 fecha y hora ISO 8601.").describe(detalle);
  }
});

// app/mcp/tools-admin.ts
import { z as z2 } from "zod";
function registerAdminTools(server, context) {
  apiTool(server, context, {
    name: "registrar_entrada_stock",
    title: "Registrar una entrada de stock",
    description: "Suma unidades al stock: producci\xF3n interna, recepci\xF3n de un proveedor o devoluci\xF3n. Eleg\xED si entran como pendientes de HT o listas.",
    access: "write",
    input: {
      productoId: identificador("ID del producto."),
      tipo: z2.enum(["internal_production", "supplier_receipt", "return"]).describe("internal_production = producci\xF3n propia; supplier_receipt = recepci\xF3n de proveedor; return = devoluci\xF3n."),
      estado: estadoStock,
      cantidad: z2.number().int().positive(),
      momento: momento("Cu\xE1ndo entr\xF3. Si se omite, ahora.").optional(),
      proveedorId: z2.string().optional().describe("Proveedor de origen."),
      referencia: z2.string().optional().describe("Remito o referencia de origen."),
      nota: z2.string().optional(),
      responsable
    },
    request: (args) => ({
      method: "POST",
      path: "/api/stock/movements/receipts",
      body: clean({
        productId: String(args.productoId),
        movementType: args.tipo,
        stockState: args.estado,
        quantity: args.cantidad,
        occurredAt: args.momento ?? (/* @__PURE__ */ new Date()).toISOString(),
        providerId: args.proveedorId,
        sourceReference: args.referencia,
        note: args.nota,
        responsible: args.responsable ?? RESPONSABLE
      })
    }),
    summary: "Entrada de stock registrada."
  });
  apiTool(server, context, {
    name: "ajustar_stock",
    title: "Ajustar el stock por diferencia",
    description: "Corrige el stock de un producto sumando o restando unidades (diferencia positiva o negativa). Exige el motivo y no puede dejar el stock negativo. Queda en el historial: ped\xED confirmaci\xF3n.",
    access: "write",
    destructive: true,
    input: {
      productoId: identificador("ID del producto."),
      estado: estadoStock,
      diferencia: z2.number().int().refine((value) => value !== 0, "La diferencia no puede ser cero.").describe("Unidades a sumar (+) o restar (-)."),
      motivo: z2.string().min(1).describe("Por qu\xE9 se ajusta."),
      momento: momento("Cu\xE1ndo. Si se omite, ahora.").optional(),
      responsable
    },
    request: (args) => ({
      method: "POST",
      path: "/api/stock/movements/adjustments",
      body: { productId: String(args.productoId), stockState: args.estado, quantityDelta: args.diferencia, reason: args.motivo, occurredAt: args.momento ?? (/* @__PURE__ */ new Date()).toISOString(), responsible: args.responsable ?? RESPONSABLE }
    }),
    summary: "Ajuste de stock registrado."
  });
  apiTool(server, context, {
    name: "revertir_movimiento_stock",
    title: "Revertir un movimiento de stock",
    description: "Anula un movimiento de stock con un movimiento inverso y deja el motivo. No se revierte dos veces ni si dejar\xEDa el stock negativo. Ped\xED confirmaci\xF3n.",
    access: "write",
    destructive: true,
    input: { movimientoId: identificador("ID del movimiento (de stock_producto)."), motivo: z2.string().min(1), momento: momento("Cu\xE1ndo. Si se omite, ahora.").optional(), responsable },
    request: (args) => ({
      method: "POST",
      path: `/api/stock/movements/${enc(args.movimientoId)}/reverse`,
      body: { reason: args.motivo, occurredAt: args.momento ?? (/* @__PURE__ */ new Date()).toISOString(), responsible: args.responsable ?? RESPONSABLE }
    }),
    summary: "Movimiento revertido."
  });
  tool(server, context, {
    name: "guardar_recurso_produccion",
    title: "Crear o editar un recurso de producci\xF3n",
    description: "Crea un recurso (f\xE1brica interna, cuadrilla interna o aserradero externo) o edita uno existente si pas\xE1s recursoId. `produce` limita qu\xE9 tipos de producto fabrica; si se omite o est\xE1n los tres, produce todos.",
    access: "write",
    input: {
      recursoId: identificador("ID del recurso a editar. Si se omite, se crea uno nuevo.").optional(),
      nombre: z2.string().min(1).optional(),
      tipo: z2.enum(["internal_factory", "internal_crew", "external_supplier"]).optional().describe("Obligatorio al crear."),
      proveedorId: z2.string().optional().describe("Aserradero asociado; obligatorio si el tipo es external_supplier."),
      produce: z2.array(tiposProducto).min(1).optional().describe("Tipos de producto que produce."),
      orden: z2.number().int().min(0).optional().describe("Orden de aparici\xF3n."),
      activo: z2.boolean().optional().describe("Solo al editar.")
    },
    run: async (args) => {
      if (args.recursoId !== void 0) {
        const response = await callApi({ method: "PATCH", path: "/api/capacity/resources", body: clean({ id: args.recursoId, name: args.nombre, active: args.activo, displayOrder: args.orden, productKinds: args.produce }) });
        return response.ok ? done("Recurso actualizado.", response.data) : fail(apiErrorMessage(response));
      }
      if (!args.nombre || !args.tipo) return fail("Para crear un recurso indic\xE1 nombre y tipo.");
      const created = await callApi({ method: "POST", path: "/api/capacity/resources", body: clean({ name: args.nombre, resourceType: args.tipo, providerId: args.proveedorId, displayOrder: args.orden }) });
      if (!created.ok) return fail(apiErrorMessage(created));
      const resource = created.data.resource;
      if (args.produce && resource?.id !== void 0) {
        const kinds2 = await callApi({ method: "PATCH", path: "/api/capacity/resources", body: { id: resource.id, productKinds: args.produce } });
        if (!kinds2.ok) return fail(`El recurso se cre\xF3, pero no se pudo guardar qu\xE9 produce: ${apiErrorMessage(kinds2)}`);
        return done("Recurso creado.", kinds2.data);
      }
      return done("Recurso creado.", created.data);
    }
  });
  const reglaCampos = {
    recursoId: identificador("ID del recurso (listar_recursos_produccion)."),
    productoId: z2.string().min(1).describe("ID del producto del cat\xE1logo."),
    clienteProductoId: identificador("Relaci\xF3n cliente-producto a la que aplica (ver_cliente)."),
    etiqueta: z2.string().min(1).describe("Nombre de la configuraci\xF3n, por ejemplo \xABF\xE1brica \xD72\xBB."),
    normalPorDia: z2.number().int().positive().describe("Unidades por d\xEDa en condiciones normales."),
    maximoPorDia: z2.number().int().positive().describe("Unidades por d\xEDa como m\xE1ximo (no menor a la normal)."),
    vigenteDesde: fecha("Desde cu\xE1ndo rige."),
    vigenteHasta: fecha("Hasta cu\xE1ndo rige. Vac\xEDo = sin fin.").optional(),
    personas: z2.number().int().min(0).optional().describe("Personas de la cuadrilla, si importa."),
    fuente: z2.string().optional().describe("Origen del dato. Por defecto \xABmanual\xBB."),
    nota: z2.string().optional()
  };
  tool(server, context, {
    name: "guardar_regla_rendimiento",
    title: "Crear o editar una regla de rendimiento",
    description: "Define cu\xE1ntas unidades por d\xEDa produce un recurso de un producto de un cliente (normal y m\xE1ximo). Pas\xE1 reglaId para editar una existente (se reemplazan todos sus valores). Las reglas alimentan las advertencias de capacidad.",
    access: "write",
    input: { reglaId: identificador("ID de la regla a editar. Si se omite, se crea una nueva.").optional(), ...reglaCampos },
    run: async (args) => {
      const body = clean({
        id: args.reglaId,
        resourceId: args.recursoId,
        productId: args.productoId,
        clientProductId: args.clienteProductoId,
        configurationLabel: args.etiqueta,
        normalUnitsPerDay: args.normalPorDia,
        maximumUnitsPerDay: args.maximoPorDia,
        validFrom: args.vigenteDesde,
        validTo: args.vigenteHasta,
        peopleCount: args.personas,
        source: args.fuente,
        note: args.nota
      });
      const response = await callApi({ method: args.reglaId === void 0 ? "POST" : "PATCH", path: "/api/capacity/rules", body });
      return response.ok ? done(args.reglaId === void 0 ? "Regla creada." : "Regla actualizada.", response.data) : fail(apiErrorMessage(response));
    }
  });
  apiTool(server, context, {
    name: "eliminar_regla_rendimiento",
    title: "Eliminar una regla de rendimiento",
    description: "Elimina una regla de rendimiento. Si ya se us\xF3 en producci\xF3n realizada, se rechaza. Ped\xED confirmaci\xF3n.",
    access: "write",
    destructive: true,
    input: { reglaId: identificador("ID de la regla.") },
    request: ({ reglaId }) => ({ method: "DELETE", path: "/api/capacity/rules", query: { id: String(reglaId) } }),
    summary: "Regla eliminada."
  });
  tool(server, context, {
    name: "guardar_capacidad_secadero",
    title: "Definir la capacidad diaria del secadero",
    description: "Fija las unidades por d\xEDa que admite el secadero (la referencia contra la que se muestra el porcentaje de carga). Superarla solo genera una advertencia.",
    access: "write",
    idempotent: true,
    input: { unidadesPorDia: z2.number().int().min(1).describe("Capacidad diaria en unidades.") },
    run: async ({ unidadesPorDia }) => {
      const today = todayKey();
      const snapshot2 = await callApi({ method: "GET", path: "/api/capacity", query: { from: today, to: today } });
      const saved = (snapshot2.data?.capacity?.internalDefaults ?? []).find((entry) => entry.operation === "ht");
      const response = await callApi({ method: "PUT", path: "/api/capacity/internal-production", body: { operation: "ht", peopleCount: saved?.peopleCount ?? 0, manualCapacity: unidadesPorDia } });
      return response.ok ? done("Capacidad del secadero guardada.", response.data) : fail(apiErrorMessage(response));
    }
  });
  apiTool(server, context, {
    name: "guardar_capacidad_transporte",
    title: "Definir los cupos de viajes de un transporte",
    description: "Fija cu\xE1ntos viajes por d\xEDa admite la flota propia o un transportista externo (valor base, todos los d\xEDas).",
    access: "write",
    idempotent: true,
    input: {
      origen: z2.enum(["internal", "external"]),
      transportistaId: z2.string().optional().describe("Obligatorio si el origen es external."),
      viajesPorDia: z2.number().int().min(0),
      estado: z2.enum(["estimated", "confirmed"]).default("confirmed").describe("estimated = estimado; confirmed = confirmado.")
    },
    request: (args) => ({ method: "PUT", path: "/api/capacity/transport", body: clean({ source: args.origen, providerId: args.transportistaId, tripCapacity: args.viajesPorDia, status: args.estado }) }),
    summary: "Cupos de transporte guardados."
  });
  apiTool(server, context, {
    name: "guardar_cupos_viajes_dia",
    title: "Excepci\xF3n de cupos de viajes en un d\xEDa",
    description: "Cambia los cupos de viajes de un transporte solo para un d\xEDa (por ejemplo, un cami\xF3n extra o uno en reparaci\xF3n).",
    access: "write",
    idempotent: true,
    input: {
      fecha: fecha("D\xEDa de la excepci\xF3n."),
      origen: z2.enum(["internal", "external"]),
      transportistaId: z2.string().optional().describe("Obligatorio si el origen es external."),
      cupos: z2.number().int().min(0).describe("Cupos de viajes ese d\xEDa."),
      responsable: z2.string().min(1).describe("Qui\xE9n aporta o confirma el cupo."),
      estado: z2.enum(["estimated", "confirmed"]).default("confirmed")
    },
    request: (args) => ({ method: "PUT", path: "/api/capacity/trip-adjustments", body: clean({ date: args.fecha, source: args.origen, providerId: args.transportistaId, tripCapacity: args.cupos, responsible: args.responsable, status: args.estado }) }),
    summary: "Excepci\xF3n guardada."
  });
  apiTool(server, context, {
    name: "ajustar_capacidad_dia",
    title: "Ajuste de capacidad de un d\xEDa",
    description: "Suma o resta capacidad (en palets) a un recurso solo para un d\xEDa: producci\xF3n interna, producci\xF3n de un aserradero externo o transporte. Para producci\xF3n interna se indica la cantidad de personas.",
    access: "write",
    idempotent: true,
    input: {
      fecha: fecha("D\xEDa del ajuste."),
      recurso: z2.enum(["internal_production", "external_production", "transport"]),
      operacion: z2.enum(["assembly", "marking", "ht"]).optional().describe("Obligatoria para producci\xF3n interna o externa."),
      origen: z2.enum(["internal", "external"]).optional().describe("Obligatorio para transport."),
      proveedorId: z2.string().optional().describe("Aserradero o transportista externo."),
      ajustePalets: z2.number().int().describe("Palets a sumar (+) o restar (-)."),
      personas: z2.number().int().min(0).optional().describe("Solo producci\xF3n interna."),
      responsable: z2.string().optional().describe("Qui\xE9n aporta la capacidad (obligatorio salvo producci\xF3n interna o ajuste 0)."),
      estado: z2.enum(["estimated", "confirmed"]).optional()
    },
    request: (args) => ({
      method: "PUT",
      path: "/api/capacity/adjustments",
      body: clean({ date: args.fecha, resourceType: args.recurso, operation: args.operacion, source: args.origen, providerId: args.proveedorId, palletAdjustment: args.ajustePalets, peopleCount: args.personas, responsible: args.responsable, status: args.estado })
    }),
    summary: "Ajuste de capacidad guardado."
  });
  tool(server, context, {
    name: "guardar_cliente",
    title: "Crear o editar un cliente",
    description: "Crea un cliente o edita uno existente si pas\xE1s clienteId. La direcci\xF3n de entrega es necesaria para despachar sus viajes.",
    access: "write",
    input: {
      clienteId: identificador("ID del cliente a editar. Si se omite, se crea uno nuevo.").optional(),
      nombre: z2.string().min(1).optional(),
      direccion: z2.string().optional(),
      departamento: z2.string().optional(),
      activo: z2.boolean().optional().describe("Solo al editar.")
    },
    run: async (args) => {
      const body = clean({ name: args.nombre, address: args.direccion, department: args.departamento, active: args.activo });
      if (args.clienteId === void 0 && !args.nombre) return fail("Para crear un cliente indic\xE1 el nombre.");
      const response = await callApi({ method: args.clienteId === void 0 ? "POST" : "PATCH", path: args.clienteId === void 0 ? "/api/clients" : `/api/clients/${enc(args.clienteId)}`, body });
      return response.ok ? done(args.clienteId === void 0 ? "Cliente creado." : "Cliente actualizado.", response.data) : fail(apiErrorMessage(response));
    }
  });
  apiTool(server, context, {
    name: "eliminar_cliente",
    title: "Eliminar un cliente",
    description: "Elimina un cliente sin pedidos. Si tiene historial, desactivalo con guardar_cliente (activo=false). Ped\xED confirmaci\xF3n expl\xEDcita.",
    access: "write",
    destructive: true,
    input: { clienteId: identificador("ID del cliente.") },
    request: ({ clienteId }) => ({ method: "DELETE", path: `/api/clients/${enc(clienteId)}` }),
    summary: "Cliente eliminado."
  });
  apiTool(server, context, {
    name: "habilitar_producto_cliente",
    title: "Habilitar un producto para un cliente",
    description: "Asocia un producto del cat\xE1logo a un cliente para poder hacerle pedidos. Requiere un primer punto de control.",
    access: "write",
    input: {
      clienteId: identificador("ID del cliente."),
      productoId: z2.string().min(1).describe("ID del producto del cat\xE1logo."),
      nombreOperativo: z2.string().optional().describe("C\xF3mo lo llama el cliente."),
      controlInicial: z2.string().min(1).describe("Primer punto de control del producto para este cliente."),
      orden: z2.number().int().optional()
    },
    request: (args) => ({
      method: "POST",
      path: `/api/clients/${enc(args.clienteId)}/products`,
      body: clean({ productId: args.productoId, operationalName: args.nombreOperativo, initialControl: args.controlInicial, displayOrder: args.orden })
    }),
    summary: "Producto habilitado para el cliente."
  });
  apiTool(server, context, {
    name: "editar_producto_cliente",
    title: "Editar un producto de un cliente",
    description: "Cambia el nombre operativo, el orden o activa/desactiva un producto habilitado para un cliente. Us\xE1 el clienteProductoId de ver_cliente.",
    access: "write",
    idempotent: true,
    input: {
      clienteProductoId: identificador("ID de la relaci\xF3n cliente-producto."),
      nombreOperativo: z2.string().optional(),
      activo: z2.boolean().optional(),
      orden: z2.number().int().optional()
    },
    request: (args) => ({ method: "PATCH", path: `/api/client-products/${enc(args.clienteProductoId)}`, body: clean({ operationalName: args.nombreOperativo, active: args.activo, displayOrder: args.orden }) }),
    summary: "Producto del cliente actualizado."
  });
  apiTool(server, context, {
    name: "guardar_controles_producto_cliente",
    title: "Definir los puntos de control de un producto de cliente",
    description: "Reemplaza la lista de puntos de control (los que se revisan al registrar HT) de un producto de un cliente. Inclu\xED todos los que deben quedar.",
    access: "write",
    idempotent: true,
    input: {
      clienteProductoId: identificador("ID de la relaci\xF3n cliente-producto."),
      controles: z2.array(z2.object({ titulo: z2.string().min(1), detalle: z2.string().optional(), activo: z2.boolean().optional() }))
    },
    request: ({ clienteProductoId, controles }) => ({
      method: "PUT",
      path: `/api/client-products/${enc(clienteProductoId)}/controls`,
      body: { controls: controles.map((control) => clean({ title: control.titulo, detail: control.detalle, active: control.activo })) }
    }),
    summary: "Controles guardados."
  });
  apiTool(server, context, {
    name: "eliminar_archivo_producto_cliente",
    title: "Quitar un plano o foto",
    description: "Quita un plano o foto de un producto de cliente (queda fuera de uso). Ped\xED confirmaci\xF3n.",
    access: "write",
    destructive: true,
    input: { archivoId: identificador("ID del archivo.") },
    request: ({ archivoId }) => ({ method: "DELETE", path: `/api/client-product-assets/${enc(archivoId)}` }),
    summary: "Archivo quitado."
  });
  const productoCampos = {
    tipo: tiposProducto.optional().describe("Obligatorio al crear."),
    medida: z2.string().optional().describe("Medida, por ejemplo 1200x1000."),
    atributos: z2.record(z2.string(), z2.string()).optional().describe("Valor por nivel de clasificaci\xF3n (ver niveles_producto): clave = id del nivel."),
    alturaCm: z2.number().positive().nullable().optional().describe("Altura en cm (m\xE1x. dos decimales); null para quitarla."),
    requiereHT: z2.boolean().optional(),
    codigoZeta: z2.string().optional().describe("C\xF3digo num\xE9rico Zeta. Obligatorio al crear."),
    nombreStock: z2.string().optional(),
    clienteIds: z2.array(z2.string()).optional().describe("Clientes asociados.")
  };
  tool(server, context, {
    name: "guardar_producto",
    title: "Crear o editar un producto del cat\xE1logo",
    description: "Crea un producto o edita uno existente si pas\xE1s productoId. Si cambia la clasificaci\xF3n y ya existe otro producto igual, se rechaza.",
    access: "write",
    input: { productoId: z2.string().optional().describe("ID del producto a editar. Si se omite, se crea uno nuevo."), ...productoCampos },
    run: async (args) => {
      if (args.productoId === void 0 && (!args.tipo || !args.codigoZeta)) return fail("Para crear un producto indic\xE1 tipo y c\xF3digo Zeta.");
      const body = clean({
        kind: args.tipo,
        measure: args.medida,
        attributes: args.atributos,
        heightCm: args.alturaCm,
        requiresTreatment: args.requiereHT,
        zetaCode: args.codigoZeta,
        stockName: args.nombreStock,
        clientIds: args.clienteIds
      });
      if (args.productoId !== void 0 && !args.tipo) {
        const current = await callApi({ method: "GET", path: "/api/products" });
        const found = (current.data.products ?? []).find((item) => item.id === args.productoId);
        if (!found) return fail("Producto no encontrado.");
        body.kind = found.kind;
      }
      const response = await callApi({ method: args.productoId === void 0 ? "POST" : "PATCH", path: args.productoId === void 0 ? "/api/products" : `/api/products/${enc(args.productoId)}`, body });
      return response.ok ? done(args.productoId === void 0 ? "Producto creado." : "Producto actualizado.", response.data) : fail(apiErrorMessage(response));
    }
  });
  apiTool(server, context, {
    name: "eliminar_producto",
    title: "Eliminar un producto del cat\xE1logo",
    description: "Elimina un producto que no figura en pedidos ni tiene stock o movimientos. Ped\xED confirmaci\xF3n expl\xEDcita.",
    access: "write",
    destructive: true,
    input: { productoId: z2.string().min(1) },
    request: ({ productoId }) => ({ method: "DELETE", path: `/api/products/${enc(productoId)}` }),
    summary: "Producto eliminado."
  });
  apiTool(server, context, {
    name: "guardar_niveles_producto",
    title: "Guardar los niveles de clasificaci\xF3n",
    description: "Reemplaza la lista de niveles de clasificaci\xF3n de productos y sus opciones. Cuidado: es la estructura del cat\xE1logo. Part\xED siempre de niveles_producto y devolv\xE9 la lista completa; \xABMedida\xBB es siempre el primer nivel y no se puede quitar un nivel que usan productos.",
    access: "write",
    destructive: true,
    idempotent: true,
    input: { niveles: z2.array(z2.object({ id: z2.string().optional(), nombre: z2.string().optional(), opciones: z2.unknown().optional() })).min(1).describe("Lista completa de niveles, con la forma que devuelve niveles_producto (id, label, options).") },
    request: ({ niveles }) => ({ method: "PUT", path: "/api/product-levels", body: { levels: niveles.map((level) => clean({ id: level.id, label: level.nombre, options: level.opciones })) } }),
    summary: "Niveles guardados."
  });
  tool(server, context, {
    name: "guardar_proveedor",
    title: "Crear o editar un proveedor",
    description: "Crea un aserradero, transportista o importador, o edita uno existente si pas\xE1s proveedorId.",
    access: "write",
    input: {
      proveedorId: z2.string().optional().describe("ID del proveedor a editar. Si se omite, se crea uno nuevo."),
      nombre: z2.string().min(1).optional(),
      tipo: z2.enum(["Aserradero", "Transporte", "Importador"]).optional().describe("Obligatorio al crear."),
      suministra: z2.string().optional().describe("Qu\xE9 provee (texto libre).")
    },
    run: async (args) => {
      if (args.proveedorId === void 0 && (!args.nombre || !args.tipo)) return fail("Para crear un proveedor indic\xE1 nombre y tipo.");
      const body = clean({ name: args.nombre, type: args.tipo, supplies: args.suministra ?? (args.proveedorId === void 0 ? args.tipo : void 0) });
      const response = await callApi({ method: args.proveedorId === void 0 ? "POST" : "PATCH", path: args.proveedorId === void 0 ? "/api/providers" : `/api/providers/${enc(args.proveedorId)}`, body });
      return response.ok ? done(args.proveedorId === void 0 ? "Proveedor creado." : "Proveedor actualizado.", response.data) : fail(apiErrorMessage(response));
    }
  });
  apiTool(server, context, {
    name: "eliminar_proveedor",
    title: "Eliminar un proveedor",
    description: "Elimina un proveedor que no est\xE1 en uso. Ped\xED confirmaci\xF3n expl\xEDcita.",
    access: "write",
    destructive: true,
    input: { proveedorId: z2.string().min(1) },
    request: ({ proveedorId }) => ({ method: "DELETE", path: `/api/providers/${enc(proveedorId)}` }),
    summary: "Proveedor eliminado."
  });
}
var enc, responsable, estadoStock, tiposProducto;
var init_tools_admin = __esm({
  "app/mcp/tools-admin.ts"() {
    "use strict";
    init_bridge();
    init_kit();
    enc = (value) => encodeURIComponent(String(value));
    responsable = z2.string().min(1).optional().describe(`Qui\xE9n lo hace. Si se omite, se registra \xAB${RESPONSABLE}\xBB.`);
    estadoStock = z2.enum(["pending_treatment", "ready"]).describe("pending_treatment = pendiente de HT; ready = listo.");
    tiposProducto = z2.enum(["Pallet", "Piso", "Bin"]);
  }
});

// app/mcp/tools-logistics.ts
import { z as z3 } from "zod";
function registerLogisticsTools(server, context) {
  apiTool(server, context, {
    name: "asignar_transporte_pedido",
    title: "Asignar transporte a un pedido",
    description: "Define si el pedido va con flota propia o con un transportista externo (existente o nuevo). Aplica a los viajes a\xFAn planificados.",
    access: "write",
    idempotent: true,
    input: {
      pedidoId: identificador("ID del pedido."),
      origen: z3.enum(["internal", "external"]).describe("internal = flota propia; external = transportista."),
      transportistaId: z3.string().optional().describe("ID del transportista registrado (listar_proveedores tipo Transporte)."),
      nuevoTransportista: z3.string().optional().describe("Nombre de un transportista nuevo para crearlo en el momento.")
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc2(args.pedidoId)}/transport`,
      body: clean({ source: args.origen, providerId: args.transportistaId, newProviderName: args.nuevoTransportista })
    }),
    summary: "Transporte asignado."
  });
  apiTool(server, context, {
    name: "crear_viaje",
    title: "Crear un viaje de un pedido",
    description: "Crea un viaje con las unidades de cada l\xEDnea que van ese d\xEDa. Se pueden hacer varios viajes por pedido. Enviar m\xE1s de lo que est\xE1 listo, o m\xE1s de lo que cabe en el veh\xEDculo, es una advertencia y no lo bloquea; lo que se rechaza es superar lo que falta enviar del pedido.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      fecha: fecha("D\xEDa del viaje."),
      origenTransporte: z3.enum(["internal", "external"]).default("internal").describe("internal = flota propia; external = transportista."),
      transportistaId: z3.string().optional().describe("Transportista si el origen es external."),
      lineas: lineasViaje,
      responsable: responsable2
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc2(args.pedidoId)}/shipments`,
      body: clean({
        plannedDate: args.fecha,
        transportSource: args.origenTransporte,
        transportProviderId: args.transportistaId,
        responsible: args.responsable ?? RESPONSABLE,
        lines: args.lineas.map((line) => ({ orderLineId: line.lineaId, plannedQuantity: line.cantidad }))
      })
    }),
    summary: "Viaje creado."
  });
  apiTool(server, context, {
    name: "editar_viaje",
    title: "Editar un viaje planificado",
    description: "Cambia fecha, transporte o cantidades de un viaje que todav\xEDa est\xE1 planificado. Reemplaza las l\xEDneas: indic\xE1 todas las que quedan.",
    access: "write",
    idempotent: true,
    input: {
      viajeId: identificador("ID del viaje (de detalle_pedido \u2192 shipments o calendario)."),
      fecha: fecha("D\xEDa del viaje."),
      origenTransporte: z3.enum(["internal", "external"]).default("internal"),
      transportistaId: z3.string().optional(),
      lineas: lineasViaje,
      responsable: responsable2
    },
    request: (args) => ({
      method: "PATCH",
      path: `/api/shipments/${enc2(args.viajeId)}`,
      body: clean({
        plannedDate: args.fecha,
        transportSource: args.origenTransporte,
        transportProviderId: args.transportistaId,
        responsible: args.responsable ?? RESPONSABLE,
        lines: args.lineas.map((line) => ({ orderLineId: line.lineaId, plannedQuantity: line.cantidad }))
      })
    }),
    summary: "Viaje actualizado."
  });
  apiTool(server, context, {
    name: "avanzar_viaje",
    title: "Avanzar el estado de un viaje",
    description: "Lleva un viaje al paso siguiente: ready (pronto) \u2192 loaded (cargado) \u2192 dispatched (despachado) \u2192 delivered (entregado), o lo cancela con cancelled. Al cargar se pueden informar las unidades realmente cargadas por l\xEDnea (cargaReal) y al entregar las realmente entregadas (entregaReal). Al despachar se descuenta el stock; si no alcanza queda registrada una incidencia, no se bloquea.",
    access: "write",
    input: {
      viajeId: identificador("ID del viaje."),
      estado: z3.enum(["ready", "loaded", "dispatched", "delivered", "cancelled"]).describe("Estado al que pasa."),
      remito: z3.string().optional().describe("N\xFAmero de remito."),
      motivoRemitoCompartido: z3.string().optional().describe("Si el remito se comparte con otro viaje, por qu\xE9."),
      cargaReal: z3.array(z3.object({ lineaViajeId: identificador("ID de la l\xEDnea del viaje."), cantidad: z3.number().int().min(0) })).optional().describe("Unidades realmente cargadas (al pasar a loaded)."),
      entregaReal: z3.array(z3.object({ lineaViajeId: identificador("ID de la l\xEDnea del viaje."), cantidad: z3.number().int().min(0) })).optional().describe("Unidades realmente entregadas (al pasar a delivered)."),
      responsable: responsable2
    },
    request: (args) => ({
      method: "POST",
      path: `/api/shipments/${enc2(args.viajeId)}/transition`,
      body: clean({
        nextStatus: args.estado,
        remittance: args.remito,
        sharedRemittanceReason: args.motivoRemitoCompartido,
        responsible: args.responsable ?? RESPONSABLE,
        loadedLines: args.cargaReal?.map((line) => ({ shipmentLineId: String(line.lineaViajeId), loadedQuantity: line.cantidad })),
        deliveredLines: args.entregaReal?.map((line) => ({ shipmentLineId: String(line.lineaViajeId), deliveredQuantity: line.cantidad }))
      })
    }),
    summary: (data) => `Viaje actualizado${data?.auditWarning ? `. Aviso: ${data.auditWarning}` : "."}`
  });
  apiTool(server, context, {
    name: "reprogramar_viaje",
    title: "Reprogramar un viaje a otro d\xEDa",
    description: "Mueve un viaje planificado o pronto a otra fecha y deja registrado el motivo.",
    access: "write",
    input: {
      viajeId: identificador("ID del viaje."),
      nuevaFecha: fecha("Nuevo d\xEDa."),
      motivo: z3.enum(["production", "logistics", "client", "weather", "other"]).describe("production = producci\xF3n; logistics = log\xEDstica; client = cliente; weather = clima; other = otro."),
      nota: z3.string().optional(),
      responsable: responsable2
    },
    request: (args) => ({
      method: "POST",
      path: `/api/shipments/${enc2(args.viajeId)}/reschedule`,
      body: clean({ newDate: args.nuevaFecha, reason: args.motivo, note: args.nota, responsible: args.responsable ?? RESPONSABLE })
    }),
    summary: "Viaje reprogramado."
  });
  apiTool(server, context, {
    name: "guardar_salida",
    title: "Agendar o editar una salida de transporte",
    description: "Agenda la salida de un viaje (veh\xEDculo, chofer, horarios y destino) o la edita si pas\xE1s salidaId. Modos: delivery (entrega con flota propia o transportista), customer_pickup (retira el cliente), supplier_pickup (retiro en un proveedor). Los solapamientos de veh\xEDculo o chofer y las salidas fuera de jornada son advertencias.",
    access: "write",
    input: {
      salidaId: identificador("ID de la salida a editar. Si se omite, se crea una nueva.").optional(),
      modo: z3.enum(["delivery", "customer_pickup", "supplier_pickup"]),
      fecha: fecha("D\xEDa de la salida."),
      viajeId: identificador("Viaje al que corresponde (delivery y customer_pickup).").optional(),
      proveedorId: z3.string().optional().describe("Proveedor a retirar (solo supplier_pickup)."),
      vehiculoId: z3.string().optional().describe("ID del veh\xEDculo (de logistica_configuracion)."),
      choferId: z3.string().optional().describe("ID del chofer. Si se omite, el habitual del veh\xEDculo."),
      salida: momento("Hora de salida.").optional(),
      regreso: momento("Hora de regreso.").optional(),
      estado: z3.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
      direccionDestino: z3.string().optional(),
      nota: z3.string().optional(),
      responsable: responsable2
    },
    request: (args) => ({
      method: "POST",
      path: "/api/logistics/runs",
      body: clean({
        id: args.salidaId,
        mode: args.modo,
        plannedDate: args.fecha,
        shipmentId: args.viajeId,
        providerId: args.proveedorId,
        vehicleId: args.vehiculoId,
        driverId: args.choferId,
        plannedStartAt: args.salida,
        plannedEndAt: args.regreso,
        status: args.estado,
        destinationAddress: args.direccionDestino,
        note: args.nota,
        responsible: args.responsable ?? RESPONSABLE
      })
    }),
    summary: "Salida guardada."
  });
  apiTool(server, context, {
    name: "calcular_ruta_salida",
    title: "Calcular la ruta y la hora de regreso",
    description: "Calcula el recorrido, la distancia, la duraci\xF3n y la hora estimada de regreso del cami\xF3n de una salida. Necesita direcci\xF3n de destino y horario de salida.",
    access: "write",
    idempotent: true,
    input: { salidaId: identificador("ID de la salida.") },
    request: ({ salidaId }) => ({ method: "POST", path: `/api/logistics/routes/${enc2(salidaId)}` }),
    summary: "Ruta calculada."
  });
  apiTool(server, context, {
    name: "guardar_configuracion_logistica",
    title: "Guardar configuraci\xF3n de Log\xEDstica",
    description: [
      "Crea o actualiza un dato de configuraci\xF3n de Log\xEDstica seg\xFAn `tipo`; `datos` lleva los campos de ese tipo:",
      "\u2022 vehicle: id, name, smallCapacity (chicos), largeCapacity (grandes), habitualDriverId, lengthM, widthM, heightM, weightT, active.",
      "\u2022 driver: id, name, active.",
      "\u2022 settings: originAddress, shiftStart, shiftEnd (HH:MM), breakMinutes, loadMinutes, unloadMinutes, marginMinutes.",
      "\u2022 class: productId, palletClass (small | large | unclassified | auto), reason.",
      "\u2022 location: entityType (client | provider), entityId, address, latitude, longitude, precision (exact | city | unknown), verified.",
      "\u2022 transport_capacity: source (provider | customer_pickup), providerId, smallCapacity, largeCapacity.",
      "\u2022 client_limit: clientId, distanceKm, travelHours, handlingMinutes, ordersPerDay."
    ].join("\n"),
    access: "write",
    idempotent: true,
    input: {
      tipo: z3.enum(["settings", "vehicle", "driver", "class", "location", "transport_capacity", "client_limit"]),
      datos: z3.record(z3.string(), z3.unknown()).describe("Campos del tipo elegido.")
    },
    request: ({ tipo, datos }) => ({ method: "PUT", path: "/api/logistics/config", body: { ...datos, kind: tipo } }),
    summary: "Configuraci\xF3n guardada."
  });
}
var enc2, responsable2, lineasViaje;
var init_tools_logistics = __esm({
  "app/mcp/tools-logistics.ts"() {
    "use strict";
    init_kit();
    enc2 = (value) => encodeURIComponent(String(value));
    responsable2 = z3.string().min(1).optional().describe(`Qui\xE9n lo hace. Si se omite, se registra \xAB${RESPONSABLE}\xBB.`);
    lineasViaje = z3.array(z3.object({
      lineaId: z3.string().min(1).describe("ID de la l\xEDnea del pedido (de detalle_pedido)."),
      cantidad: cantidad("Unidades que van en este viaje.")
    })).min(1);
  }
});

// app/mcp/tools-operations.ts
import { z as z4 } from "zod";
function registerOperationTools(server, context) {
  apiTool(server, context, {
    name: "crear_pedido",
    title: "Crear un pedido",
    description: "Crea un pedido de un cliente con uno o m\xE1s productos. El cliente sale de los productos elegidos: us\xE1 el clienteProductoId que devuelve ver_cliente (productosParaPedido[].id). Las fechas pasadas o ajustadas se aceptan.",
    access: "write",
    input: {
      productos: z4.array(z4.object({
        clienteProductoId: identificador("ID de la relaci\xF3n cliente-producto (ver_cliente \u2192 productosParaPedido[].id)."),
        cantidad: cantidad("Unidades pedidas.")
      })).min(1).describe("L\xEDneas del pedido."),
      fechaPedido: fecha("D\xEDa en que el cliente hizo el pedido."),
      fechaEntrega: fecha("D\xEDa para el que se pide la entrega."),
      notas: z4.string().optional().describe("Notas internas del pedido."),
      notaFechaEntrega: z4.string().optional().describe("Aclaraci\xF3n sobre la fecha de entrega (por ejemplo, \xABantes del feriado\xBB)."),
      requiereHT: z4.boolean().optional().describe("Marcar si el pedido requiere HT adem\xE1s del armado.")
    },
    request: (args) => ({
      method: "POST",
      path: "/api/orders",
      body: clean({
        lines: args.productos.map((line) => ({ clientProductId: line.clienteProductoId, quantity: line.cantidad })),
        orderDate: args.fechaPedido,
        plannedDate: args.fechaEntrega,
        notes: args.notas,
        deliveryDateNote: args.notaFechaEntrega,
        requiredOperations: args.requiereHT ? ["assembly", "treatment"] : void 0
      })
    }),
    summary: "Pedido creado."
  });
  apiTool(server, context, {
    name: "editar_pedido",
    title: "Editar un pedido",
    description: "Cambia datos de un pedido: fecha de entrega, cantidad total pedida, origen de la producci\xF3n (interna, aserradero o importaci\xF3n) y transporte. Indic\xE1 solo lo que cambia. Para cancelar us\xE1 cancelar_pedido.",
    access: "write",
    idempotent: true,
    input: {
      pedidoId: identificador("ID del pedido."),
      fechaEntrega: fecha("Nueva fecha de entrega.").optional(),
      cantidadTotal: z4.number().positive().optional().describe("Nueva cantidad total pedida (no puede ser menor a lo ya entregado)."),
      origenProduccion: z4.enum(["internal", "sawmill", "import"]).optional().describe("internal = f\xE1brica propia; sawmill = aserradero; import = importaci\xF3n."),
      productorId: z4.string().optional().describe("ID del aserradero o importador cuando el origen no es interno."),
      fechaProduccion: fecha("Fecha de producci\xF3n.").optional(),
      fechaLlegadaImportacion: fecha("Llegada de la importaci\xF3n (obligatoria si el origen es import).").optional(),
      origenTransporte: z4.enum(["internal", "external"]).optional().describe("internal = flota propia; external = transportista."),
      transportistaId: z4.string().optional().describe("ID del transportista cuando es externo.")
    },
    request: (args) => ({
      method: "PATCH",
      path: `/api/orders/${enc3(args.pedidoId)}`,
      body: clean({
        plannedDate: args.fechaEntrega,
        requested: args.cantidadTotal,
        productionSource: args.origenProduccion,
        producerProviderId: args.productorId,
        productionDate: args.fechaProduccion,
        importArrivalDate: args.fechaLlegadaImportacion,
        transportSource: args.origenTransporte,
        transportProviderId: args.transportistaId
      })
    }),
    summary: "Pedido actualizado."
  });
  apiTool(server, context, {
    name: "cancelar_pedido",
    title: "Cancelar un pedido",
    description: "Cancela un pedido: queda en el historial como Cancelado y se liberan sus reservas. Ped\xED confirmaci\xF3n antes de usarla.",
    access: "write",
    destructive: true,
    idempotent: true,
    input: { pedidoId: identificador("ID del pedido.") },
    request: ({ pedidoId }) => ({ method: "PATCH", path: `/api/orders/${enc3(pedidoId)}`, body: { cancelled: true } }),
    summary: "Pedido cancelado."
  });
  apiTool(server, context, {
    name: "eliminar_pedido",
    title: "Eliminar un pedido",
    description: "Elimina definitivamente un pedido que no tiene movimientos de stock ni HT. No se puede deshacer. Si ya tuvo actividad, us\xE1 cancelar_pedido. Ped\xED confirmaci\xF3n expl\xEDcita.",
    access: "write",
    destructive: true,
    input: { pedidoId: identificador("ID del pedido.") },
    request: ({ pedidoId }) => ({ method: "DELETE", path: `/api/orders/${enc3(pedidoId)}` }),
    summary: "Pedido eliminado."
  });
  apiTool(server, context, {
    name: "registrar_novedad_pedido",
    title: "Registrar una novedad del pedido",
    description: "Registra una entrega parcial, un cambio de direcci\xF3n, un despacho o una incidencia en el pedido. Para viajes con cargas y remitos prefer\xED crear_viaje y avanzar_viaje.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      tipo: z4.enum(["entrega", "direccion", "despacho", "incidencia"]),
      cantidadEntregada: cantidad("Unidades entregadas (solo para \xABentrega\xBB).").optional(),
      direccion: z4.string().optional().describe("Nueva direcci\xF3n de entrega (solo para \xABdireccion\xBB)."),
      fechaDespacho: momento("Cu\xE1ndo sali\xF3 (solo \xABdespacho\xBB).").optional(),
      fechaEntrega: momento("Cu\xE1ndo se entreg\xF3 (solo \xABentrega\xBB).").optional(),
      nota: z4.string().optional().describe("Detalle. Obligatorio para \xABincidencia\xBB.")
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc3(args.pedidoId)}/updates`,
      body: clean({ kind: args.tipo, deliveredQuantity: args.cantidadEntregada, deliveryAddress: args.direccion, dispatchedAt: args.fechaDespacho, deliveredAt: args.fechaEntrega, note: args.nota })
    }),
    summary: "Novedad registrada."
  });
  apiTool(server, context, {
    name: "planificar_produccion",
    title: "Planificar la producci\xF3n de un pedido",
    description: "Define qu\xE9 se produce, d\xF3nde y cu\xE1ndo. REEMPLAZA toda la planificaci\xF3n pendiente del pedido: inclu\xED todas las asignaciones que quer\xE9s conservar. Lo ya producido no se toca. Superar la capacidad de un d\xEDa no la bloquea (es una advertencia); lo que s\xED se rechaza es asignar m\xE1s unidades que las del pedido. Los IDs de l\xEDnea salen de detalle_pedido y los de recurso de listar_recursos_produccion.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      asignaciones: z4.array(z4.object({
        lineaId: z4.string().min(1).describe("ID de la l\xEDnea del pedido."),
        recursoId: identificador("ID del recurso de producci\xF3n."),
        fecha: fecha("D\xEDa de producci\xF3n."),
        cantidad: cantidad("Unidades a producir ese d\xEDa.")
      })).describe("Lista completa de asignaciones. Vac\xEDa = quitar toda la planificaci\xF3n pendiente.")
    },
    request: ({ pedidoId, asignaciones }) => ({
      method: "POST",
      path: `/api/orders/${enc3(pedidoId)}/production-plan`,
      body: { allocations: asignaciones.map((item) => ({ orderLineId: item.lineaId, resourceId: String(item.recursoId), plannedDate: item.fecha, plannedQuantity: item.cantidad })) }
    }),
    summary: "Producci\xF3n planificada."
  });
  apiTool(server, context, {
    name: "mover_asignacion_produccion",
    title: "Mover una asignaci\xF3n de producci\xF3n a otro d\xEDa",
    description: "Cambia el d\xEDa de una asignaci\xF3n de producci\xF3n (el ID sale de detalle_pedido \u2192 l\xEDneas \u2192 productionAllocations). Solo asignaciones sin resultado.",
    access: "write",
    idempotent: true,
    input: { asignacionId: identificador("ID de la asignaci\xF3n."), fecha: fecha("Nuevo d\xEDa de producci\xF3n.") },
    request: ({ asignacionId, fecha: plannedDate }) => ({ method: "PATCH", path: `/api/production-allocations/${enc3(asignacionId)}/move`, body: { plannedDate } }),
    summary: "Asignaci\xF3n movida."
  });
  apiTool(server, context, {
    name: "registrar_resultado_produccion",
    title: "Registrar lo realmente producido",
    description: "Carga el resultado real de una asignaci\xF3n de producci\xF3n: cu\xE1ntas unidades se hicieron y qu\xE9 d\xEDa. Si se produjo algo, indic\xE1 el destino: \xABcliente\xBB (queda para el pedido) o \xABstock\xBB. Con 0 unidades queda como no producido. La fecha real no puede ser futura.",
    access: "write",
    input: {
      asignacionId: identificador("ID de la asignaci\xF3n."),
      cantidadReal: z4.number().int().min(0).describe("Unidades producidas realmente."),
      fechaReal: fecha("D\xEDa en que se produjo."),
      destino: z4.enum(["cliente", "stock"]).optional().describe("Obligatorio si cantidadReal > 0."),
      nota: z4.string().optional()
    },
    request: (args) => ({
      method: "POST",
      path: `/api/production-allocations/${enc3(args.asignacionId)}/result`,
      body: clean({ actualQuantity: args.cantidadReal, actualDate: args.fechaReal, destination: args.destino === "cliente" ? "client" : args.destino === "stock" ? "stock" : void 0, note: args.nota })
    }),
    summary: "Resultado de producci\xF3n registrado."
  });
  apiTool(server, context, {
    name: "programar_secado",
    title: "Programar el secadero de un pedido",
    description: "Programa cu\xE1ntas unidades con HT entran al secadero cada d\xEDa. Con `asignaciones` se define d\xEDa y cantidad por l\xEDnea (recomendado); sin ellas, solo el rango de fechas. Superar la capacidad diaria del secadero no la bloquea.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      asignaciones: z4.array(z4.object({
        lineaId: z4.string().min(1).describe("ID de la l\xEDnea del pedido."),
        fecha: fecha("D\xEDa de secado."),
        cantidad: cantidad("Unidades que se tratan ese d\xEDa.")
      })).optional(),
      fechaInicio: fecha("Primer d\xEDa (si no se detallan asignaciones).").optional(),
      fechaFin: fecha("\xDAltimo d\xEDa (si no se detallan asignaciones).").optional(),
      nota: z4.string().optional()
    },
    request: (args) => ({
      method: "POST",
      path: `/api/orders/${enc3(args.pedidoId)}/drying`,
      body: clean({
        startDate: args.fechaInicio,
        endDate: args.fechaFin,
        note: args.nota,
        allocations: args.asignaciones?.map((item) => ({ orderLineId: item.lineaId, date: item.fecha, quantity: item.cantidad }))
      })
    }),
    summary: "Secadero programado."
  });
  apiTool(server, context, {
    name: "registrar_ht",
    title: "Registrar un tratamiento HT realizado",
    description: "Registra unidades tratadas con HT: pasan de \xABpendiente de HT\xBB a \xABlistas\xBB. Si el stock pendiente no alcanza (producci\xF3n sin cargar), se guarda igual y el saldo queda negativo como advertencia. Para asociarlo a un pedido indic\xE1 lineaPedidoId (de detalle_pedido); sin l\xEDnea es stock general. Los controles son opcionales.",
    access: "write",
    input: {
      productoId: identificador("ID del producto (de opciones_ht)."),
      cantidad: cantidad("Unidades tratadas."),
      momento: momento("Cu\xE1ndo se hizo. Si se omite, ahora.").optional(),
      responsable: responsable3,
      lineaPedidoId: z4.string().optional().describe("L\xEDnea del pedido a la que corresponde."),
      clienteProductoId: identificador("Relaci\xF3n cliente-producto (se deduce de la l\xEDnea si se indica).").optional(),
      nota: z4.string().optional().describe("Observaci\xF3n. Obligatoria solo si alg\xFAn control es \xABNo conforme\xBB."),
      controles: z4.array(z4.object({
        controlId: identificador("ID del punto de control (de opciones_ht)."),
        resultado: z4.enum(["pass", "fail"]).describe("pass = conforme; fail = no conforme (exige nota)."),
        nota: z4.string().optional()
      })).optional()
    },
    request: (args) => ({
      method: "POST",
      path: "/api/treatment/batches",
      body: clean({
        productId: String(args.productoId),
        quantity: args.cantidad,
        performedAt: args.momento ?? (/* @__PURE__ */ new Date()).toISOString(),
        responsible: args.responsable ?? RESPONSABLE,
        orderLineId: args.lineaPedidoId,
        clientProductId: args.clienteProductoId,
        note: args.nota,
        controls: args.controles?.map((control) => ({ controlId: control.controlId, result: control.resultado, note: control.nota })) ?? []
      })
    }),
    summary: "HT registrado."
  });
  apiTool(server, context, {
    name: "registrar_ht_no_realizado",
    title: "Registrar que el HT programado no se hizo",
    description: "Marca que lo programado en el secadero para un d\xEDa no se realiz\xF3 (queda en rojo en el calendario y vuelve a quedar pendiente). La fecha no puede ser futura.",
    access: "write",
    input: {
      pedidoId: identificador("ID del pedido."),
      lineaId: z4.string().min(1).describe("ID de la l\xEDnea del pedido."),
      fecha: fecha("D\xEDa programado que no se cumpli\xF3."),
      responsable: responsable3,
      nota: z4.string().optional().describe("Motivo.")
    },
    request: (args) => ({
      method: "POST",
      path: "/api/treatment/results",
      body: clean({ orderId: String(args.pedidoId), orderLineId: args.lineaId, date: args.fecha, responsible: args.responsable ?? RESPONSABLE, note: args.nota })
    }),
    summary: "Registrado como no realizado."
  });
  apiTool(server, context, {
    name: "revertir_lote_ht",
    title: "Revertir un lote de HT",
    description: "Anula un lote de HT: las unidades vuelven a \xABpendiente de HT\xBB. Queda registrado el motivo. Solo se revierte una vez. Ped\xED confirmaci\xF3n.",
    access: "write",
    destructive: true,
    input: {
      loteId: identificador("ID del lote."),
      motivo: z4.string().min(1).describe("Por qu\xE9 se revierte."),
      responsable: responsable3,
      momento: momento("Cu\xE1ndo se revierte. Si se omite, ahora.").optional()
    },
    request: (args) => ({
      method: "POST",
      path: `/api/treatment/batches/${enc3(args.loteId)}/reverse`,
      body: { note: args.motivo, responsible: args.responsable ?? RESPONSABLE, performedAt: args.momento ?? (/* @__PURE__ */ new Date()).toISOString() }
    }),
    summary: "Lote revertido."
  });
}
var enc3, responsable3;
var init_tools_operations = __esm({
  "app/mcp/tools-operations.ts"() {
    "use strict";
    init_kit();
    enc3 = (value) => encodeURIComponent(String(value));
    responsable3 = z4.string().min(1).optional().describe(`Qui\xE9n lo hace. Si se omite, se registra \xAB${RESPONSABLE}\xBB.`);
  }
});

// app/mcp/tools-read.ts
import { z as z5 } from "zod";
function registerReadTools(server, context) {
  tool(server, context, {
    name: "guia_operativa",
    title: "Gu\xEDa operativa de Ecoase",
    description: "Explica el flujo de trabajo del dashboard, las reglas y qu\xE9 herramienta usar en cada paso. Leela al empezar si no conoc\xE9s la operaci\xF3n.",
    access: "read",
    input: {},
    run: async () => done(guideText, { hoy: todayKey(), zonaHoraria: "America/Montevideo" })
  });
  tool(server, context, {
    name: "listar_pedidos",
    title: "Listar pedidos",
    description: "Lista pedidos con su estado, cantidades, productos, producci\xF3n y viajes. Filtra por abiertos, cerrados (entregados o cancelados) o todos, por cliente y por texto.",
    access: "read",
    input: {
      estado: z5.enum(["abiertos", "cerrados", "todos"]).default("abiertos").describe("Abiertos = en curso; cerrados = entregados o cancelados."),
      cliente: z5.string().optional().describe("Parte del nombre del cliente."),
      texto: z5.string().optional().describe("Busca en referencia, producto y notas."),
      limite: z5.number().int().min(1).max(200).default(50).describe("M\xE1ximo de pedidos a devolver.")
    },
    run: async ({ estado, cliente, texto, limite }) => {
      const clientNeedle = normalize2(cliente ?? "");
      const textNeedle = normalize2(texto ?? "");
      const matches = (await getOrders()).filter((order) => {
        if (estado === "abiertos" && isOrderClosed(order)) return false;
        if (estado === "cerrados" && !isOrderClosed(order)) return false;
        if (clientNeedle && !normalize2(order.client).includes(clientNeedle)) return false;
        if (textNeedle && !normalize2([order.id, order.reference, order.notes ?? "", ...order.lines.map((line) => line.product)].join(" ")).includes(textNeedle)) return false;
        return true;
      });
      return done(`Hay ${matches.length} pedido(s) ${estado === "todos" ? "" : estado}${matches.length > limite ? `; muestro los primeros ${limite}` : ""}.`, { total: matches.length, pedidos: matches.slice(0, limite).map(summarizeOrder) });
    }
  });
  apiTool(server, context, {
    name: "detalle_pedido",
    title: "Detalle completo de un pedido",
    description: "Devuelve todo un pedido por su ID: l\xEDneas con sus IDs, producci\xF3n planificada y real, secadero, HT, viajes, transporte y fechas. Usalo antes de planificar o modificar.",
    access: "read",
    input: { pedidoId: identificador("ID del pedido (lo da listar_pedidos o ver_pedido).") },
    request: ({ pedidoId }) => ({ method: "GET", path: `/api/orders/${encodeURIComponent(String(pedidoId))}` }),
    summary: "Detalle del pedido."
  });
  apiTool(server, context, {
    name: "historial_pedido",
    title: "Historial de cambios de un pedido",
    description: "Lista los cambios registrados de un pedido (qui\xE9n, cu\xE1ndo y qu\xE9 cambi\xF3).",
    access: "read",
    input: { pedidoId: identificador("ID del pedido.") },
    request: ({ pedidoId }) => ({ method: "GET", path: `/api/orders/${encodeURIComponent(String(pedidoId))}/history` }),
    summary: (data) => `El pedido tiene ${count(data, "history")} cambio(s) registrados.`
  });
  apiTool(server, context, {
    name: "calendario",
    title: "Calendario operativo",
    description: "Viajes, salidas de transporte, producci\xF3n planificada y entregas pedidas dentro de un rango de fechas, m\xE1s la capacidad de esos d\xEDas. Sin fechas, usa la semana actual.",
    access: "read",
    input: { desde: fecha("Primer d\xEDa.").optional(), hasta: fecha("\xDAltimo d\xEDa.").optional() },
    request: ({ desde, hasta }) => ({ method: "GET", path: "/api/calendar", query: { from: desde, to: hasta } }),
    summary: (data) => `Calendario: ${count(data, "calendar")} viaje(s), ${count(data, "transport")} salida(s), ${count(data, "production")} d\xEDa(s) de producci\xF3n.`
  });
  apiTool(server, context, {
    name: "capacidad_produccion",
    title: "Capacidad y carga por d\xEDa",
    description: "Capacidad de producci\xF3n por recurso y producto, carga asignada, estado (libre, ok, sobre lo normal, sobre el m\xE1ximo) y capacidad de transporte, d\xEDa por d\xEDa. La sobrecarga es una advertencia, no un bloqueo.",
    access: "read",
    input: { desde: fecha("Primer d\xEDa."), hasta: fecha("\xDAltimo d\xEDa.") },
    request: ({ desde, hasta }) => ({ method: "GET", path: "/api/capacity", query: { from: desde, to: hasta } }),
    summary: "Capacidad del per\xEDodo."
  });
  apiTool(server, context, {
    name: "listar_recursos_produccion",
    title: "Recursos de producci\xF3n",
    description: "F\xE1bricas, cuadrillas y aserraderos externos que producen, con qu\xE9 tipos de producto produce cada uno (Pallet, Bin, Piso), orden y si est\xE1n activos.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/capacity/resources" }),
    summary: (data) => `Hay ${count(data, "resources")} recurso(s) de producci\xF3n.`
  });
  apiTool(server, context, {
    name: "logistica_resumen",
    title: "Log\xEDstica: panorama general",
    description: "Foto de Log\xEDstica: salidas agendadas, veh\xEDculos, choferes, disponibilidad de palets listos por l\xEDnea de pedido, stock y l\xEDmites. Por defecto devuelve salidas, veh\xEDculos, choferes, ajustes y disponibilidad; ped\xED otras secciones con `secciones`.",
    access: "read",
    input: {
      secciones: z5.array(z5.string()).optional().describe("Secciones a devolver: runs, vehicles, drivers, settings, availability, orders, products, clients, providers, stock, classes, locations, transportCapacities, clientLimits.")
    },
    request: () => ({ method: "GET", path: "/api/logistics/snapshot" }),
    pick: (data, { secciones }) => pickKeys(data, secciones?.length ? secciones : ["runs", "vehicles", "drivers", "settings", "availability"]),
    summary: "Panorama de Log\xEDstica."
  });
  apiTool(server, context, {
    name: "logistica_configuracion",
    title: "Configuraci\xF3n de Log\xEDstica",
    description: "Veh\xEDculos, choferes, jornada, tama\xF1o de cada producto (chico/grande), ubicaciones, capacidades de transportistas y l\xEDmites por cliente.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/logistics/config" }),
    summary: "Configuraci\xF3n de Log\xEDstica."
  });
  apiTool(server, context, {
    name: "listar_salidas_logistica",
    title: "Salidas de transporte",
    description: "Salidas agendadas con veh\xEDculo, chofer, horarios, ruta calculada y estado. Se puede filtrar por pedido.",
    access: "read",
    input: { pedidoId: identificador("Solo las salidas de este pedido.").optional() },
    request: ({ pedidoId }) => ({ method: "GET", path: "/api/logistics/runs", query: { orderId: pedidoId === void 0 ? void 0 : String(pedidoId) } }),
    summary: (data) => `Hay ${count(data, "runs")} salida(s).`
  });
  apiTool(server, context, {
    name: "stock_producto",
    title: "Stock y movimientos de un producto",
    description: "Detalle de stock de un producto: pendiente de HT, listo, reservado, disponible y su historial de movimientos.",
    access: "read",
    input: { productoId: identificador("ID del producto (lo da listar_productos o consultar_stock).") },
    request: ({ productoId }) => ({ method: "GET", path: `/api/stock/${encodeURIComponent(String(productoId))}` }),
    summary: "Detalle de stock."
  });
  tool(server, context, {
    name: "listar_productos",
    title: "Cat\xE1logo de productos",
    description: "Productos del cat\xE1logo con tipo (Pallet, Piso, Bin), medida, clasificaci\xF3n por niveles, c\xF3digo Zeta, si requiere HT y clientes asociados.",
    access: "read",
    input: {
      consulta: z5.string().optional().describe("Texto a buscar en nombre, medida o c\xF3digo."),
      tipo: z5.enum(["Pallet", "Piso", "Bin"]).optional(),
      limite: z5.number().int().min(1).max(300).default(100)
    },
    run: async ({ consulta, tipo, limite }) => {
      const response = await callApi({ method: "GET", path: "/api/products" });
      if (!response.ok) return fail(apiErrorMessage(response));
      const needle = normalize2(consulta ?? "");
      const all = response.data.products ?? [];
      const found = all.filter((product) => (!tipo || product.kind === tipo) && (!needle || normalize2(JSON.stringify(product)).includes(needle)));
      return done(`Hay ${found.length} producto(s)${found.length > limite ? `; muestro ${limite}` : ""}.`, { total: found.length, productos: found.slice(0, limite) });
    }
  });
  apiTool(server, context, {
    name: "niveles_producto",
    title: "Niveles de clasificaci\xF3n de productos",
    description: "Los niveles con los que se clasifican los productos (Medida, Tratamiento, etc.), sus opciones y cu\xE1ntos productos usa cada una.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/product-levels" }),
    summary: "Niveles de clasificaci\xF3n."
  });
  tool(server, context, {
    name: "listar_proveedores",
    title: "Proveedores y transportistas",
    description: "Aserraderos, transportistas e importadores registrados.",
    access: "read",
    input: { tipo: z5.enum(["Aserradero", "Transporte", "Importador"]).optional() },
    run: async ({ tipo }) => {
      const response = await callApi({ method: "GET", path: "/api/providers" });
      if (!response.ok) return fail(apiErrorMessage(response));
      const providers2 = (response.data.providers ?? []).filter((provider) => !tipo || provider.type === tipo);
      return done(`Hay ${providers2.length} proveedor(es).`, { proveedores: providers2 });
    }
  });
  tool(server, context, {
    name: "ver_cliente",
    title: "Ver un cliente con sus productos",
    description: "Datos de un cliente y los productos que tiene habilitados, con el clienteProductoId que hace falta para crear pedidos y los puntos de control de cada producto.",
    access: "read",
    input: { clienteId: identificador("ID del cliente (lo da listar_clientes o clientes_con_actividad).") },
    run: async ({ clienteId }) => {
      const id = encodeURIComponent(String(clienteId));
      const [detail, options] = await Promise.all([
        callApi({ method: "GET", path: `/api/clients/${id}` }),
        callApi({ method: "GET", path: `/api/clients/${id}/products`, query: { active: true } })
      ]);
      if (!detail.ok) return fail(apiErrorMessage(detail));
      return done("Cliente y productos habilitados para pedidos.", { cliente: detail.data, productosParaPedido: options.data?.products ?? [] });
    }
  });
  apiTool(server, context, {
    name: "clientes_con_actividad",
    title: "Clientes con su actividad",
    description: "Clientes con cantidad de pedidos, unidades pedidas, entregadas y pendientes, y pedidos abiertos.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/clients" }),
    summary: (data) => `Hay ${count(data, "clients")} cliente(s).`
  });
  apiTool(server, context, {
    name: "registro_ht_dia",
    title: "Registro de HT de un d\xEDa",
    description: "Resumen del secadero y los lotes de HT registrados en un d\xEDa.",
    access: "read",
    input: { fecha: fecha("D\xEDa a consultar. Sin fecha, hoy.").optional() },
    request: ({ fecha: day }) => ({ method: "GET", path: "/api/treatment", query: { date: day } }),
    summary: "Registro de HT del d\xEDa."
  });
  apiTool(server, context, {
    name: "registro_ht_semana",
    title: "Programaci\xF3n y resultados de HT de la semana",
    description: "Para cada d\xEDa del rango (m\xE1ximo siete d\xEDas): lo programado, lo registrado y lo que no se hizo, por pedido y producto.",
    access: "read",
    input: { desde: fecha("Primer d\xEDa."), hasta: fecha("\xDAltimo d\xEDa, hasta siete d\xEDas desde el primero.") },
    request: ({ desde, hasta }) => ({ method: "GET", path: "/api/treatment/results", query: { from: desde, to: hasta } }),
    summary: "Semana de HT."
  });
  apiTool(server, context, {
    name: "opciones_ht",
    title: "Qu\xE9 se puede registrar en HT",
    description: "Productos con HT y su stock pendiente, con los clientes, l\xEDneas de pedido y puntos de control disponibles para registrar un lote.",
    access: "read",
    input: {},
    request: () => ({ method: "GET", path: "/api/treatment/options" }),
    summary: (data) => `Hay ${count(data, "options")} producto(s) con HT.`
  });
  apiTool(server, context, {
    name: "ver_lote_ht",
    title: "Ver un lote de HT",
    description: "Detalle de un lote de HT: cantidades, controles, responsable y movimientos de stock.",
    access: "read",
    input: { loteId: identificador("ID del lote.") },
    request: ({ loteId }) => ({ method: "GET", path: `/api/treatment/batches/${encodeURIComponent(String(loteId))}` }),
    summary: "Detalle del lote."
  });
  apiTool(server, context, {
    name: "url_archivo_producto_cliente",
    title: "Enlace temporal a un plano o foto",
    description: "Devuelve un enlace temporal para abrir un plano o foto de un producto de cliente.",
    access: "read",
    input: { archivoId: identificador("ID del archivo.") },
    request: ({ archivoId }) => ({ method: "POST", path: `/api/client-product-assets/${encodeURIComponent(String(archivoId))}/signed-url` }),
    summary: "Enlace temporal (vence en poco tiempo)."
  });
}
var guideText;
var init_tools_read = __esm({
  "app/mcp/tools-read.ts"() {
    "use strict";
    init_data();
    init_store();
    init_bridge();
    init_operational();
    init_kit();
    guideText = `GU\xCDA OPERATIVA DE ECOASE

Flujo normal de un pedido
1. Pedido: crear_pedido (cliente y productos salen de ver_cliente; us\xE1 clienteProductoId).
2. Producci\xF3n: planificar_produccion reparte cantidades por d\xEDa y recurso. Al terminar la jornada, registrar_resultado_produccion carga lo realmente producido (destino: cliente o stock).
3. Secadero / HT (solo productos con HT): programar_secado reparte las unidades por d\xEDa; registrar_ht carga el tratamiento hecho; registrar_ht_no_realizado marca lo que no se hizo.
4. Log\xEDstica: crear_viaje reparte lo listo en viajes; guardar_salida agenda veh\xEDculo, chofer y horario; avanzar_viaje lo lleva por listo \u2192 cargado \u2192 despachado \u2192 entregado.
5. Seguimiento: detalle_pedido, calendario, resumen_operativo y listar_pedidos_en_riesgo.

Reglas que conviene respetar
- Capacidad, stock y fechas son advertencias, nunca bloqueos: si algo supera la capacidad o se planifica fuera de fecha, se puede guardar igual; inform\xE1 la advertencia a la persona. Solo se rechaza lo incoherente (m\xE1s unidades que las del pedido, datos inv\xE1lidos, resultado real con fecha futura).
- Las fechas van como AAAA-MM-DD en hora de Uruguay; los momentos como ISO 8601 con zona (-03:00).
- Las cantidades de producci\xF3n, secadero y HT son unidades (no "palets").
- Etapas del pedido: Planificando (amarillo), Produciendo (azul), Enviando (verde); luego Entregado o Cancelado.
- Antes de modificar o borrar, mostrale a la persona lo que vas a cambiar y ped\xED confirmaci\xF3n si hay dudas. Borrar y revertir no se puede deshacer.
- Los identificadores (pedido, l\xEDnea, asignaci\xF3n, viaje, lote, producto, cliente) se obtienen con las herramientas de lectura; nunca los inventes.`;
  }
});

// app/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as z6 } from "zod";
function resolveRange(from, to) {
  const today = todayKey();
  const resolvedFrom = from && isoDate8.test(from) ? from : today;
  const resolvedTo = to && isoDate8.test(to) ? to : addDays2(resolvedFrom, 50);
  if (resolvedFrom > resolvedTo) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  return { from: resolvedFrom, to: resolvedTo, today };
}
function textResult(summary, data) {
  return {
    structuredContent: { data },
    content: [{ type: "text", text: `${summary}
${JSON.stringify(shrink(data))}` }]
  };
}
function createEcoaseMcpServer(options = {}) {
  const context = { canWrite: Boolean(options.canWrite) };
  const server = new McpServer(
    { name: "ecoase-control-operativo", version: "1.0.0" },
    {
      instructions: [
        "Control operativo de Ecoase: pedidos, producci\xF3n, secadero y HT, log\xEDstica, stock, capacidad, clientes, productos y proveedores.",
        "Empez\xE1 con guia_operativa si no conoc\xE9s el flujo. Para saber qu\xE9 pasa us\xE1 resumen_operativo, listar_pedidos, detalle_pedido y calendario; inform\xE1 siempre el per\xEDodo consultado y no presentes una alerta como certeza si depende de datos faltantes.",
        options.canWrite ? "Esta conexi\xF3n puede modificar datos: antes de crear, cambiar, cancelar, borrar o revertir, confirm\xE1 con la persona lo que vas a hacer (salvo que ya lo haya pedido de forma expl\xEDcita) y, despu\xE9s de escribir, volv\xE9 a leer para verificar el resultado." : "Esta conexi\xF3n es de solo lectura: no hay herramientas para modificar datos.",
        "Capacidad, stock y fechas son advertencias, no bloqueos: si algo se pasa de la capacidad, guardalo igual e inform\xE1 la advertencia. Nunca inventes identificadores: obtenelos con las herramientas de lectura."
      ].join("\n")
    }
  );
  server.registerTool(
    "resumen_operativo",
    {
      title: "Resumen operativo de Ecoase",
      description: "Resume pedidos abiertos, entregas y alertas de Ecoase para un per\xEDodo. Usalo para preguntas como qu\xE9 pasa en los pr\xF3ximos d\xEDas o qu\xE9 cambi\xF3 en la operaci\xF3n.",
      inputSchema: {
        desde: z6.string().regex(isoDate8).optional().describe("Fecha inicial YYYY-MM-DD. Por defecto, hoy en Uruguay."),
        hasta: z6.string().regex(isoDate8).optional().describe("Fecha final YYYY-MM-DD. Por defecto, 50 d\xEDas desde la fecha inicial."),
        clientes: z6.array(z6.string().min(1)).max(10).optional().describe("Nombres exactos de clientes. Si se omite, incluye todos.")
      },
      outputSchema: { data: z6.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ desde, hasta, clientes }) => {
      const range = resolveRange(desde, hasta);
      const allOrders = await getOrders();
      const orders2 = filterOperationalOrders(allOrders, { from: range.from, to: range.to, clients: clientes });
      const alerts = buildOperationalAlerts(orders2, range.today);
      const deliveries = orders2.flatMap((order) => (order.shipments ?? []).filter((shipment) => !["cancelled", "delivered"].includes(shipment.status) && shipment.plannedDate >= range.from && shipment.plannedDate <= range.to).map((shipment) => ({
        date: shipment.plannedDate,
        orderId: order.id,
        reference: order.reference,
        client: order.client,
        status: shipment.status,
        transport: shipment.transportLabel,
        quantity: shipment.lines.reduce((sum, line) => sum + line.plannedQuantity, 0)
      })));
      const data = {
        period: { from: range.from, to: range.to, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), timeZone: "America/Montevideo" },
        filters: { clients: clientes ?? [] },
        totals: {
          openOrders: orders2.length,
          pendingUnits: orders2.reduce((sum, order) => sum + order.pending, 0),
          plannedDeliveries: deliveries.length,
          alerts: alerts.length,
          criticalAlerts: alerts.filter((alert) => alert.severity === "critical").length
        },
        orders: orders2.map(summarizeOrder),
        deliveries: deliveries.sort((a, b) => a.date.localeCompare(b.date)),
        alerts: alerts.slice(0, 50)
      };
      return textResult(`Entre ${range.from} y ${range.to} hay ${orders2.length} pedidos abiertos, ${deliveries.length} entregas previstas y ${alerts.length} alertas.`, data);
    }
  );
  server.registerTool(
    "listar_pedidos_en_riesgo",
    {
      title: "Listar pedidos en riesgo",
      description: "Lista alertas operativas por atraso, HT, producci\xF3n o transporte. Permite filtrar por cliente, fechas y severidad.",
      inputSchema: {
        desde: z6.string().regex(isoDate8).optional(),
        hasta: z6.string().regex(isoDate8).optional(),
        clientes: z6.array(z6.string().min(1)).max(10).optional(),
        severidad: z6.enum(severities).optional()
      },
      outputSchema: { data: z6.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ desde, hasta, clientes, severidad }) => {
      const range = resolveRange(desde, hasta);
      const allOrders = await getOrders();
      const orders2 = filterOperationalOrders(allOrders, { from: range.from, to: range.to, clients: clientes });
      const alerts = buildOperationalAlerts(orders2, range.today).filter((alert) => !severidad || alert.severity === severidad);
      return textResult(`Encontr\xE9 ${alerts.length} alertas para el per\xEDodo ${range.from} a ${range.to}.`, {
        period: { from: range.from, to: range.to, generatedAt: (/* @__PURE__ */ new Date()).toISOString() },
        alerts
      });
    }
  );
  server.registerTool(
    "ver_pedido",
    {
      title: "Ver un pedido",
      description: "Busca un pedido de Ecoase por ID, referencia o nombre de cliente y devuelve su estado, productos, producci\xF3n, HT y viajes.",
      inputSchema: { consulta: z6.string().min(1).describe("ID, referencia o nombre del cliente.") },
      outputSchema: { data: z6.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ consulta }) => {
      const needle = normalize2(consulta);
      const orders2 = await getOrders();
      const matches = orders2.filter((order) => [order.id, order.reference, order.client].some((value) => normalize2(value).includes(needle)));
      const data = matches.slice(0, 20).map(summarizeOrder);
      return textResult(matches.length ? `Encontr\xE9 ${matches.length} pedido(s) relacionados con \u201C${consulta}\u201D.` : `No encontr\xE9 pedidos relacionados con \u201C${consulta}\u201D.`, data);
    }
  );
  server.registerTool(
    "listar_clientes",
    {
      title: "Listar clientes y productos",
      description: "Busca clientes de Ecoase y muestra los productos habilitados para cada uno. Usalo para saber qu\xE9 compra o utiliza un cliente.",
      inputSchema: { consulta: z6.string().optional().describe("Parte del nombre del cliente. Si se omite, lista todos.") },
      outputSchema: { data: z6.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ consulta }) => {
      const needle = normalize2(consulta ?? "");
      const clients = (await getClients()).filter((client) => !needle || normalize2(client.name).includes(needle)).slice(0, 50);
      const details = await Promise.all(clients.map((client) => getClientDetail(client.id)));
      const data = details.filter((detail) => detail !== null).map((detail) => ({
        id: detail.client.id,
        name: detail.client.name,
        address: detail.client.address,
        department: detail.client.department,
        active: detail.client.active,
        updatedAt: detail.client.updatedAt,
        products: detail.products.filter((product) => product.active).map((product) => ({
          id: product.productId,
          clientProductId: product.id,
          name: product.operationalName ?? product.product.stockName ?? `${product.product.kind} ${product.product.measure ?? ""}`.trim(),
          zetaCode: product.product.zetaCode ?? product.zetaCode,
          requiresTreatment: product.product.requiresTreatment,
          controls: product.controls.filter((control) => control.active).map((control) => control.title)
        }))
      }));
      return textResult(`Encontr\xE9 ${data.length} cliente(s).`, data);
    }
  );
  server.registerTool(
    "consultar_stock",
    {
      title: "Consultar stock",
      description: "Consulta stock f\xEDsico, pendiente de HT, listo, reservado y disponible por producto.",
      inputSchema: {
        consulta: z6.string().optional().describe("Nombre, medida o c\xF3digo del producto.")
      },
      outputSchema: { data: z6.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ consulta }) => {
      const needle = normalize2(consulta ?? "");
      const rows = (await getStockSummary()).filter((row) => {
        const searchable = [row.product.id, row.product.stockName, row.product.kind, row.product.measure, row.product.zetaCode].filter(Boolean).join(" ");
        return !needle || normalize2(searchable).includes(needle);
      });
      const data = rows.map((row) => ({
        productId: row.product.id,
        product: row.product.stockName ?? `${row.product.kind} ${row.product.measure ?? ""}`.trim(),
        zetaCode: row.product.zetaCode,
        pendingTreatment: row.pending,
        ready: row.ready,
        reserved: row.reserved,
        available: row.available,
        physical: row.physical,
        nextDelivery: row.nextDelivery,
        lastMovementAt: row.lastMovementAt
      }));
      return textResult(`Encontr\xE9 ${data.length} producto(s) en stock.`, data);
    }
  );
  registerReadTools(server, context);
  registerOperationTools(server, context);
  registerLogisticsTools(server, context);
  registerAdminTools(server, context);
  return server;
}
var severities;
var init_server = __esm({
  "app/mcp/server.ts"() {
    "use strict";
    init_store();
    init_operational();
    init_bridge();
    init_kit();
    init_tools_admin();
    init_tools_logistics();
    init_tools_operations();
    init_tools_read();
    severities = ["critical", "high", "medium"];
  }
});

// app/mcp/route.ts
var route_exports56 = {};
__export(route_exports56, {
  DELETE: () => DELETE7,
  GET: () => GET25,
  OPTIONS: () => OPTIONS,
  POST: () => POST28,
  dynamic: () => dynamic,
  runtime: () => runtime
});
import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function accessFor(request) {
  const writeToken = process.env.ECOASE_MCP_TOKEN?.trim();
  const readToken = process.env.ECOASE_MCP_READ_TOKEN?.trim();
  if (!writeToken && !readToken) return "read";
  const sent = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  const matches = (expected) => {
    if (!sent || !expected) return false;
    const a = Buffer.from(sent), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  if (matches(writeToken)) return "write";
  if (matches(readToken)) return "read";
  return "denied";
}
async function handle(request) {
  const access = accessFor(request);
  if (access === "denied") {
    return withCors(new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Falta el token de acceso o no es v\xE1lido." }, id: null }), {
      status: 401,
      headers: { "content-type": "application/json", "WWW-Authenticate": 'Bearer realm="ecoase-mcp"' }
    }));
  }
  const server = createEcoaseMcpServer({ canWrite: access === "write" });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: void 0,
    enableJsonResponse: true
  });
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}
async function POST28(request) {
  return handle(request);
}
async function GET25(request) {
  return handle(request);
}
async function DELETE7(request) {
  return handle(request);
}
async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
var runtime, dynamic, corsHeaders;
var init_route56 = __esm({
  "app/mcp/route.ts"() {
    "use strict";
    init_server();
    runtime = "nodejs";
    dynamic = "force-dynamic";
    corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
      "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version"
    };
  }
});

// server/route-map.ts
var routes;
var init_route_map = __esm({
  "server/route-map.ts"() {
    "use strict";
    routes = [
      { pattern: new RegExp("^/api/calendar$"), keys: [], load: () => Promise.resolve().then(() => (init_route(), route_exports)) },
      { pattern: new RegExp("^/api/capacity/adjustments$"), keys: [], load: () => Promise.resolve().then(() => (init_route2(), route_exports2)) },
      { pattern: new RegExp("^/api/capacity/internal-production$"), keys: [], load: () => Promise.resolve().then(() => (init_route3(), route_exports3)) },
      { pattern: new RegExp("^/api/capacity/resources$"), keys: [], load: () => Promise.resolve().then(() => (init_route4(), route_exports4)) },
      { pattern: new RegExp("^/api/capacity$"), keys: [], load: () => Promise.resolve().then(() => (init_route5(), route_exports5)) },
      { pattern: new RegExp("^/api/capacity/rules$"), keys: [], load: () => Promise.resolve().then(() => (init_route6(), route_exports6)) },
      { pattern: new RegExp("^/api/capacity/transport$"), keys: [], load: () => Promise.resolve().then(() => (init_route7(), route_exports7)) },
      { pattern: new RegExp("^/api/capacity/trip-adjustments$"), keys: [], load: () => Promise.resolve().then(() => (init_route8(), route_exports8)) },
      { pattern: new RegExp("^/api/clients$"), keys: [], load: () => Promise.resolve().then(() => (init_route9(), route_exports9)) },
      { pattern: new RegExp("^/api/history$"), keys: [], load: () => Promise.resolve().then(() => (init_route10(), route_exports10)) },
      { pattern: new RegExp("^/api/logistics/config$"), keys: [], load: () => Promise.resolve().then(() => (init_route11(), route_exports11)) },
      { pattern: new RegExp("^/api/logistics$"), keys: [], load: () => Promise.resolve().then(() => (init_route12(), route_exports12)) },
      { pattern: new RegExp("^/api/logistics/runs$"), keys: [], load: () => Promise.resolve().then(() => (init_route13(), route_exports13)) },
      { pattern: new RegExp("^/api/logistics/snapshot$"), keys: [], load: () => Promise.resolve().then(() => (init_route14(), route_exports14)) },
      { pattern: new RegExp("^/api/orders$"), keys: [], load: () => Promise.resolve().then(() => (init_route15(), route_exports15)) },
      { pattern: new RegExp("^/api/product-levels$"), keys: [], load: () => Promise.resolve().then(() => (init_route16(), route_exports16)) },
      { pattern: new RegExp("^/api/products$"), keys: [], load: () => Promise.resolve().then(() => (init_route17(), route_exports17)) },
      { pattern: new RegExp("^/api/providers$"), keys: [], load: () => Promise.resolve().then(() => (init_route18(), route_exports18)) },
      { pattern: new RegExp("^/api/stock/movements/adjustments$"), keys: [], load: () => Promise.resolve().then(() => (init_route19(), route_exports19)) },
      { pattern: new RegExp("^/api/stock/movements/receipts$"), keys: [], load: () => Promise.resolve().then(() => (init_route20(), route_exports20)) },
      { pattern: new RegExp("^/api/stock/summary$"), keys: [], load: () => Promise.resolve().then(() => (init_route21(), route_exports21)) },
      { pattern: new RegExp("^/api/treatment/batches$"), keys: [], load: () => Promise.resolve().then(() => (init_route22(), route_exports22)) },
      { pattern: new RegExp("^/api/treatment/options$"), keys: [], load: () => Promise.resolve().then(() => (init_route23(), route_exports23)) },
      { pattern: new RegExp("^/api/treatment/results$"), keys: [], load: () => Promise.resolve().then(() => (init_route24(), route_exports24)) },
      { pattern: new RegExp("^/api/treatment$"), keys: [], load: () => Promise.resolve().then(() => (init_route25(), route_exports25)) },
      { pattern: new RegExp("^/api/client-product-assets/([^/]+)/content$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route26(), route_exports26)) },
      { pattern: new RegExp("^/api/client-product-assets/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route27(), route_exports27)) },
      { pattern: new RegExp("^/api/client-product-assets/([^/]+)/signed-url$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route28(), route_exports28)) },
      { pattern: new RegExp("^/api/client-products/([^/]+)/assets$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route29(), route_exports29)) },
      { pattern: new RegExp("^/api/client-products/([^/]+)/controls$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route30(), route_exports30)) },
      { pattern: new RegExp("^/api/client-products/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route31(), route_exports31)) },
      { pattern: new RegExp("^/api/clients/([^/]+)/products$"), keys: ["clientId"], load: () => Promise.resolve().then(() => (init_route32(), route_exports32)) },
      { pattern: new RegExp("^/api/clients/([^/]+)$"), keys: ["clientId"], load: () => Promise.resolve().then(() => (init_route33(), route_exports33)) },
      { pattern: new RegExp("^/api/logistics/routes/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route34(), route_exports34)) },
      { pattern: new RegExp("^/api/order-lines/([^/]+)/production-allocations$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route35(), route_exports35)) },
      { pattern: new RegExp("^/api/orders/([^/]+)/drying$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route36(), route_exports36)) },
      { pattern: new RegExp("^/api/orders/([^/]+)/history$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route37(), route_exports37)) },
      { pattern: new RegExp("^/api/orders/([^/]+)/production-plan$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route38(), route_exports38)) },
      { pattern: new RegExp("^/api/orders/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route39(), route_exports39)) },
      { pattern: new RegExp("^/api/orders/([^/]+)/shipments$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route40(), route_exports40)) },
      { pattern: new RegExp("^/api/orders/([^/]+)/transport$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route41(), route_exports41)) },
      { pattern: new RegExp("^/api/orders/([^/]+)/updates$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route42(), route_exports42)) },
      { pattern: new RegExp("^/api/production-allocations/([^/]+)/complete$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route43(), route_exports43)) },
      { pattern: new RegExp("^/api/production-allocations/([^/]+)/confirm$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route44(), route_exports44)) },
      { pattern: new RegExp("^/api/production-allocations/([^/]+)/move$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route45(), route_exports45)) },
      { pattern: new RegExp("^/api/production-allocations/([^/]+)/result$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route46(), route_exports46)) },
      { pattern: new RegExp("^/api/products/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route47(), route_exports47)) },
      { pattern: new RegExp("^/api/providers/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route48(), route_exports48)) },
      { pattern: new RegExp("^/api/shipments/([^/]+)/reschedule$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route49(), route_exports49)) },
      { pattern: new RegExp("^/api/shipments/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route50(), route_exports50)) },
      { pattern: new RegExp("^/api/shipments/([^/]+)/transition$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route51(), route_exports51)) },
      { pattern: new RegExp("^/api/stock/([^/]+)$"), keys: ["productId"], load: () => Promise.resolve().then(() => (init_route52(), route_exports52)) },
      { pattern: new RegExp("^/api/stock/movements/([^/]+)/reverse$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route53(), route_exports53)) },
      { pattern: new RegExp("^/api/treatment/batches/([^/]+)/reverse$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route54(), route_exports54)) },
      { pattern: new RegExp("^/api/treatment/batches/([^/]+)$"), keys: ["id"], load: () => Promise.resolve().then(() => (init_route55(), route_exports55)) },
      { pattern: /^\/mcp$/, keys: [], load: () => Promise.resolve().then(() => (init_route56(), route_exports56)) }
    ];
  }
});

// server/router.ts
var router_exports = {};
__export(router_exports, {
  dispatch: () => dispatch
});
async function dispatch(request, pathOverride) {
  const pathname = pathOverride ?? new URL(request.url).pathname;
  const route = routes.find((item) => item.pattern.test(pathname));
  if (!route) return Response.json({ error: "Ruta no encontrada." }, { status: 404 });
  try {
    const match = route.pattern.exec(pathname);
    const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    const module = await route.load();
    const handler = module[request.method];
    if (!handler) {
      const allow = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].filter((method) => typeof module[method] === "function").join(", ");
      return new Response(null, { status: 405, headers: { Allow: allow } });
    }
    return await handler(request, { params: Promise.resolve(params) });
  } catch (error) {
    console.error(`Error en ${request.method} ${pathname}:`, error);
    return Response.json({ error: "No se pudo completar la operaci\xF3n." }, { status: 500 });
  }
}
var init_router = __esm({
  "server/router.ts"() {
    init_route_map();
  }
});
init_router();
export {
  dispatch
};
