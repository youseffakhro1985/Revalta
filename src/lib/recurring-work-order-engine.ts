import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import {
  addWorkOrderStatusEvent,
  allocateWorkOrderNumber,
  calculateWorkOrderSla,
  setWorkOrderEnterpriseFields,
} from "@/lib/work-order-enterprise-core";

export const RECURRING_SCHEDULE_ACTION = "work_order.recurring.schedule";
export const RECURRING_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export const RECURRING_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
export type RecurringPriority = (typeof RECURRING_PRIORITIES)[number];
export type RecurringSchedule = {
  id: string;
  company_id: string;
  property_id: string;
  property_name: string;
  title: string;
  description: string;
  frequency: RecurringFrequency;
  priority: RecurringPriority;
  estimated_cost: number | null;
  next_run_at: string;
  active: boolean;
  last_generated_at: string | null;
  last_work_order_id: string | null;
  last_work_order_number: string | null;
  created_at: Date;
  updated_at: string | Date;
};

type ScheduleMetadata = Partial<Omit<RecurringSchedule, "id" | "company_id" | "created_at">> & { schedule_id?: string };
type DbClient = typeof db | Prisma.TransactionClient;

export function advanceRecurringDate(date: Date, frequency: RecurringFrequency) {
  const next = new Date(date);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  if (frequency === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
  if (frequency === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export async function readRecurringSchedules(companyId: string, client: DbClient = db) {
  const logs = await client.auditLog.findMany({
    where: { company_id: companyId, action: RECURRING_SCHEDULE_ACTION },
    orderBy: { created_at: "asc" },
    select: { id: true, company_id: true, metadata: true, created_at: true },
  });
  const latest = new Map<string, Record<string, unknown>>();
  for (const log of logs) {
    const metadata = (log.metadata ?? {}) as ScheduleMetadata;
    const id = metadata.schedule_id || log.id;
    const previous = latest.get(id) || {};
    latest.set(id, {
      ...previous,
      ...metadata,
      id,
      company_id: log.company_id,
      created_at: previous.created_at || log.created_at,
      updated_at: metadata.updated_at || log.created_at,
    });
  }
  return [...latest.values()] as RecurringSchedule[];
}

function nextFutureRun(start: Date, frequency: RecurringFrequency, now: Date) {
  let next = advanceRecurringDate(start, frequency);
  let guard = 0;
  while (next <= now && guard < 100) {
    next = advanceRecurringDate(next, frequency);
    guard += 1;
  }
  return next;
}

export async function generateRecurringWorkOrder(input: {
  companyId: string;
  scheduleId: string;
  actorUserId: string;
  force?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtext(${input.companyId + ":" + input.scheduleId})) AS locked
    `);
    if (!lock[0]?.locked) return { status: "locked" as const };

    const schedules = await readRecurringSchedules(input.companyId, tx);
    const schedule = schedules.find((item) => item.id === input.scheduleId);
    if (!schedule || !schedule.active) return { status: "skipped" as const, reason: "inactive_or_missing" };
    if (!schedule.property_id || !schedule.title || !schedule.description || !schedule.frequency || !schedule.priority || !schedule.next_run_at) {
      return { status: "failed" as const, reason: "invalid_schedule" };
    }

    const dueAt = new Date(schedule.next_run_at);
    if (Number.isNaN(dueAt.getTime())) return { status: "failed" as const, reason: "invalid_next_run" };
    if (!input.force && dueAt > now) return { status: "skipped" as const, reason: "not_due" };

    const [property, actor] = await Promise.all([
      tx.property.findFirst({ where: { id: schedule.property_id, company_id: input.companyId }, select: { id: true } }),
      tx.user.findFirst({ where: { id: input.actorUserId, company_id: input.companyId, status: "active" }, select: { id: true } }),
    ]);
    if (!property || !actor) return { status: "failed" as const, reason: "property_or_actor_missing" };

    const scheduledEnd = new Date(dueAt.getTime() + 60 * 60 * 1000);
    const sla = calculateWorkOrderSla(now, schedule.priority);
    const workOrderNumber = await allocateWorkOrderNumber(tx, input.companyId, now);
    const created = await tx.workOrder.create({
      data: {
        company_id: input.companyId,
        property_id: schedule.property_id,
        created_by_id: actor.id,
        title: schedule.title,
        description: schedule.description,
        status: "planned",
        priority: schedule.priority,
        scheduled_start: dueAt,
        scheduled_end: scheduledEnd,
        estimated_cost: schedule.estimated_cost,
      },
    });
    await setWorkOrderEnterpriseFields(tx, {
      workOrderId: created.id,
      companyId: input.companyId,
      workOrderNumber,
      workType: "preventive",
      source: "internal",
      responseDueAt: sla.responseDueAt,
      resolutionDueAt: sla.resolutionDueAt,
    });
    await addWorkOrderStatusEvent(tx, {
      companyId: input.companyId,
      workOrderId: created.id,
      actorUserId: actor.id,
      fromStatus: null,
      toStatus: "planned",
      reason: input.force ? "Manuellt genererad från återkommande schema" : "Automatiskt genererad från återkommande schema",
      metadata: { scheduleId: schedule.id, frequency: schedule.frequency, dueAt: dueAt.toISOString() },
    });

    const nextRunAt = nextFutureRun(dueAt, schedule.frequency, now);
    await tx.auditLog.create({
      data: {
        company_id: input.companyId,
        actor_user_id: actor.id,
        entity_type: "recurring_work_order",
        entity_id: schedule.id,
        action: RECURRING_SCHEDULE_ACTION,
        metadata: {
          ...schedule,
          schedule_id: schedule.id,
          next_run_at: nextRunAt.toISOString(),
          last_generated_at: now.toISOString(),
          last_work_order_id: created.id,
          last_work_order_number: workOrderNumber,
          updated_at: now.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        company_id: input.companyId,
        actor_user_id: actor.id,
        entity_type: "work_order",
        entity_id: created.id,
        action: "work_order.generated_from_recurring_schedule",
        metadata: { scheduleId: schedule.id, workOrderNumber, dueAt: dueAt.toISOString(), nextRunAt: nextRunAt.toISOString(), automatic: !input.force },
      },
    });

    return { status: "generated" as const, workOrderId: created.id, workOrderNumber, nextRunAt };
  });
}

export async function runRecurringWorkOrderEngine(input: { companyId?: string; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const companyIds = input.companyId
    ? [input.companyId]
    : (await db.auditLog.findMany({
        where: { action: RECURRING_SCHEDULE_ACTION, company_id: { not: null } },
        distinct: ["company_id"],
        select: { company_id: true },
      })).flatMap((row) => row.company_id ? [row.company_id] : []);

  const result = { companies: companyIds.length, due: 0, generated: 0, skipped: 0, failed: 0, locked: 0, workOrders: [] as Array<{ id: string; number: string }> };
  for (const companyId of companyIds) {
    const actor = await db.user.findFirst({
      where: { company_id: companyId, status: "active" },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    if (!actor) { result.failed += 1; continue; }
    const schedules = await readRecurringSchedules(companyId);
    const due = schedules.filter((item) => item.active && new Date(item.next_run_at).getTime() <= now.getTime());
    result.due += due.length;
    for (const schedule of due) {
      try {
        const generated = await generateRecurringWorkOrder({ companyId, scheduleId: schedule.id, actorUserId: actor.id, now });
        if (generated.status === "generated") {
          result.generated += 1;
          result.workOrders.push({ id: generated.workOrderId, number: generated.workOrderNumber });
        } else if (generated.status === "locked") result.locked += 1;
        else if (generated.status === "failed") result.failed += 1;
        else result.skipped += 1;
      } catch (error) {
        console.error("Recurring work order generation failed:", companyId, schedule.id, error);
        result.failed += 1;
      }
    }
  }
  return result;
}
