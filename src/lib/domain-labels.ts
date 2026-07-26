import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS as WORK_ORDER_PRIORITY_LABELS_TYPED,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS as WORK_ORDER_STATUS_LABELS_TYPED,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from "@/lib/work-order-workflow";

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = WORK_ORDER_STATUS_LABELS_TYPED;
export const WORK_ORDER_PRIORITY_LABELS: Record<string, string> = WORK_ORDER_PRIORITY_LABELS_TYPED;

export const TICKET_STATUSES = ["new", "received", "in_progress", "waiting", "completed", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<string, string> = {
  new: "Ny",
  received: "Mottagen",
  in_progress: "Pågår",
  waiting: "Väntar",
  completed: "Klar",
  closed: "Stängd",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

/** Display map covering ticket + work-order + a few legacy aliases used in UI. */
export const OPERATIONS_STATUS_LABELS: Record<string, string> = {
  ...TICKET_STATUS_LABELS,
  ...WORK_ORDER_STATUS_LABELS,
  open: "Öppen",
  assigned: "Tilldelad",
  inspection: "Kontroll",
  resolved: "Löst",
};

export { WORK_ORDER_STATUSES, WORK_ORDER_PRIORITIES };
export type { WorkOrderStatus, WorkOrderPriority };

export function labelOf(labels: Record<string, string>, value: string | null | undefined, fallback = value || "—") {
  if (!value) return fallback;
  return labels[value] || fallback;
}

export function ticketStatusLabel(value: string | null | undefined) {
  return labelOf(TICKET_STATUS_LABELS, value);
}

export function priorityLabel(value: string | null | undefined) {
  return labelOf(PRIORITY_LABELS, value);
}

export function workOrderStatusLabel(value: string | null | undefined) {
  return labelOf(WORK_ORDER_STATUS_LABELS, value);
}

export function workOrderPriorityLabel(value: string | null | undefined) {
  return labelOf(WORK_ORDER_PRIORITY_LABELS, value);
}
