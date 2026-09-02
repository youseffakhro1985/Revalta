import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { isAssignedWorkAccessible, notFoundWorkOrder } from "@/lib/assigned-work-access";
import {
  createInvoiceDraft,
  getProfitabilitySettings,
  listMaterialEntries,
  listTimeEntries,
  type InvoiceDraftPayload,
} from "@/lib/work-order-ops-storage";

const signerRoles = new Set(["executor", "contractor", "customer"]);

async function resolveWorkOrder(user: CompanyUser, id: string) {
  const workOrder = await db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: user.company_id, property: { deleted_at: null } },
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true } },
      assigned_to: { select: { id: true, name: true, email: true } },
    },
  });
  if (!workOrder) return null;
  if (!isAssignedWorkAccessible(user, workOrder.assigned_to_id)) return null;
  return workOrder;
}

async function buildSnapshot(user: CompanyUser, id: string) {
  const companyId = user.company_id;
  const workOrder = await resolveWorkOrder(user, id);
  if (!workOrder) return null;

  const [checklist, entries, documents, signatures] = await Promise.all([
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
      where: { deleted_at: null, company_id: companyId, work_order_id: id },
      select: { id: true, file_name: true, category: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT "signer_role", "signer_name", "signer_email", "confirmation_text", "signed_at"
      FROM "WorkOrderSignature"
      WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
      ORDER BY "signed_at" ASC
    `),
  ]);

  const safeDocuments = documents.map((document) => ({
    id: document.id,
    file_name: document.file_name,
    category: document.category,
    created_at: document.created_at,
    download_url: `/api/work-orders/${id}/documents/${document.id}`,
  }));

  return { workOrder, checklist, entries, documents: safeDocuments, signatures, generatedAt: new Date().toISOString() };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await resolveWorkOrder(user as CompanyUser, id);
  if (!workOrder) return notFoundWorkOrder();

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
  const workOrder = await resolveWorkOrder(user as CompanyUser, id);
  if (!workOrder) return notFoundWorkOrder();

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
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderSignature"
          ("id", "company_id", "work_order_id", "created_by_id", "signer_role", "signer_name", "signer_email", "confirmation_text")
        VALUES
          (${signatureId}, ${user.company_id}, ${id}, ${user.id}, ${signerRole}, ${signerName}, ${signerEmail}, ${confirmationText})
        ON CONFLICT ("work_order_id", "signer_role") DO UPDATE
        SET "signer_name" = EXCLUDED."signer_name", "signer_email" = EXCLUDED."signer_email",
            "confirmation_text" = EXCLUDED."confirmation_text", "signed_at" = CURRENT_TIMESTAMP,
            "created_by_id" = EXCLUDED."created_by_id"
      `);

      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.signature_recorded",
        metadata: { signerRole, signerName },
      }, tx);
    });
    return NextResponse.json({ success: true });
  }

  if (action === "report.create") {
    const snapshot = await buildSnapshot(user as CompanyUser, id);
    if (!snapshot) return notFoundWorkOrder();
    const reportId = crypto.randomUUID();
    const version = await db.$transaction(async (tx) => {
      const versions = await tx.$queryRaw<{ next_version: number }[]>(Prisma.sql`
        SELECT COALESCE(MAX("version"), 0) + 1 AS "next_version"
        FROM "WorkOrderReport"
        WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      `);
      const nextVersion = Number(versions[0]?.next_version || 1);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderReport"
          ("id", "company_id", "work_order_id", "created_by_id", "version", "status", "title", "snapshot")
        VALUES
          (${reportId}, ${user.company_id}, ${id}, ${user.id}, ${nextVersion}, 'draft', ${`Arbetsrapport – ${workOrder.title}`}, ${JSON.stringify(snapshot)}::jsonb)
      `);
      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.report_created",
        metadata: { reportId, version: nextVersion },
      }, tx);
      return nextVersion;
    });
    return NextResponse.json({ id: reportId, version }, { status: 201 });
  }

  if (action === "report.approve") {
    const reportId = String(body.reportId || "");
    if (!reportId) return NextResponse.json({ error: "Rapport saknas" }, { status: 400 });
    const changed = await db.$transaction(async (tx) => {
      const result = await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderReport"
        SET "status" = 'approved', "approved_by_id" = ${user.id}, "approved_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${reportId} AND "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      `);
      if (!result) return result;
      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.report_approved",
        metadata: { reportId },
      }, tx);
      return result;
    });
    if (!changed) return NextResponse.json({ error: "Rapporten hittades inte" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  if (action === "invoice.create") {
    const snapshot = await buildSnapshot(user as CompanyUser, id);
    if (!snapshot) return notFoundWorkOrder();

    // Canonical invoice path: approved/billable time + material → WorkOrderInvoiceDraft (exportable).
    // WorkOrderInvoiceBasis remains an archival report snapshot with the same totals.
    const [times, materials, profit] = await Promise.all([
      listTimeEntries(user.company_id, id),
      listMaterialEntries(user.company_id, id),
      getProfitabilitySettings(user.company_id, id),
    ]);
    let billableMinutes = 0;
    for (const row of times) {
      if (row.status === "approved" && row.billable === true && row.kind !== "break") {
        billableMinutes += Number(row.minutes || 0);
      }
    }
    let billableMaterial = 0;
    for (const row of materials) {
      if (row.status !== "deleted" && row.status !== "rejected" && row.billable === true) {
        billableMaterial += Number(row.total || 0);
      }
    }
    const hourlyRate = Number(profit.customerHourlyRate || 650);
    const materialMarkup = Number(profit.materialMarkupPercent || 15);
    const fixedRevenue = Number(profit.fixedRevenue || 0);
    const round = (value: number) => Math.round(value * 100) / 100;
    const lines: Array<{
      id: string;
      type: "labor" | "material" | "other";
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }> = [];
    if (billableMinutes > 0) {
      const quantity = round(billableMinutes / 60);
      lines.push({
        id: crypto.randomUUID(),
        type: "labor",
        description: "Arbete enligt arbetsorder",
        quantity,
        unit: "tim",
        unitPrice: hourlyRate,
        total: round(quantity * hourlyRate),
      });
    }
    if (billableMaterial > 0) {
      const amount = round(billableMaterial * (1 + materialMarkup / 100));
      lines.push({
        id: crypto.randomUUID(),
        type: "material",
        description: "Material enligt arbetsorder",
        quantity: 1,
        unit: "st",
        unitPrice: amount,
        total: amount,
      });
    }
    if (fixedRevenue > 0) {
      lines.push({
        id: crypto.randomUUID(),
        type: "other",
        description: "Fast ersättning",
        quantity: 1,
        unit: "st",
        unitPrice: fixedRevenue,
        total: fixedRevenue,
      });
    }
    if (lines.length === 0) {
      return NextResponse.json({
        error: "Inga attesterade tid- eller materialrader finns. Godkänn rader under Ekonomi och fakturering först.",
      }, { status: 409 });
    }

    const subtotal = round(lines.reduce((sum, line) => sum + line.total, 0));
    const vatRate = 25;
    const vatAmount = round(subtotal * vatRate / 100);
    const total = round(subtotal + vatAmount);
    const versionId = crypto.randomUUID();
    const draftPayload: InvoiceDraftPayload = {
      versionId,
      workOrderId: id,
      status: "draft",
      customerName: "",
      customerOrgNumber: "",
      customerReference: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDays: 30,
      discountPercent: 0,
      vatPercent: vatRate,
      note: "Skapat från rapportflödet utifrån attesterad tid och material.",
      lines,
      subtotal,
      discount: 0,
      net: subtotal,
      vat: vatAmount,
      total,
      updatedById: user.id,
      updatedAt: new Date().toISOString(),
    };

    const reference = `REV-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-5)}`;
    const invoiceId = crypto.randomUUID();
    const draft = await db.$transaction(async (tx) => {
      const persistedDraft = await createInvoiceDraft(user.company_id!, draftPayload, tx);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderInvoiceBasis"
          ("id", "company_id", "work_order_id", "created_by_id", "reference", "subtotal", "vat_rate", "vat_amount", "total", "snapshot")
        VALUES
          (${invoiceId}, ${user.company_id}, ${id}, ${user.id}, ${reference}, ${subtotal}, ${vatRate}, ${vatAmount}, ${total}, ${JSON.stringify({
            ...snapshot,
            canonicalDraftVersionId: versionId,
            source: "approved_time_material",
          })}::jsonb)
      `);
      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.invoice_basis_created",
        metadata: {
          invoiceId,
          reference,
          subtotal,
          vatAmount,
          total,
          draftVersionId: versionId,
          storage: "WorkOrderInvoiceDraft",
          archive: "WorkOrderInvoiceBasis",
        },
      }, tx);
      return persistedDraft;
    });
    return NextResponse.json({
      id: invoiceId,
      reference,
      subtotal,
      vatAmount,
      total,
      draft,
    }, { status: 201 });
  }

  if (action === "invoice.approve") {
    const invoiceId = String(body.invoiceId || "");
    if (!invoiceId) return NextResponse.json({ error: "Fakturaunderlag saknas" }, { status: 400 });
    const changed = await db.$transaction(async (tx) => {
      const result = await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderInvoiceBasis"
        SET "status" = 'approved', "approved_by_id" = ${user.id}, "approved_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${invoiceId} AND "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      `);
      if (!result) return result;
      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.invoice_basis_approved",
        metadata: { invoiceId },
      }, tx);
      return result;
    });
    if (!changed) return NextResponse.json({ error: "Fakturaunderlaget hittades inte" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Åtgärden stöds inte" }, { status: 400 });
}
