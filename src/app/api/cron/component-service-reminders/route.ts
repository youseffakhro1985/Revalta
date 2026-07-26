import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { deliverServiceEmail, type ServiceEmailDelivery } from "@/lib/component-service-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueComponent = { id: string; company_id: string; property_id: string; component_name: string; criticality: string | null; next_service_at: Date; property_name: string; property_address: string; property_city: string };
type Recipient = { id: string; email: string; name: string | null; role: string };
type Preferences = { enabled: boolean; daysAhead: number; roles: string[]; additionalEmails: string[] };
type UserPreferences = { enabled: boolean; overdueOnly: boolean };
type DeliveryStatus = "sent" | "partial" | "failed";

const allowedRoles = ["owner", "admin", "manager", "property_manager"];
const defaults: Preferences = { enabled: true, daysAhead: 30, roles: [...allowedRoles], additionalEmails: [] };
const userDefaults: UserPreferences = { enabled: true, overdueOnly: false };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROCESSING_LEASE_MS = 15 * 60_000;

function noStore(body: unknown, init?: ResponseInit) { return NextResponse.json(body, { ...init, headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) } }); }
function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function authorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; }
function normalizeEmail(value: unknown) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function toJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

async function claimRun(companyId: string, dedupeKey: string, payload: Record<string, unknown>) {
  return db.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${dedupeKey})) AS "locked"`);
    if (!lock[0]?.locked) return { claimed: false as const, reason: "concurrent_run" };

    const modernExisting = await tx.componentServiceDigestRun.findUnique({
      where: { company_id_dedupe_key: { company_id: companyId, dedupe_key: dedupeKey } },
      select: { id: true, status: true, updated_at: true, created_at: true },
    });
    if (modernExisting?.status === "sent") return { claimed: false as const, reason: "already_sent" };
    if (
      modernExisting?.status === "processing"
      && modernExisting.updated_at.getTime() >= Date.now() - PROCESSING_LEASE_MS
    ) {
      return { claimed: false as const, reason: "already_processing" };
    }

    const legacyExisting = await tx.integrationEvent.findFirst({
      where: {
        company_id: companyId,
        type: "component_service_digest",
        recipient: dedupeKey,
        OR: [
          { status: "sent" },
          { status: "processing", created_at: { gte: new Date(Date.now() - PROCESSING_LEASE_MS) } },
        ],
      },
      orderBy: { created_at: "desc" },
      select: { id: true, status: true },
    });
    if (legacyExisting) {
      return { claimed: false as const, reason: legacyExisting.status === "sent" ? "already_sent" : "already_processing" };
    }

    const run = modernExisting
      ? await tx.componentServiceDigestRun.update({
        where: { id: modernExisting.id },
        data: { status: "processing", payload: toJson(payload), sent_count: 0, failed_count: 0 },
        select: { id: true },
      })
      : await tx.componentServiceDigestRun.create({
        data: {
          company_id: companyId,
          dedupe_key: dedupeKey,
          status: "processing",
          payload: toJson(payload),
        },
        select: { id: true },
      });
    return { claimed: true as const, eventId: run.id };
  });
}

async function finalizeRun(input: {
  companyId: string;
  eventId: string;
  dedupeKey: string;
  status: DeliveryStatus;
  payload: Record<string, unknown>;
  sentCount: number;
  failedCount: number;
}) {
  const { companyId, eventId, dedupeKey, status, payload, sentCount, failedCount } = input;
  await db.$transaction(async (tx) => {
    await tx.componentServiceDigestRun.update({
      where: { id: eventId },
      data: {
        status,
        payload: toJson(payload),
        sent_count: sentCount,
        failed_count: failedCount,
      },
    });

    await tx.auditLog.create({
      data: {
        company_id: companyId,
        actor_user_id: null,
        entity_type: "service_notification_run",
        entity_id: eventId,
        action: `component_service_digest.${status}`,
        metadata: toJson({ dedupeKey, status, sentCount, failedCount, storage: "ComponentServiceDigestRun" }),
      },
    });

    if (status === "sent") {
      const openModern = await tx.componentServiceDeliveryAlert.findMany({
        where: { company_id: companyId, status: "open" },
        select: { id: true },
        take: 100,
      });
      if (openModern.length) {
        await tx.componentServiceDeliveryAlert.updateMany({
          where: { id: { in: openModern.map((alert) => alert.id) } },
          data: { status: "resolved", resolved_at: new Date() },
        });
        await tx.auditLog.create({
          data: {
            company_id: companyId,
            actor_user_id: null,
            entity_type: "service_notification_delivery",
            entity_id: eventId,
            action: "component_service_delivery.recovered",
            metadata: toJson({
              recoveredByEventId: eventId,
              resolvedAlertIds: openModern.map((alert) => alert.id),
              storage: "ComponentServiceDeliveryAlert",
            }),
          },
        });
      }
      return;
    }

    const existingModern = await tx.componentServiceDeliveryAlert.findFirst({
      where: { company_id: companyId, status: "open" },
      orderBy: { created_at: "desc" },
      select: { id: true },
    });
    const existingLegacy = await tx.integrationEvent.findFirst({
      where: { company_id: companyId, type: "component_service_delivery_alert", status: "open" },
      orderBy: { created_at: "desc" },
      select: { id: true },
    });
    if (!existingModern && !existingLegacy) {
      await tx.componentServiceDeliveryAlert.create({
        data: {
          company_id: companyId,
          source_run_id: eventId,
          status: "open",
          severity: status === "failed" ? "critical" : "warning",
          sent_count: sentCount,
          failed_count: failedCount,
          dedupe_key: dedupeKey,
        },
      });
    }
  });
}

export async function GET(request: Request) {
  if (!authorized(request)) return noStore({ error: "Obehörig" }, { status: 401 });
  const now = new Date();
  const maxDueBefore = new Date(now.getTime() + 90 * 86400000);
  const [components, modernSettings, modernUserPreferences] = await Promise.all([
    db.$queryRaw<DueComponent[]>(Prisma.sql`
      SELECT a."id", a."company_id", a."property_id", a."name" AS "component_name", a."criticality", a."next_service_at",
        p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city"
      FROM "PropertyTechnicalAsset" a INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
      WHERE p."deleted_at" IS NULL
        AND a."next_service_at" IS NOT NULL AND a."next_service_at" <= ${maxDueBefore}
        AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
      ORDER BY a."company_id", a."next_service_at" ASC, a."criticality" DESC
    `),
    db.serviceNotificationSettings.findMany({
      select: { company_id: true, enabled: true, days_ahead: true, roles: true, additional_emails: true },
    }),
    db.userServiceNotificationPreference.findMany({
      select: { company_id: true, user_id: true, enabled: true, overdue_only: true },
    }),
  ]);

  const settings = new Map<string, Preferences>();
  for (const row of modernSettings) {
    settings.set(row.company_id, {
      enabled: row.enabled,
      daysAhead: row.days_ahead,
      roles: Array.isArray(row.roles) ? row.roles.map(String).filter((role) => allowedRoles.includes(role)) : defaults.roles,
      additionalEmails: Array.isArray(row.additional_emails) ? row.additional_emails.map(String) : [],
    });
  }
  const userSettings = new Map<string, UserPreferences>();
  for (const row of modernUserPreferences) {
    userSettings.set(`${row.company_id}:${row.user_id}`, { enabled: row.enabled, overdueOnly: row.overdue_only });
  }

  const grouped = new Map<string, DueComponent[]>();
  for (const component of components) {
    const preference = settings.get(component.company_id) || defaults;
    if (!preference.enabled || component.next_service_at > new Date(now.getTime() + preference.daysAhead * 86400000)) continue;
    const list = grouped.get(component.company_id) || [];
    list.push(component);
    grouped.set(component.company_id, list);
  }

  const result = { companies: grouped.size, sent: 0, partial: 0, skipped: 0, failed: 0, components: Array.from(grouped.values()).reduce((sum, list) => sum + list.length, 0) };
  const runDate = dateKey(now);

  for (const [companyId, companyComponents] of grouped) {
    const preference = settings.get(companyId) || defaults;
    const dedupeKey = `component-service-digest:${companyId}:${runDate}`;
    const recipients = await db.user.findMany({ where: { company_id: companyId, status: "active", role: { in: preference.roles } }, select: { id: true, email: true, name: true, role: true }, orderBy: { created_at: "asc" } }) as Recipient[];
    const allEmails = new Set(preference.additionalEmails.map(normalizeEmail).filter((email) => emailPattern.test(email)));
    const overdueOnlyEmails = new Set<string>();
    for (const recipient of recipients) {
      const personal = userSettings.get(`${companyId}:${recipient.id}`) || userDefaults;
      if (!personal.enabled) continue;
      const email = normalizeEmail(recipient.email);
      if (!emailPattern.test(email)) continue;
      if (personal.overdueOnly) overdueOnlyEmails.add(email); else allEmails.add(email);
    }
    for (const email of allEmails) overdueOnlyEmails.delete(email);

    const overdueComponents = companyComponents.filter((item) => item.next_service_at < now);
    const basePayload = { allRecipients: Array.from(allEmails), overdueOnlyRecipients: Array.from(overdueOnlyEmails), componentCount: companyComponents.length, overdueCount: overdueComponents.length, runDate, settings: preference };
    if (!allEmails.size && (!overdueOnlyEmails.size || !overdueComponents.length)) {
      await db.componentServiceDigestRun.upsert({
        where: { company_id_dedupe_key: { company_id: companyId, dedupe_key: dedupeKey } },
        create: {
          company_id: companyId,
          dedupe_key: dedupeKey,
          status: "skipped",
          payload: toJson({ ...basePayload, reason: "no_recipients_or_matching_components" }),
        },
        update: {
          status: "skipped",
          payload: toJson({ ...basePayload, reason: "no_recipients_or_matching_components" }),
        },
      });
      result.skipped += 1;
      continue;
    }

    const claim = await claimRun(companyId, dedupeKey, basePayload);
    if (!claim.claimed) { result.skipped += 1; continue; }

    const deliveries: ServiceEmailDelivery[] = [];
    for (const email of allEmails) deliveries.push(await deliverServiceEmail(email, companyComponents, preference.daysAhead, "all"));
    if (overdueComponents.length) for (const email of overdueOnlyEmails) deliveries.push(await deliverServiceEmail(email, overdueComponents, preference.daysAhead, "overdue_only"));

    const sentCount = deliveries.filter((item) => item.status === "sent").length;
    const failedCount = deliveries.length - sentCount;
    const status: DeliveryStatus = sentCount === 0 ? "failed" : failedCount > 0 ? "partial" : "sent";
    await finalizeRun({
      companyId,
      eventId: claim.eventId,
      dedupeKey,
      status,
      sentCount,
      failedCount,
      payload: { ...basePayload, deliverySummary: { total: deliveries.length, sent: sentCount, failed: failedCount }, deliveries },
    });
    if (status === "sent") result.sent += 1;
    else if (status === "partial") result.partial += 1;
    else result.failed += 1;
  }

  return noStore(result);
}
