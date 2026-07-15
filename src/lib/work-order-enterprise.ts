import { Prisma } from "@prisma/client";

export const WORK_ORDER_STATUSES = [
  "new", "planned", "assigned", "in_progress", "waiting_material", "waiting_resident",
  "inspection", "completed", "invoiced", "closed", "cancelled",
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  new: ["planned", "assigned", "cancelled"],
  planned: ["assigned", "in_progress", "cancelled"],
  assigned: ["planned", "in_progress", "cancelled"],
  in_progress: ["waiting_material", "waiting_resident", "inspection", "completed", "cancelled"],
  waiting_material: ["in_progress", "cancelled"],
  waiting_resident: ["in_progress", "cancelled"],
  inspection: ["in_progress", "completed", "cancelled"],
  completed: ["inspection", "invoiced", "closed"],
  invoiced: ["closed"],
  closed: [],
  cancelled: [],
};

const slaHours: Record<string, { response: number; resolution: number }> = {
  urgent: { response: 1, resolution: 8 },
  high: { response: 4, resolution: 24 },
  normal: { response: 8, resolution: 72 },
  low: { response: 24, resolution: 168 },
};

export function isWorkOrderStatus(value: unknown): value is WorkOrderStatus {
  return WORK_ORDER_STATUSES.includes(String(value) as WorkOrderStatus);
}

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus) {
  return from === to || transitions[from].includes(to);
}

export function allowedTransitions(from: WorkOrderStatus) {
  return transitions[from];
}

export function calculateSla(priority: string, createdAt = new Date()) {
  const rule = slaHours[priority] || slaHours.normal;
  return {
    responseDueAt: new Date(createdAt.getTime() + rule.response * 60 * 60 * 1000),
    resolutionDueAt: new Date(createdAt.getTime() + rule.resolution * 60 * 60 * 1000),
  };
}

export async function nextWorkOrderNumber(tx: Prisma.TransactionClient, companyId: string, at = new Date()) {
  const year = at.getFullYear();
  const rows = await tx.$queryRaw<Array<{ last_number: number }>>(Prisma.sql`
    INSERT INTO "WorkOrderNumberCounter" ("company_id", "year", "last_number", "updated_at")
    VALUES (${companyId}, ${year}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("company_id", "year") DO UPDATE
      SET "last_number" = "WorkOrderNumberCounter"."last_number" + 1,
          "updated_at" = CURRENT_TIMESTAMP
    RETURNING "last_number"
  `);
  const sequence = Number(rows[0]?.last_number || 1);
  return `WO-${year}-${String(sequence).padStart(6, "0")}`;
}

export function statusTimestampFields(status: WorkOrderStatus) {
  const now = new Date();
  return {
    respondedAt: ["assigned", "in_progress", "waiting_material", "waiting_resident", "inspection", "completed", "invoiced", "closed"].includes(status) ? now : null,
    completedAt: ["completed", "invoiced", "closed"].includes(status) ? now : null,
    closedAt: status === "closed" ? now : null,
    pausedAt: ["waiting_material", "waiting_resident"].includes(status) ? now : null,
  };
}
