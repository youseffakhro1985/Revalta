import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";

const signerRoles = new Set(["executor", "contractor", "customer"]);

async function resolveWorkOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({
    where: { id, company_id: companyId },
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true } },
      assigned_to: { select: { id: true, name: true, email: true } },
    },
  });
}

async function buildSnapshot(id: string, companyId: string) {
  const workOrder = await resolveWorkOrder(id, companyId);
  if (!workOrder) return null;

  const [checklist, entries, documents] = await Promise.all([
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT "title", "description", "is_required", "completed_at"
      FROM "WorkOrderChecklistItem"
      WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
      ORDER BY "sort_order" ASC, "created_at" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT "entry_type", "description", "quantity"::double precision AS "quantity",
             "unit", "unit_cost"::double precision AS "unit_cost",
             "total_amount"::double precision AS "total_amount", "minutes",
             "distance_km"::double precision AS "distance_km", "supplier", "occurred_at"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
      ORDER BY "occurred_at" ASC, "created_at" ASC
    `),
    db.operationalDocument.findMany({
      where: { company_id: companyId, work_order_id: id },
      select: { id: true, file_name: true, storage_url: true, category: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  return { workOrder, checklist, entries, documents, generatedAt: new Date().toISOString() };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const [signatures, reports, invoiceBases] = await Promise.all([
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT "id", "signer_role", "signer_name", "signer_email", "confirmation_text", "signed_at"
      FROM "WorkOrderSignature"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      ORDER BY "signed_at" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT "id", "version", "status", "title", "approved_at", "created_at"
      FROM "WorkOrderReport"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      ORDER BY "version" DESC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT "id", "reference", "status", "subtotal"::double precision AS "subtotal",
             "vat_rate"::double precision AS "vat_rate", "vat_amount"::double precision AS "vat_amount",
             "total"::double precision AS "total", "approved_at", "created_at"
      FROM "WorkOrderInvoiceBasis"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      ORDER BY "created_at" DESC
    `),
  ]);

  return NextResponse.json({ workOrder, signatures, reports, invoiceBases });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action || "");

  if (action === "signature.create") {
    const signerRole = String(body.signerRole || "");
    const signerName = String(body.signerName || "").trim();
    const signerEmail = body.signerEmail ? String(body.signerEmail).trim() : null;
    const confirmationText = String(body.confirmationText || "Jag intygar att uppgifterna är korrekta.").trim();
    if (!signerRoles.has(signerRole)) return NextResponse.json({ error: "Ogiltig signeringsroll" }, { status: 400 });
    if (!signerName) return NextResponse.json({ error: "Namn krävs för signering" }, { status: 400 });

    const signatureId = crypto.randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderSignature"
        ("id", "company_id", "work_order_id", "created_by_id", "signer_role", "signer_name", "signer_email", "confirmation_text")
      VALUES
        (${signatureId}, ${user.company_id}, ${id}, ${user.id}, ${signerRole}, ${signerName}, ${signerEmail}, ${confirmationText})
      ON CONFLICT ("work_order_id", "signer_role") DO UPDATE
      SET "signer_name" = EXCLUDED."signer_name", "signer_email" = EXCLUDED."signer_email",
          "confirmation_text" = EXCLUDED."confirmation_text", "signed_at" = CURRENT_TIMESTAMP,
          "created_by_id" = EXCLUDED."created_by_id"
    `);

    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.signature_recorded", metadata: { signerRole, signerName } });
    return NextResponse.json({ success: true });
  }

  if (action === "report.create") {
    const snapshot = await buildSnapshot(id, user.company_id);
    if (!snapshot) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
    const versions = await db.$queryRaw<{ next_version: number }[]>(Prisma.sql`
      SELECT COALESCE(MAX("version"), 0) + 1 AS "next_version"
      FROM "WorkOrderReport"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
    `);
    const version = Number(versions[0]?.next_version || 1);
    const reportId = crypto.randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderReport"
        ("id", "company_id", "work_order_id", "created_by_id", "version", "status", "title", "snapshot")
      VALUES
        (${reportId}, ${user.company_id}, ${id}, ${user.id}, ${version}, 'draft', ${`Arbetsrapport – ${workOrder.title}`}, ${JSON.stringify(snapshot)}::jsonb)
    `);
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.report_created", metadata: { reportId, version } });
    return NextResponse.json({ id: reportId, version }, { status: 201 });
  }

  if (action === "invoice.create") {
    const snapshot = await buildSnapshot(id, user.company_id);
    if (!snapshot) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
    const totals = await db.$queryRaw<{ subtotal: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM("total_amount"), 0)::double precision AS "subtotal"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
    `);
    const subtotal = Number(totals[0]?.subtotal || 0);
    const vatRate = 25;
    const vatAmount = Math.round(subtotal * vatRate) / 100;
    const total = subtotal + vatAmount;
    const reference = `REV-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-5)}`;
    const invoiceId = crypto.randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderInvoiceBasis"
        ("id", "company_id", "work_order_id", "created_by_id", "reference", "subtotal", "vat_rate", "vat_amount", "total", "snapshot")
      VALUES
        (${invoiceId}, ${user.company_id}, ${id}, ${user.id}, ${reference}, ${subtotal}, ${vatRate}, ${vatAmount}, ${total}, ${JSON.stringify(snapshot)}::jsonb)
    `);
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.invoice_basis_created", metadata: { invoiceId, reference, subtotal, vatAmount, total } });
    return NextResponse.json({ id: invoiceId, reference, subtotal, vatAmount, total }, { status: 201 });
  }

  return NextResponse.json({ error: "Åtgärden stöds inte" }, { status: 400 });
}
