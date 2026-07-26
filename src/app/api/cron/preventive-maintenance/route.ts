import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { runPreventiveMaintenanceEngine } from "@/lib/preventive-maintenance-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_TYPE = "preventive_maintenance_run";

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function execute(companyId?: string) {
  const run = await db.cronJobRun.create({
    data: {
      company_id: companyId ?? null,
      job_type: JOB_TYPE,
      status: "processing",
      recipient: companyId ? `company:${companyId}` : "all-companies",
      payload: { companyId: companyId ?? null, startedAt: new Date().toISOString() },
    },
  });

  try {
    const result = await runPreventiveMaintenanceEngine({ companyId });
    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: result.failed > 0 ? "partial" : "sent",
        payload: { ...result, companyId: companyId ?? null, completedAt: new Date().toISOString() },
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        payload: { companyId: companyId ?? null, error: message, completedAt: new Date().toISOString() },
      },
    });
    throw error;
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const result = await execute();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const result = await execute(user.company_id);
  await writeAuditLog(user, {
    entityType: "preventive_maintenance",
    entityId: user.company_id,
    action: "preventive_maintenance.manual_run",
    metadata: { ...result, storage: "CronJobRun" },
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
