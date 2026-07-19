import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { emptyInspectionRecord, parseInspectionRecord, type LeaseInspectionRecord } from "@/lib/lease-inspection-items";

const EVENT_TYPE = "lease_inspection_items";

async function getLease(id: string, companyId: string) {
  return db.lease.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      lease_number: true,
      status: true,
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true, unit_type: true } },
      lease_holder: { select: { id: true, name: true } },
    },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await getLease(id, user.company_id);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

    const event = await db.integrationEvent.findFirst({
      where: { company_id: user.company_id, type: EVENT_TYPE, recipient: id },
      orderBy: { created_at: "desc" },
    });
    const record = event?.payload && typeof event.payload === "object"
      ? event.payload as unknown as LeaseInspectionRecord
      : emptyInspectionRecord({ id: user.id, name: user.name, email: user.email });

    return NextResponse.json({ lease, record, permissions: { canManage: canManageLeases(user.role) } });
  } catch (error) {
    console.error("Get lease inspection items error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att hantera besiktningar" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await getLease(id, user.company_id);
    if (!lease) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });

    const existing = await db.integrationEvent.findFirst({
      where: { company_id: user.company_id, type: EVENT_TYPE, recipient: id },
      orderBy: { created_at: "desc" },
    });
    const previous = existing?.payload && typeof existing.payload === "object"
      ? existing.payload as unknown as LeaseInspectionRecord
      : emptyInspectionRecord({ id: user.id, name: user.name, email: user.email });
    const parsed = parseInspectionRecord(await request.json().catch(() => null), previous, { id: user.id, name: user.name, email: user.email });
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const record = parsed.data;
    const actionRequired = record.items.filter((item) => item.condition === "action_required" && !item.resolved).length;
    await db.$transaction(async (tx) => {
      if (existing) {
        await tx.integrationEvent.update({
          where: { id: existing.id },
          data: { status: actionRequired > 0 ? "action_required" : "recorded", payload: record },
        });
      } else {
        await tx.integrationEvent.create({
          data: { company_id: user.company_id!, type: EVENT_TYPE, recipient: id, status: actionRequired > 0 ? "action_required" : "recorded", payload: record },
        });
      }
      await tx.auditLog.create({
        data: {
          company_id: user.company_id!,
          actor_user_id: user.id,
          entity_type: "lease_inspection",
          entity_id: id,
          action: "lease_inspection.items_updated",
          metadata: {
            leaseNumber: lease.lease_number,
            version: record.version,
            itemCount: record.items.length,
            actionRequired,
            selectedForWorkOrder: record.items.filter((item) => item.selectedForWorkOrder && !item.resolved).length,
          },
        },
      });
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error("Update lease inspection items error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
