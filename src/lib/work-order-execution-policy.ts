import { normalizeWorkOrderStatus } from "@/lib/work-order-workflow";

const EXECUTION_LOCKED_STATUSES = new Set(["completed", "invoiced", "cancelled"]);

export function isWorkOrderExecutionLocked(status: unknown) {
  return EXECUTION_LOCKED_STATUSES.has(normalizeWorkOrderStatus(status));
}

export function canFinalizeWorkOrderExecution(status: unknown) {
  return normalizeWorkOrderStatus(status) === "in_progress";
}

export function canMutateWorkOrderExecution(status: unknown, canManage: boolean) {
  return canManage && !isWorkOrderExecutionLocked(status);
}
