import type { Product } from "./data";
import type { StockMovement, StockState } from "./treatment";

export type StockRiskLevel = "red" | "orange" | "yellow" | "green" | "gray";

export type StockRiskIndicator = {
  level: StockRiskLevel;
  available: number;
  daysToBreak?: number;
  estimatedBreakDate?: string;
};

export type StockSummaryRow = {
  product: Product;
  pending: number;
  ready: number;
  reserved: number;
  available: number;
  physical: number;
  dailyConsumption: number;
  weeklyConsumption: number;
  safetyStock: number;
  daysToBreak?: number;
  estimatedBreakDate?: string;
  riskLevel: StockRiskLevel;
  nextDelivery?: { date: string; quantity: number; client: string };
  lastMovementAt?: string;
};

export type StockProjectionPoint = {
  date: string;
  incoming: number;
  plannedOutgoing: number;
  dailyOutgoing: number;
  projectedAvailable: number;
};

export type StockConsumptionRule = {
  id: number | string;
  clientId: string;
  clientName: string;
  dailyConsumption: number;
  workdaysPerWeek: number;
  safetyStock: number;
  validFrom: string;
  validTo?: string;
  source: string;
  note?: string;
};

export type StockDetail = {
  summary: StockSummaryRow;
  movements: StockMovement[];
  projection: StockProjectionPoint[];
  consumption: StockConsumptionRule[];
};

export const riskCopy: Record<StockRiskLevel, { label: string; short: string }> = {
  red: { label: "Menos de 3 días", short: "Crítico" },
  orange: { label: "Entre 3 y 7 días", short: "Riesgo alto" },
  yellow: { label: "Entre 7 y 14 días", short: "Atención" },
  green: { label: "14 días o más", short: "Suficiente" },
  gray: { label: "No calculable", short: "Falta consumo" },
};

export function classifyStockRisk(daysToBreak?: number): StockRiskLevel {
  if (daysToBreak === undefined || !Number.isFinite(daysToBreak)) return "gray";
  if (daysToBreak < 3) return "red";
  if (daysToBreak < 7) return "orange";
  if (daysToBreak < 14) return "yellow";
  return "green";
}

export function movementStateLabel(state: StockState) {
  return state === "pending_treatment" ? "Pendiente de marcado" : "Listo";
}

export function balanceAfterMovement(current: number, movement: Pick<StockMovement, "quantity">) {
  return current + movement.quantity;
}
