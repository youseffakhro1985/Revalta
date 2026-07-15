import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const financialRoles = new Set(["owner", "admin", "manager"]);
const transitions: Record<string, string[]> = {
  draft: ["exported", "cancelled"],
  exported: ["sent", "invoiced", "cancelled"],
  sent: ["invoiced", "cancelled"],
  invoiced: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

type InvoiceRow = Record<string, unknown>;

async function loadInvoice(workOrderId: string, companyId: string) {
  const drafts = await db.$queryRaw<InvoiceRow[]>(Prisma.sql`
    SELECT d.*, w."work_order_number", w."title" AS "work_order_title",
      p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city",
      c."name" AS "company_name"
    FROM "WorkOrderInvoiceDraft" d
    JOIN "WorkOrder" w ON w."id" = d."work_order_id"
    JOIN "Property" p ON p."id" = w."property_id"
    JOIN "Company" c ON c."id" = d."company_id"
    WHERE d."work_order_id" = ${workOrderId} AND d."company_id" = ${companyId}
    LIMIT 1
  `);
  const draft = drafts[0];
  if (!draft) return null;
  const lines = await db.$queryRaw<InvoiceRow[]>(Prisma.sql`
    SELECT "id", "description", "quantity"::double precision AS "quantity", "unit",
      "unit_price_ex_vat"::double precision AS "unit_price_ex_vat",
      "vat_rate"::double precision AS "vat_rate", "line_total_ex_vat"::double precision AS "line_total_ex_vat",
      "sort_order"
    FROM "WorkOrderInvoiceDraftLine"
    WHERE "invoice_draft_id" = ${String(draft.id)}
    ORDER BY "sort_order", "id"
  `);
  const history = await db.$queryRaw<InvoiceRow[]>(Prisma.sql`
    SELECT e."id", e."from_status", e."to_status", e."comment", e."created_at",
      json_build_object('name', u."name", 'email', u."email") AS "actor"
    FROM "WorkOrderInvoiceStatusEvent" e
    JOIN "User" u ON u."id" = e."actor_user_id"
    WHERE e."invoice_draft_id" = ${String(draft.id)} AND e."company_id" = ${companyId}
    ORDER BY e."created_at" DESC
  `);
  return { draft, lines, history };
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(invoice: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>) {
  const { draft, lines } = invoice;
  const rows = [
    ["Underlagsnummer", draft.draft_number],
    ["Arbetsorder", draft.work_order_number],
    ["Fastighet", draft.property_name],
    ["Kund", draft.customer_name],
    ["Kundreferens", draft.customer_reference],
    ["Status", draft.status],
    [],
    ["Beskrivning", "Antal", "Enhet", "Á-pris exkl. moms", "Moms %", "Belopp exkl. moms"],
    ...lines.map((line) => [line.description, line.quantity, line.unit, line.unit_price_ex_vat, line.vat_rate, line.line_total_ex_vat]),
    [],
    ["Summa exkl. moms", draft.subtotal_ex_vat],
    ["Moms", draft.vat_amount],
    ["Summa inkl. moms", draft.total_inc_vat],
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

async function registerExport(companyId: string, userId: string, invoiceDraftId: string, format: string, fileName: string, content: string) {
  const checksum = createHash("sha256").update(content).digest("hex");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderInvoiceExportLog" ("id", "company_id", "invoice_draft_id", "actor_user_id", "format", "file_name", "checksum")
      VALUES (${randomUUID()}, ${companyId}, ${invoiceDraftId}, ${userId}, ${format}, ${fileName}, ${checksum})
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "WorkOrderInvoiceDraft"
      SET "status" = CASE WHEN "status" = 'draft' THEN 'exported' ELSE "status" END,
          "exported_at" = COALESCE("exported_at", CURRENT_TIMESTAMP),
          "exported_by_id" = COALESCE("exported_by_id", ${userId}),
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${invoiceDraftId} AND "company_id" = ${companyId}
    `);
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const invoice = await loadInvoice(id, user.company_id);
  if (!invoice) return NextResponse.json({ error: "Faktureringsunderlaget hittades inte" }, { status: 404 });

  const format = new URL(request.url).searchParams.get("format") || "json";
  if (!financialRoles.has(user.role)) return NextResponse.json({ error: "Du saknar behörighet att exportera fakturaunderlag" }, { status: 403 });

  if (format === "csv") {
    const content = buildCsv(invoice);
    const fileName = `${String(invoice.draft.draft_number || "fakturaunderlag")}.csv`;
    await registerExport(user.company_id, user.id, String(invoice.draft.id), "csv", fileName, content);
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.invoice_exported", metadata: { format: "csv", fileName } });
    return new NextResponse(content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" } });
  }

  const payload = JSON.stringify({ invoice: invoice.draft, lines: invoice.lines, statusHistory: invoice.history }, null, 2);
  const fileName = `${String(invoice.draft.draft_number || "fakturaunderlag")}.json`;
  await registerExport(user.company_id, user.id, String(invoice.draft.id), "json", fileName, payload);
  await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.invoice_exported", metadata: { format: "json", fileName } });
  return new NextResponse(payload, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!financialRoles.has(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const { id } = await params;
  const invoice = await loadInvoice(id, user.company_id);
  if (!invoice) return NextResponse.json({ error: "Faktureringsunderlaget hittades inte" }, { status: 404 });

  const body = await request.json();
  const nextStatus = String(body.status || "");
  const currentStatus = String(invoice.draft.status || "draft");
  if (!(transitions[currentStatus] || []).includes(nextStatus)) return NextResponse.json({ error: `Status kan inte ändras från ${currentStatus} till ${nextStatus}` }, { status: 409 });
  const comment = String(body.comment || "").trim() || null;
  const externalSystem = String(body.externalSystem || "").trim() || null;
  const externalInvoiceId = String(body.externalInvoiceId || "").trim() || null;
  if (["invoiced", "paid"].includes(nextStatus) && !externalInvoiceId) return NextResponse.json({ error: "Ange externt fakturanummer" }, { status: 400 });
  if (nextStatus === "cancelled" && !comment) return NextResponse.json({ error: "Ange anledning till annulleringen" }, { status: 400 });

  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "WorkOrderInvoiceDraft" SET "status" = ${nextStatus},
        "external_system" = COALESCE(${externalSystem}, "external_system"),
        "external_invoice_id" = COALESCE(${externalInvoiceId}, "external_invoice_id"),
        "status_comment" = ${comment},
        "sent_at" = CASE WHEN ${nextStatus} = 'sent' THEN CURRENT_TIMESTAMP ELSE "sent_at" END,
        "invoiced_at" = CASE WHEN ${nextStatus} = 'invoiced' THEN CURRENT_TIMESTAMP ELSE "invoiced_at" END,
        "paid_at" = CASE WHEN ${nextStatus} = 'paid' THEN CURRENT_TIMESTAMP ELSE "paid_at" END,
        "cancelled_at" = CASE WHEN ${nextStatus} = 'cancelled' THEN CURRENT_TIMESTAMP ELSE "cancelled_at" END,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${String(invoice.draft.id)} AND "company_id" = ${user.company_id}
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderInvoiceStatusEvent" ("id", "company_id", "invoice_draft_id", "actor_user_id", "from_status", "to_status", "comment", "metadata")
      VALUES (${randomUUID()}, ${user.company_id}, ${String(invoice.draft.id)}, ${user.id}, ${currentStatus}, ${nextStatus}, ${comment}, ${JSON.stringify({ externalSystem, externalInvoiceId })}::jsonb)
    `);
    if (nextStatus === "invoiced") await tx.$executeRaw(Prisma.sql`UPDATE "WorkOrder" SET "status" = 'invoiced', "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "company_id" = ${user.company_id} AND "status" = 'completed'`);
  });
  await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.invoice_status_changed", metadata: { fromStatus: currentStatus, status: nextStatus, externalSystem, externalInvoiceId, comment } });
  return NextResponse.json({ success: true });
}
