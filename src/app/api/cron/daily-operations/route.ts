import { NextResponse } from "next/server";
import { GET as componentServiceReminders } from "../component-service-reminders/route";
import { GET as componentServiceDeadLetter } from "../component-service-dead-letter/route";
import { GET as componentServiceDeadLetterRetry } from "../component-service-dead-letter-retry/route";
import { GET as componentServiceSloMonitor } from "../component-service-slo-monitor/route";
import { GET as preventiveMaintenance } from "../preventive-maintenance/route";
import { GET as serviceAssignmentEscalations } from "../service-assignment-escalations/route";
import { GET as invoiceExportJobs } from "../invoice-export-jobs/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Handler = (request: Request) => Promise<Response>;

const jobs: Array<{ name: string; handler: Handler }> = [
  { name: "component-service-reminders", handler: componentServiceReminders },
  { name: "component-service-dead-letter", handler: componentServiceDeadLetter },
  { name: "component-service-dead-letter-retry", handler: componentServiceDeadLetterRetry },
  { name: "component-service-slo-monitor", handler: componentServiceSloMonitor },
  { name: "preventive-maintenance", handler: preventiveMaintenance },
  { name: "service-assignment-escalations", handler: serviceAssignmentEscalations },
  { name: "invoice-export-jobs", handler: invoiceExportJobs },
];

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return noStore({ error: "Obehörig" }, { status: 401 });

  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const startedAt = Date.now();
    try {
      const response = await job.handler(request);
      const body = await response.json().catch(() => null);
      results.push({ name: job.name, ok: response.ok, status: response.status, durationMs: Date.now() - startedAt, body });
    } catch (error) {
      results.push({
        name: job.name,
        ok: false,
        status: 500,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Okänt driftfel",
      });
    }
  }

  const failed = results.filter((result) => result.ok !== true).length;
  return noStore({ total: results.length, succeeded: results.length - failed, failed, healthy: failed === 0, results }, {
    status: failed === results.length ? 500 : 200,
  });
}
