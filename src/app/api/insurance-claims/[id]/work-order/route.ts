import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageWorkOrderFinance, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { addWorkOrderStatusEvent, allocateWorkOrderNumber, calculateWorkOrderSla, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";
import { isMissingTableError, schemaMismatchUserMessage } from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/insurance-claims/[id]/work-order" });
const WORK_ORDER_ACTION = "insurance_claim.work_order_created";
const CLOSED_STATUSES = new Set(["settled", "closed"]);

function workOrderIdFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const workOrderId = (metadata as { workOrderId?: unknown }).workOrderId;
  return typeof workOrderId === "string" && workOrderId.trim() ? workOrderId : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rawUser = await getCurrentUser();
    if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const user = requireCompanyUser(rawUser);
    if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
    if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

    const { id } = await params;
    let claim;
    try {
      claim = await db.insuranceClaim.findFirst({
        where: { id, company_id: user.company_id, property: { deleted_at: null } },
        include: { property: { select: { id: true, name: true } } },
      });
    } catch (error) {
      if (isMissingTableError(error, "InsuranceClaim")) {
        return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
      }
      throw error;
    }

    if (!claim) {
      const orphaned = await db.insuranceClaim.findFirst({
        where: { id, company_id: user.company_id },
        select: { id: true },
      }).catch((error) => {
        if (isMissingTableError(error, "InsuranceClaim")) return null;
        throw error;
      });
      if (orphaned) {
        return NextResponse.json({ error: "Skadeärendet hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: "insurance_claim.created", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "InsuranceClaim") {
        return NextResponse.json({
          error: "Skadeärendet finns kvar i äldre lagring. Kör backfill till InsuranceClaim innan arbetsorder kan skapas.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Skadeärendet hittades inte" }, { status: 404 });
    }

    if (CLOSED_STATUSES.has(claim.status)) {
      return NextResponse.json({ error: "Arbetsorder kan inte skapas för ett avslutat skadeärende" }, { status: 409 });
    }

    const existingLink = await db.auditLog.findFirst({
      where: { ...auditScopedWhere(user), action: WORK_ORDER_ACTION, entity_id: claim.id },
      orderBy: { created_at: "desc" },
      select: { metadata: true },
    });
    const existingWorkOrderId = workOrderIdFromMetadata(existingLink?.metadata);
    if (existingWorkOrderId) {
      return NextResponse.json({ error: "Skadeärendet har redan en arbetsorder", workOrderId: existingWorkOrderId }, { status: 409 });
    }

    const created = await db.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${`insurance-claim-work-order:${claim.id}`})) AS locked
      `);
      if (!lock[0]?.locked) return { conflict: "locked" as const, workOrderId: null, workOrderNumber: null };

      const freshLink = await tx.auditLog.findFirst({
        where: { company_id: user.company_id!, action: WORK_ORDER_ACTION, entity_id: claim.id },
        orderBy: { created_at: "desc" },
        select: { metadata: true },
      });
      const linkedId = workOrderIdFromMetadata(freshLink?.metadata);
      if (linkedId) {
        return { conflict: "already_linked" as const, workOrderId: linkedId, workOrderNumber: null };
      }

      const createdAt = new Date();
      const priority = normalizeWorkOrderPriority("high");
      const sla = calculateWorkOrderSla(createdAt, priority);
      const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
      const workOrder = await tx.workOrder.create({
        data: {
          company_id: user.company_id!,
          property_id: claim.property_id,
          created_by_id: user.id,
          title: `${claim.title} · ${claim.property.name}`,
          description: [
            "Åtgärd från skade-/försäkringsärende.",
            claim.damage_type ? `Skadetyp: ${claim.damage_type}` : "",
            claim.location ? `Plats: ${claim.location}` : "",
            claim.insurer ? `Försäkringsbolag: ${claim.insurer}` : "",
            claim.claim_number ? `Skadenummer: ${claim.claim_number}` : "",
            claim.note ? `Anteckning: ${claim.note}` : "",
          ].filter(Boolean).join("\n\n"),
          status: "planned",
          priority,
          created_at: createdAt,
        },
      });
      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: workOrder.id,
        companyId: user.company_id!,
        workOrderNumber,
        workType: "corrective",
        source: "internal",
        responseDueAt: sla.responseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      });
      await setWorkOrderAssetLinks(tx, {
        workOrderId: workOrder.id,
        companyId: user.company_id!,
        buildingId: null,
        technicalAssetId: null,
      });
      await addWorkOrderStatusEvent(tx, {
        companyId: user.company_id!,
        workOrderId: workOrder.id,
        actorUserId: user.id,
        fromStatus: null,
        toStatus: "planned",
        reason: "Skapad från skadeärende",
        metadata: { claimId: claim.id, damageType: claim.damage_type },
      });

      await writeAuditLog(user, {
        entityType: "insurance_claim",
        entityId: claim.id,
        action: WORK_ORDER_ACTION,
        metadata: {
          workOrderId: workOrder.id,
          workOrderNumber,
          propertyId: claim.property_id,
          source: "internal",
        },
      }, tx);

      return { conflict: null, workOrderId: workOrder.id, workOrderNumber };
    });

    if (created.conflict === "locked") {
      return NextResponse.json({ error: "Arbetsorder skapas redan för det här skadeärendet, försök igen om en stund" }, { status: 409 });
    }
    if (created.conflict === "already_linked") {
      return NextResponse.json({ error: "Skadeärendet har redan en arbetsorder", workOrderId: created.workOrderId }, { status: 409 });
    }

    return NextResponse.json({ success: true, workOrderId: created.workOrderId, workOrderNumber: created.workOrderNumber }, { status: 201 });
  } catch (error) {
    logger.error("Create insurance claim work order error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
