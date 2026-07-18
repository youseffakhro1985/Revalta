import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type Payload = {
  notificationKey?: string;
  title?: string;
  description?: string;
  dueAt?: string;
  href?: string;
  high?: boolean;
};

function payloadFor(value: Prisma.JsonValue | null): Payload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Payload;
}

function safeNotification(value: Prisma.JsonValue | null, readKeys: Set<string>) {
  const payload = payloadFor(value);
  const key = typeof payload?.notificationKey === "string" ? payload.notificationKey.trim() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";
  const href = typeof payload?.href === "string" && payload.href.startsWith("/dashboard/") ? payload.href : "";
  const occurredAt = typeof payload?.dueAt === "string" ? new Date(payload.dueAt) : null;
  if (!key || key.length > 300 || !title || !description || !href || !occurredAt || Number.isNaN(occurredAt.getTime())) return null;
  return {
    key,
    title,
    description,
    dueAt: occurredAt.toISOString(),
    overdue: false,
    high: payload.high !== false,
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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const [events, reads] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "work_order_edit_lock_forced_release", recipient: user.id },
      orderBy: { created_at: "desc" },
      select: { payload: true },
      take: 200,
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "work_order_lock_notification_read", recipient: user.id, status: "read" },
      select: { payload: true },
      take: 1000,
    }),
  ]);

  const readKeys = new Set(reads.map((event) => payloadFor(event.payload)?.notificationKey).filter((value): value is string => typeof value === "string"));
  const notifications = events.map((event) => safeNotification(event.payload, readKeys)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return NextResponse.json({
    notifications,
    summary: {
      total: notifications.length,
      unread: notifications.filter((item) => !item.read).length,
      high: notifications.filter((item) => item.high).length,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { key?: unknown; all?: unknown };
  const events = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: "work_order_edit_lock_forced_release", recipient: user.id },
    select: { payload: true },
    take: 200,
  });
  const validKeys = new Set(events.map((event) => payloadFor(event.payload)?.notificationKey).filter((value): value is string => typeof value === "string"));
  const keys = body.all === true ? Array.from(validKeys) : [typeof body.key === "string" ? body.key.trim() : ""].filter(Boolean);
  if (!keys.length || keys.some((key) => key.length > 300 || !validKeys.has(key))) {
    return NextResponse.json({ error: "Ogiltig eller obehörig avisering" }, { status: 400 });
  }

  const existing = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: "work_order_lock_notification_read", recipient: user.id, status: "read" },
    select: { payload: true },
  });
  const existingKeys = new Set(existing.map((event) => payloadFor(event.payload)?.notificationKey).filter((value): value is string => typeof value === "string"));
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
  return NextResponse.json({ success: true, marked: missing.length });
}
