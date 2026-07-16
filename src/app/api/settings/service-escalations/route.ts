import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type AssignmentPayload = {
  notificationKey?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  status?: string;
  deadline?: string | null;
  note?: string | null;
};

type AssetRow = {
  id: string;
  property_id: string;
  component_name: string;
  property_name: string;
  next_service_at: Date;
};

function payloadFor(value: Prisma.JsonValue | null): AssignmentPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AssignmentPayload;
}

function keyFor(row: AssetRow) {
  return `component-service:${row.id}:${row.next_service_at.toISOString().slice(0, 10)}`;
}

function canManage(role: string) {
  return role === "owner" || role === "admin";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const now = new Date();
  const dueBefore = new Date(now.getTime() + 30 * 86400000);
  const [assets, assignmentEvents, escalationEvents, recipients] = await Promise.all([
    db.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT a."id", a."property_id", a."name" AS "component_name", a."next_service_at", p."name" AS "property_name"
      FROM "PropertyTechnicalAsset" a
      INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
      WHERE a."company_id" = ${user.company_id}
        AND a."next_service_at" IS NOT NULL
        AND a."next_service_at" <= ${dueBefore}
        AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
      ORDER BY a."next_service_at" ASC
      LIMIT 1000
    `),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "service_notification_assignment" },
      orderBy: { created_at: "desc" },
      take: 3000,
      select: { payload: true, created_at: true },
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "service_assignment_escalation" },
      orderBy: { created_at: "desc" },
      take: 100,
    }),
    db.user.findMany({
      where: { company_id: user.company_id, status: "active", role: { in: ["owner", "admin"] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    }),
  ]);

  const assetsByKey = new Map(assets.map((asset) => [keyFor(asset), asset]));
  const latest = new Map<string, AssignmentPayload & { updatedAt: string }>();
  for (const event of assignmentEvents) {
    const payload = payloadFor(event.payload);
    const key = payload?.notificationKey;
    if (!key || latest.has(key)) continue;
    latest.set(key, { ...payload, updatedAt: event.created_at.toISOString() });
  }

  const assignments = Array.from(latest.entries()).flatMap(([key, assignment]) => {
    const asset = assetsByKey.get(key);
    if (!asset || assignment.status === "completed") return [];
    const deadline = assignment.deadline ? new Date(assignment.deadline) : null;
    const deadlinePassed = Boolean(deadline && !Number.isNaN(deadline.getTime()) && deadline < now);
    const reason = assignment.status === "blocked" ? "blocked" : deadlinePassed ? "overdue_deadline" : null;
    if (!reason) return [];
    return [{
      notificationKey: key,
      componentName: asset.component_name,
      propertyName: asset.property_name,
      href: `/dashboard/fastigheter/${asset.property_id}/komponenter/${asset.id}`,
      assigneeName: assignment.assigneeName || null,
      status: assignment.status || "assigned",
      deadline: assignment.deadline || null,
      note: assignment.note || null,
      reason,
      updatedAt: assignment.updatedAt,
    }];
  });

  const statusCounts = escalationEvents.reduce<Record<string, number>>((result, event) => {
    result[event.status] = (result[event.status] || 0) + 1;
    return result;
  }, {});

  return NextResponse.json({
    canManage: canManage(user.role),
    configuration: {
      cronSecret: Boolean(process.env.CRON_SECRET),
      emailApiKey: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
      emailFrom: Boolean(process.env.EMAIL_FROM),
    },
    summary: {
      active: assignments.length,
      blocked: assignments.filter((item) => item.reason === "blocked").length,
      overdue: assignments.filter((item) => item.reason === "overdue_deadline").length,
      failed: statusCounts.failed || 0,
      sent: statusCounts.sent || 0,
    },
    assignments,
    recipients,
    events: escalationEvents,
    statusCounts,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
