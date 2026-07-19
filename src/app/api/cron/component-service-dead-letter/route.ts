import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET(request: Request) {
  if (!authorized(request)) return noStore({ error: "Obehörig" }, { status: 401 });

  const since = new Date(Date.now() - 30 * 86400000);
  const runs = await db.integrationEvent.findMany({
    where: {
      type: "component_service_digest",
      status: { in: ["partial", "failed"] },
      company_id: { not: null },
      created_at: { gte: since },
    },
    orderBy: { created_at: "asc" },
    take: 500,
    select: { id: true, company_id: true, payload: true, created_at: true },
  });

  let created = 0;
  let skipped = 0;

  for (const run of runs) {
    if (!run.company_id) continue;
    const payload = record(run.payload);
    const deliveries = Array.isArray(payload?.deliveries) ? payload.deliveries : [];
    const settings = record(payload?.settings);
    const daysAhead = Math.min(90, Math.max(1, numberValue(settings?.daysAhead, 30)));

    for (const raw of deliveries) {
      const delivery = record(raw);
      if (!delivery || delivery.status !== "failed") continue;
      const email = typeof delivery.email === "string" ? delivery.email.trim().toLowerCase() : "";
      const mode = delivery.mode === "overdue_only" ? "overdue_only" : "all";
      if (!email) continue;

      const recipient = `${run.id}:${email}:${mode}`;
      const existing = await db.integrationEvent.findFirst({
        where: {
          company_id: run.company_id,
          type: "component_service_dead_letter",
          recipient,
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await db.$transaction([
        db.integrationEvent.create({
          data: {
            company_id: run.company_id,
            type: "component_service_dead_letter",
            status: "open",
            recipient,
            payload: toJson({
              sourceEventId: run.id,
              email,
              mode,
              daysAhead,
              error: typeof delivery.error === "string" ? delivery.error.slice(0, 1000) : "Okänt leveransfel",
              attempts: Math.max(0, numberValue(delivery.attempts)),
              retryable: delivery.retryable === true,
              sourceCreatedAt: run.created_at,
              retryCount: 0,
            }),
          },
        }),
        db.auditLog.create({
          data: {
            company_id: run.company_id,
            actor_user_id: null,
            entity_type: "service_notification_dead_letter",
            entity_id: run.id,
            action: "component_service_dead_letter.created",
            metadata: toJson({ sourceEventId: run.id, email, mode }),
          },
        }),
      ]);
      created += 1;
    }
  }

  return noStore({ scannedRuns: runs.length, created, skipped });
}
