import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getWorkOrderEnterpriseState } from "@/lib/work-order-enterprise-core";
import { evaluateWorkOrderSla } from "@/lib/work-order-sla";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const [workOrder, enterprise] = await Promise.all([
    db.workOrder.findFirst({
      where: { id, company_id: user.company_id },
      select: {
        id: true,
        status: true,
        priority: true,
        created_at: true,
        completed_at: true,
      },
    }),
    getWorkOrderEnterpriseState(db, user.company_id, id),
  ]);

  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

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

  return NextResponse.json(
    {
      sla,
      evaluatedAt: evaluatedAt.toISOString(),
      priority: workOrder.priority,
      createdAt: workOrder.created_at,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
