import type { OperationOrder, ProductionAllocationStatus } from "./data.ts";

export type ProductionResourceType = "internal_factory" | "internal_crew" | "external_supplier";
export type ProductionLoadStatus = "normal" | "stretched" | "overloaded" | "missing_rule" | "unavailable";

export type ProductionResource = {
  id: number | string;
  name: string;
  resourceType: ProductionResourceType;
  providerId?: string;
  active: boolean;
  displayOrder: number;
};

export type ProductionProduct = { id: string; name: string };

export type ProductionCapacityRule = {
  id: number | string;
  resourceId: number | string;
  productId: string;
  productName: string;
  peopleCount?: number;
  configurationLabel: string;
  normalUnitsPerDay: number;
  maximumUnitsPerDay: number;
  validFrom: string;
  validTo?: string;
  source: string;
  note?: string;
  createdAt?: string;
};

export type ProductionDailyOverride = {
  id: number | string;
  date: string;
  resourceId: number | string;
  capacityRuleId?: number | string;
  productId?: string;
  normalUnitsPerDay?: number;
  maximumUnitsPerDay?: number;
  available: boolean;
  externalStatus?: "estimated" | "confirmed";
  reason: string;
  responsible: string;
};

export type ProductionAssignmentSummary = {
  id: number | string;
  orderId: string;
  orderReference: string;
  client: string;
  orderLineId: string;
  productId?: string;
  productName: string;
  resourceId?: number | string;
  capacityRuleId?: number | string;
  applicableRuleIds: Array<number | string>;
  configurationLabel?: string;
  plannedQuantity: number;
  actualQuantity?: number;
  pendingQuantity: number;
  status: ProductionAllocationStatus;
  note?: string;
  completionNote?: string;
  normalUnitsPerDay?: number;
  maximumUnitsPerDay?: number;
};

export type ProductionResourceDay = {
  resource: ProductionResource;
  assignments: ProductionAssignmentSummary[];
  normalLoad?: number;
  maximumLoad?: number;
  confirmedNormalLoad?: number;
  confirmedMaximumLoad?: number;
  status: ProductionLoadStatus;
  available: boolean;
  externalStatus: "estimated" | "confirmed";
  override?: ProductionDailyOverride;
};

export type ProductionCapacityDay = {
  date: string;
  status: ProductionLoadStatus;
  resources: ProductionResourceDay[];
  unassigned: ProductionAssignmentSummary[];
  issues: string[];
};

