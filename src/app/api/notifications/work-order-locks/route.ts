import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const MAX_NOTIFICATIONS = 200;
const MAX_READ_MARKERS = 1000;

type Payload = {
  notificationKey?: unknown;
  title?: unknown;
  description?: unknown;
  dueAt?: unknown;
  href?: unknown;
  high?: unknown;
};

function payloadFor(value: unknown): Payload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function notificationKeyFrom(value: unknown) {
  const key = stringValue(payloadFor(value)?.notificationKey);
  return key && key.length <= 300 ? key : null;
}

function safeNotification(value: unknown, readKeys: Set<string>) {
  const payload = payloadFor(value);
  const key = notificationKeyFrom(value);
  const title = stringValue(payload?.title);
  const description = stringValue(payload?.description);
  const hrefValue = stringValue(payload?.href);
  const href = hrefValue.startsWith("/dashboard/") ? hrefValue : "";
  const dueAtValue = stringValue(payload?.dueAt);
  const occurredAt = dueAtValue ? new Date(dueAtValue) : null;

  if (!key || !title || !description || !href || !occurredAt || Number.isNaN(occurredAt.getTime())) return null;

  return {
    key,
    title,
    description,
    dueAt: occurredAt.toISOString(),
    overdue: false,
    high: payload?.high !== false,
    read: readKeys.has(key),
    snoozedUntil: null,
    href,
    kind: "security" as const,
    snoozable: false,
    assignable: false,
    dateLabel: "Händelse",
    openLabel: "Öppna arbetsorder",
  };
}

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

  const [events, reads] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "work_order_edit_lock_forced_release", recipient: user.id },
      orderBy: { created_at: "desc" },
      select: { payload: true },
      take: MAX_NOTIFICATIONS,
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "work_order_lock_notification_read", recipient: user.id, status: "read" },
      orderBy: { created_at: "desc" },
      select: { payload: true },
      take: MAX_READ_MARKERS,
    }),
  ]);

  const readKeys = new Set(
    reads.map((event) => notificationKeyFrom(event.payload)).filter((value): value is string => value !== null),
  );
  const notifications = events
    .map((event) => safeNotification(event.payload, readKeys))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return noStore({
    notifications,
    summary: {
      total: notifications.length,
      unread: notifications.filter((item) => !item.read).length,
      high: notifications.filter((item) => item.high).length,
    },
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { key?: unknown; all?: unknown };
  const events = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: "work_order_edit_lock_forced_release", recipient: user.id },
    orderBy: { created_at: "desc" },
    select: { payload: true },
    take: MAX_NOTIFICATIONS,
  });
  const validKeys = new Set(
    events.map((event) => notificationKeyFrom(event.payload)).filter((value): value is string => value !== null),
  );
  const requestedKey = stringValue(body.key);
  const keys: string[] = body.all === true ? Array.from(validKeys) : requestedKey ? [requestedKey] : [];

  if (!keys.length || keys.some((key) => !validKeys.has(key))) {
    return noStore({ error: "Ogiltig eller obehörig avisering" }, { status: 400 });
  }

  const existing = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: "work_order_lock_notification_read", recipient: user.id, status: "read" },
    orderBy: { created_at: "desc" },
    select: { payload: true },
    take: MAX_READ_MARKERS,
  });
  const existingKeys = new Set(
    existing.map((event) => notificationKeyFrom(event.payload)).filter((value): value is string => value !== null),
  );
  const missing = Array.from(new Set(keys)).filter((key) => !existingKeys.has(key));

  if (missing.length) {
    await db.integrationEvent.createMany({
      data: missing.map((key) => ({
        company_id: user.company_id,
        type: "work_order_lock_notification_read",
        status: "read",
        recipient: user.id,
        payload: { notificationKey: key },
      })),
    });
  }

  return noStore({ success: true, marked: missing.length });
}
