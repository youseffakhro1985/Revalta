import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { countDeviations, normalizeChecklist } from "@/lib/inspection-round-checklist";
import { addWorkOrderStatusEvent, allocateWorkOrderNumber, calculateWorkOrderSla, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsorder" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const body = await request.json().catch(() => null) as { itemIds?: unknown } | null;
    const requestedIds = Array.isArray(body?.itemIds)
      ? [...new Set(body.itemIds.filter((value): value is string => typeof value === "string"))]
      : [];

    const round = await db.inspectionRound.findFirst({
      where: { id, company_id: user.company_id },
      include: { property: { select: { id: true, name: true } } },
    });
    if (!round) {
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), entity_type: "round", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "InspectionRound") {
        return NextResponse.json({
          error: "Ronden finns kvar i äldre lagring. Kör backfill till InspectionRound innan arbetsorder kan skapas.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Ronden hittades inte" }, { status: 404 });
    }

    const checklist = normalizeChecklist(round.checklist);
    const candidates = checklist.filter((item) => {
      if (!item.hasDeviation || item.workOrderId) return false;
      if (!requestedIds.length) return true;
      return requestedIds.includes(item.id);
    });
    if (!candidates.length) {
      return NextResponse.json({ error: "Inga öppna avvikelser att skapa arbetsorder för" }, { status: 409 });
    }
    if (candidates.length > 50) {
      return NextResponse.json({ error: "Högst 50 arbetsorder kan skapas åt gången" }, { status: 400 });
    }

    const created = await db.$transaction(async (tx) => {
      const result: Array<{ itemId: string; workOrderId: string; workOrderNumber: string }> = [];
      const nextChecklist = [...checklist];

      for (const item of candidates) {
        const createdAt = new Date();
        const priority = normalizeWorkOrderPriority("normal");
        const sla = calculateWorkOrderSla(createdAt, priority);
        const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
        const workOrder = await tx.workOrder.create({
          data: {
            company_id: user.company_id!,
            property_id: round.property_id,
            created_by_id: user.id,
            title: `Rondavvikelse · ${item.label} · ${round.property.name}`,
            description: [
              `Avvikelse från ronden ”${round.title}”.`,
              `Kontrollpunkt: ${item.label}`,
              item.note ? `Anteckning: ${item.note}` : "",
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
          reason: "Skapad från rondavvikelse",
          metadata: { roundId: round.id, itemId: item.id, label: item.label },
        });

        const index = nextChecklist.findIndex((entry) => entry.id === item.id);
        if (index >= 0) nextChecklist[index] = { ...nextChecklist[index], workOrderId: workOrder.id };
        result.push({ itemId: item.id, workOrderId: workOrder.id, workOrderNumber });
      }

      await tx.inspectionRound.updateMany({
        where: { id: round.id, company_id: user.company_id! },
        data: {
          checklist: nextChecklist as unknown as Prisma.InputJsonValue,
          deviations: countDeviations(nextChecklist),
          status: round.status === "planned" ? "in_progress" : round.status,
        },
      });

      return { result, checklist: nextChecklist };
    });

    await writeAuditLog(user, {
      entityType: "round",
      entityId: round.id,
      action: "round.work_orders_created",
      metadata: {
        count: created.result.length,
        itemIds: created.result.map((item) => item.itemId),
        workOrderIds: created.result.map((item) => item.workOrderId),
        storage: "InspectionRound",
      },
    });

    return NextResponse.json({
      created: created.result,
      checklist: created.checklist,
      deviations: countDeviations(created.checklist),
    }, { status: 201 });
  } catch (error) {
    console.error("Create round work orders error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
