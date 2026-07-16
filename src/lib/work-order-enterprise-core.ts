import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { WorkOrderPriority, WorkOrderStatus } from "@/lib/work-order-workflow";

export const WORK_ORDER_TYPES = ["corrective", "preventive", "inspection", "emergency", "project", "warranty"] as const;
export const WORK_ORDER_SOURCES = ["internal", "ticket", "maintenance_plan", "inspection", "component", "resident", "supplier"] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];
export type WorkOrderSource = (typeof WORK_ORDER_SOURCES)[number];

type EnterpriseRow = {
  id: string;
  work_order_number: string | null;
  work_type: string;
  source: string;
  sla_response_due_at: Date | null;
  sla_resolution_due_at: Date | null;
  responded_at: Date | null;
  paused_at: Date | null;
  pause_reason: string | null;
  closed_at: Date | null;
};

export type WorkOrderStatusEventRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  metadata: Prisma.JsonValue | null;
  created_at: Date;
  actor_user_id: string;
  actor_name: string | null;
  actor_email: string;
};

const SLA: Record<WorkOrderPriority, { responseHours: number; resolutionHours: number }> = {
  urgent: { responseHours: 1, resolutionHours: 4 },
  high: { responseHours: 4, resolutionHours: 24 },
  normal: { responseHours: 24, resolutionHours: 72 },
  low: { responseHours: 48, resolutionHours: 168 },
};

const TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  new: ["planned", "in_progress", "cancelled"],
  planned: ["new", "in_progress", "waiting_material", "blocked", "cancelled"],
  in_progress: ["planned", "waiting_material", "blocked", "completed", "cancelled"],
  waiting_material: ["planned", "in_progress", "blocked", "cancelled"],
  blocked: ["planned", "in_progress", "waiting_material", "cancelled"],
  completed: ["in_progress", "invoiced"],
  invoiced: ["completed"],
  cancelled: ["new", "planned"],
};

export function normalizeWorkOrderType(value: unknown): WorkOrderType {
  return WORK_ORDER_TYPES.includes(value as WorkOrderType) ? value as WorkOrderType : "corrective";
}

export function normalizeWorkOrderSource(value: unknown): WorkOrderSource {
  return WORK_ORDER_SOURCES.includes(value as WorkOrderSource) ? value as WorkOrderSource : "internal";
}

export function calculateWorkOrderSla(createdAt: Date, priority: WorkOrderPriority) {
  const policy = SLA[priority];
  return {
    responseDueAt: new Date(createdAt.getTime() + policy.responseHours * 60 * 60 * 1000),
    resolutionDueAt: new Date(createdAt.getTime() + policy.resolutionHours * 60 * 60 * 1000),
  };
}

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export async function allocateWorkOrderNumber(tx: Prisma.TransactionClient, companyId: string, now = new Date()) {
  const year = now.getUTCFullYear();
  const rows = await tx.$queryRaw<Array<{ last_number: number }>>(Prisma.sql`
    INSERT INTO "WorkOrderNumberCounter" ("company_id", "year", "last_number", "updated_at")
    VALUES (${companyId}, ${year}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("company_id", "year") DO UPDATE
      SET "last_number" = "WorkOrderNumberCounter"."last_number" + 1,
          "updated_at" = CURRENT_TIMESTAMP
    RETURNING "last_number"
  `);
  const sequence = rows[0]?.last_number;
  if (!sequence) throw new Error("Kunde inte reservera arbetsordernummer");
  return `AO-${year}-${String(sequence).padStart(6, "0")}`;
}

export async function setWorkOrderEnterpriseFields(tx: Prisma.TransactionClient, args: {
  workOrderId: string;
  companyId: string;
  workOrderNumber: string;
  workType: WorkOrderType;
  source: WorkOrderSource;
  responseDueAt: Date;
  resolutionDueAt: Date;
}) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "WorkOrder"
    SET "work_order_number" = ${args.workOrderNumber},
        "work_type" = ${args.workType},
        "source" = ${args.source},
        "sla_response_due_at" = ${args.responseDueAt},
        "sla_resolution_due_at" = ${args.resolutionDueAt}
    WHERE "id" = ${args.workOrderId} AND "company_id" = ${args.companyId}
  `);
}

export async function addWorkOrderStatusEvent(tx: Prisma.TransactionClient, args: {
  companyId: string;
  workOrderId: string;
  actorUserId: string;
  fromStatus: string | null;
  toStatus: string;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "WorkOrderStatusEvent"
      ("id", "company_id", "work_order_id", "actor_user_id", "from_status", "to_status", "reason", "metadata", "created_at")
    VALUES
      (${randomUUID()}, ${args.companyId}, ${args.workOrderId}, ${args.actorUserId}, ${args.fromStatus}, ${args.toStatus}, ${args.reason ?? null}, ${args.metadata ? JSON.stringify(args.metadata) : null}::jsonb, CURRENT_TIMESTAMP)
  `);
}

export async function getWorkOrderEnterpriseState(client: Prisma.TransactionClient | typeof import("@/lib/db").default, companyId: string, workOrderId: string) {
  const rows = await client.$queryRaw<EnterpriseRow[]>(Prisma.sql`
    SELECT "id", "work_order_number", "work_type", "source", "sla_response_due_at", "sla_resolution_due_at",
           "responded_at", "paused_at", "pause_reason", "closed_at"
    FROM "WorkOrder"
    WHERE "id" = ${workOrderId} AND "company_id" = ${companyId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getWorkOrderStatusEvents(client: Prisma.TransactionClient | typeof import("@/lib/db").default, companyId: string, workOrderId: string) {
  return client.$queryRaw<WorkOrderStatusEventRow[]>(Prisma.sql`
    SELECT e."id", e."from_status", e."to_status", e."reason", e."metadata", e."created_at", e."actor_user_id",
           u."name" AS "actor_name", u."email" AS "actor_email"
    FROM "WorkOrderStatusEvent" e
    INNER JOIN "User" u ON u."id" = e."actor_user_id"
    WHERE e."company_id" = ${companyId} AND e."work_order_id" = ${workOrderId}
    ORDER BY e."created_at" DESC
    LIMIT 250
  `);
}
