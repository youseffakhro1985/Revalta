import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";
import { deliverServiceEmail } from "@/lib/component-service-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueComponent = {
  id: string;
  property_id: string;
  component_name: string;
  next_service_at: Date;
  property_name: string;
  property_address: string;
  property_city: string;
};

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function authorizedUser() {
  const user = await getCurrentUser();
  if (!user) return { response: noStore({ error: "Obehörig" }, { status: 401 }) };
  if (!user.company_id) return { response: noStore({ error: "Användaren saknar organisation" }, { status: 400 }) };
  if (!canManageCompany(user.role)) {
    return { response: noStore({ error: "Endast ägare och administratörer kan hantera dead-letter-kön" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;

  const events = await db.integrationEvent.findMany({
    where: {
      company_id: auth.user.company_id,
      type: "component_service_dead_letter",
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: { id: true, status: true, recipient: true, payload: true, created_at: true },
  });

  const items = events.map((event) => {
    const payload = record(event.payload);
    return {
      id: event.id,
      status: event.status === "resolved" || event.status === "dismissed" ? event.status : "open",
      email: text(payload?.email),
      mode: payload?.mode === "overdue_only" ? "overdue_only" : "all",
      error: text(payload?.error),
      attempts: Math.max(0, numberValue(payload?.attempts)),
      retryable: payload?.retryable === true,
      retryCount: Math.max(0, numberValue(payload?.retryCount)),
      lastRetryAt: text(payload?.lastRetryAt),
      sourceEventId: text(payload?.sourceEventId),
      createdAt: event.created_at,
    };
  });

  return noStore({
    items,
    summary: {
      total: items.length,
      open: items.filter((item) => item.status === "open").length,
      retryable: items.filter((item) => item.status === "open" && item.retryable).length,
      permanent: items.filter((item) => item.status === "open" && !item.retryable).length,
      resolved: items.filter((item) => item.status === "resolved").length,
      dismissed: items.filter((item) => item.status === "dismissed").length,
    },
  });
}

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null;
  const id = text(body?.id);
  const action = text(body?.action);
  if (!id || !["retry", "dismiss"].includes(action)) {
    return noStore({ error: "Giltigt kö-id och åtgärd krävs" }, { status: 400 });
  }

  const event = await db.integrationEvent.findFirst({
    where: {
      id,
      company_id: auth.user.company_id,
      type: "component_service_dead_letter",
    },
    select: { id: true, status: true, payload: true },
  });
  if (!event) return noStore({ error: "Köposten hittades inte" }, { status: 404 });
  if (event.status !== "open") return noStore({ error: "Köposten är redan avslutad" }, { status: 409 });

  const payload = record(event.payload) || {};
  if (action === "dismiss") {
    await db.$transaction([
      db.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: "dismissed",
          payload: toJson({ ...payload, dismissedAt: new Date().toISOString(), dismissedBy: auth.user.id }),
        },
      }),
      db.auditLog.create({
        data: {
          company_id: auth.user.company_id,
          actor_user_id: auth.user.id,
          entity_type: "service_notification_dead_letter",
          entity_id: event.id,
          action: "component_service_dead_letter.dismissed",
          metadata: toJson({ email: text(payload.email), sourceEventId: text(payload.sourceEventId) }),
        },
      }),
    ]);
    return noStore({ success: true, status: "dismissed" });
  }

  const email = text(payload.email).toLowerCase();
  const mode = payload.mode === "overdue_only" ? "overdue_only" : "all";
  const daysAhead = Math.min(90, Math.max(1, numberValue(payload.daysAhead, 30)));
  if (!email) return noStore({ error: "Köposten saknar mottagare" }, { status: 422 });

  const now = new Date();
  const dueBefore = mode === "overdue_only" ? now : new Date(now.getTime() + daysAhead * 86400000);
  const components = await db.$queryRaw<DueComponent[]>(Prisma.sql`
    SELECT a."id", a."property_id", a."name" AS "component_name", a."next_service_at",
      p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city"
    FROM "PropertyTechnicalAsset" a
    INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
    WHERE a."company_id" = ${auth.user.company_id}
      AND a."next_service_at" IS NOT NULL
      AND a."next_service_at" <= ${dueBefore}
      AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
    ORDER BY a."next_service_at" ASC
  `);

  if (!components.length) {
    return noStore({ error: "Det finns inga aktuella servicepunkter att skicka" }, { status: 409 });
  }

  const result = await deliverServiceEmail(email, components, daysAhead, mode);
  const retryCount = Math.max(0, numberValue(payload.retryCount)) + 1;
  const nextPayload = {
    ...payload,
    retryCount,
    lastRetryAt: new Date().toISOString(),
    lastRetryBy: auth.user.id,
    lastRetryResult: result,
    error: result.error,
    attempts: result.attempts,
    retryable: result.retryable,
  };

  await db.$transaction([
    db.integrationEvent.update({
      where: { id: event.id },
      data: { status: result.status === "sent" ? "resolved" : "open", payload: toJson(nextPayload) },
    }),
    db.auditLog.create({
      data: {
        company_id: auth.user.company_id,
        actor_user_id: auth.user.id,
        entity_type: "service_notification_dead_letter",
        entity_id: event.id,
        action: result.status === "sent" ? "component_service_dead_letter.resolved" : "component_service_dead_letter.retry_failed",
        metadata: toJson({ email, mode, retryCount, attempts: result.attempts, error: result.error }),
      },
    }),
  ]);

  return noStore({ success: result.status === "sent", status: result.status === "sent" ? "resolved" : "open", delivery: result });
}
