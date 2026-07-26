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
  source: "table" | "legacy";
};

export const RECURRING_SCHEDULE_LEGACY_BACKFILL_ERROR =
  "Schemat finns kvar i äldre lagring. Kör backfill till RecurringWorkOrderSchedule innan det kan uppdateras eller genereras.";

export type RecurringRunRecord = {
  id: string;
  company_id: string | null;
  status: string;
  recipient: string | null;
  payload: Prisma.JsonValue | null;
  created_at: Date;
  updated_at?: Date;
};

type ScheduleMetadata = Partial<Omit<RecurringSchedule, "id" | "company_id" | "created_at">> & { schedule_id?: string };
type DbClient = typeof db | Prisma.TransactionClient;

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toSchedule(row: {
  id: string;
  company_id: string;
  property_id: string;
  property_name: string;
  title: string;
  description: string;
  frequency: string;
  priority: string;
  estimated_cost: Prisma.Decimal | number | null;
  next_run_at: Date | string;
  active: boolean;
  last_generated_at: Date | string | null;
  last_work_order_id: string | null;
  last_work_order_number: string | null;
  created_at: Date;
  updated_at: Date | string;
}): RecurringSchedule {
  return {
    id: row.id,
    company_id: row.company_id,
    property_id: row.property_id,
    property_name: row.property_name,
    title: row.title,
    description: row.description,
    frequency: row.frequency as RecurringFrequency,
    priority: row.priority as RecurringPriority,
    estimated_cost: asNumber(row.estimated_cost),
    next_run_at: row.next_run_at instanceof Date ? row.next_run_at.toISOString() : String(row.next_run_at),
    active: row.active,
    last_generated_at: row.last_generated_at
      ? (row.last_generated_at instanceof Date ? row.last_generated_at.toISOString() : String(row.last_generated_at))
      : null,
    last_work_order_id: row.last_work_order_id,
    last_work_order_number: row.last_work_order_number,
    created_at: row.created_at,
    updated_at: row.updated_at,
    source: "table",
  };
}

async function readLegacySchedules(companyId: string, client: DbClient) {
  const logs = await client.auditLog.findMany({
    where: { company_id: companyId, action: RECURRING_SCHEDULE_ACTION },
    orderBy: { created_at: "asc" },
    select: { id: true, company_id: true, metadata: true, created_at: true },
  });
  const latest = new Map<string, RecurringSchedule>();
  for (const log of logs) {
    const metadata = (log.metadata ?? {}) as ScheduleMetadata;
    const id = metadata.schedule_id || log.id;
    const previous = latest.get(id);
    latest.set(id, {
      id,
      company_id: log.company_id!,
      property_id: String(metadata.property_id || previous?.property_id || ""),
      property_name: String(metadata.property_name || previous?.property_name || ""),
      title: String(metadata.title || previous?.title || ""),
      description: String(metadata.description || previous?.description || ""),
      frequency: (metadata.frequency || previous?.frequency || "monthly") as RecurringFrequency,
      priority: (metadata.priority || previous?.priority || "normal") as RecurringPriority,
      estimated_cost: asNumber(metadata.estimated_cost ?? previous?.estimated_cost ?? null),
      next_run_at: String(metadata.next_run_at || previous?.next_run_at || log.created_at.toISOString()),
      active: typeof metadata.active === "boolean" ? metadata.active : (previous?.active ?? true),
      last_generated_at: metadata.last_generated_at != null
        ? String(metadata.last_generated_at)
        : (previous?.last_generated_at ?? null),
      last_work_order_id: metadata.last_work_order_id != null
        ? String(metadata.last_work_order_id)
        : (previous?.last_work_order_id ?? null),
      last_work_order_number: metadata.last_work_order_number != null
        ? String(metadata.last_work_order_number)
        : (previous?.last_work_order_number ?? null),
      created_at: previous?.created_at || log.created_at,
      updated_at: metadata.updated_at || log.created_at,
      source: "legacy",
    });
  }
  return latest;
}

