import type { WorkOrderSlaEvaluation, WorkOrderSlaRisk } from "@/lib/work-order-sla";

export type SlaPriorityItem<T = unknown> = {
  id: string;
  status: string;
  priority: string;
  assigned: boolean;
  sla: WorkOrderSlaEvaluation;
  payload?: T;
};

const riskWeight: Record<WorkOrderSlaRisk, number> = {
  overdue: 0,
  critical: 1,
  soon: 2,
  not_configured: 3,
  normal: 4,
  paused: 5,
  fulfilled: 6,
};

const priorityWeight: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function slaPriorityScore(item: SlaPriorityItem) {
  const risk = riskWeight[item.sla.risk] * 10_000_000;
  const due = item.sla.dueAt ? Math.max(0, new Date(item.sla.dueAt).getTime()) : Number.MAX_SAFE_INTEGER;
  const assignment = item.assigned ? 0 : -1_000_000;
  const priority = (priorityWeight[item.priority] ?? 4) * 100_000;
  return risk + priority + assignment + Math.min(due, 9_000_000_000_000);
}

export function buildSlaPriorityQueue<T>(items: SlaPriorityItem<T>[], limit = 8) {
  return items
    .filter((item) => !["completed", "invoiced", "cancelled"].includes(item.status))
    .filter((item) => ["overdue", "critical", "soon", "not_configured"].includes(item.sla.risk))
    .sort((a, b) => slaPriorityScore(a) - slaPriorityScore(b))
    .slice(0, Math.max(0, limit));
}
