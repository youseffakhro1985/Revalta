import { Prisma } from "@prisma/client";
import db from "@/lib/db";

export type RecurringIncidentEventType = "status" | "escalation" | "assignment" | "sla";

const legacyTypeByEvent: Record<RecurringIncidentEventType, string> = {
  status: "recurring_work_order_incident",
  escalation: "recurring_incident_escalation",
  assignment: "recurring_incident_assignment",
  sla: "recurring_incident_sla",
};

const eventByLegacyType: Record<string, RecurringIncidentEventType> = {
  recurring_work_order_incident: "status",
  recurring_incident_escalation: "escalation",
  recurring_incident_assignment: "assignment",
  recurring_incident_sla: "sla",
};

export type RecurringIncidentEventRecord = {
  id: string;
  company_id: string;
  notification_key: string;
  event_type: RecurringIncidentEventType;
  status: string;
  recipient: string | null;
  payload: Prisma.JsonValue;
  created_at: Date;
};

function objectPayload(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function keyFromPayload(value: Prisma.JsonValue | null) {
  const key = objectPayload(value)?.notificationKey;
  return typeof key === "string" ? key : "";
}

export async function createRecurringIncidentEvent(input: {
  companyId: string;
  notificationKey: string;
  eventType: RecurringIncidentEventType;
  status: string;
  recipient?: string | null;
  payload: Prisma.InputJsonValue;
}) {
  const payload = {
    ...(typeof input.payload === "object" && input.payload && !Array.isArray(input.payload) ? input.payload : {}),
    notificationKey: input.notificationKey,
  } as Prisma.InputJsonValue;

  return db.recurringIncidentEvent.create({
    data: {
      company_id: input.companyId,
      notification_key: input.notificationKey,
      event_type: input.eventType,
      status: input.status,
      recipient: input.recipient ?? null,
      payload,
    },
  });
}

/**
 * Atomically create an "escalation" event, guarding against a concurrent or
 * retried cron invocation creating a duplicate escalation (and thus a duplicate
 * notification) for the same notificationKey/level. Takes a Postgres advisory
 * lock scoped to (companyId, notificationKey), then re-checks the highest
 * already-recorded escalation level for that key *inside* the lock before
 * inserting — mirrors the pattern used by generateRecurringWorkOrder.
 */
export async function tryCreateRecurringIncidentEscalation(input: {
  companyId: string;
  notificationKey: string;
  level: number;
  status: string;
  recipient?: string | null;
  payload: Prisma.InputJsonValue;
}) {
  return db.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtext(${`recurring-incident-escalation:${input.companyId}:${input.notificationKey}`})) AS locked
    `);
    if (!lock[0]?.locked) return { created: false as const, reason: "locked" as const };

    const existing = await tx.recurringIncidentEvent.findMany({
      where: { company_id: input.companyId, notification_key: input.notificationKey, event_type: "escalation" },
      select: { payload: true },
    });
    const highestExisting = existing.reduce((max, row) => {
      const data = objectPayload(row.payload);
      const level = typeof data?.level === "number" ? data.level : 0;
      return Math.max(max, level);
    }, 0);
    if (highestExisting >= input.level) {
      return { created: false as const, reason: "already_escalated" as const };
    }

    const payload = {
      ...(typeof input.payload === "object" && input.payload && !Array.isArray(input.payload) ? input.payload : {}),
      notificationKey: input.notificationKey,
    } as Prisma.InputJsonValue;

    const event = await tx.recurringIncidentEvent.create({
      data: {
        company_id: input.companyId,
        notification_key: input.notificationKey,
        event_type: "escalation",
        status: input.status,
        recipient: input.recipient ?? null,
        payload,
      },
    });
    return { created: true as const, event };
  });
}

export async function listRecurringIncidentEvents(
  companyId: string,
  options: { eventTypes?: RecurringIncidentEventType[]; take?: number } = {},
): Promise<RecurringIncidentEventRecord[]> {
  const take = options.take ?? 4000;
  const eventTypes = options.eventTypes;
  const modern = await db.recurringIncidentEvent.findMany({
    where: {
      company_id: companyId,
      ...(eventTypes ? { event_type: { in: eventTypes } } : {}),
    },
    orderBy: { created_at: "desc" },
    take,
  });

  const modernIds = new Set(modern.map((row) => row.id));
  const legacyTypes = (eventTypes || (Object.keys(legacyTypeByEvent) as RecurringIncidentEventType[]))
    .map((type) => legacyTypeByEvent[type]);

  const legacy = await db.integrationEvent.findMany({
    where: {
      company_id: companyId,
      type: { in: legacyTypes },
    },
    orderBy: { created_at: "desc" },
    select: { id: true, company_id: true, type: true, status: true, recipient: true, payload: true, created_at: true },
    take,
  });

  const merged: RecurringIncidentEventRecord[] = [
    ...modern.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      notification_key: row.notification_key,
      event_type: row.event_type as RecurringIncidentEventType,
      status: row.status,
      recipient: row.recipient,
      payload: row.payload,
      created_at: row.created_at,
    })),
    ...legacy
      .filter((row) => !modernIds.has(row.id) && row.company_id)
      .map((row) => ({
        id: row.id,
        company_id: row.company_id!,
        notification_key: keyFromPayload(row.payload),
        event_type: eventByLegacyType[row.type] || "status" as RecurringIncidentEventType,
        status: row.status,
        recipient: row.recipient,
        payload: row.payload,
        created_at: row.created_at,
      }))
      .filter((row) => row.notification_key),
  ];

  return merged.sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).slice(0, take);
}