export function advanceRecurringDate(date: Date, frequency: RecurringFrequency) {
  const next = new Date(date);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  if (frequency === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
  if (frequency === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export async function readRecurringSchedules(companyId: string, client: DbClient = db) {
  const [modern, legacy, activeProperties] = await Promise.all([
    client.recurringWorkOrderSchedule.findMany({ where: { company_id: companyId } }),
    readLegacySchedules(companyId, client),
    client.property.findMany({
      where: { company_id: companyId, deleted_at: null },
      select: { id: true },
    }),
  ]);

  const activePropertyIds = new Set(activeProperties.map((property) => property.id));
  const byId = new Map<string, RecurringSchedule>();
  for (const row of legacy.values()) {
    if (row.property_id && !activePropertyIds.has(row.property_id)) continue;
    byId.set(row.id, { ...row, source: "legacy" });
  }
  for (const row of modern) {
    if (row.property_id && !activePropertyIds.has(row.property_id)) continue;
    byId.set(row.id, toSchedule(row));
  }
  return [...byId.values()].sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)));
}

export async function upsertRecurringSchedule(input: {
  id: string;
  companyId: string;
  propertyId: string;
  propertyName: string;
  title: string;
  description: string;
  frequency: RecurringFrequency;
  priority: RecurringPriority;
  estimatedCost: number | null;
  nextRunAt: Date;
  active?: boolean;
  actorUserId: string;
  lastGeneratedAt?: Date | null;
  lastWorkOrderId?: string | null;
  lastWorkOrderNumber?: string | null;
  client?: DbClient;
}) {
  const client = input.client ?? db;
  const now = new Date();
  const active = input.active ?? true;
  const row = await client.recurringWorkOrderSchedule.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      company_id: input.companyId,
      property_id: input.propertyId,
      property_name: input.propertyName,
      title: input.title,
      description: input.description,
      frequency: input.frequency,
      priority: input.priority,
      estimated_cost: input.estimatedCost,
      next_run_at: input.nextRunAt,
      active,
      last_generated_at: input.lastGeneratedAt ?? null,
      last_work_order_id: input.lastWorkOrderId ?? null,
      last_work_order_number: input.lastWorkOrderNumber ?? null,
      created_by_id: input.actorUserId,
      updated_by_id: input.actorUserId,
      created_at: now,
      updated_at: now,
    },
    update: {
      property_id: input.propertyId,
      property_name: input.propertyName,
      title: input.title,
      description: input.description,
      frequency: input.frequency,
      priority: input.priority,
      estimated_cost: input.estimatedCost,
      next_run_at: input.nextRunAt,
      active,
      last_generated_at: input.lastGeneratedAt === undefined ? undefined : input.lastGeneratedAt,
      last_work_order_id: input.lastWorkOrderId === undefined ? undefined : input.lastWorkOrderId,
      last_work_order_number: input.lastWorkOrderNumber === undefined ? undefined : input.lastWorkOrderNumber,
      updated_by_id: input.actorUserId,
      updated_at: now,
    },
  });
  return toSchedule(row);
}

export async function listRecurringRuns(
  companyId: string | null,
  options: { statuses?: string[]; since?: Date; take?: number } = {},
) {
  const take = options.take ?? 20;
  const statuses = options.statuses;
  const modern = await db.recurringWorkOrderRun.findMany({
    where: {
      ...(companyId ? { company_id: companyId } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(options.since ? { created_at: { gte: options.since } } : {}),
    },
    orderBy: { created_at: "desc" },
    take,
  });

  const modernIds = new Set(modern.map((row) => row.id));
  const legacy = await db.integrationEvent.findMany({
    where: {
      ...(companyId ? { company_id: companyId } : {}),
      type: "recurring_work_orders_run",
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(options.since ? { created_at: { gte: options.since } } : {}),
    },
    orderBy: { created_at: "desc" },
    take,
    select: { id: true, company_id: true, status: true, recipient: true, payload: true, created_at: true },
  });

  const merged: RecurringRunRecord[] = [
    ...modern.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      status: row.status,
      recipient: row.recipient,
      payload: row.payload,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    ...legacy
      .filter((row) => !modernIds.has(row.id))
      .map((row) => ({
        id: row.id,
        company_id: row.company_id,
        status: row.status,
        recipient: row.recipient,
        payload: row.payload,
        created_at: row.created_at,
      })),
  ];

  return merged.sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).slice(0, take);
}

