import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

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

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function authorizedUser() {
  const user = await getCurrentUser();
  if (!user) return { response: noStore({ error: "Obehörig" }, { status: 401 }) };
  if (!user.company_id) return { response: noStore({ error: "Användaren saknar organisation" }, { status: 400 }) };
  if (!canManageCompany(user.role)) {
    return { response: noStore({ error: "Endast ägare och administratörer kan hantera eskaleringar" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;

  const events = await db.integrationEvent.findMany({
    where: {
      company_id: auth.user.company_id,
      type: "component_service_dead_letter_escalation",
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: { id: true, status: true, recipient: true, payload: true, created_at: true },
  });

  const items = events.map((event) => {
    const payload = record(event.payload);
    const reason = text(payload?.reason);
    return {
      id: event.id,
      deadLetterId: text(payload?.deadLetterId) || text(event.recipient),
      sourceEventId: text(payload?.sourceEventId),
      email: text(payload?.email),
      mode: payload?.mode === "overdue_only" ? "overdue_only" : "all",
      autoRetryCount: numberValue(payload?.autoRetryCount),
      reason,
      error: text(payload?.error),
      status: event.status === "resolved" || event.status === "acknowledged" ? event.status : "open",
      createdAt: event.created_at,
      severity: reason === "permanent_delivery_error" || reason === "missing_recipient" ? "critical" : "warning",
      title: reason === "permanent_delivery_error"
        ? "Permanent leveransstörning"
        : reason === "missing_recipient"
          ? "Mottagare saknas"
          : "Automatiska återförsök uttömda",
    };
  });

  return noStore({
    items,
    summary: {
      total: items.length,
      open: items.filter((item) => item.status === "open").length,
      acknowledged: items.filter((item) => item.status === "acknowledged").length,
      resolved: items.filter((item) => item.status === "resolved").length,
      critical: items.filter((item) => item.status === "open" && item.severity === "critical").length,
    },
  });
}

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null;
  const id = text(body?.id);
  const action = text(body?.action);
  if (!id || !["acknowledge", "resolve"].includes(action)) {
    return noStore({ error: "Giltigt eskalerings-id och åtgärd krävs" }, { status: 400 });
  }

  const event = await db.integrationEvent.findFirst({
    where: {
      id,
      company_id: auth.user.company_id,
      type: "component_service_dead_letter_escalation",
    },
    select: { id: true, status: true, payload: true },
  });
  if (!event) return noStore({ error: "Eskaleringen hittades inte" }, { status: 404 });
  if (event.status === "resolved") return noStore({ success: true, status: "resolved", changed: false });

  const nextStatus = action === "resolve" ? "resolved" : "acknowledged";
  const payload = record(event.payload) || {};
  const timestamp = new Date().toISOString();

  await db.$transaction([
    db.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: nextStatus,
        payload: toJson({
          ...payload,
          [action === "resolve" ? "resolvedAt" : "acknowledgedAt"]: timestamp,
          [action === "resolve" ? "resolvedBy" : "acknowledgedBy"]: auth.user.id,
        }),
      },
    }),
    db.auditLog.create({
      data: {
        company_id: auth.user.company_id,
        actor_user_id: auth.user.id,
        entity_type: "service_notification_escalation",
        entity_id: event.id,
        action: `component_service_dead_letter_escalation.${nextStatus}`,
        metadata: toJson({ deadLetterId: text(payload.deadLetterId), email: text(payload.email) }),
      },
    }),
  ]);

  return noStore({ success: true, status: nextStatus, changed: true });
}
