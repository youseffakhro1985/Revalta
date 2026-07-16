import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type Row = {
  asset_id: string;
  property_id: string;
  component_name: string;
  criticality: string | null;
  next_service_at: Date;
  property_name: string;
  property_address: string;
  property_city: string;
};

type NotificationPayload = {
  notificationKey?: string;
  snoozedUntil?: string;
};

function keyFor(row: Row) {
  return `component-service:${row.asset_id}:${row.next_service_at.toISOString().slice(0, 10)}`;
}

function payloadFor(value: Prisma.JsonValue | null): NotificationPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as NotificationPayload;
}

function notificationKey(value: Prisma.JsonValue | null) {
  const key = payloadFor(value)?.notificationKey;
  return typeof key === "string" ? key : null;
}

async function rowsFor(companyId: string) {
  const dueBefore = new Date(Date.now() + 30 * 86400000);
  return db.$queryRaw<Row[]>(Prisma.sql`
    SELECT a."id" AS "asset_id", a."property_id", a."name" AS "component_name", a."criticality", a."next_service_at",
      p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city"
    FROM "PropertyTechnicalAsset" a
    INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
    WHERE a."company_id" = ${companyId}
      AND a."next_service_at" IS NOT NULL
      AND a."next_service_at" <= ${dueBefore}
      AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
    ORDER BY a."next_service_at" ASC, a."criticality" DESC
    LIMIT 200
  `);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const filter = new URL(request.url).searchParams.get("filter") || "all";
  const [rows, reads, snoozeEvents] = await Promise.all([
    rowsFor(user.company_id),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "service_notification_read", recipient: user.id, status: "read" },
      select: { payload: true },
      take: 1000,
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "service_notification_snooze", recipient: user.id },
      orderBy: { created_at: "desc" },
      select: { status: true, payload: true },
      take: 2000,
    }),
  ]);

  const read = new Set(reads.map((item) => notificationKey(item.payload)).filter((value): value is string => Boolean(value)));
  const latestSnooze = new Map<string, { status: string; until: Date | null }>();
  for (const event of snoozeEvents) {
    const payload = payloadFor(event.payload);
    const key = payload?.notificationKey;
    if (!key || latestSnooze.has(key)) continue;
    const parsed = payload.snoozedUntil ? new Date(payload.snoozedUntil) : null;
    latestSnooze.set(key, { status: event.status, until: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null });
  }

  const now = new Date();
  const all = rows.map((row) => {
    const key = keyFor(row);
    const overdue = row.next_service_at < now;
    const high = overdue || row.criticality === "critical" || row.criticality === "high";
    const snooze = latestSnooze.get(key);
    const snoozedUntil = snooze?.status === "active" && snooze.until && snooze.until > now ? snooze.until : null;
    return {
      key,
      title: overdue ? `Förfallen service: ${row.component_name}` : `Kommande service: ${row.component_name}`,
      description: `${row.property_name} · ${row.property_address}, ${row.property_city}`,
      dueAt: row.next_service_at.toISOString(),
      overdue,
      high,
      read: read.has(key),
      snoozedUntil: snoozedUntil?.toISOString() || null,
      href: `/dashboard/fastigheter/${row.property_id}/komponenter/${row.asset_id}`,
    };
  });

  const active = all.filter((item) => !item.snoozedUntil);
  const notifications = all.filter((item) => {
    if (filter === "snoozed") return Boolean(item.snoozedUntil);
    if (item.snoozedUntil) return false;
    if (filter === "unread") return !item.read;
    if (filter === "overdue") return item.overdue;
    if (filter === "high") return item.high;
    return true;
  });

  return NextResponse.json({
    notifications,
    summary: {
      total: active.length,
      unread: active.filter((item) => !item.read).length,
      overdue: active.filter((item) => item.overdue).length,
      high: active.filter((item) => item.high).length,
      snoozed: all.filter((item) => item.snoozedUntil).length,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as {
    key?: unknown;
    all?: unknown;
    action?: unknown;
    snoozedUntil?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "read";
  const rows = await rowsFor(user.company_id);
  const validKeys = new Set(rows.map(keyFor));
  const keys = body.all === true ? Array.from(validKeys) : [typeof body.key === "string" ? body.key.trim() : ""].filter(Boolean);

  if (!keys.length || keys.some((key) => key.length > 300 || !validKeys.has(key))) {
    return NextResponse.json({ error: "Ogiltig eller obehörig avisering" }, { status: 400 });
  }

  if (action === "snooze") {
    const until = typeof body.snoozedUntil === "string" ? new Date(body.snoozedUntil) : null;
    const max = new Date(Date.now() + 90 * 86400000);
    if (!until || Number.isNaN(until.getTime()) || until <= new Date() || until > max) {
      return NextResponse.json({ error: "Snooze-datum måste vara inom de kommande 90 dagarna" }, { status: 400 });
    }
    await db.integrationEvent.createMany({
      data: keys.map((key) => ({
        company_id: user.company_id,
        type: "service_notification_snooze",
        status: "active",
        recipient: user.id,
        payload: { notificationKey: key, snoozedUntil: until.toISOString(), changedBy: user.id },
      })),
    });
    return NextResponse.json({ success: true, snoozed: keys.length, snoozedUntil: until.toISOString() });
  }

  if (action === "unsnooze") {
    await db.integrationEvent.createMany({
      data: keys.map((key) => ({
        company_id: user.company_id,
        type: "service_notification_snooze",
        status: "cleared",
        recipient: user.id,
        payload: { notificationKey: key, changedBy: user.id },
      })),
    });
    return NextResponse.json({ success: true, reactivated: keys.length });
  }

  if (action !== "read") return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });

  const existing = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: "service_notification_read", recipient: user.id, status: "read" },
    select: { payload: true },
  });
  const existingKeys = new Set(existing.map((item) => notificationKey(item.payload)).filter((value): value is string => Boolean(value)));
  const missing = Array.from(new Set(keys)).filter((key) => !existingKeys.has(key));
  if (missing.length) {
    await db.integrationEvent.createMany({
      data: missing.map((key) => ({
        company_id: user.company_id,
        type: "service_notification_read",
        status: "read",
        recipient: user.id,
        payload: { notificationKey: key },
      })),
    });
  }
  return NextResponse.json({ success: true, marked: missing.length });
}
