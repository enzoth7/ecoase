export type StageId =
  | "pedido"
  | "plan"
  | "disponibilidad"
  | "preparacion"
  | "entrega";

export type EvidenceKind = "excel" | "regla_relevada" | "no_confirmado";

export interface EvidenceSource {
  kind: EvidenceKind;
  label: "Dato del Excel" | "Regla relevada" | "No confirmado";
  reference: string;
  note?: string;
}

export interface Stage {
  id: StageId;
  number: number;
  title: string;
  question: string;
  decision: string;
  output: string;
  known: string[];
  unknown: string[];
  evidence: EvidenceSource[];
}

export type ValidationCaseStatus = "cerrado" | "bloqueado" | "por_confirmar";

export interface ValidationCase {
  id: string;
  client: string;
  reference: string;
  status: ValidationCaseStatus;
  statusLabel: "Circuito cerrado" | "Bloqueado" | "Por confirmar";
  summary: string;
  currentStageId: StageId;
  facts: string[];
  nextQuestion: string;
  evidence: EvidenceSource[];
}

const excel = (reference: string, note?: string): EvidenceSource => ({
  kind: "excel",
  label: "Dato del Excel",
  reference,
  note,
});

const rule = (reference: string, note?: string): EvidenceSource => ({
  kind: "regla_relevada",
  label: "Regla relevada",
  reference,
  note,
});

const unknown = (reference: string, note?: string): EvidenceSource => ({
  kind: "no_confirmado",
  label: "No confirmado",
  reference,
  note,
});

export const stages: Stage[] = [
  {
    id: "pedido",
    number: 1,
    title: "Pedido",
    question: "¿Qué necesita el cliente?",
    decision: "Aclarar cliente, producto, cantidad y fecha solicitada.",
    output: "Pedido entendible",
    known: [
      "Los pedidos llegan por WhatsApp, llamada, correo u orden de compra.",
      "Los datos mínimos son cliente, producto, cantidad y fecha solicitada.",
    ],
    unknown: [
      "Qué canal o documento manda cuando dos fuentes se contradicen.",
      "Cómo se registra un pedido recibido por llamada.",
    ],
    evidence: [
      rule("Audios 1, 7 y 8", "Canales de ingreso y aclaración del pedido."),
      unknown("Fuente de verdad del pedido"),
    ],
  },
  {
    id: "plan",
    number: 2,
    title: "Plan y compromiso",
    question: "¿Qué se puede prometer?",
    decision: "Priorizar y separar fecha solicitada de fecha acordada.",
    output: "Compromiso vigente",
    known: [
      "Los pedidos se consolidan en un plan semanal y se ajustan durante la operación.",
      "Una urgencia puede cambiar el plan y obligar a renegociar otros compromisos.",
    ],
    unknown: [
      "Cuál es la fuente final del compromiso: orden, plan o acuerdo posterior.",
      "Qué reglas determinan la prioridad entre clientes.",
    ],
    evidence: [
      excel("Plan semanal · semanas 32 y 33"),
      rule("Audios 1, 7 y 9", "Consolidación, urgencias y renegociación."),
      unknown("Fuente de verdad del compromiso"),
    ],
  },
  {
    id: "disponibilidad",
    number: 3,
    title: "Disponibilidad",
    question: "¿De dónde sale el producto?",
    decision: "Elegir stock, producción propia, tercero o importación.",
    output: "Origen y fecha viable",
    known: [
      "Producción decide el origen y la viabilidad según stock, capacidad y plazo.",
      "Los movimientos de producción y recepción alimentan el control de stock.",
      "Impuestos y trámites afectan solamente a la rama de importación.",
    ],
    unknown: [
      "Capacidad diaria por producto y mesa.",
      "Plazos y cupos de proveedores e importación.",
    ],
    evidence: [
      rule("Audios 5, 7 y 9", "Decisión entre origen propio, tercero o importación."),
      excel("Stock Palbin y Stock Pamer · MOVIMIENTOS"),
      unknown("Capacidades y plazos de abastecimiento"),
    ],
  },
  {
    id: "preparacion",
    number: 4,
    title: "Preparación y logística",
    question: "¿Está listo para salir?",
    decision: "Coordinar marcado o HT, disponibilidad y camión.",
    output: "Despacho viable",
    known: [
      "Marcar o tratar cambia el estado del producto sin crear stock físico nuevo.",
      "El HT demora aproximadamente 3–4 horas.",
      "Coordinación organiza la entrega cuando producción confirma viabilidad.",
    ],
    unknown: [
      "Capacidad del secadero por ciclo y cantidad de ciclos diarios.",
      "Capacidad disponible por camión, día y zona.",
    ],
    evidence: [
      excel("Stock Palbin y Stock Pamer · MOVIMIENTOS"),
      rule("Audio 6", "Duración de referencia del tratamiento térmico: 3–4 horas."),
      unknown("Capacidad de HT y transporte"),
    ],
  },
  {
    id: "entrega",
    number: 5,
    title: "Entrega y cierre",
    question: "¿Qué se entregó y qué queda?",
    decision: "Relacionar remito, entrega, saldo y próxima fecha.",
    output: "Cumplido o reprogramado",
    known: [
      "Las órdenes registran cantidad, remito, entregado y saldo.",
      "Una entrega parcial conserva el pendiente y exige una nueva decisión.",
    ],
    unknown: [
      "Qué evidencia convierte un despacho en entrega confirmada.",
      "Quién registra y valida una incidencia o rechazo.",
    ],
    evidence: [
      excel("Órdenes de compra · columnas Cantidad, Remito, Entregados y Saldo"),
      rule("Audio 7", "Negociación de entregas parciales y nuevas fechas."),
      unknown("Confirmación final de entrega"),
    ],
  },
];

