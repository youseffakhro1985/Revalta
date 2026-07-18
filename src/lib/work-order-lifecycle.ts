export const workOrderStatuses = [
  "new",
  "planned",
  "assigned",
  "in_progress",
  "waiting",
  "inspection",
  "completed",
  "invoiced",
  "closed",
  "cancelled",
] as const;

export type WorkOrderStatus = (typeof workOrderStatuses)[number];

const transitions: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  new: ["planned", "assigned", "in_progress", "cancelled"],
  planned: ["assigned", "in_progress", "waiting", "cancelled"],
  assigned: ["planned", "in_progress", "waiting", "cancelled"],
  in_progress: ["waiting", "inspection", "completed", "cancelled"],
  waiting: ["planned", "assigned", "in_progress", "cancelled"],
  inspection: ["in_progress", "completed"],
  completed: ["in_progress", "invoiced", "closed"],
  invoiced: ["completed", "closed"],
  closed: ["in_progress"],
  cancelled: ["new"],
};

export const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  new: "Ny",
  planned: "Planerad",
  assigned: "Tilldelad",
  in_progress: "Pågående",
  waiting: "Väntar",
  inspection: "Besiktning",
  completed: "Utförd",
  invoiced: "Fakturerad",
  closed: "Stängd",
  cancelled: "Avbruten",
};

export function isWorkOrderStatus(value: unknown): value is WorkOrderStatus {
  return typeof value === "string" && (workOrderStatuses as readonly string[]).includes(value);
}

export function allowedWorkOrderTransitions(status: WorkOrderStatus) {
  return transitions[status];
}

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus) {
  return from === to || transitions[from].includes(to);
}

export function isTerminalWorkOrderStatus(status: WorkOrderStatus) {
  return status === "closed" || status === "cancelled";
}

export function deriveWorkOrderStatus(input: {
  current: WorkOrderStatus;
  requested?: WorkOrderStatus;
  assignedToId?: string | null;
}) {
  if (input.requested) return input.requested;
  if (input.current === "new" && input.assignedToId) return "assigned";
  return input.current;
}