export async function createRecurringRun(input: {
  companyId?: string | null;
  status?: string;
  recipient?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  return db.recurringWorkOrderRun.create({
    data: {
      company_id: input.companyId ?? null,
      status: input.status ?? "processing",
      recipient: input.recipient ?? null,
      payload: input.payload ?? Prisma.JsonNull,
    },
  });
}

export async function updateRecurringRun(
  id: string,
  data: { status?: string; payload?: Prisma.InputJsonValue },
) {
  return db.recurringWorkOrderRun.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.payload !== undefined ? { payload: data.payload } : {}),
    },
  });
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
    // Fail-closed: never rematerialize AuditLog-only schedules into RecurringWorkOrderSchedule.
    if (schedule.source === "legacy") {
      return { status: "failed" as const, reason: "legacy_requires_backfill" as const };
    }
    if (!schedule.property_id || !schedule.title || !schedule.description || !schedule.frequency || !schedule.priority || !schedule.next_run_at) {
      return { status: "failed" as const, reason: "invalid_schedule" };
    }

    const dueAt = new Date(schedule.next_run_at);
    if (Number.isNaN(dueAt.getTime())) return { status: "failed" as const, reason: "invalid_next_run" };
    if (!input.force && dueAt > now) return { status: "skipped" as const, reason: "not_due" };

    const [property, actor] = await Promise.all([
      tx.property.findFirst({ where: { id: schedule.property_id, company_id: input.companyId, deleted_at: null }, select: { id: true, name: true } }),
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
    await upsertRecurringSchedule({
      id: schedule.id,
      companyId: input.companyId,
      propertyId: schedule.property_id,
      propertyName: property.name || schedule.property_name,
      title: schedule.title,
      description: schedule.description,
      frequency: schedule.frequency,
      priority: schedule.priority,
      estimatedCost: schedule.estimated_cost,
      nextRunAt,
      active: schedule.active,
      actorUserId: actor.id,
      lastGeneratedAt: now,
      lastWorkOrderId: created.id,
      lastWorkOrderNumber: workOrderNumber,
      client: tx,
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
  const modernCompanies = await db.recurringWorkOrderSchedule.findMany({
    where: input.companyId ? { company_id: input.companyId } : undefined,
    distinct: ["company_id"],
    select: { company_id: true },
  });
  const legacyCompanies = await db.auditLog.findMany({
    where: {
      action: RECURRING_SCHEDULE_ACTION,
      company_id: input.companyId ? input.companyId : { not: null },
    },
    distinct: ["company_id"],
    select: { company_id: true },
  });
  const companyIds = [...new Set([
    ...modernCompanies.map((row) => row.company_id),
    ...legacyCompanies.flatMap((row) => (row.company_id ? [row.company_id] : [])),
  ])];

  const result = { companies: companyIds.length, due: 0, generated: 0, skipped: 0, failed: 0, locked: 0, workOrders: [] as Array<{ id: string; number: string }> };
  for (const companyId of companyIds) {
    const actor = await db.user.findFirst({
      where: { company_id: companyId, status: "active" },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    if (!actor) { result.failed += 1; continue; }
    const schedules = await readRecurringSchedules(companyId);
    const due = schedules.filter((item) => item.active && item.source === "table" && new Date(item.next_run_at).getTime() <= now.getTime());
    const legacyDue = schedules.filter((item) => item.active && item.source === "legacy" && new Date(item.next_run_at).getTime() <= now.getTime());
    result.due += due.length;
    result.skipped += legacyDue.length;
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