export const validationCases: ValidationCase[] = [
  {
    id: "pamer-184833",
    client: "Pamer",
    reference: "Orden 184833",
    status: "cerrado",
    statusLabel: "Circuito cerrado",
    summary: "Un ejemplo que sí puede reconciliarse desde la orden hasta la salida.",
    currentStageId: "entrega",
    facts: ["5 líneas · 500 unidades", "Remito 603", "Entregado 500 · saldo 0"],
    nextQuestion: "¿Este es el nivel de trazabilidad que Jony espera para los demás pedidos?",
    evidence: [
      excel("Órdenes de compra · PAMER!A4:J8"),
      excel("Stock Pamer · MOVIMIENTOS!A53:I57", "Cinco ventas vinculadas al remito 603."),
    ],
  },
  {
    id: "frutura-14",
    client: "Frutura",
    reference: "Viernes 14",
    status: "bloqueado",
    statusLabel: "Bloqueado",
    summary: "El plan registra el faltante, pero no contiene el acuerdo siguiente.",
    currentStageId: "disponibilidad",
    facts: ["600 pallets 122 × 102", "El plan dice: no llegaron los pallets"],
    nextQuestion: "¿Cuál es la nueva fecha viable y quién debe confirmarla con el cliente?",
    evidence: [
      excel("Plan diario · Plan semanal!A74:E74"),
      unknown("Nueva fecha de llegada y entrega"),
    ],
  },
  {
    id: "proquimur-63",
    client: "Proquimur",
    reference: "Plan semanal",
    status: "por_confirmar",
    statusLabel: "Por confirmar",
    summary: "Las cantidades están escritas, pero el compromiso todavía no está cerrado.",
    currentStageId: "plan",
    facts: ["300 pallets con HT", "300 pallets sin HT", "Estado: esperando confirmación"],
    nextQuestion: "¿El cliente confirma ambas cantidades y qué fecha queda acordada?",
    evidence: [
      excel("Plan diario · Plan semanal!A63:E63"),
      unknown("Fecha acordada con Proquimur"),
    ],
  },
];

export const validationQuestions = [
  "¿Estas son las cinco etapas reales del recorrido?",
  "¿Qué decisión importante falta o está ubicada en la etapa equivocada?",
  "¿Qué variable conviene confirmar primero para que el piloto sea útil?",
];
