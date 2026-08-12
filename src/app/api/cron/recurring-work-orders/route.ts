import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAssignWorkOrders, getCurrentUser } from "@/lib/current-user";
import { isCronRequestAuthorized } from "@/lib/request-security";
import {
  createRecurringRun,
  runRecurringWorkOrderEngine,
  updateRecurringRun,
} from "@/lib/recurring-work-order-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function execute(companyId?: string) {
  const run = await createRecurringRun({
    companyId: companyId ?? null,
    status: "processing",
    recipient: companyId ? `company:${companyId}` : "all-companies",
    payload: { companyId: companyId ?? null, startedAt: new Date().toISOString() },
  });

  try {
    const result = await runRecurringWorkOrderEngine({ companyId });
    await updateRecurringRun(run.id, {
      status: result.failed > 0 ? "partial" : "sent",
      payload: { ...result, companyId: companyId ?? null, completedAt: new Date().toISOString() },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    await updateRecurringRun(run.id, {
      status: "failed",
      payload: { companyId: companyId ?? null, error: message, completedAt: new Date().toISOString() },
    });
    throw error;
  }
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const result = await execute();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canAssignWorkOrders(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const result = await execute(user.company_id);
  await writeAuditLog(user, {
    entityType: "recurring_work_order",
    entityId: user.company_id,
    action: "recurring_work_orders.manual_run",
    metadata: result,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
