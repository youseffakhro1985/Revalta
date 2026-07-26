import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getNotificationUxState, markNotificationsRead } from "@/lib/notification-ux-state";

export const dynamic = "force-dynamic";

const MAX_NOTIFICATIONS = 200;

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

  const [events, ux] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "work_order_edit_lock_forced_release", recipient: user.id },
      orderBy: { created_at: "desc" },
      select: { payload: true },
      take: MAX_NOTIFICATIONS,
    }),
    getNotificationUxState(user.company_id, user.id, "work_order_lock"),
  ]);

  const notifications = events
    .map((event) => safeNotification(event.payload, ux.read))
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

  const ux = await getNotificationUxState(user.company_id, user.id, "work_order_lock");
  const missing = Array.from(new Set(keys)).filter((key) => !ux.read.has(key));
  if (missing.length) await markNotificationsRead(user.company_id, user.id, "work_order_lock", missing);

  return noStore({ success: true, marked: missing.length });
}
