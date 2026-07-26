import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import type { LeaseInspectionRecord } from "@/lib/lease-inspection-items";
import { addWorkOrderStatusEvent, allocateWorkOrderNumber, calculateWorkOrderSla, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";

const RECORD_EVENT = "lease_inspection_items";
const LINK_EVENT = "lease_inspection_item_work_order";

type LinkPayload = { leaseId: string; itemId: string; recordVersion: number; workOrderId: string; createdAt: string };

async function getLease(id: string, companyId: string) {
  return db.lease.findFirst({
    where: { id, company_id: companyId, deleted_at: null },
    select: {
      id: true,
      lease_number: true,
      property_id: true,
      unit_id: true,
      property: { select: { name: true } },
      unit: { select: { designation: true } },
      lease_holder: { select: { name: true } },
    },
  });
}

/** Mutation path: require modern LeaseInspectionRecord; IE-only → 409. */
async function getRecordForMutation(id: string, companyId: string) {
  const modern = await db.leaseInspectionRecord.findUnique({
    where: { company_id_lease_id: { company_id: companyId, lease_id: id } },
    select: { payload: true },
  });
  if (modern?.payload && typeof modern.payload === "object") {
    return { record: modern.payload as unknown as LeaseInspectionRecord } as const;
  }

  const legacy = await db.integrationEvent.findFirst({
    where: { company_id: companyId, type: RECORD_EVENT, recipient: id },
    orderBy: { created_at: "desc" },
    select: { id: true },
  });
  if (legacy) {
    return {
      error: "Besiktningen finns kvar i äldre lagring. Kör backfill till LeaseInspectionRecord innan arbetsorder kan skapas.",
      status: 409 as const,
    };
  }
  return { error: "Spara besiktningspunkterna innan arbetsorder skapas", status: 409 as const };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const lease = await getLease(id, user.company_id);
  if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

  const [modernLinks, legacyLinks] = await Promise.all([
    db.leaseInspectionWorkOrderLink.findMany({
      where: { company_id: user.company_id, lease_id: id },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: LINK_EVENT, recipient: { startsWith: `${id}:` } },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
  ]);

  const modernPayloads: LinkPayload[] = modernLinks.map((link) => ({
    leaseId: link.lease_id,
    itemId: link.item_id,
    recordVersion: link.record_version,
    workOrderId: link.work_order_id,
    createdAt: link.created_at.toISOString(),
  }));
  const modernItemIds = new Set(modernPayloads.map((item) => item.itemId));
  const legacyPayloads = legacyLinks
    .map((link) => link.payload as unknown as LinkPayload)
    .filter((item) => item?.workOrderId && item.itemId && !modernItemIds.has(item.itemId));

  const payloads = [...modernPayloads, ...legacyPayloads];
  const ids = [...new Set(payloads.map((item) => item.workOrderId))];
  const workOrders = ids.length
    ? await db.workOrder.findMany({
        where: { deleted_at: null, company_id: user.company_id, id: { in: ids } },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          created_at: true,
          assigned_to: { select: { name: true, email: true } },
        },
      })
    : [];
  const byId = new Map(workOrders.map((item) => [item.id, item]));
  return NextResponse.json({
    links: payloads.map((payload) => ({ ...payload, workOrder: byId.get(payload.workOrderId) ?? null })),
    permissions: { canManage: canManageTickets(user.role) },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsorder" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    const { id } = await params;
    const [lease, loaded] = await Promise.all([getLease(id, user.company_id), getRecordForMutation(id, user.company_id)]);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });
    if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    const record = loaded.record;

    const body = await request.json().catch(() => null) as { version?: unknown; itemIds?: unknown } | null;
    if (!body || Number(body.version) !== record.version) {
      return NextResponse.json({ error: "Besiktningen har ändrats. Ladda om och försök igen." }, { status: 409 });
    }
    const requestedIds = Array.isArray(body.itemIds)
      ? [...new Set(body.itemIds.filter((value): value is string => typeof value === "string"))]
      : [];
    if (!requestedIds.length) return NextResponse.json({ error: "Välj minst en besiktningspunkt" }, { status: 400 });
    if (requestedIds.length > 50) return NextResponse.json({ error: "Högst 50 arbetsorder kan skapas åt gången" }, { status: 400 });

    const items = record.items.filter((item) => requestedIds.includes(item.id));
    if (items.length !== requestedIds.length) return NextResponse.json({ error: "En eller flera besiktningspunkter hittades inte" }, { status: 404 });
    if (items.some((item) => item.condition !== "action_required" || item.resolved || !item.selectedForWorkOrder)) {
      return NextResponse.json({ error: "Alla valda punkter måste kräva åtgärd, vara öppna och markerade för arbetsorder" }, { status: 409 });
    }

    const [modernLinks, legacyLinks] = await Promise.all([
      db.leaseInspectionWorkOrderLink.findMany({
        where: { company_id: user.company_id, lease_id: id, item_id: { in: items.map((item) => item.id) } },
        select: { item_id: true },
      }),
      db.integrationEvent.findMany({
        where: { company_id: user.company_id, type: LINK_EVENT, recipient: { in: items.map((item) => `${id}:${item.id}`) } },
        orderBy: { created_at: "desc" },
      }),
    ]);
    const existingItemIds = new Set([
      ...modernLinks.map((link) => link.item_id),
      ...legacyLinks.map((link) => (link.payload as unknown as LinkPayload)?.itemId).filter(Boolean),
    ]);
    const pending = items.filter((item) => !existingItemIds.has(item.id));
    if (!pending.length) return NextResponse.json({ error: "Alla valda punkter har redan arbetsorder" }, { status: 409 });

    const created = await db.$transaction(async (tx) => {
      const result: Array<{ itemId: string; workOrderId: string; workOrderNumber: string }> = [];
      for (const item of pending) {
        const createdAt = new Date();
        const priority = normalizeWorkOrderPriority(item.priority);
        const sla = calculateWorkOrderSla(createdAt, priority);
        const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
        const workOrder = await tx.workOrder.create({
          data: {
            company_id: user.company_id!,
            property_id: lease.property_id,
            unit_id: lease.unit_id,
            created_by_id: user.id,
            title: `${item.area} · ${item.component} · ${lease.property.name}`,
            description: [
              `Besiktningsåtgärd för avtal ${lease.lease_number}.`,
              `Hyrespart: ${lease.lease_holder.name}`,
              `Anmärkning: ${item.description}`,
              item.recommendation ? `Rekommenderad åtgärd: ${item.recommendation}` : "",
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
          reason: "Skapad från besiktningspunkt",
          metadata: {
            leaseId: id,
            itemId: item.id,
            area: item.area,
            component: item.component,
            recordVersion: record.version,
          },
        });
        await tx.leaseInspectionWorkOrderLink.create({
          data: {
            company_id: user.company_id!,
            lease_id: id,
            item_id: item.id,
            record_version: record.version,
            work_order_id: workOrder.id,
            created_by_id: user.id,
          },
        });
        result.push({ itemId: item.id, workOrderId: workOrder.id, workOrderNumber });
      }
      await tx.auditLog.create({
        data: {
          company_id: user.company_id!,
          actor_user_id: user.id,
          entity_type: "lease_inspection",
          entity_id: id,
          action: "lease_inspection.work_orders_created",
          metadata: {
            leaseNumber: lease.lease_number,
            recordVersion: record.version,
            count: result.length,
            itemIds: result.map((item) => item.itemId),
            workOrderIds: result.map((item) => item.workOrderId),
            storage: "LeaseInspectionWorkOrderLink",
          },
        },
      });
      return result;
    });

    return NextResponse.json({ created, skipped: items.length - pending.length }, { status: 201 });
  } catch (error) {
    console.error("Create inspection item work orders error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
