import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { getWorkOrderEnterpriseState } from "@/lib/work-order-enterprise-core";
import { evaluateWorkOrderSla } from "@/lib/work-order-sla";

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function resolveSla(id: string, companyId: string) {
  const [workOrder, enterprise] = await Promise.all([
    db.workOrder.findFirst({
      where: { deleted_at: null, id, company_id: companyId, property: { deleted_at: null } },
      select: {
        id: true,
        status: true,
        priority: true,
        created_at: true,
        completed_at: true,
      },
    }),
    getWorkOrderEnterpriseState(db, companyId, id),
  ]);

  if (!workOrder) return null;
  const evaluatedAt = new Date();
  const sla = evaluateWorkOrderSla({
    status: workOrder.status,
    responseDueAt: enterprise?.sla_response_due_at,
    resolutionDueAt: enterprise?.sla_resolution_due_at,
    respondedAt: enterprise?.responded_at,
    completedAt: workOrder.completed_at,
    closedAt: enterprise?.closed_at,
    pausedAt: enterprise?.paused_at,
    pauseReason: enterprise?.pause_reason,
  }, evaluatedAt);

  return { workOrder, enterprise, sla, evaluatedAt };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const result = await resolveSla(id, user.company_id);
  if (!result) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const auditHistory = await db.auditLog.findMany({
    where: {
      company_id: user.company_id,
      entity_type: "work_order",
      entity_id: id,
      action: "work_order.sla_deadlines_updated",
    },
    orderBy: { created_at: "desc" },
    take: 25,
    select: {
      id: true,
      created_at: true,
      metadata: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(
    {
      sla: result.sla,
      evaluatedAt: result.evaluatedAt.toISOString(),
      priority: result.workOrder.priority,
      createdAt: result.workOrder.created_at,
      canManage: canManageTickets(user.role),
      governance: {
        responseLocked: Boolean(result.enterprise?.responded_at),
        resolutionLocked: Boolean(result.workOrder.completed_at || result.enterprise?.closed_at),
      },
      auditHistory: auditHistory.map((entry) => ({
        id: entry.id,
        createdAt: entry.created_at.toISOString(),
        actor: {
          id: entry.actor?.id ?? null,
          name: entry.actor?.name || entry.actor?.email || "Okänd användare",
        },
        metadata: entry.metadata,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet att ändra SLA" }, { status: 403 });

  const { id } = await params;
  const current = await resolveSla(id, user.company_id);
  if (!current) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
  }

  const reason = String(body.reason || "").trim();
  if (reason.length < 10) return NextResponse.json({ error: "Ange en tydlig motivering på minst 10 tecken" }, { status: 400 });
  if (reason.length > 1000) return NextResponse.json({ error: "Motiveringen får vara högst 1 000 tecken" }, { status: 400 });

  const responseDueAt = optionalDate(body.responseDueAt);
  const resolutionDueAt = optionalDate(body.resolutionDueAt);
  if (responseDueAt === undefined || resolutionDueAt === undefined) {
    return NextResponse.json({ error: "Ett SLA-datum är ogiltigt" }, { status: 400 });
  }
  if (responseDueAt && resolutionDueAt && resolutionDueAt <= responseDueAt) {
    return NextResponse.json({ error: "Lösningstiden måste ligga efter svarstiden" }, { status: 400 });
  }
  if (current.enterprise?.responded_at && responseDueAt?.getTime() !== current.enterprise.sla_response_due_at?.getTime()) {
    return NextResponse.json({ error: "Svarstiden är låst eftersom respons redan har registrerats" }, { status: 409 });
  }
  if ((current.workOrder.completed_at || current.enterprise?.closed_at) && resolutionDueAt?.getTime() !== current.enterprise?.sla_resolution_due_at?.getTime()) {
    return NextResponse.json({ error: "Lösningstiden är låst eftersom arbetsordern är avslutad" }, { status: 409 });
  }

  const before = {
    responseDueAt: current.enterprise?.sla_response_due_at?.toISOString() ?? null,
    resolutionDueAt: current.enterprise?.sla_resolution_due_at?.toISOString() ?? null,
  };
  const after = {
    responseDueAt: responseDueAt?.toISOString() ?? null,
    resolutionDueAt: resolutionDueAt?.toISOString() ?? null,
  };
  if (before.responseDueAt === after.responseDueAt && before.resolutionDueAt === after.resolutionDueAt) {
    return NextResponse.json({ error: "Ingen deadline har ändrats" }, { status: 400 });
  }

  await db.$executeRaw(Prisma.sql`
    UPDATE "WorkOrder"
    SET "sla_response_due_at" = ${responseDueAt},
        "sla_resolution_due_at" = ${resolutionDueAt},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "company_id" = ${user.company_id}
  `);

  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: "work_order.sla_deadlines_updated",
    metadata: { before, after, reason },
  });

  const updated = await resolveSla(id, user.company_id);
  return NextResponse.json(
    {
      success: true,
      sla: updated?.sla,
      evaluatedAt: updated?.evaluatedAt.toISOString(),
      governance: {
        responseLocked: Boolean(updated?.enterprise?.responded_at),
        resolutionLocked: Boolean(updated?.workOrder.completed_at || updated?.enterprise?.closed_at),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
