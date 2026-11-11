import type { OperationOrder, ProductionAllocationStatus } from "./data.ts";

export type ProductionResourceType = "internal_factory" | "internal_crew" | "external_supplier";
export type ProductionLoadStatus = "normal" | "stretched" | "overloaded" | "missing_rule";

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
  clientProductId?: number | string;
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

export type ProductionAssignmentSummary = {
  id: number | string;
  orderId: string;
  orderReference: string;
  client: string;
  orderLineId: string;
  productId?: string;
  clientProductId?: number | string;
  productName: string;
  resourceId?: number | string;
  capacityRuleId?: number | string;
  applicableRuleIds: Array<number | string>;
  configurationLabel?: string;
  peopleCount?: number;
  plannedQuantity: number;
  plannedDate: string;
  actualQuantity?: number;
  actualDate?: string;
  resultDestination?: "client" | "stock";
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
};

export type ProductionCapacityDay = {
  date: string;
  producedQuantity: number;
  status: ProductionLoadStatus;
  resources: ProductionResourceDay[];
  unassigned: ProductionAssignmentSummary[];
  issues: string[];
};

export type ProductionCapacitySnapshot = {
  resources: ProductionResource[];
  rules: ProductionCapacityRule[];
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
  return { normal: 0, stretched: 1, missing_rule: 2, overloaded: 4 }[status];
}

export function buildProductionCapacity(input: {
  from: string;
  to: string;
  resources: ProductionResource[];
  rules: ProductionCapacityRule[];
  products: ProductionProduct[];
  orders: OperationOrder[];
}): ProductionCapacitySnapshot {
  const resources = [...input.resources].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "es"));
  const producedByDate = new Map<string, number>();
  for (const order of input.orders) {
    for (const line of order.lines) {
      for (const allocation of line.productionAllocations ?? []) {
        if (allocation.status !== "completed" || !allocation.actualDate || !allocation.actualQuantity) continue;
        producedByDate.set(allocation.actualDate, (producedByDate.get(allocation.actualDate) ?? 0) + Math.max(allocation.actualQuantity, 0));
      }
    }
  }
  const days = datesBetween(input.from, input.to).map<ProductionCapacityDay>((date) => {
    const rawAssignments = input.orders.flatMap((order) => order.lines.flatMap((line) => (line.productionAllocations ?? [])
      .filter((allocation) => allocation.status !== "cancelled" && allocation.plannedDate === date)
      .map((allocation) => ({ order, line, allocation }))));

    const summaries = rawAssignments.map<ProductionAssignmentSummary>(({ order, line, allocation }) => {
      const resourceId = allocation.productionResourceId;
      const applicableRules = resourceId && line.clientProductId
        ? input.rules.filter((rule) => sameId(rule.resourceId, resourceId) && sameId(rule.clientProductId, line.clientProductId) && rule.productId === line.productId && ruleIsCurrent(rule, date))
        : [];
      const storedRule = applicableRules.find((rule) => sameId(rule.id, allocation.capacityRuleId))
        ?? (allocation.status !== "draft" ? input.rules.find((rule) => sameId(rule.id, allocation.capacityRuleId)) : undefined);
      const rule = storedRule ?? (applicableRules.length === 1 ? applicableRules[0] : undefined);
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
        maximumUnitsPerDay: rule?.maximumUnitsPerDay,
      };
    });

    const resourceDays = resources.filter((resource) => resource.active).map<ProductionResourceDay>((resource) => {
      const assignments = summaries.filter((assignment) => sameId(assignment.resourceId, resource.id));
      const missingRule = assignments.some((assignment) => !assignment.normalUnitsPerDay || !assignment.maximumUnitsPerDay);
      const calculable = assignments.filter((assignment) => assignment.normalUnitsPerDay && assignment.maximumUnitsPerDay);
      const normalLoad = missingRule ? undefined : calculable.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.normalUnitsPerDay!, 0);
      const maximumLoad = missingRule ? undefined : calculable.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.maximumUnitsPerDay!, 0);
      const confirmed = calculable.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed");
      const confirmedMissingRule = assignments.some((assignment) => (assignment.status === "confirmed" || assignment.status === "completed") && (!assignment.normalUnitsPerDay || !assignment.maximumUnitsPerDay));
      const confirmedNormalLoad = confirmedMissingRule ? undefined : confirmed.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.normalUnitsPerDay!, 0);
      const confirmedMaximumLoad = confirmedMissingRule ? undefined : confirmed.reduce((sum, assignment) => sum + (assignment.actualQuantity ?? assignment.plannedQuantity) / assignment.maximumUnitsPerDay!, 0);
      let status: ProductionLoadStatus = "normal";
      if (missingRule) status = "missing_rule";
      else if ((maximumLoad ?? 0) > 1.0000001) status = "overloaded";
      else if ((normalLoad ?? 0) > 1.0000001) status = "stretched";
      return { resource, assignments, normalLoad, maximumLoad, confirmedNormalLoad, confirmedMaximumLoad, status };
    });
    const unassigned = summaries.filter((assignment) => !assignment.resourceId || !resources.some((resource) => sameId(resource.id, assignment.resourceId)));
    const statuses = [...resourceDays.map((entry) => entry.status), ...(unassigned.length ? ["missing_rule" as const] : [])];
    const status = statuses.sort((left, right) => statusPriority(right) - statusPriority(left))[0] ?? "normal";
    const issues = [
      ...resourceDays.filter((entry) => entry.status !== "normal").map((entry) => `${entry.resource.name}: ${entry.status}`),
      ...(unassigned.length ? [`${unassigned.length} asignación${unassigned.length === 1 ? "" : "es"} sin recurso`] : []),
    ];
    return { date, producedQuantity: producedByDate.get(date) ?? 0, status, resources: resourceDays, unassigned, issues };
  });
  return { resources, rules: input.rules, products: input.products, days };
}
