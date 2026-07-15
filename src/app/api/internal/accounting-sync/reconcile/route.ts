import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";

function authorized(request: Request) {
  const secret = process.env.ACCOUNTING_SYNC_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}` || request.headers.get("x-accounting-sync-secret") === secret;
}

function endpointFor(provider: string, externalInvoiceNumber: string) {
  const encoded = encodeURIComponent(externalInvoiceNumber);
  if (provider === "fortnox") {
    const template = process.env.FORTNOX_INVOICE_STATUS_URL_TEMPLATE;
    return template ? template.replace("{invoiceNumber}", encoded) : null;
  }
  if (provider === "visma") {
    const template = process.env.VISMA_INVOICE_STATUS_URL_TEMPLATE;
    return template ? template.replace("{invoiceNumber}", encoded) : null;
  }
  const template = process.env.ACCOUNTING_GENERIC_STATUS_URL_TEMPLATE;
  return template ? template.replace("{invoiceNumber}", encoded) : null;
}

function headersFor(provider: string) {
  if (provider === "fortnox") {
    const token = process.env.FORTNOX_ACCESS_TOKEN;
    const clientSecret = process.env.FORTNOX_CLIENT_SECRET;
    return token && clientSecret ? { Authorization: `Bearer ${token}`, "Client-Secret": clientSecret } : null;
  }
  if (provider === "visma") {
    const token = process.env.VISMA_ACCESS_TOKEN;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }
  const secret = process.env.ACCOUNTING_GENERIC_WEBHOOK_SECRET;
  return secret ? { Authorization: `Bearer ${secret}` } : null;
}

function readStatus(payload: Record<string, unknown>) {
  const nested = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  return String(nested.status || nested.invoiceStatus || nested.paymentStatus || "").trim().toLowerCase();
}

function readPaymentReference(payload: Record<string, unknown>) {
  const nested = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  const value = nested.paymentReference || nested.payment_reference || nested.transactionId;
  return value === null || value === undefined ? null : String(value);
}

function mapStatus(status: string) {
  if (["paid", "fully_paid", "settled"].includes(status)) return "paid";
  if (["invoiced", "booked", "sent", "issued"].includes(status)) return "invoiced";
  if (["cancelled", "voided", "deleted"].includes(status)) return "cancelled";
  return null;
}

async function reconcile(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Obehörig intern körning" }, { status: 401 });
  const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 10)));
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT "id", "company_id", "work_order_id", "external_system", "external_invoice_number", "status"
    FROM "WorkOrderInvoiceDraft"
    WHERE "external_system" IN ('fortnox', 'visma', 'generic')
      AND "external_invoice_number" IS NOT NULL
      AND "status" IN ('exported', 'sent', 'invoiced')
      AND ("last_reconciled_at" IS NULL OR "last_reconciled_at" < CURRENT_TIMESTAMP - INTERVAL '30 minutes')
    ORDER BY COALESCE("last_reconciled_at", "created_at") ASC
    LIMIT ${limit}
  `);

  const results: Array<Record<string, unknown>> = [];
  for (const invoice of rows) {
    const provider = String(invoice.external_system);
    const externalNumber = String(invoice.external_invoice_number);
    const endpoint = endpointFor(provider, externalNumber);
    const headers = headersFor(provider);
    if (!endpoint || !headers) {
      results.push({ id: invoice.id, provider, status: "skipped", reason: "Statusavstämning är inte konfigurerad" });
      continue;
    }

    try {
      const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
      const text = await response.text();
      let payload: Record<string, unknown> = {};
      try { payload = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { payload = { raw: text.slice(0, 2_000) }; }
      if (!response.ok) {
        results.push({ id: invoice.id, provider, status: "failed", httpStatus: response.status });
        continue;
      }
      const externalStatus = readStatus(payload);
      const mappedStatus = mapStatus(externalStatus);
      const paymentReference = readPaymentReference(payload);
      await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "WorkOrderInvoiceDraft"
          SET "last_reconciled_at" = CURRENT_TIMESTAMP,
              "last_external_status" = ${externalStatus || null},
              "payment_reference" = COALESCE(${paymentReference}, "payment_reference"),
              "status" = COALESCE(${mappedStatus}, "status"),
              "invoiced_at" = CASE WHEN ${mappedStatus} = 'invoiced' AND "invoiced_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "invoiced_at" END,
              "paid_at" = CASE WHEN ${mappedStatus} = 'paid' AND "paid_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "paid_at" END,
              "cancelled_at" = CASE WHEN ${mappedStatus} = 'cancelled' AND "cancelled_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "cancelled_at" END,
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${String(invoice.id)}
        `);
        if (mappedStatus === "paid") {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "WorkOrder" SET "status" = CASE WHEN "status" IN ('completed', 'invoiced') THEN 'closed' ELSE "status" END,
              "closed_at" = CASE WHEN "status" IN ('completed', 'invoiced') AND "closed_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "closed_at" END,
              "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = ${String(invoice.work_order_id)} AND "company_id" = ${String(invoice.company_id)}
          `);
        }
      });
      results.push({ id: invoice.id, provider, status: mappedStatus || "unchanged", externalStatus });
    } catch (error) {
      results.push({ id: invoice.id, provider, status: "failed", error: error instanceof Error ? error.message : "Okänt fel" });
    }
  }

  return NextResponse.json({ reconciledCount: results.length, results });
}

export async function GET(request: Request) {
  return reconcile(request);
}

export async function POST(request: Request) {
  return reconcile(request);
}
