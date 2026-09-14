import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageWorkOrderFinance, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { addWorkOrderStatusEvent, allocateWorkOrderNumber, calculateWorkOrderSla, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";
import { hasWorkOrderVendorContractColumn, isMissingTableError, schemaMismatchUserMessage, workOrderVendorWrite } from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/quotes/[id]/work-order" });
export const QUOTE_WORK_ORDER_ACTION = "quote.work_order_created";
const ELIGIBLE_STATUSES = new Set(["approved", "invoiced"]);
const BLOCKED_STATUSES = new Set(["rejected", "cancelled"]);

function workOrderIdFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const workOrderId = (metadata as { workOrderId?: unknown }).workOrderId;
  return typeof workOrderId === "string" && workOrderId.trim() ? workOrderId : null;
}

function asMoney(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    const companyId = user.company_id;

    const { id } = await params;
    let quote;
    try {
      quote = await db.quote.findFirst({
        where: { id, company_id: companyId, property: { deleted_at: null } },
        include: { property: { select: { id: true, name: true } } },
      });
    } catch (error) {
      if (isMissingTableError(error, "Quote")) {
        return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
      }
      throw error;
    }

    if (!quote) {
      const orphaned = await db.quote.findFirst({
        where: { id, company_id: companyId },
        select: { id: true },
      }).catch((error) => {
        if (isMissingTableError(error, "Quote")) return null;
        throw error;
      });
      if (orphaned) {
        return NextResponse.json({ error: "Offerten hittades inte" }, { status: 404 });
      }
      const createdLegacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: "quote.created", OR: [{ id }, { entity_id: id }] },
        select: { id: true, metadata: true },
      });
      const metadata = (createdLegacy?.metadata || {}) as Record<string, unknown>;
      if (createdLegacy && metadata.storage !== "Quote") {
        return NextResponse.json({
          error: "Offerten finns kvar i äldre lagring. Kör backfill till Quote innan arbetsorder kan skapas.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Offerten hittades inte" }, { status: 404 });
    }

    if (BLOCKED_STATUSES.has(quote.status)) {
      return NextResponse.json({ error: "Arbetsorder kan inte skapas för en avslagen eller makulerad offert" }, { status: 409 });
    }
    if (!ELIGIBLE_STATUSES.has(quote.status)) {
      return NextResponse.json({ error: "Godkänn offerten innan en arbetsorder skapas" }, { status: 409 });
    }

    const existingLink = await db.auditLog.findFirst({
      where: { ...auditScopedWhere(user), action: QUOTE_WORK_ORDER_ACTION, entity_id: quote.id },
      orderBy: { created_at: "desc" },
      select: { metadata: true },
    });
    const existingWorkOrderId = workOrderIdFromMetadata(existingLink?.metadata);
    if (existingWorkOrderId) {
      return NextResponse.json({ error: "Offerten har redan en arbetsorder", workOrderId: existingWorkOrderId }, { status: 409 });
    }

    const persistVendor = await hasWorkOrderVendorContractColumn();
    const supplierName = quote.supplier?.trim() || "";
    let vendorContractId: string | null = null;
    if (persistVendor && supplierName) {
      const vendor = await db.vendorContract.findFirst({
        where: {
          company_id: companyId,
          status: "active",
          name: { equals: supplierName, mode: "insensitive" },
          OR: [{ property_id: null }, { property_id: quote.property_id }],
        },
        select: { id: true },
      });
      vendorContractId = vendor?.id ?? null;
    }

    const created = await db.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${`quote-work-order:${quote.id}`})) AS locked
      `);
      if (!lock[0]?.locked) return { conflict: "locked" as const, workOrderId: null, workOrderNumber: null };

      const freshLink = await tx.auditLog.findFirst({
        where: { company_id: companyId, action: QUOTE_WORK_ORDER_ACTION, entity_id: quote.id },
        orderBy: { created_at: "desc" },
        select: { metadata: true },
      });
      const linkedId = workOrderIdFromMetadata(freshLink?.metadata);
      if (linkedId) {
        return { conflict: "already_linked" as const, workOrderId: linkedId, workOrderNumber: null };
      }

      const createdAt = new Date();
      const priority = normalizeWorkOrderPriority("normal");
      const sla = calculateWorkOrderSla(createdAt, priority);
      const workOrderNumber = await allocateWorkOrderNumber(tx, companyId, createdAt);
      const workOrder = await tx.workOrder.create({
        data: {
          company_id: companyId,
          property_id: quote.property_id,
          created_by_id: user.id,
          title: `${quote.title} · ${quote.property.name}`,
          description: [
            "Åtgärd från godkänd offert.",
            supplierName ? `Leverantör: ${supplierName}` : "",
            quote.note ? `Anteckning: ${quote.note}` : "",
          ].filter(Boolean).join("\n\n"),
          status: "planned",
          priority,
          estimated_cost: asMoney(quote.subtotal),
          created_at: createdAt,
          ...workOrderVendorWrite(persistVendor, vendorContractId),
        },
      });
      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: workOrder.id,
        companyId,
        workOrderNumber,
        workType: "corrective",
        source: "supplier",
        responseDueAt: sla.responseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      });
      await setWorkOrderAssetLinks(tx, {
        workOrderId: workOrder.id,
        companyId,
        buildingId: null,
        technicalAssetId: null,
      });
      await addWorkOrderStatusEvent(tx, {
        companyId,
        workOrderId: workOrder.id,
        actorUserId: user.id,
        fromStatus: null,
        toStatus: "planned",
        reason: "Skapad från offert",
        metadata: { quoteId: quote.id },
      });

      await writeAuditLog(user, {
        entityType: "quote",
        entityId: quote.id,
        action: QUOTE_WORK_ORDER_ACTION,
        metadata: {
          workOrderId: workOrder.id,
          workOrderNumber,
          propertyId: quote.property_id,
          vendorContractId,
          source: "supplier",
        },
      }, tx);

      return { conflict: null, workOrderId: workOrder.id, workOrderNumber };
    });

    if (created.conflict === "locked") {
      return NextResponse.json({ error: "Arbetsorder skapas redan för den här offerten, försök igen om en stund" }, { status: 409 });
    }
    if (created.conflict === "already_linked") {
      return NextResponse.json({ error: "Offerten har redan en arbetsorder", workOrderId: created.workOrderId }, { status: 409 });
    }

    return NextResponse.json({ success: true, workOrderId: created.workOrderId, workOrderNumber: created.workOrderNumber }, { status: 201 });
  } catch (error) {
    logger.error("Create quote work order error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
