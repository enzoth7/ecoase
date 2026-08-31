import type { Product } from "./data.ts";

export type StockState = "pending_treatment" | "ready";
export type StockMovementType = "opening_balance" | "internal_production" | "supplier_receipt" | "production_receipt" | "treatment_out" | "treatment_in" | "treatment_reversal_out" | "treatment_reversal_in" | "dispatch" | "return" | "waste" | "adjustment" | "reversal";
export type TreatmentBatchStatus = "posted" | "rejected" | "reversal";
export type TreatmentControlResult = "pass" | "fail";

export interface StockMovement {
  id: number | string;
  productId: string;
  stockState: StockState;
  quantity: number;
  movementType: StockMovementType;
  treatmentBatchId?: number | string;
  productionAllocationId?: number | string;
  orderLineId?: string;
  shipmentLineId?: number | string;
  clientId?: string;
  providerId?: string;
  remittance?: string;
  sourceReference?: string;
  transformationId: string;
  performedAt: string;
  responsible: string;
  note?: string;
  correctionOfMovementId?: number | string;
  createdAt: string;
}

export interface TreatmentControlCheck {
  id: number | string;
  batchId: number | string;
  controlId: number | string;
  title: string;
  result: TreatmentControlResult;
  note?: string;
}

export interface TreatmentBatch {
  id: number | string;
  productId: string;
  productName: string;
  clientProductId?: number | string;
  clientName?: string;
  orderLineId?: string;
  orderReference?: string;
  quantity: number;
  performedAt: string;
  responsible: string;
  status: TreatmentBatchStatus;
  note?: string;
  reversalOfBatchId?: number | string;
  reversedByBatchId?: number | string;
  createdAt: string;
  checks: TreatmentControlCheck[];
  movements: StockMovement[];
  primaryAsset?: { id: number | string; url: string; mimeType: string; altText: string };
}

export interface TreatmentDestination {
  key: string;
  label: string;
  clientProductId?: number | string;
  orderLineId?: string;
  clientName?: string;
  orderReference?: string;
  controls: Array<{ id: number | string; title: string; detail?: string }>;
  primaryAsset?: { id: number | string; url: string; mimeType: string; altText: string };
}

export interface TreatmentProductOption {
  product: Product;
  label: string;
  pending: number;
  ready: number;
  destinations: TreatmentDestination[];
}

export interface TreatmentDaySummary {
  date: string;
  processed: number;
  rejected: number;
  reversed: number;
  pending: number;
  ready: number;
}

export interface TreatmentDashboard {
  date: string;
  summary: TreatmentDaySummary;
  trend: Array<{ date: string; processed: number; rejected: number }>;
  batches: TreatmentBatch[];
}

export interface TreatmentRecordResult {
  batchId: number | string;
  status: TreatmentBatchStatus;
  transformationId?: string;
  previousPending: number;
  newPending: number;
  previousReady: number;
  newReady: number;
}

export interface CreateTreatmentBatchInput {
  productId: string;
  clientProductId?: number | string;
  orderLineId?: string;
  quantity: number;
  performedAt: string;
  responsible: string;
  note?: string;
  controls: Array<{ controlId: number | string; result: TreatmentControlResult; note?: string }>;
}

export function productTreatmentLabel(product: Pick<Product, "kind" | "measure" | "stockName">) {
  return [product.stockName, product.kind, product.measure ?? "Sin medida"].filter(Boolean).join(" · ");
}

export function calculateStockBalances(movements: Array<Pick<StockMovement, "productId" | "stockState" | "quantity">>) {
  const balances = new Map<string, { pending: number; ready: number }>();
  for (const movement of movements) {
    const current = balances.get(movement.productId) ?? { pending: 0, ready: 0 };
    if (movement.stockState === "pending_treatment") current.pending += movement.quantity;
    else current.ready += movement.quantity;
    balances.set(movement.productId, current);
  }
  return balances;
}

export function summarizeTreatmentDay(date: string, batches: TreatmentBatch[], balances: Map<string, { pending: number; ready: number }>): TreatmentDaySummary {
  const sameDay = batches.filter((batch) => batch.performedAt.slice(0, 10) === date);
  return {
    date,
    processed: sameDay.filter((batch) => batch.status === "posted").reduce((sum, batch) => sum + batch.quantity, 0),
    rejected: sameDay.filter((batch) => batch.status === "rejected").reduce((sum, batch) => sum + batch.quantity, 0),
    reversed: sameDay.filter((batch) => batch.status === "reversal").reduce((sum, batch) => sum + batch.quantity, 0),
    pending: [...balances.values()].reduce((sum, balance) => sum + balance.pending, 0),
    ready: [...balances.values()].reduce((sum, balance) => sum + balance.ready, 0),
  };
}
