import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { buildIdempotencyKey, validateAccountingPayload, type AccountingInvoicePayload, type AccountingProvider } from "@/lib/accounting-sync";

const allowedProviders = new Set<AccountingProvider>(["fortnox", "visma", "generic"]);
const financialRoles = new Set(["owner", "admin", "manager"]);

async function loadDraft(workOrderId: string, companyId: string) {
  const drafts = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT d."id", d."draft_number", d."customer_name", d."customer_reference", d."subtotal_ex_vat"::double precision,
      d."vat_amount"::double precision, d."total_inc_vat"::double precision, d."notes", d."status", d."sync_status",
      d."external_system", d."external_invoice_number", d."last_reconciled_at", d."last_external_status", d."payment_reference",
      d."last_synced_at", d."last_sync_error", d."paid_at", d."invoiced_at", d."cancelled_at",
      w."work_order_number", w."title",
      COALESCE(json_agg(json_build_object('description', l."description", 'quantity', l."quantity"::double precision,
        'unit', l."unit", 'unitPriceExVat', l."unit_price_ex_vat"::double precision, 'vatRate', l."vat_rate"::double precision,
        'totalExVat', l."line_total_ex_vat"::double precision) ORDER BY l."sort_order") FILTER (WHERE l."id" IS NOT NULL), '[]'::json) AS lines
    FROM "WorkOrderInvoiceDraft" d
    JOIN "WorkOrder" w ON w."id" = d."work_order_id"
    LEFT JOIN "WorkOrderInvoiceDraftLine" l ON l."invoice_draft_id" = d."id"
    WHERE d."work_order_id" = ${workOrderId} AND d."company_id" = ${companyId}
    GROUP BY d."id", w."work_order_number", w."title"
    LIMIT 1
  `);
  return drafts[0] ?? null;
}

function payloadFromDraft(draft: Record<string, unknown>, idempotencyKey: string): AccountingInvoicePayload {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 30);
  return {
    idempotencyKey,
    draftId: String(draft.id),
    draftNumber: String(draft.draft_number),
    workOrderNumber: draft.work_order_number ? String(draft.work_order_number) : null,
    customerName: draft.customer_name ? String(draft.customer_name) : null,
    customerReference: draft.customer_reference ? String(draft.customer_reference) : null,
    currency: "SEK",
    invoiceDate: today.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    notes: draft.notes ? String(draft.notes) : null,
    subtotalExVat: Number(draft.subtotal_ex_vat || 0),
    vatAmount: Number(draft.vat_amount || 0),
    totalIncVat: Number(draft.total_inc_vat || 0),
    lines: Array.isArray(draft.lines) ? draft.lines as AccountingInvoicePayload["lines"] : [],
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const draft = await loadDraft(id, user.company_id);
  if (!draft) return NextResponse.json({ error: "Faktureringsunderlag saknas" }, { status: 404 });
  const jobs = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT j."id", j."provider", j."operation", j."status", j."attempt_count", j."max_attempts", j."next_attempt_at",
      j."last_error_code", j."last_error_message", j."external_reference", j."completed_at", j."created_at",
      COALESCE(json_agg(json_build_object('id', a."id", 'attemptNumber', a."attempt_number", 'status', a."status",
        'errorCode', a."error_code", 'errorMessage', a."error_message", 'durationMs', a."duration_ms", 'createdAt', a."created_at")
        ORDER BY a."created_at" DESC) FILTER (WHERE a."id" IS NOT NULL), '[]'::json) AS attempts
    FROM "AccountingSyncJob" j
    LEFT JOIN "AccountingSyncAttempt" a ON a."sync_job_id" = j."id"
    WHERE j."invoice_draft_id" = ${String(draft.id)} AND j."company_id" = ${user.company_id}
    GROUP BY j."id"
    ORDER BY j."created_at" DESC LIMIT 20
  `);
  return NextResponse.json({ draft, jobs });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!financialRoles.has(user.role)) return NextResponse.json({ error: "Du saknar behörighet för ekonomisynk" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();
  const provider = String(body.provider || "") as AccountingProvider;
  if (!allowedProviders.has(provider)) return NextResponse.json({ error: "Ogiltigt ekonomisystem" }, { status: 400 });
  const draft = await loadDraft(id, user.company_id);
  if (!draft) return NextResponse.json({ error: "Faktureringsunderlag saknas" }, { status: 404 });
  if (!["exported", "sent", "invoiced"].includes(String(draft.status))) return NextResponse.json({ error: "Underlaget måste vara exporterat eller skickat före synk" }, { status: 409 });
  const idempotencyKey = buildIdempotencyKey(user.company_id, String(draft.id), provider, "create_invoice");
  const payload = payloadFromDraft(draft, idempotencyKey);
  const errors = validateAccountingPayload(payload);
  if (errors.length) return NextResponse.json({ error: errors.join(". ") }, { status: 400 });
  const jobId = randomUUID();
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AccountingSyncJob" ("id", "company_id", "invoice_draft_id", "provider", "operation", "idempotency_key", "payload_snapshot", "created_by_id")
        VALUES (${jobId}, ${user.company_id}, ${String(draft.id)}, ${provider}, 'create_invoice', ${idempotencyKey}, ${JSON.stringify(payload)}::jsonb, ${user.id})
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderInvoiceDraft" SET "accounting_provider" = ${provider}, "sync_status" = 'queued', "sync_job_id" = ${jobId},
          "last_sync_error" = NULL, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${String(draft.id)} AND "company_id" = ${user.company_id}
      `);
    });
  } catch (error) {
    if (String(error).includes("AccountingSyncJob_idempotency_key")) return NextResponse.json({ error: "Samma faktura är redan köad för detta ekonomisystem" }, { status: 409 });
    throw error;
  }
  await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.accounting_sync_queued", metadata: { jobId, provider, draftId: draft.id } });
  return NextResponse.json({ success: true, jobId }, { status: 201 });
}
