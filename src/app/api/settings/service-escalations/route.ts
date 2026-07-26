import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getServiceEscalationRules } from "@/lib/service-escalation-rules";
import { listServiceNotificationAssignments } from "@/lib/service-notification-assignments";

export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  property_id: string;
  component_name: string;
  property_name: string;
  next_service_at: Date;
};

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
  const { rules, updatedAt: rulesUpdatedAt } = await getServiceEscalationRules(user.company_id);

  const [assets, assignmentRows, escalationEvents, recipients] = await Promise.all([
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
    listServiceNotificationAssignments(user.company_id),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "service_assignment_escalation" },
      orderBy: { created_at: "desc" },
      take: 100,
    }),
    db.user.findMany({
      where: {
        company_id: user.company_id,
        status: "active",
        role: { in: rules.recipientRoles },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    }),
  ]);

  const assetsByKey = new Map(assets.map((asset) => [keyFor(asset), asset]));
  const latest = new Map<string, {
    notificationKey: string;
    assigneeId: string | null;
    assigneeName: string | null;
    status: string;
    deadline: string | null;
    note: string | null;
    updatedAt: string;
  }>();
  for (const row of assignmentRows) {
    if (latest.has(row.notificationKey)) continue;
    latest.set(row.notificationKey, {
      notificationKey: row.notificationKey,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      status: row.status,
      deadline: row.deadline,
      note: row.note,
      updatedAt: row.updatedAt,
    });
  }

  const graceMs = rules.graceDays * 86400000;
  const assignments = rules.enabled
    ? Array.from(latest.entries()).flatMap(([key, assignment]) => {
        const asset = assetsByKey.get(key);
        if (!asset || assignment.status === "completed") return [];

        const deadline = assignment.deadline ? new Date(assignment.deadline) : null;
        const deadlinePassed = Boolean(
          deadline &&
          !Number.isNaN(deadline.getTime()) &&
          deadline.getTime() + graceMs < now.getTime(),
        );

        const reason = assignment.status === "blocked" && rules.escalateBlocked
          ? "blocked"
          : deadlinePassed && rules.escalateOverdue
            ? "overdue_deadline"
            : null;

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
      })
    : [];

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
    rules,
    rulesUpdatedAt,
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
