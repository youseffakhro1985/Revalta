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

function buildNotification(input: {
  key: string;
  title: string;
  description: string;
  href: string;
  dueAt: Date;
  high: boolean;
  readKeys: Set<string>;
}) {
  if (!input.key || !input.title || !input.description || !input.href.startsWith("/dashboard/")) return null;
  if (Number.isNaN(input.dueAt.getTime())) return null;
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    dueAt: input.dueAt.toISOString(),
    overdue: false,
    high: input.high,
    read: input.readKeys.has(input.key),
    snoozedUntil: null,
    href: input.href,
    kind: "security" as const,
    snoozable: false,
    assignable: false,
    dateLabel: "Händelse",
    openLabel: "Öppna arbetsorder",
  };
}

function safeLegacyNotification(value: unknown, readKeys: Set<string>) {
  const payload = payloadFor(value);
  const key = notificationKeyFrom(value);
  const title = stringValue(payload?.title);
  const description = stringValue(payload?.description);
  const hrefValue = stringValue(payload?.href);
  const dueAtValue = stringValue(payload?.dueAt);
  const occurredAt = dueAtValue ? new Date(dueAtValue) : null;
  if (!key || !occurredAt) return null;
  return buildNotification({
    key,
    title,
    description,
    href: hrefValue,
    dueAt: occurredAt,
    high: payload?.high !== false,
    readKeys,
  });
}

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

async function listNotifications(companyId: string, userId: string, readKeys: Set<string>) {
  const [modern, legacy] = await Promise.all([
    db.workOrderLockNotification.findMany({
      where: { company_id: companyId, recipient_user_id: userId },
      orderBy: { created_at: "desc" },
      take: MAX_NOTIFICATIONS,
    }),
    db.integrationEvent.findMany({
      where: { company_id: companyId, type: "work_order_edit_lock_forced_release", recipient: userId },
      orderBy: { created_at: "desc" },
      select: { payload: true },
      take: MAX_NOTIFICATIONS,
    }),
  ]);

  const byKey = new Map<string, NonNullable<ReturnType<typeof buildNotification>>>();
  for (const event of legacy) {
    const item = safeLegacyNotification(event.payload, readKeys);
    if (item) byKey.set(item.key, item);
  }
  for (const row of modern) {
    const item = buildNotification({
      key: row.notification_key,
      title: row.title,
      description: row.description,
      href: row.href,
      dueAt: row.occurred_at,
      high: row.high,
      readKeys,
    });
    if (item) byKey.set(item.key, item);
  }

  return [...byKey.values()]
    .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime())
    .slice(0, MAX_NOTIFICATIONS);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

  const ux = await getNotificationUxState(user.company_id, user.id, "work_order_lock");
  const notifications = await listNotifications(user.company_id, user.id, ux.read);

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
  const ux = await getNotificationUxState(user.company_id, user.id, "work_order_lock");
  const current = await listNotifications(user.company_id, user.id, ux.read);
  const validKeys = new Set(current.map((item) => item.key));
  const requestedKey = stringValue(body.key);
  const keys: string[] = body.all === true ? Array.from(validKeys) : requestedKey ? [requestedKey] : [];

  if (!keys.length || keys.some((key) => !validKeys.has(key))) {
    return noStore({ error: "Ogiltig eller obehörig avisering" }, { status: 400 });
  }

  const missing = Array.from(new Set(keys)).filter((key) => !ux.read.has(key));
  if (missing.length) await markNotificationsRead(user.company_id, user.id, "work_order_lock", missing);

  return noStore({ success: true, marked: missing.length });
}
