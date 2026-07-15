import { Prisma } from "@prisma/client";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";

const providers = new Set(["fortnox", "visma", "generic"]);
const paidStatuses = new Set(["paid", "fully_paid", "settled"]);
const invoicedStatuses = new Set(["invoiced", "booked", "sent", "issued"]);
const cancelledStatuses = new Set(["cancelled", "voided", "deleted"]);

function secretFor(provider: string) {
  if (provider === "fortnox") return process.env.FORTNOX_WEBHOOK_SECRET;
  if (provider === "visma") return process.env.VISMA_WEBHOOK_SECRET;
  return process.env.GENERIC_ACCOUNTING_WEBHOOK_SECRET;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifySignature(provider: string, rawBody: string, request: Request) {
  const secret = secretFor(provider);
  if (!secret) return false;
  const timestamp = request.headers.get("x-webhook-timestamp") || request.headers.get("x-revalta-timestamp") || "";
  const signatureHeader = request.headers.get("x-webhook-signature") || request.headers.get("x-revalta-signature") || "";
  const signature = signatureHeader.replace(/^sha256=/i, "").trim();
  if (!timestamp || !signature) return false;
  const timestampMs = Number(timestamp) > 1_000_000_000_000 ? Number(timestamp) : Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(expected, signature);
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizePayload(provider: string, payload: Record<string, unknown>) {
  const nested = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  const eventId = stringValue(payload.eventId || payload.id || nested.eventId || nested.id || payload.deliveryId);
  const eventType = stringValue(payload.eventType || payload.type || nested.eventType || nested.type || "invoice.updated");
  const externalInvoiceNumber = stringValue(
    nested.externalInvoiceNumber || nested.invoiceNumber || nested.invoice_no || nested.documentNumber || payload.invoiceNumber,
  );
  const status = stringValue(nested.status || nested.invoiceStatus || nested.paymentStatus || payload.status).toLowerCase();
  const paymentReference = stringValue(nested.paymentReference || nested.payment_reference || nested.transactionId || payload.paymentReference);
  return { provider, eventId, eventType, externalInvoiceNumber, status, paymentReference };
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!providers.has(provider)) return NextResponse.json({ error: "Okänd integrationsleverantör" }, { status: 404 });

  const rawBody = await request.text();
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ogiltig webhook-payload" }, { status: 400 });
  }

  const signatureValid = verifySignature(provider, rawBody, request);
  if (!signatureValid) return NextResponse.json({ error: "Ogiltig eller för gammal webhook-signatur" }, { status: 401 });

  const normalized = normalizePayload(provider, payload);
  if (!normalized.eventId) return NextResponse.json({ error: "Webhookhändelsen saknar unikt event-ID" }, { status: 400 });

  const eventId = randomUUID();
  try {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "IntegrationWebhookEvent" ("id", "provider", "external_event_id", "event_type", "signature_valid", "payload_hash", "payload")
      VALUES (${eventId}, ${provider}, ${normalized.eventId}, ${normalized.eventType}, true, ${payloadHash}, ${JSON.stringify(payload)}::jsonb)
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("IntegrationWebhookEvent_provider_external_key")) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  if (!normalized.externalInvoiceNumber) {
    await db.$executeRaw(Prisma.sql`
      UPDATE "IntegrationWebhookEvent" SET "status" = 'ignored', "processed_at" = CURRENT_TIMESTAMP,
        "error_message" = 'Externt fakturanummer saknas' WHERE "id" = ${eventId}
    `);
    return NextResponse.json({ received: true, ignored: true });
  }

  const invoiceRows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT d."id", d."company_id", d."work_order_id", d."status"
    FROM "WorkOrderInvoiceDraft" d
    WHERE d."external_system" = ${provider} AND d."external_invoice_number" = ${normalized.externalInvoiceNumber}
    LIMIT 1
  `);
  const invoice = invoiceRows[0];
  if (!invoice) {
    await db.$executeRaw(Prisma.sql`
      UPDATE "IntegrationWebhookEvent" SET "status" = 'ignored', "processed_at" = CURRENT_TIMESTAMP,
        "error_message" = 'Matchande fakturaunderlag hittades inte' WHERE "id" = ${eventId}
    `);
    return NextResponse.json({ received: true, ignored: true });
  }

  let nextStatus: string | null = null;
  if (paidStatuses.has(normalized.status)) nextStatus = "paid";
  else if (invoicedStatuses.has(normalized.status)) nextStatus = "invoiced";
  else if (cancelledStatuses.has(normalized.status)) nextStatus = "cancelled";

  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "WorkOrderInvoiceDraft"
      SET "last_reconciled_at" = CURRENT_TIMESTAMP,
          "last_external_status" = ${normalized.status || null},
          "payment_reference" = COALESCE(${normalized.paymentReference || null}, "payment_reference"),
          "status" = COALESCE(${nextStatus}, "status"),
          "invoiced_at" = CASE WHEN ${nextStatus} = 'invoiced' AND "invoiced_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "invoiced_at" END,
          "paid_at" = CASE WHEN ${nextStatus} = 'paid' AND "paid_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "paid_at" END,
          "cancelled_at" = CASE WHEN ${nextStatus} = 'cancelled' AND "cancelled_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "cancelled_at" END,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${String(invoice.id)}
    `);
    if (nextStatus === "paid") {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrder" SET "status" = CASE WHEN "status" IN ('completed', 'invoiced') THEN 'closed' ELSE "status" END,
          "closed_at" = CASE WHEN "status" IN ('completed', 'invoiced') AND "closed_at" IS NULL THEN CURRENT_TIMESTAMP ELSE "closed_at" END,
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${String(invoice.work_order_id)} AND "company_id" = ${String(invoice.company_id)}
      `);
    }
    await tx.$executeRaw(Prisma.sql`
      UPDATE "IntegrationWebhookEvent" SET "status" = 'processed', "invoice_draft_id" = ${String(invoice.id)},
        "processed_at" = CURRENT_TIMESTAMP WHERE "id" = ${eventId}
    `);
  });

  return NextResponse.json({ received: true, processed: true, invoiceDraftId: invoice.id, status: nextStatus || "unchanged" });
}
