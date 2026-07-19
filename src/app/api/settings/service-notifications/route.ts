import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";
import {
  parseComponentServiceNotificationPreferences,
  validateComponentServiceNotificationPreferences,
} from "@/lib/component-service-notifications";

export const dynamic = "force-dynamic";

type ServiceCount = { total: bigint; overdue: bigint };

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHost ? `https://${productionHost}` : "https://www.revalta.se";
}

async function getPreferences(companyId: string) {
  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: "component_service_settings", status: "active" },
    orderBy: { created_at: "desc" },
    select: { payload: true, created_at: true },
  });
  return {
    preferences: parseComponentServiceNotificationPreferences(event?.payload),
    updatedAt: event?.created_at ?? null,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

  const stored = await getPreferences(user.company_id);
  const [events, recipients, counts] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: { in: ["component_service_digest", "component_service_test"] } },
      orderBy: { created_at: "desc" },
      take: 50,
      select: { id: true, type: true, status: true, recipient: true, payload: true, created_at: true },
    }),
    db.user.findMany({
      where: { company_id: user.company_id, status: "active", role: { in: stored.preferences.roles } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    }),
    db.$queryRaw<ServiceCount[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "total",
        COUNT(*) FILTER (WHERE "next_service_at" < NOW())::bigint AS "overdue"
      FROM "PropertyTechnicalAsset"
      WHERE "company_id" = ${user.company_id}
        AND "next_service_at" IS NOT NULL
        AND "next_service_at" <= NOW() + (${stored.preferences.daysAhead} * INTERVAL '1 day')
        AND COALESCE("status", 'active') NOT IN ('retired', 'removed')
    `),
  ]);

  const statusCounts = events.reduce<Record<string, number>>((summary, event) => {
    summary[event.status] = (summary[event.status] || 0) + 1;
    return summary;
  }, {});

  return noStore({
    canManage: canManageCompany(user.role),
    currentUserEmail: user.email,
    configuration: {
      cronSecret: Boolean(process.env.CRON_SECRET),
      emailApiKey: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
      emailFrom: Boolean(process.env.EMAIL_FROM),
      appUrl: appBaseUrl(),
    },
    preferences: stored.preferences,
    preferencesUpdatedAt: stored.updatedAt,
    due: { total: Number(counts[0]?.total || 0), overdue: Number(counts[0]?.overdue || 0) },
    recipients,
    events,
    statusCounts,
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan ändra inställningarna" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const validation = validateComponentServiceNotificationPreferences(body);
  if (!validation.success) return noStore({ error: validation.error }, { status: 400 });

  const preferences = validation.preferences;
  const previous = await getPreferences(user.company_id);
  const created = await db.$transaction(async (tx) => {
    await tx.integrationEvent.updateMany({
      where: { company_id: user.company_id, type: "component_service_settings", status: "active" },
      data: { status: "superseded" },
    });
    const event = await tx.integrationEvent.create({
      data: {
        company_id: user.company_id,
        type: "component_service_settings",
        status: "active",
        recipient: `company:${user.company_id}`,
        payload: { ...preferences, updatedBy: user.id },
      },
      select: { created_at: true },
    });
    await tx.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "service_notification_settings",
        entity_id: user.company_id,
        action: "component_service_notifications.updated",
        metadata: { before: previous.preferences, after: preferences },
      },
    });
    return event;
  });

  return noStore({ success: true, preferences, updatedAt: created.created_at });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan skicka testutskick" }, { status: 403 });
  }

  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return noStore({ error: "E-postleverantören är inte fullständigt konfigurerad" }, { status: 503 });
  }

  const recentTest = await db.integrationEvent.findFirst({
    where: {
      company_id: user.company_id,
      type: "component_service_test",
      created_at: { gte: new Date(Date.now() - 60_000) },
    },
    select: { id: true },
  });
  if (recentTest) {
    return noStore({ error: "Vänta en minut innan du skickar ett nytt testutskick" }, { status: 429 });
  }

  const event = await db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type: "component_service_test",
      status: "processing",
      recipient: user.email,
      payload: { initiatedBy: user.id, appUrl: appBaseUrl() },
    },
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Revalta: test av serviceaviseringar",
        html: `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid #e7e1d7;border-radius:18px;background:#fff"><div style="padding:26px 30px;background:#174d45;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Revalta</div><h1 style="margin:8px 0 0;font-size:25px">Serviceaviseringarna fungerar</h1></div><div style="padding:28px 30px"><p style="margin:0;line-height:1.6;color:#514e48">Detta är ett testutskick från Revaltas aviseringspanel.</p><p style="margin:24px 0 0"><a href="${appBaseUrl()}/dashboard/installningar/aviseringar" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna aviseringspanelen</a></p></div></div></div></body></html>`,
      }),
    });
    const providerResponse = await response.text();
    if (!response.ok) {
      throw new Error(`E-postleverantören svarade ${response.status}: ${providerResponse.slice(0, 300)}`);
    }
    await db.integrationEvent.update({
      where: { id: event.id },
      data: { status: "sent", payload: { initiatedBy: user.id, providerResponse } },
    });
    return noStore({ success: true, recipient: user.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    await db.integrationEvent.update({
      where: { id: event.id },
      data: { status: "failed", payload: { initiatedBy: user.id, error: message } },
    });
    return noStore({ error: message }, { status: 502 });
  }
}
