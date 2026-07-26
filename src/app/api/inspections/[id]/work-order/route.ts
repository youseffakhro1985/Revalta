import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { addWorkOrderStatusEvent, allocateWorkOrderNumber, calculateWorkOrderSla, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";

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
      where: { id, company_id: user.company_id },
      include: { property: { select: { id: true, name: true } } },
    });
    if (!inspection) return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
    if (inspection.status !== "action_required") {
      return NextResponse.json({ error: "Arbetsorder kan endast skapas när status är ”Åtgärd krävs”" }, { status: 409 });
    }
    if (inspection.work_order_id) {
      return NextResponse.json({ error: "Kontrollen har redan en arbetsorder", workOrderId: inspection.work_order_id }, { status: 409 });
    }

    const created = await db.$transaction(async (tx) => {
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
      await tx.complianceInspection.updateMany({
        where: { id: inspection.id, company_id: user.company_id!, work_order_id: null },
        data: { work_order_id: workOrder.id },
      });
      return { workOrderId: workOrder.id, workOrderNumber };
    });

    await writeAuditLog(user, {
      entityType: "compliance_inspection",
      entityId: inspection.id,
      action: "inspection.work_order_created",
      metadata: {
        workOrderId: created.workOrderId,
        workOrderNumber: created.workOrderNumber,
        propertyId: inspection.property_id,
      },
    });

    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (error) {
    console.error("Create inspection work order error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
