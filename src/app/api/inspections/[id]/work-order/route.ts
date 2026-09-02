import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { addWorkOrderStatusEvent, allocateWorkOrderNumber, calculateWorkOrderSla, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/inspections/[id]/work-order" });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const inspection = await db.complianceInspection.findFirst({
      where: { id, company_id: user.company_id, property: { deleted_at: null } },
      include: { property: { select: { id: true, name: true } } },
    });
    if (!inspection) {
      const orphaned = await db.complianceInspection.findFirst({
        where: { id, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: "inspection.created", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "ComplianceInspection") {
        return NextResponse.json({
          error: "Kontrollen finns kvar i äldre lagring. Kör backfill till ComplianceInspection innan arbetsorder kan skapas.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
    }
    if (inspection.status !== "action_required") {
      return NextResponse.json({ error: "Arbetsorder kan endast skapas när status är ”Åtgärd krävs”" }, { status: 409 });
    }
    if (inspection.work_order_id) {
      return NextResponse.json({ error: "Kontrollen har redan en arbetsorder", workOrderId: inspection.work_order_id }, { status: 409 });
    }

    // Two concurrent requests (double-click, client retry) can both pass the
    // work_order_id check above before either transaction commits. Guard with
    // an advisory lock scoped to this inspection, then re-check work_order_id
    // *inside* the lock — same pattern as tryCreateRecurringIncidentEscalation
    // in src/lib/recurring-incident-storage.ts.
    const created = await db.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${`inspection-work-order:${inspection.id}`})) AS locked
      `);
      if (!lock[0]?.locked) return { conflict: "locked" as const, workOrderId: null, workOrderNumber: null };

      const fresh = await tx.complianceInspection.findFirst({
        where: { id: inspection.id, company_id: user.company_id! },
        select: { work_order_id: true },
      });
      if (!fresh || fresh.work_order_id) {
        return { conflict: "already_linked" as const, workOrderId: fresh?.work_order_id ?? null, workOrderNumber: null };
      }

      const createdAt = new Date();
      const priority = normalizeWorkOrderPriority("high");
      const sla = calculateWorkOrderSla(createdAt, priority);
      const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
      const workOrder = await tx.workOrder.create({
        data: {
          company_id: user.company_id!,
          property_id: inspection.property_id,
          created_by_id: user.id,
          title: `${inspection.title} · ${inspection.property.name}`,
          description: [
            `Åtgärd från myndighets-/besiktningskontroll (${inspection.type}).`,
            inspection.note ? `Anteckning: ${inspection.note}` : "",
            inspection.supplier ? `Besiktningsföretag: ${inspection.supplier}` : "",
            `Förfallodatum: ${inspection.due_date.toISOString().slice(0, 10)}`,
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
        source: "inspection",
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
        reason: "Skapad från besiktningskontroll",
        metadata: { inspectionId: inspection.id, type: inspection.type },
      });
      const linked = await tx.complianceInspection.updateMany({
        where: { id: inspection.id, company_id: user.company_id!, work_order_id: null },
        data: { work_order_id: workOrder.id },
      });
      if (linked.count === 0) {
        // Lost the race after all (should be unreachable given the lock, but
        // never report success for a work order that didn't actually get
        // linked back to the inspection).
        throw new Error("Kunde inte länka arbetsordern till kontrollen");
      }

      await writeAuditLog(user, {
        entityType: "compliance_inspection",
        entityId: inspection.id,
        action: "inspection.work_order_created",
        metadata: {
          workOrderId: workOrder.id,
          workOrderNumber,
          propertyId: inspection.property_id,
        },
      }, tx);

      return { conflict: null, workOrderId: workOrder.id, workOrderNumber };
    });

    if (created.conflict === "locked") {
      return NextResponse.json({ error: "Arbetsorder skapas redan för den här kontrollen, försök igen om en stund" }, { status: 409 });
    }
    if (created.conflict === "already_linked") {
      return NextResponse.json({ error: "Kontrollen har redan en arbetsorder", workOrderId: created.workOrderId }, { status: 409 });
    }

    return NextResponse.json({ success: true, workOrderId: created.workOrderId, workOrderNumber: created.workOrderNumber }, { status: 201 });
  } catch (error) {
    logger.error("Create inspection work order error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