export type ProductionCapacitySnapshot = {
  resources: ProductionResource[];
  rules: ProductionCapacityRule[];
  overrides: ProductionDailyOverride[];
  products: ProductionProduct[];
  days: ProductionCapacityDay[];
};

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const current = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (current <= end) {
    dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function sameId(left: number | string | undefined, right: number | string | undefined) {
  return left !== undefined && right !== undefined && String(left) === String(right);
}

function ruleIsCurrent(rule: ProductionCapacityRule, date: string) {
  return rule.validFrom <= date && (!rule.validTo || rule.validTo >= date);
}

function statusPriority(status: ProductionLoadStatus) {
  return { normal: 0, stretched: 1, missing_rule: 2, unavailable: 3, overloaded: 4 }[status];
}

function scopedOverride(overrides: ProductionDailyOverride[], resourceId: number | string, date: string, rule?: ProductionCapacityRule) {
  const candidates = overrides.filter((entry) => sameId(entry.resourceId, resourceId) && entry.date === date && (
    rule ? sameId(entry.capacityRuleId, rule.id) || (!entry.capacityRuleId && entry.productId === rule.productId) : !entry.capacityRuleId && !entry.productId
  ));
  return candidates.sort((left, right) => Number(Boolean(right.capacityRuleId)) - Number(Boolean(left.capacityRuleId)))[0];
}

export function buildProductionCapacity(input: {
  from: string;
  to: string;
  resources: ProductionResource[];
  rules: ProductionCapacityRule[];
  overrides: ProductionDailyOverride[];
  products: ProductionProduct[];
  orders: OperationOrder[];
}): ProductionCapacitySnapshot {
  const resources = [...input.resources].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "es"));
  const days = datesBetween(input.from, input.to).map<ProductionCapacityDay>((date) => {
    const rawAssignments = input.orders.flatMap((order) => order.lines.flatMap((line) => (line.productionAllocations ?? [])
      .filter((allocation) => allocation.status !== "cancelled" && allocation.plannedDate === date)
      .map((allocation) => ({ order, line, allocation }))));

    const summaries = rawAssignments.map<ProductionAssignmentSummary>(({ order, line, allocation }) => {
      const resourceId = allocation.productionResourceId;
      const applicableRules = resourceId && line.productId
        ? input.rules.filter((rule) => sameId(rule.resourceId, resourceId) && rule.productId === line.productId && ruleIsCurrent(rule, date))
        : [];
      const storedRule = applicableRules.find((rule) => sameId(rule.id, allocation.capacityRuleId));
      const rule = storedRule ?? (applicableRules.length === 1 ? applicableRules[0] : undefined);
      const override = rule && resourceId ? scopedOverride(input.overrides, resourceId, date, rule) : undefined;
      const plannedQuantity = allocation.plannedQuantity;
      const actualQuantity = allocation.actualQuantity;
      return {
        id: allocation.id,
        orderId: order.id,
        orderReference: order.reference,
        client: order.client,
        orderLineId: line.id,
        productId: line.productId,
        productName: line.product,
        resourceId,
        capacityRuleId: rule?.id,
        applicableRuleIds: applicableRules.map((entry) => entry.id),
        configurationLabel: rule?.configurationLabel,
        plannedQuantity,
        actualQuantity,
        pendingQuantity: Math.max(plannedQuantity - (actualQuantity ?? 0), 0),
        status: allocation.status,
        note: allocation.note,
        completionNote: allocation.completionNote,
        normalUnitsPerDay: override?.normalUnitsPerDay ?? rule?.normalUnitsPerDay,
        maximumUnitsPerDay: override?.maximumUnitsPerDay ?? rule?.maximumUnitsPerDay,
      };
    });

    const resourceDays = resources.filter((resource) => resource.active).map<ProductionResourceDay>((resource) => {
      const assignments = summaries.filter((assignment) => sameId(assignment.resourceId, resource.id));
      const resourceOverride = scopedOverride(input.overrides, resource.id, date);
      const available = resourceOverride?.available ?? true;
      const externalStatus = resource.resourceType === "external_supplier" ? resourceOverride?.externalStatus ?? "estimated" : "confirmed";
      const missingRule = assignments.some((assignment) => !assignment.normalUnitsPerDay || !assignment.maximumUnitsPerDay);
      const calculable = assignments.filter((assignment) => assignment.normalUnitsPerDay && assignment.maximumUnitsPerDay);
      const normalLoad = missingRule ? undefined : calculable.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.normalUnitsPerDay!, 0);
      const maximumLoad = missingRule ? undefined : calculable.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.maximumUnitsPerDay!, 0);
      const confirmed = calculable.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed");
      const confirmedMissingRule = assignments.some((assignment) => (assignment.status === "confirmed" || assignment.status === "completed") && (!assignment.normalUnitsPerDay || !assignment.maximumUnitsPerDay));
      const confirmedNormalLoad = confirmedMissingRule ? undefined : confirmed.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.normalUnitsPerDay!, 0);
      const confirmedMaximumLoad = confirmedMissingRule ? undefined : confirmed.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.maximumUnitsPerDay!, 0);
      let status: ProductionLoadStatus = "normal";
      if (!available && assignments.length) status = "unavailable";
      else if (missingRule) status = "missing_rule";
      else if ((maximumLoad ?? 0) > 1.0000001) status = "overloaded";
      else if ((normalLoad ?? 0) > 1.0000001) status = "stretched";
      return { resource, assignments, normalLoad, maximumLoad, confirmedNormalLoad, confirmedMaximumLoad, status, available, externalStatus, override: resourceOverride };
    });
    const unassigned = summaries.filter((assignment) => !assignment.resourceId || !resources.some((resource) => sameId(resource.id, assignment.resourceId)));
    const statuses = [...resourceDays.map((entry) => entry.status), ...(unassigned.length ? ["missing_rule" as const] : [])];
    const status = statuses.sort((left, right) => statusPriority(right) - statusPriority(left))[0] ?? "normal";
    const issues = [
      ...resourceDays.filter((entry) => entry.status !== "normal").map((entry) => `${entry.resource.name}: ${entry.status}`),
      ...(unassigned.length ? [`${unassigned.length} asignación${unassigned.length === 1 ? "" : "es"} sin recurso`] : []),
    ];
    return { date, status, resources: resourceDays, unassigned, issues };
  });
  return { resources, rules: input.rules, overrides: input.overrides, products: input.products, days };
}
