import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import {
  listServiceNotificationAssignments,
  upsertServiceNotificationAssignment,
} from "@/lib/service-notification-assignments";

export const dynamic = "force-dynamic";

type AssetRow = { id: string; next_service_at: Date };

const allowedStatuses = ["assigned", "in_progress", "completed", "blocked"];

function keyFor(row: AssetRow) {
  return `component-service:${row.id}:${row.next_service_at.toISOString().slice(0, 10)}`;
}

async function validNotificationKeys(companyId: string) {
  const dueBefore = new Date(Date.now() + 30 * 86400000);
  const rows = await db.$queryRaw<AssetRow[]>(Prisma.sql`
    SELECT a."id", a."next_service_at"
    FROM "PropertyTechnicalAsset" a
    INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
    WHERE p."deleted_at" IS NULL
      AND a."company_id" = ${companyId}
      AND a."next_service_at" IS NOT NULL
      AND a."next_service_at" <= ${dueBefore}
      AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
    LIMIT 500
  `);
  return new Set(rows.map(keyFor));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const [users, rows] = await Promise.all([
    db.user.findMany({
      where: { company_id: user.company_id, status: "active" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    listServiceNotificationAssignments(user.company_id),
  ]);

  const assignments: Record<string, {
    notificationKey: string;
    assigneeId: string | null;
    assigneeName: string | null;
    status: string;
    deadline: string | null;
    note: string | null;
    updatedAt: string;
  }> = {};
  for (const row of rows) {
    assignments[row.notificationKey] = {
      notificationKey: row.notificationKey,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      status: row.status,
      deadline: row.deadline,
      note: row.note,
      updatedAt: row.updatedAt,
    };
  }

  return NextResponse.json({ users, assignments }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as {
    notificationKey?: unknown;
    assigneeId?: unknown;
    status?: unknown;
    deadline?: unknown;
    note?: unknown;
  };

  const notificationKey = typeof body.notificationKey === "string" ? body.notificationKey.trim() : "";
  const assigneeId = typeof body.assigneeId === "string" && body.assigneeId.trim() ? body.assigneeId.trim() : null;
  const status = typeof body.status === "string" && allowedStatuses.includes(body.status) ? body.status : "assigned";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const deadline = typeof body.deadline === "string" && body.deadline ? new Date(body.deadline) : null;

  const validKeys = await validNotificationKeys(user.company_id);
  if (!notificationKey || notificationKey.length > 300 || !validKeys.has(notificationKey)) {
    return NextResponse.json({ error: "Ogiltig eller obehörig avisering" }, { status: 400 });
  }
  if (deadline && (Number.isNaN(deadline.getTime()) || deadline < new Date(Date.now() - 86400000) || deadline > new Date(Date.now() + 365 * 86400000))) {
    return NextResponse.json({ error: "Deadline måste ligga inom det kommande året" }, { status: 400 });
  }

  let assignee: { id: string; name: string | null; email: string } | null = null;
  if (assigneeId) {
    assignee = await db.user.findFirst({
      where: { id: assigneeId, company_id: user.company_id, status: "active" },
      select: { id: true, name: true, email: true },
    });
    if (!assignee) return NextResponse.json({ error: "Den ansvariga användaren hittades inte" }, { status: 400 });
  }

  const assetId = notificationKey.startsWith("component-service:")
    ? notificationKey.split(":")[1] || null
    : null;

  const assignment = await upsertServiceNotificationAssignment({
    companyId: user.company_id,
    notificationKey,
    assetId,
    assigneeId: assignee?.id || null,
    assigneeName: assignee?.name || assignee?.email || null,
    status,
    deadline,
    note: note || null,
    changedById: user.id,
  });

  return NextResponse.json({
    success: true,
    assignment: {
      notificationKey: assignment.notificationKey,
      assigneeId: assignment.assigneeId,
      assigneeName: assignment.assigneeName,
      status: assignment.status,
      deadline: assignment.deadline,
      note: assignment.note,
      updatedAt: assignment.updatedAt,
    },
  }, { status: 201 });
}
