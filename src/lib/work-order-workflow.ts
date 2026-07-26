import { calculateResolutionDueAt } from "@/lib/sla-policy";

export const WORK_ORDER_STATUSES = ["new", "planned", "in_progress", "waiting_material", "blocked", "completed", "invoiced", "cancelled"] as const;
export const WORK_ORDER_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  new: "Ny",
  planned: "Planerad",
  in_progress: "Påbörjad",
  waiting_material: "Väntar material",
  blocked: "Blockerad",
  completed: "Klar",
  invoiced: "Fakturerad",
  cancelled: "Avbruten",
};

export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

export function normalizeWorkOrderStatus(value: unknown): WorkOrderStatus {
  return WORK_ORDER_STATUSES.includes(value as WorkOrderStatus) ? value as WorkOrderStatus : "planned";
}

export function normalizeWorkOrderPriority(value: unknown): WorkOrderPriority {
  return WORK_ORDER_PRIORITIES.includes(value as WorkOrderPriority) ? value as WorkOrderPriority : "normal";
}

export function workOrderSlaDeadline(createdAt: Date, priorityValue: unknown) {
  return calculateResolutionDueAt(priorityValue, createdAt);
}

export function workOrderRisk(args: { status: unknown; priority: unknown; createdAt: Date; scheduledEnd?: Date | null; now?: Date }) {
  const now = args.now ?? new Date();
  const status = normalizeWorkOrderStatus(args.status);
  if (["completed", "invoiced", "cancelled"].includes(status)) return "closed" as const;
  if (status === "blocked") return "critical" as const;
  const deadline = args.scheduledEnd ?? workOrderSlaDeadline(args.createdAt, args.priority);
  const remaining = deadline.getTime() - now.getTime();
  if (remaining < 0) return "overdue" as const;
  if (remaining <= 8 * 60 * 60 * 1000) return "high" as const;
  if (remaining <= 24 * 60 * 60 * 1000) return "medium" as const;
  return "normal" as const;
}
