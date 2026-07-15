import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { sendAccountingInvoice, type AccountingInvoicePayload, type AccountingProvider } from "@/lib/accounting-sync";

function authorized(request: Request) {
  const secret = process.env.ACCOUNTING_SYNC_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}` || request.headers.get("x-accounting-sync-secret") === secret;
}

function retryDelayMinutes(attemptNumber: number) {
  return Math.min(60 * 12, Math.max(2, 2 ** attemptNumber));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Obehörig intern körning" }, { status: 401 });
  const workerId = `worker-${randomUUID()}`;
  const limit = Math.min(20, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 5)));
  const processed: Array<Record<string, unknown>> = [];

  for (let index = 0; index < limit; index += 1) {
    const claimed = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH candidate AS (
        SELECT "id" FROM "AccountingSyncJob"
        WHERE "status" IN ('queued', 'retrying')
          AND "next_attempt_at" <= CURRENT_TIMESTAMP
          AND ("locked_at" IS NULL OR "locked_at" < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
          AND "attempt_count" < "max_attempts"
        ORDER BY "next_attempt_at", "created_at"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "AccountingSyncJob" j
      SET "status" = 'processing', "locked_at" = CURRENT_TIMESTAMP, "locked_by" = ${workerId},
          "attempt_count" = j."attempt_count" + 1, "updated_at" = CURRENT_TIMESTAMP
      FROM candidate
      WHERE j."id" = candidate."id"
      RETURNING j.*
    `);
    const job = claimed[0];
    if (!job) break;
    const attemptNumber = Number(job.attempt_count);
    const attemptId = randomUUID();
    const started = Date.now();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "AccountingSyncAttempt" ("id", "company_id", "sync_job_id", "attempt_number", "status", "request_snapshot")
      VALUES (${attemptId}, ${String(job.company_id)}, ${String(job.id)}, ${attemptNumber}, 'started', ${JSON.stringify(job.payload_snapshot)}::jsonb)
    `);

    const result = await sendAccountingInvoice(String(job.provider) as AccountingProvider, job.payload_snapshot as AccountingInvoicePayload);
    const durationMs = Date.now() - started;
    if (result.ok) {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "AccountingSyncAttempt" SET "status" = 'completed', "response_snapshot" = ${JSON.stringify(result.response || {})}::jsonb,
            "duration_ms" = ${durationMs} WHERE "id" = ${attemptId}
        `);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "AccountingSyncJob" SET "status" = 'completed', "external_reference" = ${result.externalReference || null},
            "response_snapshot" = ${JSON.stringify(result.response || {})}::jsonb, "completed_at" = CURRENT_TIMESTAMP,
            "locked_at" = NULL, "locked_by" = NULL, "last_error_code" = NULL, "last_error_message" = NULL, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${String(job.id)}
        `);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "WorkOrderInvoiceDraft" SET "sync_status" = 'synced', "last_synced_at" = CURRENT_TIMESTAMP,
            "last_sync_error" = NULL, "external_invoice_number" = COALESCE(${result.externalReference || null}, "external_invoice_number"),
            "external_system" = ${String(job.provider)}, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${String(job.invoice_draft_id)} AND "company_id" = ${String(job.company_id)}
        `);
      });
      processed.push({ id: job.id, status: "completed", provider: job.provider, externalReference: result.externalReference || null });
      continue;
    }

    const finalFailure = !result.retryable || attemptNumber >= Number(job.max_attempts);
    const nextAttempt = new Date(Date.now() + retryDelayMinutes(attemptNumber) * 60_000);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "AccountingSyncAttempt" SET "status" = 'failed', "response_snapshot" = ${JSON.stringify(result.response || {})}::jsonb,
          "error_code" = ${result.errorCode || null}, "error_message" = ${result.errorMessage || null}, "duration_ms" = ${durationMs}
        WHERE "id" = ${attemptId}
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "AccountingSyncJob" SET "status" = ${finalFailure ? "failed" : "retrying"}, "next_attempt_at" = ${nextAttempt},
          "last_error_code" = ${result.errorCode || null}, "last_error_message" = ${result.errorMessage || null},
          "locked_at" = NULL, "locked_by" = NULL, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${String(job.id)}
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderInvoiceDraft" SET "sync_status" = ${finalFailure ? "failed" : "queued"},
          "last_sync_error" = ${result.errorMessage || "Okänt synkfel"}, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${String(job.invoice_draft_id)} AND "company_id" = ${String(job.company_id)}
      `);
    });
    processed.push({ id: job.id, status: finalFailure ? "failed" : "retrying", provider: job.provider, errorCode: result.errorCode, nextAttemptAt: finalFailure ? null : nextAttempt.toISOString() });
  }

  return NextResponse.json({ workerId, processedCount: processed.length, processed });
}
