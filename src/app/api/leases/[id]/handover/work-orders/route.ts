import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { calculateWorkOrderSla, allocateWorkOrderNumber, addWorkOrderStatusEvent, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import type { LeaseHandoverPayload } from "@/lib/lease-handover";

const HANDOVER_EVENT = "lease_handover_record";
const LINK_EVENT = "lease_handover_work_order_link";
const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);

type LinkPayload = {
  leaseId: string;
  handoverVersion: number;
  workOrderId: string;
  createdAt: string;
};

async function getLease(id: string, companyId: string) {
  return db.lease.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      lease_number: true,
      property_id: true,
      unit_id: true,
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, designation: true } },
      lease_holder: { select: { name: true } },
    },
  });
}

async function getHandover(id: string, companyId: string) {
  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: HANDOVER_EVENT, recipient: id },
    orderBy: { created_at: "desc" },
  });
  return event?.payload && typeof event.payload === "object"
    ? (event.payload as unknown as LeaseHandoverPayload)
    : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await getLease(id, user.company_id);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

    const [links, assignees] = await Promise.all([
      db.integrationEvent.findMany({
        where: { company_id: user.company_id, type: LINK_EVENT, recipient: id },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
      db.user.findMany({
        where: { company_id: user.company_id, status: "active", role: { in: ["owner", "admin", "manager", "technician"] } },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    const ids = links
      .map((link) => link.payload as unknown as LinkPayload)
      .map((payload) => payload?.workOrderId)
      .filter((value): value is string => Boolean(value));

    const workOrders = ids.length
      ? await db.workOrder.findMany({
          where: { company_id: user.company_id, id: { in: ids } },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            scheduled_start: true,
            scheduled_end: true,
            created_at: true,
            assigned_to: { select: { id: true, name: true, email: true } },
          },
        })
      : [];

    return NextResponse.json({
      workOrders,
      assignees,
      permissions: { canManage: canManageTickets(user.role) },
    });
  } catch (error) {
    console.error("Get handover work orders error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsorder" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const [lease, handover] = await Promise.all([getLease(id, user.company_id), getHandover(id, user.company_id)]);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });
    if (!handover) return NextResponse.json({ error: "Ingen överlämning är registrerad" }, { status: 409 });
    if (!["remarks", "action_required"].includes(handover.inspection.condition) || !handover.inspection.note.trim()) {
      return NextResponse.json({ error: "Besiktningen måste innehålla en anmärkning eller ett åtgärdsbehov" }, { status: 409 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
    if (Number(body.handoverVersion) !== handover.version) {
      return NextResponse.json({ error: "Överlämningen har ändrats. Ladda om innan arbetsordern skapas." }, { status: 409 });
    }

    const priority = allowedPriorities.has(String(body.priority)) ? String(body.priority) : "normal";
    const assignedToId = typeof body.assignedToId === "string" && body.assignedToId.trim() ? body.assignedToId.trim() : null;
    const scheduledStart = typeof body.scheduledStart === "string" && body.scheduledStart ? new Date(body.scheduledStart) : null;
    const scheduledEnd = typeof body.scheduledEnd === "string" && body.scheduledEnd ? new Date(body.scheduledEnd) : null;
    const extraNote = typeof body.note === "string" ? body.note.trim().slice(0, 3000) : "";

    if (scheduledStart && Number.isNaN(scheduledStart.getTime())) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
    if (scheduledEnd && Number.isNaN(scheduledEnd.getTime())) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
    if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) return NextResponse.json({ error: "Sluttiden måste ligga efter starttiden" }, { status: 400 });

    if (assignedToId) {
      const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
      if (!assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
    }

    const duplicate = await db.integrationEvent.findFirst({
      where: { company_id: user.company_id, type: LINK_EVENT, recipient: id },
      orderBy: { created_at: "desc" },
    });
    const duplicatePayload = duplicate?.payload as unknown as LinkPayload | undefined;
    if (duplicatePayload?.handoverVersion === handover.version) {
      const existing = await db.workOrder.findFirst({ where: { id: duplicatePayload.workOrderId, company_id: user.company_id }, select: { id: true, status: true } });
      if (existing && !["completed", "cancelled"].includes(existing.status)) {
        return NextResponse.json({ error: "Den aktuella besiktningsversionen har redan en öppen arbetsorder" }, { status: 409 });
      }
    }

    const createdAt = new Date();
    const sla = calculateWorkOrderSla(createdAt, priority);
    const title = `Besiktningsåtgärd · ${lease.property.name} · ${lease.unit.designation}`;
    const description = [
      `Skapad från ${handover.mode === "move_in" ? "inflyttnings" : "avflyttnings"}besiktning för avtal ${lease.lease_number}.`,
      `Hyrespart: ${lease.lease_holder.name}`,
      `Besiktningsbedömning: ${handover.inspection.condition === "action_required" ? "Åtgärd krävs" : "Anmärkningar"}`,
      `Besiktningsanteckning: ${handover.inspection.note}`,
      extraNote ? `Kompletterande instruktion: ${extraNote}` : "",
    ].filter(Boolean).join("\n\n");

    const workOrder = await db.$transaction(async (tx) => {
      const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
      const created = await tx.workOrder.create({
        data: {
          company_id: user.company_id!,
          property_id: lease.property_id,
          unit_id: lease.unit_id,
          assigned_to_id: assignedToId,
          created_by_id: user.id,
          title,
          description,
          status: "planned",
          priority,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          created_at: createdAt,
        },
      });
      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: created.id,
        companyId: user.company_id!,
        workOrderNumber,
        workType: "corrective",
        source: "inspection",
        responseDueAt: sla.responseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      });
      await setWorkOrderAssetLinks(tx, { workOrderId: created.id, companyId: user.company_id!, buildingId: null, technicalAssetId: null });
      await addWorkOrderStatusEvent(tx, {
        companyId: user.company_id!,
        workOrderId: created.id,
        actorUserId: user.id,
        fromStatus: null,
        toStatus: "planned",
        reason: "Arbetsorder skapad från besiktningsanmärkning",
        metadata: { leaseId: id, leaseNumber: lease.lease_number, handoverVersion: handover.version, inspectionCondition: handover.inspection.condition },
      });
      await tx.integrationEvent.create({
        data: {
          company_id: user.company_id!,
          type: LINK_EVENT,
          recipient: id,
          status: "linked",
          payload: { leaseId: id, handoverVersion: handover.version, workOrderId: created.id, createdAt: createdAt.toISOString() },
        },
      });
      await tx.auditLog.create({
        data: {
          company_id: user.company_id!,
          actor_user_id: user.id,
          entity_type: "lease_handover",
          entity_id: id,
          action: "lease_handover.work_order_created",
          metadata: { workOrderId: created.id, workOrderNumber, handoverVersion: handover.version, priority, assignedToId },
        },
      });
      return { ...created, workOrderNumber };
    });

    return NextResponse.json({ workOrder }, { status: 201 });
  } catch (error) {
    console.error("Create handover work order error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
