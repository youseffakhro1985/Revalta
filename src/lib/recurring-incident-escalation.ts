import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { createRecurringIncidentEvent, listRecurringIncidentEvents } from "@/lib/recurring-incident-storage";
import { listRecurringRuns, readRecurringSchedules } from "@/lib/recurring-work-order-engine";

type IncidentPayload = {
  notificationKey?: string;
  status?: string;
  changedAt?: string;
};

type EscalationPayload = {
  notificationKey?: string;
  level?: number;
};

type SourceIncident = {
  notificationKey: string;
  sourceAt: Date;
  sourceType: "run" | "schedule";
};

function objectPayload(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function incidentPayload(value: Prisma.JsonValue | null): IncidentPayload {
  return (objectPayload(value) || {}) as IncidentPayload;
}

function escalationPayload(value: Prisma.JsonValue | null): EscalationPayload {
  return (objectPayload(value) || {}) as EscalationPayload;
}

async function sourceIncidents(companyId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const historySince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [schedules, runs] = await Promise.all([
    readRecurringSchedules(companyId),
    listRecurringRuns(companyId, {
      statuses: ["partial", "failed"],
      since: historySince,
      take: 100,
    }),
  ]);

  const incidents: SourceIncident[] = runs.map((run) => ({
    notificationKey: `recurring-run:${run.id}`,
    sourceAt: run.created_at,
    sourceType: "run",
  }));

  for (const schedule of schedules) {
    if (!schedule.active || !schedule.next_run_at) continue;
    const dueAt = new Date(schedule.next_run_at);
    if (Number.isNaN(dueAt.getTime()) || dueAt >= staleBefore) continue;
    incidents.push({
      notificationKey: `recurring-schedule:${schedule.id}:${dueAt.toISOString().slice(0, 10)}`,
      sourceAt: dueAt,
      sourceType: "schedule",
    });
  }

  return incidents;
}

export async function runRecurringIncidentEscalation(options: { companyId?: string } = {}) {
  const companyIds = options.companyId
    ? [options.companyId]
    : (await db.user.findMany({
        where: { company_id: { not: null } },
        select: { company_id: true },
        distinct: ["company_id"],
      }))
        .map((item) => item.company_id)
        .filter((value): value is string => Boolean(value));

  let scanned = 0;
  let escalated = 0;
  let skipped = 0;
  const errors: Array<{ companyId: string; notificationKey?: string; error: string }> = [];

  for (const companyId of companyIds) {
    try {
      const sources = await sourceIncidents(companyId);
      scanned += sources.length;
      const events = await listRecurringIncidentEvents(companyId, {
        eventTypes: ["status", "escalation"],
        take: 4000,
      });

      const latestIncident = new Map<string, { status: string; changedAt: Date }>();
      const highestLevel = new Map<string, number>();

      for (const event of events) {
        if (event.event_type === "status") {
          const data = incidentPayload(event.payload);
          const key = event.notification_key || data.notificationKey;
          if (!key || latestIncident.has(key)) continue;
          const changedAt = data.changedAt ? new Date(data.changedAt) : event.created_at;
          latestIncident.set(key, {
            status: data.status || event.status,
            changedAt: Number.isNaN(changedAt.getTime()) ? event.created_at : changedAt,
          });
        } else if (event.event_type === "escalation") {
          const data = escalationPayload(event.payload);
          const key = event.notification_key || data.notificationKey;
          if (!key || typeof data.level !== "number") continue;
          highestLevel.set(key, Math.max(highestLevel.get(key) || 0, data.level));
        }
      }

      const now = Date.now();
      for (const source of sources) {
        const incident = latestIncident.get(source.notificationKey);
        if (incident?.status === "resolved") {
          skipped += 1;
          continue;
        }

        const openHours = Math.max(0, (now - source.sourceAt.getTime()) / 3600000);
        const acknowledgedHours = incident?.status === "acknowledged"
          ? Math.max(0, (now - incident.changedAt.getTime()) / 3600000)
          : 0;

        let desiredLevel = 0;
        let reason = "";
        if (incident?.status === "acknowledged" && acknowledgedHours >= 24) {
          desiredLevel = 2;
          reason = "Kvitterad incident har varit olöst längre än 24 timmar";
        } else if (!incident || incident.status === "reopened") {
          if (openHours >= 8) {
            desiredLevel = 2;
            reason = "Incidenten har inte kvitterats inom åtta timmar";
          } else if (openHours >= 2) {
            desiredLevel = 1;
            reason = "Incidenten har inte kvitterats inom två timmar";
          }
        }

        if (!desiredLevel || (highestLevel.get(source.notificationKey) || 0) >= desiredLevel) {
          skipped += 1;
          continue;
        }

        await createRecurringIncidentEvent({
          companyId,
          notificationKey: source.notificationKey,
          eventType: "escalation",
          status: `level_${desiredLevel}`,
          recipient: desiredLevel === 2 ? "company:management" : "company:operations",
          payload: {
            notificationKey: source.notificationKey,
            level: desiredLevel,
            reason,
            sourceType: source.sourceType,
            sourceAt: source.sourceAt.toISOString(),
            escalatedAt: new Date().toISOString(),
          },
        });
        highestLevel.set(source.notificationKey, desiredLevel);
        escalated += 1;
      }
    } catch (error) {
      errors.push({
        companyId,
        error: error instanceof Error ? error.message : "Okänt fel",
      });
    }
  }

  return { companies: companyIds.length, scanned, escalated, skipped, failed: errors.length, errors };
}
