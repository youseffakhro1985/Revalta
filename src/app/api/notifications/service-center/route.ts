import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type Row = { asset_id: string; property_id: string; component_name: string; criticality: string | null; next_service_at: Date; property_name: string; property_address: string; property_city: string };
type Payload = { notificationKey?: string };

function keyFor(row: Row) { return `component-service:${row.asset_id}:${row.next_service_at.toISOString().slice(0, 10)}`; }
function readKey(payload: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const key = (payload as Payload).notificationKey;
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
  const [rows, reads] = await Promise.all([
    rowsFor(user.company_id),
    db.integrationEvent.findMany({ where: { company_id: user.company_id, type: "service_notification_read", recipient: user.id, status: "read" }, select: { payload: true }, take: 1000 }),
  ]);
  const read = new Set(reads.map((item) => readKey(item.payload)).filter((value): value is string => Boolean(value)));
  const now = new Date();
  const all = rows.map((row) => {
    const key = keyFor(row); const overdue = row.next_service_at < now;
    const high = overdue || row.criticality === "critical" || row.criticality === "high";
    return {
      key,
      title: overdue ? `Förfallen service: ${row.component_name}` : `Kommande service: ${row.component_name}`,
      description: `${row.property_name} · ${row.property_address}, ${row.property_city}`,
      dueAt: row.next_service_at.toISOString(), overdue, high, read: read.has(key),
      href: `/dashboard/fastigheter/${row.property_id}/komponenter/${row.asset_id}`,
    };
  });
  const notifications = all.filter((item) => filter === "unread" ? !item.read : filter === "overdue" ? item.overdue : filter === "high" ? item.high : true);
  return NextResponse.json({ notifications, summary: { total: all.length, unread: all.filter((i) => !i.read).length, overdue: all.filter((i) => i.overdue).length, high: all.filter((i) => i.high).length } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { key?: unknown; all?: unknown };
  const keys = body.all === true ? (await rowsFor(user.company_id)).map(keyFor) : [typeof body.key === "string" ? body.key.trim() : ""].filter(Boolean);
  if (!keys.length || keys.some((key) => key.length > 300)) return NextResponse.json({ error: "Ogiltig avisering" }, { status: 400 });
  const existing = await db.integrationEvent.findMany({ where: { company_id: user.company_id, type: "service_notification_read", recipient: user.id, status: "read" }, select: { payload: true } });
  const existingKeys = new Set(existing.map((item) => readKey(item.payload)).filter((value): value is string => Boolean(value)));
  const missing = Array.from(new Set(keys)).filter((key) => !existingKeys.has(key));
  if (missing.length) await db.integrationEvent.createMany({ data: missing.map((notificationKey) => ({ company_id: user.company_id, type: "service_notification_read", status: "read", recipient: user.id, payload: { notificationKey } })) });
  return NextResponse.json({ success: true, marked: missing.length });
}
