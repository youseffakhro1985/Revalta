import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const financialRoles = new Set(["owner", "admin", "manager"]);

async function resolveWorkOrder(id: string, companyId: string) {
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT "id", "work_order_number", "title", "status", "billable", "estimated_cost",
           "approved_budget", "financial_status", "financial_reviewed_at",
           "financial_review_comment", "financial_locked_at"
    FROM "WorkOrder"
    WHERE "id" = ${id} AND "company_id" = ${companyId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function financialSnapshot(id: string, companyId: string) {
  const [summaryRows, invoiceRows] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN "voided_at" IS NULL THEN "total_amount" ELSE 0 END), 0)::double precision AS "actual_total",
        COALESCE(SUM(CASE WHEN "voided_at" IS NULL AND "approval_status" = 'approved' THEN "total_amount" ELSE 0 END), 0)::double precision AS "approved_total",
        COALESCE(SUM(CASE WHEN "voided_at" IS NULL AND "approval_status" = 'pending' THEN "total_amount" ELSE 0 END), 0)::double precision AS "pending_total",
        COALESCE(SUM(CASE WHEN "voided_at" IS NULL AND "approval_status" = 'rejected' THEN "total_amount" ELSE 0 END), 0)::double precision AS "rejected_total",
        COUNT(*) FILTER (WHERE "voided_at" IS NULL AND "approval_status" = 'pending')::integer AS "pending_count"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
    `),
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id", "draft_number", "status", "customer_name", "customer_reference",
             "subtotal_ex_vat"::double precision AS "subtotal_ex_vat",
             "vat_amount"::double precision AS "vat_amount",
             "total_inc_vat"::double precision AS "total_inc_vat",
             "notes", "approved_at", "created_at"
      FROM "WorkOrderInvoiceDraft"
      WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
      LIMIT 1
    `),
  ]);
  return { summary: summaryRows[0], invoiceDraft: invoiceRows[0] ?? null };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
  const snapshot = await financialSnapshot(id, user.company_id);
  const budget = Number(workOrder.approved_budget ?? workOrder.estimated_cost ?? 0);
  const actual = Number(snapshot.summary?.actual_total ?? 0);
  return NextResponse.json({ workOrder, ...snapshot, variance: { amount: actual - budget, percent: budget > 0 ? ((actual - budget) / budget) * 100 : null } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!financialRoles.has(user.role)) return NextResponse.json({ error: "Du saknar behörighet för ekonomiskt godkännande" }, { status: 403 });
  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
  const body = await request.json();
  const action = String(body.action || "");
  const comment = String(body.comment || "").trim() || null;

  if (action === "budget.set") {
    if (workOrder.financial_locked_at) return NextResponse.json({ error: "Ekonomin är låst. Återöppna granskningen först." }, { status: 409 });
    const budget = Number(body.approvedBudget);
    if (!Number.isFinite(budget) || budget < 0) return NextResponse.json({ error: "Budgeten måste vara ett giltigt positivt belopp" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`UPDATE "WorkOrder" SET "approved_budget" = ${budget}, "financial_status" = 'review', "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "company_id" = ${user.company_id}`);
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.budget_set", metadata: { approvedBudget: budget } });
    return NextResponse.json({ success: true });
  }

  if (action === "financial.approve") {
    const snapshot = await financialSnapshot(id, user.company_id);
    if (Number(snapshot.summary?.pending_count ?? 0) > 0) return NextResponse.json({ error: "Alla kostnadsrader måste vara attesterade före slutgodkännande" }, { status: 409 });
    await db.$executeRaw(Prisma.sql`
      UPDATE "WorkOrder" SET "financial_status" = 'approved', "financial_reviewed_at" = CURRENT_TIMESTAMP,
        "financial_reviewed_by_id" = ${user.id}, "financial_review_comment" = ${comment},
        "financial_locked_at" = CURRENT_TIMESTAMP, "actual_cost" = ${Number(snapshot.summary?.approved_total ?? 0)}, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "company_id" = ${user.company_id}
    `);
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.financial_approved", metadata: { comment, approvedTotal: snapshot.summary?.approved_total } });
    return NextResponse.json({ success: true });
  }

  if (action === "financial.reject") {
    if (!comment) return NextResponse.json({ error: "Ange anledning till avvisningen" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`UPDATE "WorkOrder" SET "financial_status" = 'rejected', "financial_reviewed_at" = CURRENT_TIMESTAMP, "financial_reviewed_by_id" = ${user.id}, "financial_review_comment" = ${comment}, "financial_locked_at" = NULL, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "company_id" = ${user.company_id}`);
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.financial_rejected", metadata: { comment } });
    return NextResponse.json({ success: true });
  }

  if (action === "financial.reopen") {
    if (!comment) return NextResponse.json({ error: "Ange anledning till återöppning" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`UPDATE "WorkOrder" SET "financial_status" = 'reopened', "financial_locked_at" = NULL, "financial_review_comment" = ${comment}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "company_id" = ${user.company_id}`);
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.financial_reopened", metadata: { comment } });
    return NextResponse.json({ success: true });
  }

  if (action === "invoice.generate") {
    if (String(workOrder.financial_status) !== "approved") return NextResponse.json({ error: "Ekonomin måste vara slutgodkänd innan faktureringsunderlag skapas" }, { status: 409 });
    const existing = await financialSnapshot(id, user.company_id);
    if (existing.invoiceDraft) return NextResponse.json({ error: "Faktureringsunderlag finns redan" }, { status: 409 });
    const vatRate = Number(body.vatRate ?? 25);
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) return NextResponse.json({ error: "Ogiltig momssats" }, { status: 400 });
    const lines = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id", "description", "quantity"::double precision AS "quantity", "unit",
             CASE WHEN "quantity" > 0 THEN ("total_amount" / "quantity")::double precision ELSE "total_amount"::double precision END AS "unit_price",
             "total_amount"::double precision AS "total_amount"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
        AND "voided_at" IS NULL AND "approval_status" = 'approved'
      ORDER BY "occurred_at", "created_at"
    `);
    if (lines.length === 0) return NextResponse.json({ error: "Det finns inga godkända kostnadsrader att fakturera" }, { status: 409 });
    const subtotal = lines.reduce((sum, line) => sum + Number(line.total_amount ?? 0), 0);
    const vat = subtotal * vatRate / 100;
    const draftId = randomUUID();
    const draftNumber = `FI-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderInvoiceDraft" ("id", "company_id", "work_order_id", "draft_number", "customer_name", "customer_reference", "subtotal_ex_vat", "vat_amount", "total_inc_vat", "notes", "created_by_id")
        VALUES (${draftId}, ${user.company_id}, ${id}, ${draftNumber}, ${body.customerName ? String(body.customerName).trim() : null}, ${body.customerReference ? String(body.customerReference).trim() : null}, ${subtotal}, ${vat}, ${subtotal + vat}, ${body.notes ? String(body.notes).trim() : null}, ${user.id})
      `);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "WorkOrderInvoiceDraftLine" ("id", "invoice_draft_id", "source_entry_id", "description", "quantity", "unit", "unit_price_ex_vat", "vat_rate", "line_total_ex_vat", "sort_order")
          VALUES (${randomUUID()}, ${draftId}, ${String(line.id)}, ${String(line.description)}, ${Number(line.quantity ?? 1)}, ${line.unit ? String(line.unit) : null}, ${Number(line.unit_price ?? 0)}, ${vatRate}, ${Number(line.total_amount ?? 0)}, ${index})
        `);
      }
    });
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.invoice_draft_generated", metadata: { draftId, draftNumber, subtotal, vat, total: subtotal + vat } });
    return NextResponse.json({ success: true, draftId, draftNumber }, { status: 201 });
  }

  return NextResponse.json({ error: "Ogiltig ekonomisk åtgärd" }, { status: 400 });
}
