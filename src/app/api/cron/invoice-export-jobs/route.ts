import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";

const JOB_TYPE = "work_order.invoice_integration_job";
const INVOICE_TYPE = "work_order.invoice_basis";
const MAX_BATCH = 20;
const TIMEOUT_MS = 15_000;

type JsonObject = Record<string, unknown>;
type Provider = "fortnox" | "visma" | "webhook";

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function providerConfig(provider: Provider) {
  if (provider === "fortnox") {
    return {
      endpoint: process.env.FORTNOX_INVOICE_EXPORT_URL,
      token: process.env.FORTNOX_ACCESS_TOKEN,
      tokenHeader: "Authorization",
      tokenValue: process.env.FORTNOX_ACCESS_TOKEN
        ? `Bearer ${process.env.FORTNOX_ACCESS_TOKEN}`
        : undefined,
    };
  }
  if (provider === "visma") {
    return {
      endpoint: process.env.VISMA_INVOICE_EXPORT_URL,
      token: process.env.VISMA_ACCESS_TOKEN,
      tokenHeader: "Authorization",
      tokenValue: process.env.VISMA_ACCESS_TOKEN
        ? `Bearer ${process.env.VISMA_ACCESS_TOKEN}`
        : undefined,
    };
  }
  return {
    endpoint: process.env.INVOICE_WEBHOOK_URL,
    token: process.env.INVOICE_WEBHOOK_SECRET,
    tokenHeader: "X-Revalta-Webhook-Secret",
    tokenValue: process.env.INVOICE_WEBHOOK_SECRET,
  };
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  return authorization === `Bearer ${secret}` || cronHeader === secret;
}

async function writeJobEvent(
  companyId: string,
  workOrderId: string,
  status: string,
  payload: JsonObject,
) {
  await db.integrationEvent.create({
    data: {
      company_id: companyId,
      type: JOB_TYPE,
      status,
      recipient: workOrderId,
      payload: jsonValue(payload),
    },
  });
}

async function processJob(job: JsonObject & { companyId: string; workOrderId: string }) {
  const jobId = String(job.jobId ?? "");
  const provider = String(job.provider ?? "") as Provider;
  const now = new Date().toISOString();

  if (!jobId || !["fortnox", "visma", "webhook"].includes(provider)) {
    return { jobId, status: "skipped", error: "Ogiltigt exportjobb" };
  }

  const config = providerConfig(provider);
  if (!config.endpoint || (provider !== "webhook" && !config.token)) {
    const error = "Integrationen saknar endpoint eller autentisering";
    await writeJobEvent(job.companyId, job.workOrderId, "failed", {
      ...job,
      status: "failed",
      error,
      updatedAt: now,
    });
    return { jobId, status: "failed", error };
  }

  const invoiceEvent = await db.integrationEvent.findFirst({
    where: {
      company_id: job.companyId,
      recipient: job.workOrderId,
      type: INVOICE_TYPE,
    },
    orderBy: { created_at: "desc" },
  });
  const invoice = invoiceEvent ? asObject(invoiceEvent.payload) : null;
  if (!invoice) {
    const error = "Faktureringsunderlaget saknas";
    await writeJobEvent(job.companyId, job.workOrderId, "failed", {
      ...job,
      status: "failed",
      error,
      updatedAt: now,
    });
    return { jobId, status: "failed", error };
  }

  await writeJobEvent(job.companyId, job.workOrderId, "processing", {
    ...job,
    status: "processing",
    processingStartedAt: now,
    updatedAt: now,
    error: null,
  });

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": jobId,
      "X-Revalta-Job-Id": jobId,
    };
    if (config.tokenHeader && config.tokenValue) {
      headers[config.tokenHeader] = config.tokenValue;
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "revalta",
        provider,
        jobId,
        workOrderId: job.workOrderId,
        invoice,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const responseText = (await response.text()).slice(0, 4_000);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${responseText || response.statusText}`);
    }

    const completedAt = new Date().toISOString();
    await writeJobEvent(job.companyId, job.workOrderId, "sent", {
      ...job,
      status: "sent",
      externalStatus: response.status,
      externalResponse: responseText || null,
      completedAt,
      updatedAt: completedAt,
      error: null,
    });
    return { jobId, status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "Okänt leveransfel";
    const failedAt = new Date().toISOString();
    await writeJobEvent(job.companyId, job.workOrderId, "failed", {
      ...job,
      status: "failed",
      error: message,
      failedAt,
      updatedAt: failedAt,
    });
    return { jobId, status: "failed", error: message };
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  }

  const events = await db.integrationEvent.findMany({
    where: { type: JOB_TYPE },
    orderBy: { created_at: "desc" },
    take: 5_000,
  });

  const latest = new Map<string, JsonObject & { companyId: string; workOrderId: string }>();
  for (const event of events) {
    const payload = asObject(event.payload);
    if (!payload || typeof payload.jobId !== "string" || !event.company_id || !event.recipient) continue;
    if (!latest.has(payload.jobId)) {
      latest.set(payload.jobId, {
        ...payload,
        companyId: event.company_id,
        workOrderId: event.recipient,
      });
    }
  }

  const queued = [...latest.values()]
    .filter((job) => job.status === "queued")
    .sort((a, b) => String(a.updatedAt ?? a.createdAt ?? "").localeCompare(String(b.updatedAt ?? b.createdAt ?? "")))
    .slice(0, MAX_BATCH);

  const results = [];
  for (const job of queued) {
    results.push(await processJob(job));
  }

  return NextResponse.json({
    processed: results.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
